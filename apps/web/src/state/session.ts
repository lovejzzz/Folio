import { CourseStore, SCHEMA_VERSION, type Course } from '@folio/core';
import { useSyncExternalStore } from 'react';
import { currentMessages } from '../i18n';
import { SaveConflictError, isQuotaError, loadCourse, loadCourseWithHistory, saveCourse, saveCourseIfUnchanged, versionOf } from './db';
import { historyDelta, mergeHistory, sortRows, trackerFrom, type HistoryRow, type HistoryTracker } from './historySync';
import { clearJournal, takeJournal, writeJournal } from './journal';
import { toast } from './toasts';
import { useUi } from './ui';

/**
 * The open course. Every command is written to IndexedDB within 300 ms;
 * typing never waits on a save, and nothing is dropped when storage is full.
 * A save only lands if no other tab saved the course since this one did.
 * Undo history is saved with the course, in the same transaction, so it
 * survives a reload or a switch to another course.
 */

const SAVE_DELAY = 300;

interface Session {
  id: string;
  store: CourseStore;
  timer: ReturnType<typeof setTimeout> | null;
  unsubscribe: () => void;
  /** The version in IndexedDB as far as this tab knows. */
  savedVersion: string;
  /** Saves run one after another so each checks against the last. */
  saving: Promise<void>;
  /** Set while replacing the course with another tab's copy, so that isn't saved back. */
  quiet: boolean;
  /** Which history entries are on disk, so a save writes only what changed. */
  history: HistoryTracker;
}

let active: Session | null = null;
const listeners = new Set<() => void>();
const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('folio.courses');

const dirty = (s: Session) => versionOf(s.store.getState()) !== s.savedVersion;

async function save(session: Session): Promise<void> {
  const ui = useUi.getState();
  if (ui.conflict || !dirty(session)) return;
  const course = session.store.getState();
  const { write, next } = historyDelta(course.id, session.store.getHistory(), session.history, SCHEMA_VERSION);
  try {
    await saveCourseIfUnchanged(course, session.savedVersion, write);
    session.savedVersion = versionOf(course);
    session.history = next;
    clearJournal(course.id);
    channel?.postMessage({ id: course.id, version: session.savedVersion });
    ui.setSaveState(dirty(session) ? 'saving' : 'saved');
  } catch (error) {
    ui.setSaveState('error');
    if (error instanceof SaveConflictError) return ui.setConflict(error.reason);
    const t = currentMessages();
    toast({ message: isQuotaError(error) ? t.errors.storageFull : t.errors.generic, tone: 'critical', duration: 0 });
  }
}

function flush(session: Session): Promise<void> {
  if (session.timer) clearTimeout(session.timer);
  session.timer = null;
  session.saving = session.saving.then(() => save(session));
  return session.saving;
}

function schedule(session: Session): void {
  if (session.quiet) return;
  useUi.getState().setSaveState('saving');
  if (session.timer) clearTimeout(session.timer);
  session.timer = setTimeout(() => void flush(session), SAVE_DELAY);
}

/** Open a course, with the history rows saved beside it. */
export function openSession(course: Course, rows: readonly HistoryRow[] = []): CourseStore {
  if (active?.id === course.id) return active.store;
  closeSession();
  const { rows: sorted, restorable } = sortRows(rows, SCHEMA_VERSION);
  const store = new CourseStore(course, restorable);
  const session: Session = {
    id: course.id,
    store,
    timer: null,
    unsubscribe: () => {},
    savedVersion: versionOf(course),
    saving: Promise.resolve(),
    quiet: false,
    history: trackerFrom(sorted),
  };
  session.unsubscribe = store.subscribe(() => schedule(session));
  active = session;
  useUi.getState().setConflict(null);
  for (const l of listeners) l();
  return store;
}

export function closeSession(): void {
  if (!active) return;
  const session = active;
  session.unsubscribe();
  if (session.timer) void flush(session);
  active = null;
  for (const l of listeners) l();
}

/** Forget the open course without saving it, if it is this one (it was deleted), or whichever is open. */
export function dropSession(id?: string): void {
  if (!active || (id !== undefined && active.id !== id)) return;
  id = active.id;
  const session = active;
  if (session.timer) clearTimeout(session.timer);
  session.unsubscribe();
  clearJournal(id);
  active = null;
  for (const l of listeners) l();
}

