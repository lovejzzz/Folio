import type { Flag } from './flags';
import { CourseSchema, SCHEMA_VERSION, type Course } from './schema';

/**
 * Courses are versioned and migrated forward, one step at a time. Each step
 * takes the raw JSON of version N and returns version N + 1.
 */

type Raw = Record<string, unknown>;

const isRecord = (value: unknown): value is Raw => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** Version 1 stored "needs a look" as one English sentence; version 2 stores flags. */
function flagsFromSentence(entity: unknown): void {
  if (!isRecord(entity) || !('flag' in entity)) return;
  const flags: Flag[] = typeof entity.flag === 'string' && entity.flag ? [{ code: 'note', values: { text: entity.flag } }] : [];
  delete entity.flag;
  entity.flags = flags;
}

const recordValues = (value: unknown): unknown[] => (isRecord(value) ? Object.values(value) : []);

const steps: Record<number, (raw: Raw) => Raw> = {
  1: (raw) => {
    const next = structuredClone(raw);
    for (const lesson of recordValues(next.lessons)) {
      if (isRecord(lesson)) recordValues(lesson.gen).forEach(flagsFromSentence);
    }
    recordValues(next.tasks).forEach(flagsFromSentence);
    recordValues(next.faq).forEach(flagsFromSentence);
    return { ...next, schemaVersion: 2 };
  },
};

/** Why a file could not be read, as a code the interface words in its own language. */
export type CourseFormatCode = 'notACourse' | 'newerVersion' | 'unknownFormat' | 'incomplete' | 'notFolio' | 'damagedFile' | 'unreadable';

export class CourseFormatError extends Error {
  readonly code: CourseFormatCode;
  constructor(code: CourseFormatCode, message: string) {
    super(message);
    this.name = 'CourseFormatError';
    this.code = code;
  }
}

/** True for a CourseFormatError, even one thrown from a separately bundled copy of core. */
export function isCourseFormatError(error: unknown): error is CourseFormatError {
  return error instanceof CourseFormatError || (error instanceof Error && error.name === 'CourseFormatError' && 'code' in error);
}

export function parseCourse(input: unknown): Course {
  if (!isRecord(input)) throw new CourseFormatError('notACourse', 'This file does not contain a course.');
  let raw = input;
  let version = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 0;
  if (version > SCHEMA_VERSION) {
    throw new CourseFormatError('newerVersion', 'This course was made with a newer version of Folio.');
  }
  while (version < SCHEMA_VERSION) {
    const step = steps[version];
    if (!step) throw new CourseFormatError('unknownFormat', 'This course uses a format Folio cannot read.');
    raw = step(raw);
    version += 1;
  }
  const result = CourseSchema.safeParse(raw);
  if (!result.success) throw new CourseFormatError('incomplete', 'This course file is damaged or incomplete.');
  return result.data;
}
