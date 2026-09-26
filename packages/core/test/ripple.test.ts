import { describe, expect, it } from 'vitest';
import { CourseStore, attentionItems, cellState, cmd, orderedLessons, staleItems, staleReasons } from '../src';
import { sampleCourse } from '../src/sample';

describe('ripple', () => {
  it('starts with everything up to date', () => {
    const course = sampleCourse();
    expect(staleItems(course)).toEqual([]);
    expect(attentionItems(course)).toEqual([]);
    const lesson = orderedLessons(course)[0]!;
    expect(cellState(course, lesson, 'quiz')).toBe('ready');
  });

  it('marks dependent sections out of date when an objective changes', () => {
    const store = new CourseStore(sampleCourse());
    const lesson = orderedLessons(store.getState())[1]!;
    store.apply([cmd('objective.update', { objectiveId: lesson.objectiveIds[0]!, text: 'Something new' })], {
      label: { key: 't' },
      source: 'teacher',
    });
    const state = store.getState();
    const fresh = state.lessons[lesson.id]!;
    expect(staleReasons(state, fresh, 'quiz')).toEqual(['objectives']);
    expect(staleReasons(state, fresh, 'faq')).toEqual([]);
    expect(cellState(state, fresh, 'quiz')).toBe('stale');
    expect(staleItems(state).map((s) => s.kind).sort()).toEqual(
      ['assignments', 'discussions', 'plan', 'quiz', 'slides', 'study'].sort(),
    );
  });

  it('ripples a plan edit into slides and the study guide only', () => {
    const store = new CourseStore(sampleCourse());
    const lesson = orderedLessons(store.getState())[0]!;
    store.apply([cmd('plan.update', { lessonId: lesson.id, keyIdeas: ['Only one idea now'] })], {
      label: { key: 't' },
      source: 'teacher',
    });
    const state = store.getState();
    const kinds = staleItems(state).map((s) => s.kind).sort();
    expect(kinds).toEqual(['slides', 'study']);
    expect(state.lessons[lesson.id]!.gen.plan!.edited).toBe(true);
  });

  it('keep-mine clears staleness without changing content, and undo restores it', () => {
    const store = new CourseStore(sampleCourse());
    const lesson = orderedLessons(store.getState())[0]!;
    store.apply([cmd('course.update', { shape: { quizSize: 8 } })], { label: { key: 't' }, source: 'teacher' });
    expect(staleItems(store.getState()).length).toBe(4);
    store.apply([cmd('review.keep', { lessonId: lesson.id, kind: 'quiz' })], { label: { key: 't' }, source: 'teacher' });
    expect(staleItems(store.getState()).length).toBe(3);
    store.undo();
    store.undo();
    expect(staleItems(store.getState())).toEqual([]);
  });
});
