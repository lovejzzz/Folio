import { parseCourse, type Course, type HistoryEntry } from '@folio/core';
import { versionOf } from './db';

/**
 * A last-moment copy of unsaved work. IndexedDB writes are asynchronous and
 * may not finish while a page unloads; localStorage writes are synchronous
 * and do. The next load replays the copy if nothing newer was saved since.
 */

const key = (id: string) => `folio.unsaved.${id}`;

interface Entry {
  /** The saved version this work was built on. */
  base: string;
  /** The course, without the text of sources unchanged since that version: they are taken from it again. */
  course: Course;
  /** Those sources, by ID. A long PDF's text would otherwise fill localStorage, and the copy wouldn't fit. */
  kept?: string[];
  /** History entries not saved yet: new ones, and ones undone or redone since. */
  history?: HistoryEntry[];
}

export interface Unsaved {
  course: Course;
  history: HistoryEntry[];
}

export function writeJournal(course: Course, base: string, history: HistoryEntry[] = [], saved: Course['sources'] = {}): void {
  const kept = Object.keys(course.sources).filter((id) => course.sources[id] === saved[id]);
  const sources = Object.fromEntries(Object.entries(course.sources).filter(([id]) => !kept.includes(id)));
  try {
    localStorage.setItem(key(course.id), JSON.stringify({ base, course: { ...course, sources }, kept, history } satisfies Entry));
  } catch {
    /* storage full or blocked: the IndexedDB save is still on its way */
  }
}

export function clearJournal(id: string): void {
  try {
    localStorage.removeItem(key(id));
  } catch {
    /* storage unavailable */
  }
}

/** Unsaved work for this course, if it was built on exactly the saved version. */
export function takeJournal(saved: Course): Unsaved | null {
  const id = saved.id;
  let raw: string | null;
  try {
    raw = localStorage.getItem(key(id));
  } catch {
    return null;
  }
  if (!raw) return null;
  clearJournal(id);
  try {
    const entry = JSON.parse(raw) as Entry;
    if (entry.base !== versionOf(saved)) return null;
    const kept = Object.fromEntries((entry.kept ?? []).flatMap((s) => (saved.sources[s] ? [[s, saved.sources[s]]] : [])));
    const course = { ...entry.course, sources: { ...kept, ...entry.course.sources } };
    return { course: parseCourse(course), history: Array.isArray(entry.history) ? entry.history : [] };
  } catch {
    return null;
  }
}
