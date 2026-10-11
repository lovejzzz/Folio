import { cmd, lessonPieces, newId, orderedLessons, setsWork, type Assignment, type Command, type Course, type Lesson, type Rubric } from '@folio/core';
import type { Inference } from './inference';
import { runJob } from './jobs';
import { courseBackground, lessonContext, systemPrompt } from './prompts';
import { universityRubric } from './scales';
import { AssignmentDraft } from './schemas';

/**
 * A rubric for graded work that stands without one. Rubrics were written only with their assignment, so a piece
 * whose rubric was deleted, or lost on the way in from a file, could get one back only by being written again:
 * the teacher's own words replaced to mend what was missing beside them. Here the piece is read and not touched.
 * Where another piece of the same component has a rubric, that one is taken as it is (every part of a component is
 * scored on one rubric) and no model is asked.
 */

const RubricDraft = AssignmentDraft.shape.rubric;

/** A lesson's written pieces that a rubric scores and that point at none the course holds. */
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

/** The rubric another piece of the same component already has, copied under a new id: the component's one rubric. */
export function siblingRubric(course: Course, piece: Assignment): Rubric | null {
  if (!piece.toward.trim()) return null;
  const other = Object.values(course.tasks).find((t) => t.kind === 'assignment' && t.id !== piece.id && t.toward.trim() === piece.toward.trim() && t.rubricId && course.rubrics[t.rubricId]);
  const found = other?.kind === 'assignment' && other.rubricId ? course.rubrics[other.rubricId] : undefined;
  if (!found) return null;
  const levels = found.levels.map((lv) => ({ ...lv, id: newId('x') }));
  return { id: newId('r'), title: found.title, levels, criteria: found.criteria.map((c) => ({ id: newId('x'), name: c.name, descriptors: Object.fromEntries(found.levels.map((lv, i) => [levels[i]!.id, c.descriptors[lv.id] ?? ''])) })) };
}

export function rubricAlonePrompt(course: Course, lesson: Lesson, piece: Assignment): string {
  // A rubric written for the first of a run of pieces is taken by the rest: written to that piece's own topic, a
  // problem set on stacks was scored on "Code for `count` and `remove_front`", which was the week before's.
  const run = piece.toward.trim() && orderedLessons(course).filter((l) => lessonPieces(l).some((p) => p.toward.trim() === piece.toward.trim())).length > 1;
  const shared = run ? ` Every piece of "${piece.toward.trim()}" in the course is scored on this one rubric: name its criteria for what any of them shows (such as correct results, reasoning shown, clear presentation), never for this lesson's topic, functions or documents, and write descriptors that fit them all.` : '';
  return [
    lessonContext(course, lesson),
    `This piece of graded work stands as written and is not to be changed in any word:\n\nTitle: ${piece.title}\n${piece.prompt}\n${piece.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`,
    `Write only its rubric: two to five criteria, each for something the piece as written asks a student to do, with a descriptor for every level that a marker could apply to a student's work. ${universityRubric(course.locale)} Nothing in the rubric asks for what the piece does not ask.${shared}`,
  ].join('\n\n');
}

/** The command that gives one piece its rubric: a sibling's, or one written for it. Null when none could be had. */
export async function rubricFor(inference: Inference, course: Course, lesson: Lesson, piece: Assignment, signal?: AbortSignal): Promise<Command | null> {
  const copied = siblingRubric(course, piece);
  if (copied) return cmd('rubric.attach', { taskId: piece.id, rubric: copied });
  const result = await runJob(inference, { task: 'folio_rubric', system: systemPrompt(course.language, course.locale), context: courseBackground(course), prompt: rubricAlonePrompt(course, lesson, piece), effort: 'medium', schema: RubricDraft, signal });
  const v = result.value;
  if (!v.criteria.length || v.criteria.some((c) => c.descriptors.length !== v.levels.length)) return null;
  const levels = v.levels.map((lv) => ({ id: newId('x'), label: lv.label, points: lv.points }));
  const rubric: Rubric = { id: newId('r'), title: piece.title, levels, criteria: v.criteria.map((c) => ({ id: newId('x'), name: c.name, descriptors: Object.fromEntries(levels.map((lv, i) => [lv.id, c.descriptors[i] ?? ''])) })) };
  return cmd('rubric.attach', { taskId: piece.id, rubric });
}

/**
 * Give every piece that lacks one its rubric, lesson by lesson, one at a time so a later piece of a component takes
 * the rubric an earlier one was just given. Returns how many were given and how many could not be.
 */
export async function fillRubrics(inference: Inference, getCourse: () => Course, commit: (commands: Command[]) => void, lessonIds?: readonly string[], signal?: AbortSignal): Promise<{ given: number; failed: number }> {
  let given = 0;
  let failed = 0;
  for (const { id } of orderedLessons(getCourse()).filter((l) => !lessonIds || lessonIds.includes(l.id))) {
    for (const { id: taskId } of piecesLackingRubric(getCourse(), getCourse().lessons[id]!)) {
      if (signal?.aborted) return { given, failed };
      const course = getCourse();
      const piece = course.tasks[taskId];
      const command = piece?.kind === 'assignment' ? await rubricFor(inference, course, course.lessons[id]!, piece, signal).catch(() => null) : null;
      if (command) commit([command]);
      if (command) given += 1;
      else failed += 1;
    }
  }
  return { given, failed };
}
