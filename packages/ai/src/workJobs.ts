import { cmd, lessonPieces, newId, type Command, type Course, type Flag, type Lesson, type Rubric, type Task } from '@folio/core';
import type { JobSpec, Problem } from './jobs';
import { AssignmentDraft, StepDraft, TestDraft } from './schemas';
import { tidySteps, unnumberSteps } from './tidy';

/**
 * The jobs that write the work a lesson holds: a graded assignment with its rubric, a step toward a larger
 * piece, and a test taken in class; with what every section job shares.
 */

/** Everything one generated section needs: its schema, its checks and how it becomes commands. */
export interface SectionJob<T> {
  schema: JobSpec<T>['schema'];
  tidy?: (value: T, course: Course, lesson: Lesson) => T;
  check?: (value: T, course: Course, lesson: Lesson) => Problem[];
  toCommands: (value: T, problems: Problem[], course: Course, lesson: Lesson) => Command[];
}

/** The flags for one item, or for the whole section when index is null. */
export function flagsAt(problems: Problem[], index: number | null): Flag[] {
  return problems.filter((p) => p.index === index).map((p) => p.flag);
}

export const base = (lesson: Lesson) => ({ lessonId: lesson.id, sourceRefs: [], origin: 'ai' as const, edited: false });


export const assignments: SectionJob<AssignmentDraft> = {
  schema: AssignmentDraft,
  tidy: tidySteps,
  check: (v, _course, lesson) => [
    ...v.rubric.criteria
      .filter((c) => c.descriptors.length !== v.rubric.levels.length)
      .map((c): Problem => ({ index: null, flag: { code: 'criterionLevels', values: { criterion: c.name } } })),
    // Work graded in class needs its running order: who goes when, what the others do, how it is scored in the time.
    ...(lesson.homework.kind === 'inclass' && !v.answerKey.trim()
      ? [{ index: null, flag: { code: 'schemaIssue' as const, values: { path: 'answerKey', issue: 'Say how the teacher runs and scores this for a whole class in the lesson' } } }]
      : []),
  ],
  toCommands: (v, problems, _course, lesson) => {
    const levels = v.rubric.levels.map((lv) => ({ id: newId('x'), label: lv.label, points: lv.points }));
    const rubric: Rubric = {
      id: newId('r'),
      title: v.title,
      levels,
      criteria: v.rubric.criteria.map((c) => ({
        id: newId('x'),
        name: c.name,
        descriptors: Object.fromEntries(levels.map((lv, i) => [lv.id, c.descriptors[i] ?? ''])),
      })),
    };
    const task: Task = {
      ...base(lesson),
      id: newId('t'),
      kind: 'assignment',
      objectiveIds: [...lesson.objectiveIds],
      flags: [],
      title: v.title,
      prompt: v.prompt,
      steps: v.steps,
      rubricId: rubric.id,
      answerKey: v.answerKey.trim(),
      toward: lesson.homework.toward.trim(),
    };
    return [cmd('tasks.fill', { lessonId: lesson.id, kind: 'assignments', flags: flagsAt(problems, null), tasks: [task], rubrics: [rubric] })];
  },
};

export const step: SectionJob<StepDraft> = {
  schema: StepDraft,
  tidy: unnumberSteps,
  toCommands: (v, problems, _course, lesson) => {
    const task: Task = {
      ...base(lesson),
      id: newId('t'),
      kind: 'assignment',
      objectiveIds: [...lesson.objectiveIds],
      flags: [],
      title: v.title,
      prompt: v.prompt,
      steps: v.steps,
      rubricId: null,
      answerKey: '',
      toward: lesson.homework.toward.trim(),
    };
    return [cmd('tasks.fill', { lessonId: lesson.id, kind: 'assignments', flags: flagsAt(problems, null), tasks: [task], rubrics: [] })];
  },
};

const pointsOf = (n: number) => (n === 1 ? '1 point' : `${n} points`);
/** The text without the points a model wrote at its end: Folio adds them, and they stood there twice. */
const withoutPoints = (text: string, points: number) => text.trim().replace(new RegExp(String.raw`(?:\s*\(${points}\s*(?:points?|pts?|marks?)\))+\s*$`, 'i'), '');

/**
 * A test taken in class, kept as an assignment whose steps are its questions, each with its points, and whose
 * answer key is the teacher's alone. Before this a unit test worth half a grade was a line in a plan.
 */
export const test: SectionJob<TestDraft> = {
  schema: TestDraft,
  toCommands: (v, problems, _course, lesson) => {
    const total = v.questions.reduce((n, q) => n + q.points, 0);
    const task: Task = {
      ...base(lesson),
      id: newId('t'),
      kind: 'assignment',
      objectiveIds: [...lesson.objectiveIds],
      flags: [],
      title: v.title,
      prompt: v.instructions,
      steps: v.questions.map((q) => `${withoutPoints(q.question, q.points)} (${pointsOf(q.points)})`),
      rubricId: null,
      answerKey: [...v.questions.map((q, i) => `${i + 1}. ${withoutPoints(q.answer, q.points)} (${pointsOf(q.points)})`), `Total: ${pointsOf(total)}`].join('\n'),
      toward: lesson.homework.toward.trim(),
    };
    return [cmd('tasks.fill', { lessonId: lesson.id, kind: 'assignments', flags: flagsAt(problems, null), tasks: [task], rubrics: [] })];
  },
};

