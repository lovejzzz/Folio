import { SHAPE_LIMITS, withinLimit, type Course, type MaterialKind, type ShapeLimit } from '@folio/core';
import type { PlanOperation } from './schemas';

/**
 * A ⌘K plan is checked against the course before the teacher sees it. Steps
 * that can't be done (a lesson that doesn't exist, a quiz size out of range)
 * or that would change nothing are taken out and listed with a reason, so the
 * preview only ever promises what Apply will actually do.
 */

export type SkipReason =
  | { code: 'noLesson'; lesson: number; count: number }
  | { code: 'range'; min: number; max: number }
  | { code: 'tooMany'; max: number }
  | { code: 'lastLesson' }
  | { code: 'removed' }
  | { code: 'unchanged' };

export interface SkippedOperation {
  op: PlanOperation;
  reason: SkipReason;
}

export interface CheckedPlan {
  operations: PlanOperation[];
  skipped: SkippedOperation[];
}

/** The course as the plan so far would leave it. Lesson numbers keep referring to the course before any change. */
interface PlanState {
  readonly original: number;
  readonly titles: string[];
  count: number;
  removed: Set<number>;
  quizSize: number;
  minutes: number;
  level: string;
  materials: Record<MaterialKind, boolean>;
}

function initialState(course: Course): PlanState {
  const titles = course.lessonOrder.map((id) => course.lessons[id]?.title ?? '');
  return {
    original: titles.length,
    titles,
    count: titles.length,
    removed: new Set(),
    quizSize: course.shape.quizSize,
    minutes: course.shape.minutesPerLesson,
    level: course.audience.level,
    materials: Object.fromEntries(Object.entries(course.materials).map(([k, v]) => [k, v.enabled])) as Record<MaterialKind, boolean>,
  };
}

function lessonProblem(s: PlanState, lesson: number): SkipReason | null {
  if (!Number.isInteger(lesson) || lesson < 1 || lesson > s.original) return { code: 'noLesson', lesson, count: s.original };
  return s.removed.has(lesson) ? { code: 'removed' } : null;
}

function rangeProblem(limit: ShapeLimit, value: number): SkipReason | null {
  const { min, max } = SHAPE_LIMITS[limit];
  return withinLimit(limit, value) ? null : { code: 'range', min, max };
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Lesson structure: add, remove, rename, move, add an objective. */
function checkLessonOp(s: PlanState, op: PlanOperation): SkipReason | null | undefined {
  switch (op.op) {
    case 'addLesson': {
      const where = op.after === 0 ? null : lessonProblem(s, op.after);
      if (where) return where;
      if (s.count + 1 > SHAPE_LIMITS.lessons.max) return { code: 'tooMany', max: SHAPE_LIMITS.lessons.max };
      s.count += 1;
      return null;
    }
    case 'removeLesson': {
      const problem = lessonProblem(s, op.lesson);
      if (problem) return problem;
      if (s.count - 1 < SHAPE_LIMITS.lessons.min) return { code: 'lastLesson' };
      s.removed.add(op.lesson);
      s.count -= 1;
      return null;
    }
    case 'renameLesson':
      return lessonProblem(s, op.lesson) ?? (same(s.titles[op.lesson - 1] ?? '', op.title) ? { code: 'unchanged' } : null);
    case 'moveLesson': {
      const problem = lessonProblem(s, op.lesson);
      if (problem) return problem;
      if (!Number.isInteger(op.to) || op.to < 1 || op.to > s.count) return { code: 'noLesson', lesson: op.to, count: s.count };
      return op.to === op.lesson && s.count === s.original ? { code: 'unchanged' } : null;
    }
    case 'addObjective':
      return lessonProblem(s, op.lesson);
    default:
      return undefined;
  }
}

/** Course settings: quiz size, minutes, level, materials. */
function checkSettingOp(s: PlanState, op: PlanOperation): SkipReason | null {
  switch (op.op) {
    case 'setQuizSize': {
      const problem = rangeProblem('quizSize', op.size) ?? (op.size === s.quizSize ? { code: 'unchanged' as const } : null);
      if (!problem) s.quizSize = op.size;
      return problem;
    }
    case 'setMinutes': {
      const problem = rangeProblem('minutesPerLesson', op.minutes) ?? (op.minutes === s.minutes ? { code: 'unchanged' as const } : null);
      if (!problem) s.minutes = op.minutes;
      return problem;
    }
    case 'setLevel':
      if (same(op.level, s.level)) return { code: 'unchanged' };
      s.level = op.level;
      return null;
    case 'setMaterial':
      if (s.materials[op.material] === op.enabled) return { code: 'unchanged' };
      s.materials[op.material] = op.enabled;
      return null;
    default:
      return null;
  }
}

/** Split a plan into the steps that can run, in order, and the ones left out with why. */
export function checkOperations(course: Course, operations: readonly PlanOperation[]): CheckedPlan {
  const state = initialState(course);
  const plan: CheckedPlan = { operations: [], skipped: [] };
  for (const op of operations) {
    const lessonReason = checkLessonOp(state, op);
    const reason = lessonReason === undefined ? checkSettingOp(state, op) : lessonReason;
    if (reason) plan.skipped.push({ op, reason });
    else plan.operations.push(op);
  }
  return plan;
}
