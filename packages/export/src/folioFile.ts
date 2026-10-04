import { strFromU8, strToU8, unzipSync, zipSync, type Unzipped, type Zippable } from 'fflate';
import { CourseFormatError, isCourseFormatError, localMediaId, pageMediaRefs, parseCourse, type Course } from '@folio/core';

/**
 * A .folio file is a zip: course.json is the course itself, manifest.json
 * says what the file is, and sources/ holds each source as plain text so a
 * teacher can still read their material without Folio. The pictures, clips
 * and files the teacher added are under media/, listed in media.json.
 */

export const FOLIO_FORMAT = 'folio';
export const FOLIO_VERSION = 1;

export interface FolioManifest {
  format: typeof FOLIO_FORMAT;
  version: number;
  schemaVersion: number;
  exportedAt: string;
  title: string;
}

function safeName(id: string): string {
  return id.replace(/[^A-Za-z0-9_-]/g, '_') || 'source';
}

/** A picture, clip or file the teacher added, as a backup carries it. */
export interface FolioMedia {
  /** What the course calls it by: `media:<id>`. */
  id: string;
  /** The name the file had when it was added. */
  name: string;
  type: string;
  bytes: Uint8Array;
}

/** Every reference a course makes to something kept on the device: its weeks' pages and the pages that belong to no week. */
export function courseMediaIds(course: Course): string[] {
  const pages = [...Object.values(course.lessons).map((l) => l.page), ...(course.pages ?? []).map((p) => p.blocks)];
  return [...new Set(pages.flatMap((page) => pageMediaRefs(page)).flatMap((ref) => localMediaId(ref) ?? []))];
}

/** Pack a course into .folio bytes, with the media it was given. */
export function writeFolio(course: Course, now = new Date().toISOString(), media: readonly FolioMedia[] = []): Uint8Array {
  const manifest: FolioManifest = {
    format: FOLIO_FORMAT,
    version: FOLIO_VERSION,
    schemaVersion: course.schemaVersion,
    exportedAt: now,
    title: course.title,
  };
  const files: Zippable = {
    'manifest.json': strToU8(JSON.stringify(manifest, null, 2)),
    'course.json': strToU8(JSON.stringify(course, null, 2)),
  };
  for (const id of course.sourceOrder) {
    const source = course.sources[id];
    if (source) files[`sources/${safeName(id)}.txt`] = strToU8(source.text);
  }
  const kept = media.filter((m) => MEDIA_ID.test(m.id));
  if (kept.length) files['media.json'] = strToU8(JSON.stringify(kept.map(({ id, name, type }) => ({ id, name, type })), null, 2));
  // Pictures and video are packed already: stored as they are, which is also much quicker.
  for (const m of kept) files[`media/${m.id}`] = [m.bytes, { level: 0 }];
  return zipSync(files, { level: 6 });
}

function parseJson(bytes: Uint8Array, what: string): unknown {
  try {
    return JSON.parse(strFromU8(bytes).replace(/^\uFEFF/, ''));
  } catch {
    throw new CourseFormatError('unreadable', `The ${what} inside this file is damaged and cannot be read.`);
  }
}

function looksLikeJson(bytes: Uint8Array): boolean {
  for (const byte of bytes.subarray(0, 64)) {
    if (byte === 0x7b) return true;
    // Skip whitespace and a UTF-8 byte order mark.
    if (![0x20, 0x09, 0x0a, 0x0d, 0xef, 0xbb, 0xbf].includes(byte)) return false;
  }
  return false;
}

/**
 * The largest backup Folio opens, and the largest a course inside it may
 * unpack to. A course's text is a few megabytes; its pictures and clips are
 * most of a backup. A file that unpacks to gigabytes (a zip bomb) would
 * freeze the tab.
 */
export const MAX_FOLIO_BYTES = 300 * 1024 * 1024;
const MAX_UNPACKED_BYTES = 400 * 1024 * 1024;
/** What a course itself may unpack to, its media aside: the text of a course is never this long. */
const MAX_COURSE_BYTES = 100 * 1024 * 1024;
/** One picture, clip or file: the most Folio lets a teacher add. */
export const MAX_MEDIA_BYTES = 200 * 1024 * 1024;
const MAX_MEDIA_ENTRIES = 2000;
/** IDs as Folio makes them, with the file's extension: nothing that could name a path. */
const MEDIA_ID = /^[A-Za-z0-9_-]{1,64}(\.[A-Za-z0-9]{1,8})?$/;

const COURSE_PARTS = new Set(['manifest.json', 'course.json', 'media.json']);

/** Unpack only the entries asked for, and only while their sizes stay within the limits. */
function unzip(bytes: Uint8Array, wanted: ReadonlySet<string>, each: number, all: number): Unzipped {
  const isZip = bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (!isZip) throw new CourseFormatError('notFolio', 'This is not a Folio course file.');
  try {
    let unpacked = 0;
    return unzipSync(bytes, {
      filter: (f) => {
        if (!wanted.has(f.name)) return false;
        unpacked += f.originalSize;
        if (f.originalSize > each || unpacked > all) throw new CourseFormatError('tooLarge', 'This Folio file is too large to open.');
        return true;
      },
    });
  } catch (error) {
    if (isCourseFormatError(error)) throw error;
    throw new CourseFormatError('damagedFile', 'This Folio file is damaged and cannot be opened.');
  }
}

