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
  /** The teacher has said they have it. Never assumed. */
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
    return pieces.map((piece) => ({ lessonId, lesson: n + 1, piece, confirmed: course.grading.find((g) => g.item.trim() === piece)?.own === true }));
  });
}

/** The same course with these pieces marked as the teacher's own and in hand, or not: the value for `course.update`. */
export function gradingWithOwn(course: Course, pieces: readonly string[], own: boolean): Course['grading'] {
  return course.grading.map((g) => (pieces.includes(g.item.trim()) ? { ...g, own } : g));
}
