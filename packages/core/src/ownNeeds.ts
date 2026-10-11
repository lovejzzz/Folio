import { lessonPieces } from './course';
import { hasModulePages } from './page';
import type { Course } from './schema';

/**
 * Graded work a lesson sets or runs that Folio is not writing out, because the teacher chose neither graded work nor
 * rubrics: the paper, the instructions and the scoring are the teacher's to bring. One account of it, read wherever a
 * teacher is told the state of a course: before a build, on the map, in a lesson's list of what to have ready, and
 * before an export. A deck written alone was "ready" on the map and exported without a word while its slides said
 * "the quiz is the teacher's own paper".
 */
export interface OwnNeed {
  lessonId: string;
  /** The lesson's number, counted from 1. */
  lesson: number;
  /** The graded component, by the name the course gives it. */
  piece: string;
  /** The teacher has said they have it, for this lesson. Never assumed, and never carried from another lesson. */
  confirmed: boolean;
}

/** Whether graded work is written out for this course: chosen, or needed by the rubrics that are. */
export const worksWritten = (course: Course): boolean => course.materials.assignments.enabled || course.materials.rubrics.enabled || hasModulePages(course);

export function ownNeeds(course: Course, lessonIds?: readonly string[]): OwnNeed[] {
  if (worksWritten(course)) return [];
  return course.lessonOrder.flatMap((lessonId, n) => {
    const lesson = course.lessons[lessonId];
    if (!lesson || (lessonIds && !lessonIds.includes(lessonId))) return [];
    const pieces = [...new Set(lessonPieces(lesson).filter((p) => p.kind !== 'none' && p.toward.trim()).map((p) => p.toward.trim()))];
    return pieces.map((piece) => ({ lessonId, lesson: n + 1, piece, confirmed: (lesson.own ?? []).includes(piece) }));
  });
}

/**
 * The lessons a teacher's word reaches when they say they have a piece "for every lesson that uses it": each lesson
 * that sets or runs it, with the pieces it would then have in hand. Said only when asked for in so many words: one
 * lesson's quiz paper in hand is not the next lesson's.
 */
export function ownEverywhere(course: Course, pieces: readonly string[]): { lessonId: string; pieces: string[] }[] {
  return course.lessonOrder.flatMap((lessonId) => {
    const mine = ownNeeds(course, [lessonId]);
    const hit = mine.filter((n) => pieces.includes(n.piece));
    return hit.length ? [{ lessonId, pieces: [...new Set([...mine.filter((n) => n.confirmed).map((n) => n.piece), ...hit.map((n) => n.piece)])] }] : [];
  });
}
