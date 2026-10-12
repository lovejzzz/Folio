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

/**
 * The lesson's tasks that are its ungraded steps toward a larger piece. A step and the piece it leads to are written
 * for one component ("Essay 1") and a task does not say which it is: they are told apart by their order, which is the
 * order of the lesson's pieces. Taken for the piece, a draft that told students "this is an ungraded step" was given a
 * rubric of four criteria and sixteen points.
 */
export function stepTasks(course: Course, lesson: Lesson): Set<string> {
  const steps = new Set<string>();
  const pieces = lessonPieces(lesson);
  for (const toward of new Set(pieces.map((p) => p.toward.trim()))) {
    const of = pieces.filter((p) => p.toward.trim() === toward);
    const tasks = lesson.taskIds.map((id) => course.tasks[id]).filter((t): t is Assignment => t?.kind === 'assignment' && t.toward.trim() === toward);
    // One task a piece, in order: where the counts differ (a task removed, one added by hand) nothing can be told.
    if (of.length === tasks.length) of.forEach((p, i) => p.kind === 'step' && steps.add(tasks[i]!.id));
  }
  return steps;
}

export function piecesLackingRubric(course: Course, lesson: Lesson): Assignment[] {
  if (!course.materials.rubrics.enabled || !setsWork(lesson, 'rubrics')) return [];
  const scored = new Set(lessonPieces(lesson).filter((p) => p.kind === 'assignment' || p.kind === 'inclass').map((p) => p.toward.trim()));
  const byPoints = (toward: string) => {
    const g = course.grading.find((x) => x.item.trim() === toward);
    return g?.judged === 'complete' || Boolean(g?.card?.points);
  };
  const steps = stepTasks(course, lesson);
  return lesson.taskIds.flatMap((id) => {
    const t = course.tasks[id];
    return t?.kind === 'assignment' && scored.has(t.toward.trim()) && !steps.has(t.id) && !byPoints(t.toward.trim()) && !scoredByAnswer(t) && !(t.rubricId && course.rubrics[t.rubricId]) ? [t] : [];
  });
}
