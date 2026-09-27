/**
 * The range each course-shape number may take when a teacher or the model
 * sets it: the plan screen's steppers and ⌘K plans read the same limits.
 * Stored courses are validated more loosely (see schema.ts), so a course
 * saved by an older Folio still opens.
 */
export const SHAPE_LIMITS = {
  lessons: { min: 1, max: 20 },
  minutesPerLesson: { min: 10, max: 240, step: 5 },
  quizSize: { min: 1, max: 30 },
} as const;

export type ShapeLimit = keyof typeof SHAPE_LIMITS;

export function withinLimit(limit: ShapeLimit, value: number): boolean {
  const { min, max } = SHAPE_LIMITS[limit];
  return Number.isInteger(value) && value >= min && value <= max;
}
