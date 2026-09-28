import { enabledKinds, parseCourse, type Course, type CourseStatus, type Language, type MaterialKind } from '@folio/core';
import Dexie, { type Table } from 'dexie';
import type { HistoryRow, HistoryWrite } from './historySync';

/** One store for everything: IndexedDB via Dexie. Nothing is ever pruned. */
export interface CourseRow {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  status: CourseStatus;
  language: Language;
  lessonCount: number;
  kinds: MaterialKind[];
  data: Course;
}

export type CourseSummary = Omit<CourseRow, 'data'>;

class FolioDb extends Dexie {
  courses!: Table<CourseRow, string>;
  /** Undo history, one row per entry, written in the same transaction as its course. */
  history!: Table<HistoryRow, string>;
  constructor() {
    super('folio');
    this.version(1).stores({ courses: 'id, updatedAt' });
    this.version(2).stores({ courses: 'id, updatedAt', history: 'key, courseId' });
  }
}

export const db = new FolioDb();

/** Whether this browser lets Folio store anything. Private windows and some settings block it outright. */
export async function storageWorks(): Promise<boolean> {
  try {
    await db.open();
    return true;
  } catch {
    return false;
  }
}

function rowOf(course: Course): CourseRow {
  return {
    id: course.id,
    title: course.title,
    createdAt: course.createdAt,
    updatedAt: course.updatedAt,
    status: course.status,
    language: course.language,
    lessonCount: course.lessonOrder.length,
    kinds: enabledKinds(course),
    data: course,
  };
}

async function writeHistory(write: HistoryWrite | undefined): Promise<void> {
  if (!write) return;
  if (write.replace) await db.history.where('courseId').equals(write.courseId).delete();
  else if (write.remove.length) await db.history.bulkDelete(write.remove);
  if (write.put.length) await db.history.bulkPut(write.put);
}

let askedToKeep = false;

/**
 * Ask the browser to keep Folio's storage. Without it storage is "best
 * effort": Safari clears a site not visited for a week, and any browser may
 * clear it when the disk is low, and the browser holds the only copy.
 */
export function keepStorage(): void {
  if (askedToKeep || typeof navigator === 'undefined') return;
  askedToKeep = true;
  void navigator.storage?.persist?.().catch(() => false);
}

/** Whether the browser has promised to keep Folio's storage; null when it can't say. */
export async function storageKept(): Promise<boolean | null> {
  try {
    return (await navigator.storage?.persisted?.()) ?? null;
  } catch {
    return null;
  }
}

export async function saveCourse(course: Course, history?: HistoryWrite): Promise<void> {
  keepStorage();
  await db.transaction('rw', db.courses, db.history, async () => {
    await db.courses.put(rowOf(course));
    await writeHistory(history);
  });
}

/** Someone else (another tab or window) saved this course since we last did. */
export class SaveConflictError extends Error {
  constructor(readonly reason: 'changed' | 'deleted') {
    super(`The course was ${reason} elsewhere.`);
  }
}

/** Identifies one saved state of a course. Revisions alone repeat when two tabs edit from the same start. */
export const versionOf = (course: Pick<Course, 'revision' | 'updatedAt' | 'stamp'>): string => `${course.revision}@${course.updatedAt}${course.stamp ? `#${course.stamp}` : ''}`;

/** Save only if the stored copy is still the one this tab last saved or loaded. */
export async function saveCourseIfUnchanged(course: Course, expected: string, history?: HistoryWrite): Promise<void> {
  await db.transaction('rw', db.courses, db.history, async () => {
    const row = await db.courses.get(course.id);
    if (!row) throw new SaveConflictError('deleted');
    if (versionOf(row.data) !== expected) throw new SaveConflictError('changed');
    await db.courses.put(rowOf(course));
    await writeHistory(history);
  });
}

export async function loadCourse(id: string): Promise<Course | null> {
  const row = await db.courses.get(id);
  return row ? parseCourse(row.data) : null;
}

/** A course with its undo history, read together so the two always match. */
export async function loadCourseWithHistory(id: string): Promise<{ course: Course; history: HistoryRow[] } | null> {
  const [row, history] = await db.transaction('r', db.courses, db.history, () =>
    Promise.all([db.courses.get(id), db.history.where('courseId').equals(id).toArray()]),
  );
  return row ? { course: parseCourse(row.data), history } : null;
}

export async function listCourses(): Promise<CourseSummary[]> {
  const rows = await db.courses.orderBy('updatedAt').reverse().toArray();
  return rows.map(({ data: _data, ...summary }) => summary);
}

export async function deleteCourse(id: string): Promise<void> {
  await db.transaction('rw', db.courses, db.history, async () => {
    await db.courses.delete(id);
    await db.history.where('courseId').equals(id).delete();
  });
}

export async function allCourses(): Promise<Course[]> {
  return (await db.courses.toArray()).map((r) => r.data);
}

export function isQuotaError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'QuotaExceededError' || /quota/i.test(error.message));
}