// A graded clicker round had a brief ("answer the instructor's questions") and a plan that ran "the clicker questions": nobody wrote one.
export const EACH_TIME = '; its brief and rubric are one text for every time and hold no questions or problems, so the ones of this time are written out in full, with their answers in the notes, in the segment that runs it';

const PIECE: Record<string, string> = { assignment: 'the graded assignment', step: 'a short ungraded step toward', test: 'the graded test', inclass: 'the piece graded in class', none: '' };

/** What a lesson holds beside its main piece, for its plan: the plan sets or runs each, and writes none of them. */
export function otherPieces(lesson: Lesson, due: (piece: Lesson['homework']) => string = () => ''): string {
  // Each by where it happens: told "set before students leave, or run in the lesson", plans ran a weekly paper as silent writing in class.
  const moment = (p: Lesson['homework']) => (p.kind === 'inclass' ? `run in the lesson${p.standing ? EACH_TIME : ''}` : p.kind === 'test' ? 'sat in the lesson' : p.standing ? 'done outside class every time: the close sets it in a sentence, and no lesson time goes to writing it' : 'set before students leave');
  // With when it is due, as the piece itself is told: untold, a page gave a step "by Sunday" that its own text set five weeks on.
  const others = (lesson.also ?? []).filter((p) => p.kind !== 'none').map((p) => `${PIECE[p.kind]}${p.toward.trim() ? ` "${p.toward.trim()}"` : ''} (${[moment(p), due(p)].filter(Boolean).join('; ')})`);
  return others.length ? ` The lesson also holds, each written separately: ${others.join('; ')}. The plan gives each its moment and writes none of them.` : '';
}

/** The assignment a lesson holds for one component: the one written for it, else the lesson's first. */
export function workOf(course: Course, lesson: Lesson | undefined, toward: string): Task | undefined {
  const all = (lesson?.taskIds ?? []).map((id) => course.tasks[id]).filter((t) => t?.kind === 'assignment');
  return all.find((t) => t?.kind === 'assignment' && t.toward.trim() === toward) ?? all[0];
}

/**
 * A piece that is one piece wherever it appears is written once, and the later lessons take the first one's
 * instructions, rubric and notes as they stand: work graded in class over several lessons (an oral interview
 * taken in two groups), and a standing task set again each week (a response to the reading). Written again for
 * each lesson, the second day's students were scored on a different rubric for the same 40%, and a seminar's
 * weekly response paper came with nine briefs and nine rubrics.
 */
export function continuedInClass(course: Course, lesson: Lesson): Command[] | null {
  const { kind, standing } = lesson.homework;
  const toward = lesson.homework.toward.trim();
  // Work in class the outline marked as different pieces of one component (an organizer, then a draft) is written each on its
  // own: taken for one piece in groups, the draft was given the organizer's brief and rubric, word for word.
  // A paper sat in class is never the same paper twice: marked standing, a lab's second pre-lab quiz was its first, word for word.
  if (kind === 'test' || !(kind === 'inclass' ? standing !== false : standing) || !toward) return null;
  const first = course.lessonOrder
    .slice(0, course.lessonOrder.indexOf(lesson.id))
    .map((id) => course.lessons[id])
    .find((l) => l && lessonPieces(l).some((p) => p.kind === kind && p.toward.trim() === toward));
  const source = workOf(course, first, toward);
  if (!source || source.kind !== 'assignment') return null;
  const scale = source.rubricId ? course.rubrics[source.rubricId] : undefined;
  const levelIds = new Map((scale?.levels ?? []).map((lv) => [lv.id, newId('x')]));
  const rubric: Rubric | null = scale
    ? {
        id: newId('r'),
        title: scale.title,
        levels: scale.levels.map((lv) => ({ ...lv, id: levelIds.get(lv.id)! })),
        criteria: scale.criteria.map((c) => ({ id: newId('x'), name: c.name, descriptors: Object.fromEntries(Object.entries(c.descriptors).map(([id, text]) => [levelIds.get(id) ?? id, text])) })),
      }
    : null;
  const task: Task = { ...source, ...base(lesson), id: newId('t'), objectiveIds: [...lesson.objectiveIds], flags: [], rubricId: rubric?.id ?? null, toward };
  return [cmd('tasks.fill', { lessonId: lesson.id, kind: 'assignments', flags: [], tasks: [task], rubrics: rubric ? [rubric] : [] })];
}
