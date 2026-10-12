import { lessonPieces } from './course';
import { setsWork } from './ripple';
import type { Assignment, Course, Lesson } from './schema';

/**
 * Rubrics chosen, a rubric-scored piece of the lesson standing written, and no rubric of the course's for it. Pieces
 * marked in points or as complete, and pieces that say they are scored answer by answer, have none by design. Read by the build's plan, the map and the writer of rubrics alone.
 */
/**
 * A piece that says of itself that it is scored answer by answer: "Each correct answer earns 1 point; an incorrect or
 * unanswered question earns 0 points." Such a piece has no rubric because it needs none, whatever the grading table
 * says of its component. Taken for a piece that lacked one, eight reading quizzes and clicker rounds in four courses
 * were each given four criteria of four levels beside a sentence that promised a point an answer.
 */
export function scoredByAnswer(piece: Assignment): boolean {
  const text = [piece.prompt, ...piece.steps].join('\n');
  return /\b(?:each|every|a|per)\s+(?:correct\s+)?(?:answer|response|question|item|problem)\b[^.\n]{0,80}?\b\d+(?:\.\d+)?\s*points?\b|\b\d+(?:\.\d+)?\s*points?\s+(?:each|per (?:question|answer|item|problem|correct answer)|for (?:each|every|a) correct)\b|\b(?:one|1) point for (?:each|every|a) correct\b/i.test(text);
}

export function piecesLackingRubric(course: Course, lesson: Lesson): Assignment[] {
  if (!course.materials.rubrics.enabled || !setsWork(lesson, 'rubrics')) return [];
  const scored = new Set(lessonPieces(lesson).filter((p) => p.kind === 'assignment' || p.kind === 'inclass').map((p) => p.toward.trim()));
  const byPoints = (toward: string) => {
    const g = course.grading.find((x) => x.item.trim() === toward);
    return g?.judged === 'complete' || Boolean(g?.card?.points);
  };
  return lesson.taskIds.flatMap((id) => {
    const t = course.tasks[id];
    return t?.kind === 'assignment' && scored.has(t.toward.trim()) && !byPoints(t.toward.trim()) && !scoredByAnswer(t) && !(t.rubricId && course.rubrics[t.rubricId]) ? [t] : [];
  });
}

