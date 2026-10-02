import { strFromU8, strToU8, unzipSync, zipSync, type Unzipped, type Zippable } from 'fflate';
import { CourseFormatError, isCourseFormatError, parseCourse, type Course } from '@folio/core';

/**
 * A .folio file is a zip: course.json is the course itself, manifest.json
 * says what the file is, and sources/ holds each source as plain text so a
 * teacher can still read their material without Folio.
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

/** Pack a course into .folio bytes. */
export function writeFolio(course: Course, now = new Date().toISOString()): Uint8Array {
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
 * unpack to. A real course with long sources is a few megabytes; a file that
 * unpacks to gigabytes (a zip bomb) would freeze the tab.
 */
export const MAX_FOLIO_BYTES = 50 * 1024 * 1024;
const MAX_UNPACKED_BYTES = 100 * 1024 * 1024;

function unzip(bytes: Uint8Array): Unzipped {
  const isZip = bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (!isZip) throw new CourseFormatError('notFolio', 'This is not a Folio course file.');
  try {
    let unpacked = 0;
    // Only the two files a course is read from, and only while their sizes add up to something sane.
    return unzipSync(bytes, {
      filter: (f) => {
        if (f.name !== 'manifest.json' && f.name !== 'course.json') return false;
        unpacked += f.originalSize;
        if (unpacked > MAX_UNPACKED_BYTES) throw new CourseFormatError('tooLarge', 'This Folio file is too large to open.');
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

/**
 * Read a course from .folio bytes, or from a bare course JSON file.
 * Throws CourseFormatError with a code the interface words for the teacher.
 */
export function readFolio(bytes: Uint8Array): Course {
  if (bytes.length > MAX_FOLIO_BYTES) throw new CourseFormatError('tooLarge', 'This Folio file is too large to open.');
  if (looksLikeJson(bytes)) return withinLimits(parseCourse(parseJson(bytes, 'course')));
  const files = unzip(bytes);
  const manifest = files['manifest.json'];
  const course = files['course.json'];
  if (!manifest || !course) throw new CourseFormatError('notFolio', 'This is not a Folio course file.');
  checkManifest(parseJson(manifest, 'file description'));
  return withinLimits(parseCourse(parseJson(course, 'course')));
}
