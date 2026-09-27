import { parseCourse, type Course } from '@folio/core';

/**
 * A last-moment copy of unsaved work. IndexedDB writes are asynchronous and
 * may not finish while a page unloads; localStorage writes are synchronous
 * and do. The next load replays the copy if nothing newer was saved since.
 */

const key = (id: string) => `folio.unsaved.${id}`;

interface Entry {
  /** The saved version this work was built on. */
  base: string;
  course: Course;
}

export function writeJournal(course: Course, base: string): void {
  try {
    localStorage.setItem(key(course.id), JSON.stringify({ base, course } satisfies Entry));
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
export function takeJournal(id: string, savedVersion: string): Course | null {
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
    return entry.base === savedVersion ? parseCourse(entry.course) : null;
  } catch {
    return null;
  }
}
