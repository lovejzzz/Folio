import { enabledKinds, parseCourse, type Course, type CourseStatus, type Language, type MaterialKind } from '@folio/core';
import Dexie, { type Table } from 'dexie';

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
  constructor() {
    super('folio');
    this.version(1).stores({ courses: 'id, updatedAt' });
  }
}

export const db = new FolioDb();

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

export async function saveCourse(course: Course): Promise<void> {
  await db.courses.put(rowOf(course));
}

export async function loadCourse(id: string): Promise<Course | null> {
  const row = await db.courses.get(id);
  return row ? parseCourse(row.data) : null;
}

export async function listCourses(): Promise<CourseSummary[]> {
  const rows = await db.courses.orderBy('updatedAt').reverse().toArray();
  return rows.map(({ data: _data, ...summary }) => summary);
}

export async function deleteCourse(id: string): Promise<void> {
  await db.courses.delete(id);
}

export async function allCourses(): Promise<Course[]> {
  return (await db.courses.toArray()).map((r) => r.data);
}

export function isQuotaError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'QuotaExceededError' || /quota/i.test(error.message));
}
