import { describe, expect, it } from 'vitest';
import { CourseStore, SHAPE_LIMITS, cmd, newId, orderedLessons } from '@folio/core';
import { sampleCourse } from '@folio/core/sample';
import { checkOperations, operationsToCommands, planCourseChange, type PlanOperation } from '../src';
import { fakeInference } from './fake';

describe('course plans', () => {
  it('resolves lesson numbers against the course before anything moves', () => {
    const course = sampleCourse();
    const [l1, l2, l3, l4] = orderedLessons(course);
    const commands = operationsToCommands(course, [
      { op: 'addLesson', after: 2, title: 'Sampling bias in the news', summary: 'Case studies.', objectives: ['Spot bias'] },
      { op: 'removeLesson', lesson: 1 },
      { op: 'renameLesson', lesson: 4, title: 'Samples' },
      { op: 'setQuizSize', size: 8 },
    ]);
    const store = new CourseStore(course);
    store.apply(commands, { label: { key: 'p' }, source: 'ai' });
    const titles = orderedLessons(store.getState()).map((l) => l.title);
    expect(titles).toEqual([l2!.title, 'Sampling bias in the news', l3!.title, 'Samples']);
    expect(store.getState().shape.quizSize).toBe(8);
    expect(store.getState().lessons[l4!.id]!.title).toBe('Samples');
    expect(store.getState().lessons[l1!.id]).toBeUndefined();
  });

  it('turns a request into a previewable proposal', async () => {
    const course = sampleCourse();
    const inf = fakeInference(() => ({ summary: 'Quizzes get 8 questions.', operations: [{ op: 'setQuizSize', size: 8 }] }));
    const proposal = await planCourseChange(inf, course, 'Make all quizzes 8 questions');
    expect(proposal.basisRevision).toBe(course.revision);
    expect(proposal.preview).toEqual([{ op: 'setQuizSize', size: 8 }]);
    expect(proposal.commands).toHaveLength(1);
    expect(inf.calls[0]!.prompt).toContain('Make all quizzes 8 questions');
  });

  it('leaves impossible steps out of the preview and says why', async () => {
    const course = sampleCourse();
    const inf = fakeInference(() => ({
      summary: 'Remove lesson 99 and make quizzes 40 questions.',
      operations: [
        { op: 'removeLesson', lesson: 99 },
        { op: 'setQuizSize', size: 40 },
        { op: 'renameLesson', lesson: 2, title: 'Pictures of data' },
      ],
    }));
    const proposal = await planCourseChange(inf, course, 'remove lesson 99, quizzes of 40, rename lesson 2');
    expect(proposal.preview).toEqual([{ op: 'renameLesson', lesson: 2, title: 'Pictures of data' }]);
    expect(proposal.skipped).toEqual([
      { op: { op: 'removeLesson', lesson: 99 }, reason: { code: 'noLesson', lesson: 99, count: 4 } },
      { op: { op: 'setQuizSize', size: 40 }, reason: { code: 'range', min: 1, max: SHAPE_LIMITS.quizSize.max } },
    ]);
    expect(proposal.commands).toHaveLength(1);
    // The model is told the limits up front.
    expect(inf.calls[0]!.prompt).toContain(`1–${SHAPE_LIMITS.quizSize.max} questions per quiz`);
  });

  it('accepts a quiz size of 40 from the model so it can say it is out of range, instead of repairing it', async () => {
    const inf = fakeInference(() => ({ summary: 'x', operations: [{ op: 'setQuizSize', size: 40 }] }));
    const proposal = await planCourseChange(inf, sampleCourse(), 'quizzes of 40');
    expect(inf.calls).toHaveLength(1);
    expect(proposal.preview).toEqual([]);
    expect(proposal.skipped[0]!.reason.code).toBe('range');
  });

  it('shows nothing to do when every step would change nothing', () => {
    const course = sampleCourse();
    const first = orderedLessons(course)[0]!;
    const checked = checkOperations(course, [
      { op: 'setQuizSize', size: course.shape.quizSize },
      { op: 'setMinutes', minutes: course.shape.minutesPerLesson },
      { op: 'setLevel', level: ` ${course.audience.level.toLowerCase()} ` },
      { op: 'setMaterial', material: 'slides', enabled: true },
      { op: 'renameLesson', lesson: 1, title: first.title },
      { op: 'moveLesson', lesson: 3, to: 3 },
    ]);
    expect(checked.operations).toEqual([]);
    expect(checked.skipped.map((s) => s.reason.code)).toEqual(['unchanged', 'unchanged', 'unchanged', 'unchanged', 'unchanged', 'unchanged']);
  });

  it('follows the plan step by step: a lesson removed earlier cannot be renamed, moved or added after', () => {
    const course = sampleCourse();
    const ops: PlanOperation[] = [
      { op: 'removeLesson', lesson: 2 },
      { op: 'removeLesson', lesson: 2 },
      { op: 'renameLesson', lesson: 2, title: 'Gone' },
      { op: 'addObjective', lesson: 2, text: 'Gone' },
      { op: 'addLesson', after: 2, title: 'After a removed lesson', summary: 's', objectives: ['o'] },
      { op: 'moveLesson', lesson: 1, to: 4 },
      { op: 'setQuizSize', size: 8 },
      { op: 'setQuizSize', size: 8 },
    ];
    const checked = checkOperations(course, ops);
    expect(checked.operations).toEqual([ops[0], { op: 'setQuizSize', size: 8 }]);
    expect(checked.skipped.map((s) => s.reason)).toEqual([
      { code: 'removed' },
      { code: 'removed' },
      { code: 'removed' },
      { code: 'removed' },
      { code: 'noLesson', lesson: 4, count: 3 },
      { code: 'unchanged' },
    ]);
    // What is left applies cleanly.
    const store = new CourseStore(course);
    store.apply(operationsToCommands(course, checked.operations), { label: { key: 'p' }, source: 'ai' });
    expect(store.getState().lessonOrder).toHaveLength(3);
  });

  it('keeps the lesson count within the shared limits', () => {
    const store = new CourseStore(sampleCourse());
    const oneLesson = checkOperations(store.getState(), [1, 2, 3, 4].map((lesson) => ({ op: 'removeLesson', lesson }) as const));
    expect(oneLesson.operations).toHaveLength(3);
    expect(oneLesson.skipped).toEqual([{ op: { op: 'removeLesson', lesson: 4 }, reason: { code: 'lastLesson' } }]);

    const max = SHAPE_LIMITS.lessons.max;
    for (let i = store.getState().lessonOrder.length; i < max - 1; i++) {
      store.apply([cmd('lesson.insert', { lesson: { id: newId('l'), title: `L${i}`, summary: '' }, afterId: null })], { label: { key: 't' }, source: 'teacher' });
    }
    const add = (title: string): PlanOperation => ({ op: 'addLesson', after: 0, title, summary: 's', objectives: ['o'] });
    const full = checkOperations(store.getState(), [add('Fits'), add('One too many')]);
    expect(full.operations.map((o) => (o.op === 'addLesson' ? o.title : ''))).toEqual(['Fits']);
    expect(full.skipped[0]!.reason).toEqual({ code: 'tooMany', max });
  });

  it('checks minutes against the same range as the plan screen', () => {
    const { min, max } = SHAPE_LIMITS.minutesPerLesson;
    const checked = checkOperations(sampleCourse(), [
      { op: 'setMinutes', minutes: min - 1 },
      { op: 'setMinutes', minutes: max + 1 },
      { op: 'setMinutes', minutes: 45 },
    ]);
    expect(checked.operations).toEqual([{ op: 'setMinutes', minutes: 45 }]);
    expect(checked.skipped.map((s) => s.reason)).toEqual([
      { code: 'range', min, max },
      { code: 'range', min, max },
    ]);
  });
});
