import { lessonPieces } from './course';
import { setsWork } from './ripple';
import type { Assignment, Course, Lesson } from './schema';

/**
 * Rubrics chosen, a rubric-scored piece of the lesson standing written, and no rubric of the course's for it. Pieces
 * marked in points or as complete have none by design. Read by the build's plan, the map and the writer of rubrics alone.
 */
export function piecesLackingRubric(course: Course, lesson: Lesson): Assignment[] {
  if (!course.materials.rubrics.enabled || !setsWork(lesson, 'rubrics')) return [];
  const scored = new Set(lessonPieces(lesson).filter((p) => p.kind === 'assignment' || p.kind === 'inclass').map((p) => p.toward.trim()));
  const byPoints = (toward: string) => {
    const g = course.grading.find((x) => x.item.trim() === toward);
    return g?.judged === 'complete' || Boolean(g?.card?.points);
  };
  return lesson.taskIds.flatMap((id) => {
    const t = course.tasks[id];
    return t?.kind === 'assignment' && scored.has(t.toward.trim()) && !byPoints(t.toward.trim()) && !(t.rubricId && course.rubrics[t.rubricId]) ? [t] : [];
  });
}

