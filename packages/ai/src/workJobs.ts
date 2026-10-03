import { cmd, newId, type Command, type Course, type Flag, type Lesson, type Rubric, type Task } from '@folio/core';
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
  check: (v) =>
    v.rubric.criteria
      .filter((c) => c.descriptors.length !== v.rubric.levels.length)
      .map((c) => ({ index: null, flag: { code: 'criterionLevels', values: { criterion: c.name } } })),
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
    };
    return [cmd('tasks.fill', { lessonId: lesson.id, kind: 'assignments', flags: flagsAt(problems, null), tasks: [task], rubrics: [] })];
  },
};

const pointsOf = (n: number) => (n === 1 ? '1 point' : `${n} points`);
/** The text without the points a model wrote at its end: Folio adds them, and they stood there twice. */
const withoutPoints = (text: string) => text.trim().replace(/(?:\s*\(\d+\s*(?:points?|pts?|marks?)\))+\s*$/i, '');

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
      steps: v.questions.map((q) => `${withoutPoints(q.question)} (${pointsOf(q.points)})`),
      rubricId: null,
      answerKey: [...v.questions.map((q, i) => `${i + 1}. ${withoutPoints(q.answer)} (${pointsOf(q.points)})`), `Total: ${pointsOf(total)}`].join('\n'),
    };
    return [cmd('tasks.fill', { lessonId: lesson.id, kind: 'assignments', flags: flagsAt(problems, null), tasks: [task], rubrics: [] })];
  },
};
