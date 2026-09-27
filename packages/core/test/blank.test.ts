import { describe, expect, it } from 'vitest';
import {
  CourseStore,
  cmd,
  isBlankCriterion,
  isBlankLesson,
  isBlankQuestion,
  lessonQuestions,
  newId,
  orderedLessons,
  project,
  staleItems,
  withoutBlankChoices,
  type Command,
  type Question,
} from '../src';
import { sampleCourse } from '../src/sample';

const teacher = { label: { key: 't' }, source: 'teacher' as const };

function setup() {
  const store = new CourseStore(sampleCourse());
  const lesson = orderedLessons(store.getState())[1]!;
  const run = (...commands: Command[]) => store.apply(commands, teacher);
  const text = (kind: Parameters<typeof project>[1], audience: 'student' | 'teacher' = 'teacher') =>
    JSON.stringify(project(store.getState(), kind, { audience, lessonIds: [lesson.id] }));
  return { store, lesson, run, text };
}

function blankQuestion(lessonId: string): Question {
  return {
    id: newId('t'),
    kind: 'question',
    lessonId,
    objectiveIds: [],
    sourceRefs: [],
    origin: 'teacher',
    edited: true,
    flags: [],
    format: 'choice',
    prompt: '',
    choices: [0, 1, 2, 3].map(() => ({ id: newId('x'), text: '' })),
    correct: null,
    answer: '',
    explanation: '',
    difficulty: 2,
  };
}

describe('blank items', () => {
  it('a blank objective leaves every section up to date until it has text', () => {
    const { store, lesson, run } = setup();
    const id = newId('o');
    run(cmd('objective.add', { objective: { id, text: '' }, lessonId: lesson.id }));
    expect(staleItems(store.getState())).toEqual([]);
    run(cmd('objective.update', { objectiveId: id, text: '   ' }));
    expect(staleItems(store.getState())).toEqual([]);
    run(cmd('objective.update', { objectiveId: id, text: 'Compare two histograms' }));
    expect(staleItems(store.getState()).length).toBeGreaterThan(0);
  });

  it('blank key ideas and steps leave slides and study guides up to date', () => {
    const { store, lesson, run } = setup();
    run(
      cmd('plan.update', {
        lessonId: lesson.id,
        keyIdeas: [...lesson.keyIdeas, ''],
        segments: [...lesson.segments, { id: newId('x'), kind: 'practice', title: '', minutes: 5, description: '', teacherNotes: '' }],
      }),
    );
    expect(staleItems(store.getState()).filter((s) => s.kind !== 'plan')).toEqual([]);
  });

  it('are left out of every projection', () => {
    const { lesson, run, text } = setup();
    const before = { plan: text('plan'), study: text('study'), map: text('map'), syllabus: text('syllabus') };
    run(
      cmd('objective.add', { objective: { id: newId('o'), text: '' }, lessonId: lesson.id }),
      cmd('plan.update', {
        lessonId: lesson.id,
        keyIdeas: [...lesson.keyIdeas, ' '],
        segments: [...lesson.segments, { id: newId('x'), kind: 'practice', title: '', minutes: 5, description: '', teacherNotes: '' }],
        vocabulary: [...lesson.vocabulary, { id: newId('x'), term: '', definition: '' }],
      }),
      cmd('study.update', { lessonId: lesson.id, points: [...lesson.study.points, { id: newId('x'), heading: '', explanation: '' }] }),
    );
    expect(text('plan')).toBe(before.plan);
    expect(text('study')).toBe(before.study);
    expect(text('map')).toBe(before.map);
    expect(text('syllabus')).toBe(before.syllabus);
  });

  it('leaves blank questions, discussions, FAQ entries, steps and criteria out of exports', () => {
    const { store, lesson, run, text } = setup();
    const kinds = ['quiz', 'discussions', 'faq', 'assignments', 'rubrics'] as const;
    const before = Object.fromEntries(kinds.map((k) => [k, text(k)]));
    const state = store.getState();
    const assignment = Object.values(state.tasks).find((t) => t.kind === 'assignment' && t.lessonId === lesson.id);
    if (assignment?.kind !== 'assignment' || !assignment.rubricId) throw new Error('sample lesson has an assignment with a rubric');
    const rubric = state.rubrics[assignment.rubricId]!;
    const { id: _id, ...rubricBody } = rubric;
    run(
      cmd('task.add', { task: blankQuestion(lesson.id), afterId: null }),
      cmd('task.add', {
        task: { id: newId('t'), kind: 'discussion', lessonId: lesson.id, objectiveIds: [], sourceRefs: [], origin: 'teacher', edited: true, flags: [], prompt: '', followUps: [''] },
        afterId: null,
      }),
      cmd('faq.add', { entry: { id: newId('f'), lessonId: lesson.id, question: '', answer: '', origin: 'teacher', edited: true, flags: [] } }),
      cmd('task.update', { taskId: assignment.id, fields: { steps: [...assignment.steps, ''] } }),
      cmd('rubric.update', { rubricId: rubric.id, rubric: { ...rubricBody, criteria: [...rubric.criteria, { id: newId('x'), name: '', descriptors: {} }] } }),
    );
    for (const k of kinds) expect(text(k), k).toBe(before[k]);
  });

  it('drop blank choices so letters and the answer key still agree', () => {
    const { store, lesson } = setup();
    const q = lessonQuestions(store.getState(), lesson).find((x) => x.format === 'choice')!;
    const correctIndex = q.choices.findIndex((c) => c.id === q.correct);
    const withBlank = { ...q, choices: [{ id: 'x_blank', text: ' ' }, ...q.choices] };
    const shown = withoutBlankChoices(withBlank);
    expect(shown.choices).toEqual(q.choices);
    expect(shown.correct).toBe(q.correct);
    expect(correctIndex).toBeGreaterThanOrEqual(0);
    expect(withoutBlankChoices({ ...q, choices: [...q.choices.slice(0, 1), { id: 'x_b', text: '' }], correct: 'x_b' }).correct).toBeNull();
  });

  it('are told apart from items with anything in them', () => {
    const { store, lesson } = setup();
    const q = blankQuestion(lesson.id);
    expect(isBlankQuestion(q)).toBe(true);
    expect(isBlankQuestion({ ...q, choices: [{ id: 'x', text: 'Yes' }] })).toBe(false);
    expect(isBlankQuestion({ ...q, explanation: 'Because' })).toBe(false);
    expect(isBlankCriterion({ id: 'x', name: '', descriptors: { a: '' } })).toBe(true);
    expect(isBlankCriterion({ id: 'x', name: '', descriptors: { a: 'Clear' } })).toBe(false);
    expect(isBlankLesson(store.getState(), lesson)).toBe(false);
    expect(isBlankLesson(store.getState(), { ...lesson, title: '', summary: '', objectiveIds: [], segments: [], keyIdeas: [], vocabulary: [], slides: [], study: { overview: '', points: [] }, taskIds: [], faqIds: [], gen: {} })).toBe(true);
  });
});
