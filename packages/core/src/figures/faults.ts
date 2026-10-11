import { figureProblem, type FigureProblem } from './binarySearch';
import type { Course } from '../schema';

/** A demonstration that cannot be shown as it stands, and where it is: lesson and slide counted from 1. */
export interface FigureFault {
  lessonId: string;
  lesson: number;
  slide: number;
  title: string;
  problem: FigureProblem;
}

/**
 * Every demonstration in the course (or in the lessons named) that is unfinished or cannot be searched, by the same
 * check its slide and its exports use. What the map marks and what an export is held for are read from here, so no
 * place has a judgment of its own.
 */
export function figureFaults(course: Course, lessonIds?: readonly string[]): FigureFault[] {
  return course.lessonOrder.flatMap((lessonId, n) => {
    const lesson = course.lessons[lessonId];
    if (!lesson || (lessonIds && !lessonIds.includes(lessonId))) return [];
    return lesson.slides.flatMap((s, i) => {
      const problem = s.visual?.kind === 'figure' ? figureProblem(s.visual) : null;
      return problem ? [{ lessonId, lesson: n + 1, slide: i + 1, title: s.title, problem }] : [];
    });
  });
}