/** Load a saved course into the session, or return null if it isn't on this device. */
export async function loadSession(id: string): Promise<CourseStore | null> {
  if (active?.id === id) return active.store;
  const loaded = await loadCourseWithHistory(id);
  if (!loaded) return null;
  const saved = loaded.course;
  const store = openSession(saved, loaded.history);
  // Work that was typed as the page closed last time, and never reached IndexedDB.
  const unsaved = takeJournal(id, versionOf(saved));
  if (unsaved && active?.id === id) {
    store.reset(unsaved.course, mergeHistory(store.exportHistory(), unsaved.history));
    active.savedVersion = versionOf(saved);
    void flush(active);
  }
  return store;
}

export async function createSession(course: Course): Promise<CourseStore> {
  await saveCourse(course);
  return openSession(course);
}

/** Take the stored copy (another tab's), dropping this tab's unsaved changes. */
export async function reloadFromDisk(): Promise<void> {
  const session = active;
  if (!session) return;
  const saved = await loadCourseWithHistory(session.id);
  useUi.getState().setConflict(null);
  if (!saved) return dropSession(session.id);
  replace(session, saved.course, saved.history);
}

/** Keep this tab's version, overwriting what the other tab saved. */
export async function keepThisVersion(): Promise<void> {
  const session = active;
  if (!session) return;
  const saved = await loadCourse(session.id);
  useUi.getState().setConflict(null);
  // This tab's history replaces whatever the other tab saved with its copy.
  session.history.replace = true;
  if (saved) {
    session.savedVersion = versionOf(saved);
    return flush(session);
  }
  const course = session.store.getState();
  const { write, next } = historyDelta(course.id, session.store.getHistory(), session.history, SCHEMA_VERSION);
  await saveCourse(course, write);
  session.savedVersion = versionOf(course);
  session.history = next;
}

function replace(session: Session, course: Course, rows: readonly HistoryRow[]): void {
  if (session.timer) clearTimeout(session.timer);
  session.timer = null;
  session.quiet = true;
  const { rows: sorted, restorable } = sortRows(rows, SCHEMA_VERSION);
  session.store.reset(course, restorable);
  session.history = trackerFrom(sorted);
  session.quiet = false;
  session.savedVersion = versionOf(course);
  useUi.getState().setSaveState('saved');
}

/** Another tab saved: follow along if this tab has nothing unsaved, else say so. */
async function onRemoteSave(id: string, version: string): Promise<void> {
  const session = active;
  if (!session || session.id !== id || version === session.savedVersion) return;
  if (dirty(session)) return useUi.getState().setConflict('changed');
  const saved = await loadCourseWithHistory(id);
  if (saved && active === session && !dirty(session)) replace(session, saved.course, saved.history);
}

export function activeStore(): CourseStore | null {
  return active?.store ?? null;
}

export function flushNow(): Promise<void> {
  return active ? flush(active) : Promise.resolve();
}

/** As the page goes away: commit the field being typed in, and keep a synchronous copy. */
function onLeave(commitFocused: boolean): void {
  if (commitFocused && document.activeElement instanceof HTMLElement) document.activeElement.blur();
  const session = active;
  if (!session || !dirty(session) || useUi.getState().conflict) return;
  const course = session.store.getState();
  const { write } = historyDelta(course.id, session.store.getHistory(), session.history, SCHEMA_VERSION);
  writeJournal(course, session.savedVersion, write.put.map((row) => row.entry));
  void flush(session);
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => onLeave(true));
  window.addEventListener('beforeunload', () => onLeave(true));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') onLeave(false);
  });
  channel?.addEventListener('message', (e: MessageEvent<{ id: string; version: string }>) => void onRemoteSave(e.data.id, e.data.version));
}

/** Called whenever a different course (or none) becomes the open one. */
export function onSessionChange(listener: () => void): () => void {
  return subscribeActive(listener);
}

function subscribeActive(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useStore(): CourseStore {
  const store = useSyncExternalStore(subscribeActive, activeStore);
  if (!store) throw new Error('No course is open.');
  return store;
}

/** The open course; re-renders on every change. */
export function useCourse(): Course {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, store.getState);
}
