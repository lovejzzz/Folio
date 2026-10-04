import { attentionItems, enabledKinds, parseCourse, type Course, type CourseStatus, type Language, type MaterialKind } from '@folio/core';
import Dexie, { type Table } from 'dexie';
import { currentMessages } from '../i18n';
import { upgradeToSeparateTexts } from './dbUpgrade';
import type { HistoryRow, HistoryWrite } from './historySync';
import { dryCourse, dryEntry, neededTexts, wetCourse, wetEntry, type Texts } from './sourceTexts';
import { toast } from './toasts';

/**
 * One store for everything: IndexedDB via Dexie. Nothing is ever pruned. A course is kept in three parts, so
 * a small change writes little and the Library reads little: its summary (what a card shows), its body (the
 * course with its files' text taken out), and each file's text, written once when the file is added.
 */
export interface CourseSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  status: CourseStatus;
  language: Language;
  lessonCount: number;
  kinds: MaterialKind[];
  /** How many parts carry a note for the teacher: a course is not finished while it has some. Absent on a summary written before this was kept. */
  toCheck?: number;
}

export interface CourseRow {
  id: string;
  /** The course with every source's text kept apart (see sourceTexts). */
  data: Course;
}

/** One attached file's text, for one course. Files never change once added, so it is written once. */
export interface SourceTextRow {
  /** `${courseId}:${sourceId}` */
  key: string;
  courseId: string;
  text: string;
}

/**
 * Which courses belong to the signed-in account. A course with no row was made on this device while signed
 * out, or before this account signed in: 'ask' until the teacher says whether to add it, then 'linked' or
 * 'declined'. `version` is the account's copy this device last had; `synced` the local version it matched.
 */
export interface SyncRow {
  id: string;
  account: string;
  state: 'linked' | 'declined' | 'ask';
  version: number;
  synced: string;
  /** The file texts the account holds for this course, as of the last send or fetch. */
  sent?: string[];
  /** The pictures, clips and files the account holds for this course. */
  media?: string[];
}

/**
 * A picture, clip or file the teacher added to a page, for one course. The course holds only `media:<id>`; the
 * bytes stay here, on this device, and are not sent to the account.
 */
export interface MediaRow {
  /** `${courseId}:${id}` */
  key: string;
  courseId: string;
  id: string;
  /** The name the file had when it was added. */
  name: string;
  type: string;
  bytes: number;
  blob: Blob;
  /** When it was added, in milliseconds: one just added is never cleared away as unused. */
  at: number;
}

class FolioDb extends Dexie {
  summaries!: Table<CourseSummary, string>;
  courses!: Table<CourseRow, string>;
  sources!: Table<SourceTextRow, string>;
  /** Undo history, one row per entry, written in the same transaction as its course. */
  history!: Table<HistoryRow, string>;
  sync!: Table<SyncRow, string>;
  media!: Table<MediaRow, string>;
  constructor() {
    super('folio');
    this.version(1).stores({ courses: 'id, updatedAt' });
    this.version(2).stores({ courses: 'id, updatedAt', history: 'key, courseId' });
    this.version(3).stores({ courses: 'id, updatedAt', history: 'key, courseId', sync: 'id, account' });
    this.version(4)
      .stores({ summaries: 'id, updatedAt', courses: 'id', sources: 'key, courseId', history: 'key, courseId', sync: 'id, account' })
      .upgrade(upgradeToSeparateTexts);
    this.version(5).stores({ media: 'key, courseId' });
  }
}

export const db = new FolioDb();

/**
 * A newer Folio opened in another tab and is changing how courses are stored: this tab lets go of the
 * database so the change can go ahead, and asks to be reloaded rather than fail its next save quietly.
 */
db.on('versionchange', () => {
  db.close();
  toast({ key: 'db-updated', message: currentMessages().errors.dbUpdated, tone: 'attention', duration: 0 });
  return false;
});

/** Whether this browser lets Folio store anything. Private windows and some settings block it outright. */
export async function storageWorks(): Promise<boolean> {
  try {
    await db.open();
    return true;
  } catch {
    return false;
  }
}

export function summaryOf(course: Course): CourseSummary {
  return {
    id: course.id,
    title: course.title,
    createdAt: course.createdAt,
    updatedAt: course.updatedAt,
    status: course.status,
    language: course.language,
    lessonCount: course.lessonOrder.length,
    kinds: enabledKinds(course),
    toCheck: attentionItems(course).length,
  };
}

const textKey = (courseId: string, sourceId: string) => `${courseId}:${sourceId}`;

/** Write the texts not yet stored for this course. Only their keys are read to find out, never the texts. */
async function storeNewTexts(courseId: string, texts: Texts): Promise<void> {
  const keys = Object.keys(texts).map((id) => textKey(courseId, id));
  const have = new Set(await db.sources.where('key').anyOf(keys).primaryKeys());
  const rows = Object.entries(texts)
    .filter(([id]) => !have.has(textKey(courseId, id)))
    .map(([id, text]) => ({ key: textKey(courseId, id), courseId, text }));
  if (rows.length) await db.sources.bulkPut(rows);
}

