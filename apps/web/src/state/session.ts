import { CourseStore, type Course } from '@folio/core';
import { useSyncExternalStore } from 'react';
import { currentMessages } from '../i18n';
import { isQuotaError, loadCourse, saveCourse } from './db';
import { toast } from './toasts';
import { useUi } from './ui';

/**
 * The open course. Every command is written to IndexedDB within 300 ms;
 * typing never waits on a save, and nothing is dropped when storage is full.
 */

const SAVE_DELAY = 300;

interface Session {
  id: string;
  store: CourseStore;
  timer: ReturnType<typeof setTimeout> | null;
  unsubscribe: () => void;
}

let active: Session | null = null;
const listeners = new Set<() => void>();

async function flush(session: Session): Promise<void> {
  if (session.timer) clearTimeout(session.timer);
  session.timer = null;
  const ui = useUi.getState();
  try {
    await saveCourse(session.store.getState());
    ui.setSaveState('saved');
  } catch (error) {
    ui.setSaveState('error');
    const t = currentMessages();
    toast({ message: isQuotaError(error) ? t.errors.storageFull : t.errors.generic, tone: 'critical', duration: 0 });
  }
}

function schedule(session: Session): void {
  useUi.getState().setSaveState('saving');
  if (session.timer) clearTimeout(session.timer);
  session.timer = setTimeout(() => void flush(session), SAVE_DELAY);
}

export function openSession(course: Course): CourseStore {
  if (active?.id === course.id) return active.store;
  closeSession();
  const store = new CourseStore(course);
  const session: Session = { id: course.id, store, timer: null, unsubscribe: () => {} };
  session.unsubscribe = store.subscribe(() => schedule(session));
  active = session;
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

/** Load a saved course into the session, or return null if it isn't on this device. */
export async function loadSession(id: string): Promise<CourseStore | null> {
  if (active?.id === id) return active.store;
  const course = await loadCourse(id);
  return course ? openSession(course) : null;
}

export async function createSession(course: Course): Promise<CourseStore> {
  await saveCourse(course);
  return openSession(course);
}

export function activeStore(): CourseStore | null {
  return active?.store ?? null;
}

export function flushNow(): Promise<void> {
  return active ? flush(active) : Promise.resolve();
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => void flushNow());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushNow();
  });
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
