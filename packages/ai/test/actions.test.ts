import { describe, expect, it } from 'vitest';
import { CourseStore, orderedLessons } from '@folio/core';
import { sampleCourse } from '@folio/core/sample';
import { operationsToCommands, planCourseChange } from '../src';
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
});