/**
 * A text goes once nothing needs it: not the course, and no step of its history (undo can bring a removed file
 * back). Only history dropping steps can make that happen, so it is checked only then.
 */
async function dropUnneededTexts(courseId: string, body: Course): Promise<void> {
  const needed = neededTexts(body);
  await db.history.where('courseId').equals(courseId).each((row) => void neededTexts(row.entry, needed));
  const keys = await db.sources.where('courseId').equals(courseId).primaryKeys();
  const gone = keys.filter((k) => !needed.has(k.slice(courseId.length + 1)));
  if (gone.length) await db.sources.bulkDelete(gone);
}

/** Write a course in its three parts, and its history's new and changed steps, inside the caller's transaction. */
async function writeCourse(course: Course, history: HistoryWrite | undefined): Promise<void> {
  const { body, texts } = dryCourse(course);
  const rows = (history?.put ?? []).map((row) => {
    const dried = dryEntry(row.entry);
    Object.assign(texts, dried.texts);
    return { ...row, entry: dried.entry };
  });
  // IndexedDB requests first and only: a transaction that waits on anything else closes early.
  await db.summaries.put(summaryOf(course));
  await db.courses.put({ id: course.id, data: body });
  if (Object.keys(texts).length) await storeNewTexts(course.id, texts);
  await writeHistory(history && { ...history, put: rows });
  if (history && (history.replace || history.remove.length)) await dropUnneededTexts(course.id, body);
}

/** Every text stored for a course, by source ID. */
export async function textsOf(courseId: string): Promise<Texts> {
  const rows = await db.sources.where('courseId').equals(courseId).toArray();
  return Object.fromEntries(rows.map((r) => [r.key.slice(courseId.length + 1), r.text]));
}

const PARTS = () => [db.summaries, db.courses, db.sources, db.history] as const;

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

/** A course was saved or deleted on this device; `forgotten` is a copy removed at sign-out, still in the account. */
export interface CourseWrite {
  type: 'saved' | 'deleted' | 'forgotten';
  id: string;
}
const writeListeners = new Set<(write: CourseWrite) => void>();

/** Told of every course saved or deleted in this tab, for keeping the account's copy up to date. */
export function onCourseWrite(listener: (write: CourseWrite) => void): () => void {
  writeListeners.add(listener);
  return () => writeListeners.delete(listener);
}
const told = (write: CourseWrite) => {
  for (const l of writeListeners) l(write);
};

export async function saveCourse(course: Course, history?: HistoryWrite): Promise<void> {
  keepStorage();
  await db.transaction('rw', PARTS(), () => writeCourse(course, history));
  told({ type: 'saved', id: course.id });
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
  await db.transaction('rw', PARTS(), async () => {
    const row = await db.courses.get(course.id);
    if (!row) throw new SaveConflictError('deleted');
    if (versionOf(row.data) !== expected) throw new SaveConflictError('changed');
    await writeCourse(course, history);
  });
  told({ type: 'saved', id: course.id });
}

export async function loadCourse(id: string): Promise<Course | null> {
  const [row, texts] = await db.transaction('r', db.courses, db.sources, () => Promise.all([db.courses.get(id), textsOf(id)]));
  return row ? parseCourse(wetCourse(row.data, texts)) : null;
}

/** A course with its undo history, read together so the two always match. */
export async function loadCourseWithHistory(id: string): Promise<{ course: Course; history: HistoryRow[] } | null> {
  const [row, history, texts] = await db.transaction('r', db.courses, db.history, db.sources, () =>
    Promise.all([db.courses.get(id), db.history.where('courseId').equals(id).toArray(), textsOf(id)]),
  );
  return row ? { course: parseCourse(wetCourse(row.data, texts)), history: history.map((h) => ({ ...h, entry: wetEntry(h.entry, texts) })) } : null;
}

/** What the Library shows, newest first: summaries only, never a course's body or its files. */
export async function listCourses(): Promise<CourseSummary[]> {
  return db.summaries.orderBy('updatedAt').reverse().toArray();
}

/** Delete a course here; `forget` removes only this device's copy (signing out), leaving the account's. */
export async function deleteCourse(id: string, { forget = false }: { forget?: boolean } = {}): Promise<void> {
  await db.transaction('rw', [...PARTS(), db.media], async () => {
    await db.summaries.delete(id);
    await db.courses.delete(id);
    await db.sources.where('courseId').equals(id).delete();
    await db.history.where('courseId').equals(id).delete();
    // The account holds no pictures: forgetting this device's copy keeps them, for when the course comes back.
    if (!forget) await db.media.where('courseId').equals(id).delete();
  });
  told({ type: forget ? 'forgotten' : 'deleted', id });
}

export async function allCourses(): Promise<Course[]> {
  const ids = await db.summaries.toCollection().primaryKeys();
  const courses = await Promise.all(ids.map(loadCourse));
  return courses.filter((c): c is Course => c !== null);
}

export function isQuotaError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'QuotaExceededError' || /quota/i.test(error.message));
}
