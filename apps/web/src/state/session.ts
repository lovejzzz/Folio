import { CourseStore, SCHEMA_VERSION, hasModulePages, type Course } from '@folio/core';
import { useSyncExternalStore } from 'react';
import { currentMessages, setWeeklyCourse } from '../i18n';
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
/** While a course is being written, changes come from the model, not a teacher waiting: they're gathered longer. */
const BUILD_SAVE_DELAY = 1000;
/** However steadily changes keep coming (typing without a pause), nothing waits longer than this to be saved. */
const MAX_SAVE_WAIT = 2000;

let building = false;
/** Told by the build when it starts and ends. */
export function setBuilding(on: boolean): void {
  building = on;
}

interface Session {
  id: string;
  store: CourseStore;
  timer: ReturnType<typeof setTimeout> | null;
  /** When the first change not yet saved was made. */
  waitingSince: number | null;
  unsubscribe: () => void;
  /** The version in IndexedDB as far as this tab knows. */
  savedVersion: string;
  /** That version's sources: one still the same object hasn't changed, and the journal leaves its text out. */
  savedSources: Course['sources'];
  /** Saves run one after another so each checks against the last. */
  saving: Promise<void>;
  /** Set while replacing the course with another tab's copy, so that isn't saved back. */
  quiet: boolean;
  /** The version a save is writing right now, until it lands or fails. */
  writing: string | null;
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
    session.writing = versionOf(course);
    await saveCourseIfUnchanged(course, session.savedVersion, write);
    session.savedVersion = versionOf(course);
    session.savedSources = course.sources;
    session.history = next;
    clearJournal(course.id);
    channel?.postMessage({ id: course.id, version: session.savedVersion });
    ui.setSaveState(dirty(session) ? 'saving' : 'saved');
  } catch (error) {
    ui.setSaveState('error');
    if (error instanceof SaveConflictError) return ui.setConflict(error.reason);
    const t = currentMessages();
    // One toast however many saves fail while the teacher keeps typing.
    toast({ key: 'save-error', message: isQuotaError(error) ? t.errors.storageFull : t.errors.saveFailed, tone: 'critical', duration: 0 });
  } finally {
    session.writing = null;
  }
}

function flush(session: Session): Promise<void> {
  if (session.timer) clearTimeout(session.timer);
  session.timer = null;
  session.waitingSince = null;
  session.saving = session.saving.then(() => save(session));
  return session.saving;
}

function schedule(session: Session): void {
  if (session.quiet) return;
  useUi.getState().setSaveState('saving');
  if (session.timer) clearTimeout(session.timer);
  const now = Date.now();
  session.waitingSince ??= now;
  const delay = Math.min(building ? BUILD_SAVE_DELAY : SAVE_DELAY, Math.max(0, session.waitingSince + MAX_SAVE_WAIT - now));
  session.timer = setTimeout(() => void flush(session), delay);
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
    waitingSince: null,
    unsubscribe: () => {},
    savedVersion: versionOf(course),
    savedSources: course.sources,
    saving: Promise.resolve(),
    quiet: false,
    writing: null,
    history: trackerFrom(sorted),
  };
  session.unsubscribe = store.subscribe(() => schedule(session));
  active = session;
  setWeeklyCourse(hasModulePages(course));
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
  setWeeklyCourse(false);
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
  setWeeklyCourse(false);
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
  const unsaved = takeJournal(saved);
  if (unsaved && active?.id === id) {
    store.reset(unsaved.course, mergeHistory(store.exportHistory(), unsaved.history));
    active.savedVersion = versionOf(saved);
    active.savedSources = saved.sources;
    void flush(active);
  }
  // Pictures nothing can show again are cleared now, as the course opens: never while it is being changed.
  void import('./media').then((m) => m.dropUnusedMedia(id, [store.getState(), store.exportHistory()])).catch(() => undefined);
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
    session.savedSources = saved.sources;
    return flush(session);
  }
  const course = session.store.getState();
  const { write, next } = historyDelta(course.id, session.store.getHistory(), session.history, SCHEMA_VERSION);
  await saveCourse(course, write);
  session.savedVersion = versionOf(course);
  session.savedSources = course.sources;
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
  session.savedSources = course.sources;
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
  writeJournal(course, session.savedVersion, write.put.map((row) => row.entry), session.savedSources, session.writing ?? undefined);
  void flush(session);
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => onLeave(true));
  window.addEventListener('beforeunload', (e) => {
    onLeave(true);
    // Work that couldn't be saved (storage full, or another tab changed the course) is lost on close: ask first.
    const { saveState, conflict } = useUi.getState();
    if (active && dirty(active) && (saveState === 'error' || conflict)) e.preventDefault();
  });
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
