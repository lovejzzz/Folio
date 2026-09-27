import { describe, expect, it } from 'vitest';
import { CourseStore, attentionItems, cellState, cmd, computeBasis, hashValue, orderedLessons, parseCourse, staleItems, staleReasons } from '../src';
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

  it('ripples a plan edit into the sections written from it: slides, study guide, quiz and assignment', () => {
    const store = new CourseStore(sampleCourse());
    const lesson = orderedLessons(store.getState())[0]!;
    store.apply([cmd('plan.update', { lessonId: lesson.id, keyIdeas: ['Only one idea now'] })], {
      label: { key: 't' },
      source: 'teacher',
    });
    const state = store.getState();
    const kinds = staleItems(state).map((s) => s.kind).sort();
    expect(kinds).toEqual(['assignments', 'quiz', 'slides', 'study']);
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

  it('keeps a course saved before readings existed up to date', () => {
    const course = sampleCourse();
    const lesson = orderedLessons(course)[0]!;
    // The basis a section was stamped with before lessons had readings.
    expect(lesson.gen.plan!.basis.lesson).toBe(hashValue([lesson.title, lesson.summary]));
    const saved = JSON.parse(JSON.stringify(course)) as Record<string, unknown>;
    delete saved.grading;
    for (const l of Object.values(saved.lessons as Record<string, Record<string, unknown>>)) delete l.readings;
    const loaded = parseCourse(saved);
    expect(loaded.lessons[lesson.id]!.readings).toEqual([]);
    expect(loaded.grading).toEqual([]);
    expect(staleItems(loaded)).toEqual([]);
  });

  it('marks only the plan and discussions out of date when readings change, and undo restores them', () => {
    const course = sampleCourse();
    const lesson = orderedLessons(course)[0]!;
    // Sections built now record the readings they were built with.
    for (const kind of ['plan', 'discussions', 'slides'] as const) lesson.gen[kind]!.basis = computeBasis(course, lesson, kind);
    const store = new CourseStore(course);
    const meta = { label: { key: 't' }, source: 'teacher' } as const;
    store.apply([cmd('lesson.update', { lessonId: lesson.id, readings: [''] })], meta);
    expect(staleItems(store.getState())).toEqual([]);
    store.apply([cmd('lesson.update', { lessonId: lesson.id, readings: ['Freedman, Statistics, ch. 4'] })], meta);
    const state = store.getState();
    const fresh = state.lessons[lesson.id]!;
    expect(fresh.readings).toEqual(['Freedman, Statistics, ch. 4']);
    expect(staleReasons(state, fresh, 'plan')).toEqual(['readings']);
    expect(staleReasons(state, fresh, 'discussions')).toEqual(['readings']);
    expect(staleReasons(state, fresh, 'slides')).toEqual([]);
    expect(staleReasons(state, fresh, 'quiz')).toEqual([]);
    store.undo();
    store.undo();
    expect(store.getState().lessons[lesson.id]!.readings).toEqual([]);
    expect(staleItems(store.getState())).toEqual([]);
  });
});
