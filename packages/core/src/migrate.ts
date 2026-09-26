import { CourseSchema, SCHEMA_VERSION, type Course } from './schema';

/**
 * Courses are versioned and migrated forward, one step at a time. Each step
 * takes the raw JSON of version N and returns version N + 1.
 */
const steps: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {};

export class CourseFormatError extends Error {}

export function parseCourse(input: unknown): Course {
  if (!input || typeof input !== 'object') throw new CourseFormatError('This file does not contain a course.');
  let raw = input as Record<string, unknown>;
  let version = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 0;
  if (version > SCHEMA_VERSION) {
    throw new CourseFormatError('This course was made with a newer version of Folio.');
  }
  while (version < SCHEMA_VERSION) {
    const step = steps[version];
    if (!step) throw new CourseFormatError('This course uses a format Folio cannot read.');
    raw = step(raw);
    version += 1;
  }
  const result = CourseSchema.safeParse(raw);
  if (!result.success) throw new CourseFormatError('This course file is damaged or incomplete.');
  return result.data;
}