function checkManifest(value: unknown): void {
  const m = value && typeof value === 'object' ? (value as Partial<FolioManifest>) : {};
  if (m.format !== FOLIO_FORMAT) throw new CourseFormatError('notFolio', 'This is not a Folio course file.');
  if (typeof m.version !== 'number') throw new CourseFormatError('damagedFile', 'This Folio file is damaged and cannot be opened.');
  if (m.version > FOLIO_VERSION) throw new CourseFormatError('newerVersion', 'This file was made with a newer version of Folio.');
}

/**
 * Far beyond any real course (Folio plans at most 40 lessons): a file past these was made by hand or is
 * damaged, and opening it would only freeze the page. Courses already on this device are never held to them.
 */
const IMPORT_LIMITS = { lessons: 200, tasks: 20_000, sources: 200, sourceText: 5_000_000, field: 200_000 };

/** Whether any piece of text in this value, however deep, is longer than `limit`. */
function hasLongText(value: unknown, limit: number): boolean {
  if (typeof value === 'string') return value.length > limit;
  if (Array.isArray(value)) return value.some((v) => hasLongText(v, limit));
  return value !== null && typeof value === 'object' && Object.values(value).some((v) => hasLongText(v, limit));
}

function withinLimits(course: Course): Course {
  const over =
    course.lessonOrder.length > IMPORT_LIMITS.lessons ||
    Object.keys(course.tasks).length > IMPORT_LIMITS.tasks ||
    course.sourceOrder.length > IMPORT_LIMITS.sources ||
    Object.values(course.sources).some((s) => s.text.length > IMPORT_LIMITS.sourceText) ||
    // Every other piece of text: a title, a plan, a question. Sources are measured above.
    hasLongText({ ...course, sources: {} }, IMPORT_LIMITS.field);
  if (over) throw new CourseFormatError('tooLarge', 'This Folio file is too large to open.');
  return course;
}

/** What media.json lists that the course still uses: nothing else under media/ is ever unpacked. */
function listedMedia(index: Uint8Array | undefined, course: Course): Omit<FolioMedia, 'bytes'>[] {
  if (!index) return [];
  const list: unknown = parseJson(index, 'list of pictures and files');
  if (!Array.isArray(list)) throw new CourseFormatError('damagedFile', 'This Folio file is damaged and cannot be opened.');
  if (list.length > MAX_MEDIA_ENTRIES) throw new CourseFormatError('tooLarge', 'This Folio file is too large to open.');
  const used = new Set(courseMediaIds(course));
  const text = (v: unknown) => (typeof v === 'string' ? v.slice(0, 300) : '');
  return list.flatMap((item: unknown) => {
    const m = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    const id = text(m.id);
    return MEDIA_ID.test(id) && used.has(id) ? [{ id, name: text(m.name), type: text(m.type) }] : [];
  });
}

/**
 * Read a course and its media from .folio bytes, or a course alone from a bare course JSON file. A backup made
 * before media existed, or one whose pictures are missing, still opens: the course then shows the empty places.
 * Throws CourseFormatError with a code the interface words for the teacher.
 */
export function readFolioFile(bytes: Uint8Array, { withMedia = true }: { withMedia?: boolean } = {}): { course: Course; media: FolioMedia[] } {
  if (bytes.length > MAX_FOLIO_BYTES) throw new CourseFormatError('tooLarge', 'This Folio file is too large to open.');
  if (looksLikeJson(bytes)) return { course: withinLimits(parseCourse(parseJson(bytes, 'course'))), media: [] };
  const files = unzip(bytes, COURSE_PARTS, MAX_COURSE_BYTES, MAX_COURSE_BYTES);
  const manifest = files['manifest.json'];
  const body = files['course.json'];
  if (!manifest || !body) throw new CourseFormatError('notFolio', 'This is not a Folio course file.');
  checkManifest(parseJson(manifest, 'file description'));
  const course = withinLimits(parseCourse(parseJson(body, 'course')));
  const listed = withMedia ? listedMedia(files['media.json'], course) : [];
  if (!listed.length) return { course, media: [] };
  const entries = unzip(bytes, new Set(listed.map((m) => `media/${m.id}`)), MAX_MEDIA_BYTES, MAX_UNPACKED_BYTES);
  return { course, media: listed.flatMap((m) => (entries[`media/${m.id}`] ? [{ ...m, bytes: entries[`media/${m.id}`]! }] : [])) };
}

/** The course alone: its media is left packed. */
export function readFolio(bytes: Uint8Array): Course {
  return readFolioFile(bytes, { withMedia: false }).course;
}
