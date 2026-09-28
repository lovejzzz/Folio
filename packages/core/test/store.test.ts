import { describe, expect, it } from 'vitest';
import { CourseStore, cmd, createCourse, newId, orderedLessons } from '../src';

function courseWithLessons(n: number) {
  const store = new CourseStore(createCourse({ title: 'Test' }));
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const id = newId('l');
    ids.push(id);
    store.apply([cmd('lesson.insert', { lesson: { id, title: `L${i + 1}`, summary: '' }, afterId: ids[i - 1] ?? null })], {
      label: { key: 't' },
      source: 'teacher',
    });
  }
  return { store, ids };
}

describe('CourseStore', () => {
  it('applies commands and bumps the revision outside the patches', () => {
    const { store, ids } = courseWithLessons(2);
    expect(store.getState().revision).toBe(2);
    expect(orderedLessons(store.getState()).map((l) => l.title)).toEqual(['L1', 'L2']);
    store.apply([cmd('lesson.update', { lessonId: ids[0]!, title: 'Renamed' })], { label: { key: 't' }, source: 'teacher' });
    expect(store.getState().lessons[ids[0]!]!.title).toBe('Renamed');
  });

  it('marks every change uniquely, so two copies changed at the same moment still differ', () => {
    const { store, ids } = courseWithLessons(1);
    const first = new CourseStore(store.getState());
    const second = new CourseStore(store.getState());
    first.apply([cmd('lesson.update', { lessonId: ids[0]!, title: 'From one' })], { label: { key: 't' }, source: 'teacher' });
    second.apply([cmd('lesson.update', { lessonId: ids[0]!, title: 'From two' })], { label: { key: 't' }, source: 'teacher' });
    expect(first.getState().revision).toBe(second.getState().revision);
    expect(first.getState().stamp).toBeTruthy();
    expect(first.getState().stamp).not.toBe(second.getState().stamp);
  });

  it('undoes and redoes', () => {
    const { store, ids } = courseWithLessons(1);
    store.apply([cmd('lesson.update', { lessonId: ids[0]!, title: 'New' })], { label: { key: 't' }, source: 'teacher' });
    expect(store.undo()).toEqual({ ok: true });
    expect(store.getState().lessons[ids[0]!]!.title).toBe('L1');
    expect(store.redo()).toEqual({ ok: true });
    expect(store.getState().lessons[ids[0]!]!.title).toBe('New');
  });

  it('keeps undo correct after lessons are reordered', () => {
    const { store, ids } = courseWithLessons(3);
    store.apply([cmd('lesson.update', { lessonId: ids[2]!, title: 'Third' })], { label: { key: 't' }, source: 'teacher' });
    const rename = store.getHistory().at(-1)!;
    store.apply([cmd('lesson.move', { lessonId: ids[2]!, toIndex: 0 })], { label: { key: 't' }, source: 'teacher' });
    expect(store.undo(rename.id)).toEqual({ ok: true });
    const state = store.getState();
    expect(state.lessonOrder[0]).toBe(ids[2]);
    expect(state.lessons[ids[2]!]!.title).toBe('L3');
  });

  it('undoes several changes to the same list one after another', () => {
    const { store } = courseWithLessons(1);
    store.apply([cmd('lesson.insert', { lesson: { id: newId('l'), title: 'L2', summary: '' }, afterId: null })], { label: { key: 't' }, source: 'teacher' });
    store.apply([cmd('lesson.insert', { lesson: { id: newId('l'), title: 'L3', summary: '' }, afterId: null })], { label: { key: 't' }, source: 'teacher' });
    const [a, b] = orderedLessons(store.getState());
    store.apply([cmd('lesson.move', { lessonId: a!.id, toIndex: 2 })], { label: { key: 't' }, source: 'teacher' });
    store.apply([cmd('lesson.move', { lessonId: b!.id, toIndex: 2 })], { label: { key: 't' }, source: 'teacher' });
    const final = orderedLessons(store.getState()).map((l) => l.title);
    for (let i = 0; i < 4; i++) expect(store.undo()).toEqual({ ok: true });
    expect(orderedLessons(store.getState()).map((l) => l.title)).toEqual(['L1']);
    for (let i = 0; i < 4; i++) expect(store.redo()).toEqual({ ok: true });
    expect(orderedLessons(store.getState()).map((l) => l.title)).toEqual(final);
  });

  it('refuses to undo a change that later edits touched', () => {
    const { store, ids } = courseWithLessons(1);
    store.apply([cmd('lesson.update', { lessonId: ids[0]!, title: 'A' })], { label: { key: 't' }, source: 'teacher' });
    const first = store.getHistory().at(-1)!;
    store.apply([cmd('lesson.update', { lessonId: ids[0]!, title: 'B' })], { label: { key: 't' }, source: 'teacher' });
    expect(store.canUndoEntry(first.id)).toBe(false);
    expect(store.undo(first.id)).toEqual({ ok: false, reason: 'conflict' });
    expect(store.getState().lessons[ids[0]!]!.title).toBe('B');
  });

  it('skips build steps on plain undo', () => {
    const { store, ids } = courseWithLessons(1);
    store.apply([cmd('lesson.update', { lessonId: ids[0]!, summary: 'teacher' })], { label: { key: 't' }, source: 'teacher' });
    store.apply([cmd('course.update', { title: 'Built' })], { label: { key: 'b' }, source: 'ai', undoable: false });
    expect(store.undo()).toEqual({ ok: true });
    expect(store.getState().lessons[ids[0]!]!.summary).toBe('');
    expect(store.getState().title).toBe('Built');
  });

  it('keeps silent bookkeeping out of history', () => {
    const { store } = courseWithLessons(1);
    const before = store.getHistory().length;
    store.apply([cmd('course.update', { status: 'ready' })], { label: { key: 's' }, source: 'ai', silent: true });
    expect(store.getState().status).toBe('ready');
    expect(store.getHistory()).toHaveLength(before);
  });

  it('removes a lesson with its tasks and orphaned objectives', () => {
    const { store, ids } = courseWithLessons(2);
    const objective = { id: newId('o'), text: 'Know things' };
    store.apply([cmd('objective.add', { objective, lessonId: ids[0]! })], { label: { key: 't' }, source: 'teacher' });
    store.apply([cmd('lesson.remove', { lessonId: ids[0]! })], { label: { key: 't' }, source: 'teacher' });
    const state = store.getState();
    expect(state.lessonOrder).toEqual([ids[1]]);
    expect(state.objectives[objective.id]).toBeUndefined();
    store.undo();
    expect(store.getState().objectives[objective.id]?.text).toBe('Know things');
    expect(store.getState().lessonOrder).toEqual(ids);
  });
});
