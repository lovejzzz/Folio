import { describe, expect, it } from 'vitest';
import { CourseStore, HISTORY_LIMIT, cmd, createCourse, newId, sameValue, type Course } from '../src';

const label = { key: 't' };

function storeWithLesson() {
  const store = new CourseStore(createCourse({ title: 'Test' }));
  const lessonId = newId('l');
  store.apply([cmd('lesson.insert', { lesson: { id: lessonId, title: 'One', summary: '' }, afterId: null })], { label, source: 'teacher' });
  return { store, lessonId };
}

/** What a reload does: the course and its history go through storage and come back as copies. */
function reload(store: CourseStore, via: 'json' | 'clone' = 'json'): CourseStore {
  const copy = <T,>(value: T): T => (via === 'json' ? (JSON.parse(JSON.stringify(value)) as T) : structuredClone(value));
  return new CourseStore(copy(store.getState()) as Course, copy(store.exportHistory()));
}

describe('history on disk', () => {
  it('undoes an entry restored from storage', () => {
    const { store, lessonId } = storeWithLesson();
    store.apply([cmd('lesson.update', { lessonId, title: 'Renamed' })], { label: { key: 'renamedLesson', values: { n: 1 } }, source: 'teacher' });
    for (const via of ['json', 'clone'] as const) {
      const restored = reload(store, via);
      expect(restored.getHistory().map((e) => e.label.key)).toEqual(['t', 'renamedLesson']);
      expect(restored.getHistory()[1]!.label.values).toEqual({ n: 1 });
      expect(restored.canUndo()).toBe(true);
      expect(restored.undo()).toEqual({ ok: true });
      expect(restored.getState().lessons[lessonId]!.title).toBe('One');
      expect(restored.redo()).toEqual({ ok: true });
      expect(restored.getState().lessons[lessonId]!.title).toBe('Renamed');
    }
  });

  it('undoes list changes (whole-array refs) after a round trip', () => {
    const { store } = storeWithLesson();
    const second = newId('l');
    store.apply([cmd('lesson.insert', { lesson: { id: second, title: 'Two', summary: '' }, afterId: null })], { label, source: 'teacher' });
    store.apply([cmd('lesson.move', { lessonId: second, toIndex: 1 })], { label, source: 'teacher' });
    const restored = reload(store);
    expect(restored.undo()).toEqual({ ok: true });
    expect(restored.getState().lessonOrder[0]).toBe(second);
    expect(restored.undo()).toEqual({ ok: true });
    expect(restored.getState().lessonOrder).toHaveLength(1);
  });

  it('still refuses an undo that later changes would clobber', () => {
    const { store, lessonId } = storeWithLesson();
    store.apply([cmd('lesson.update', { lessonId, title: 'A' })], { label, source: 'teacher' });
    const first = store.getHistory().at(-1)!;
    store.apply([cmd('lesson.update', { lessonId, title: 'B' })], { label, source: 'teacher' });
    const restored = reload(store);
    expect(restored.canUndoEntry(first.id)).toBe(false);
    expect(restored.undo(first.id)).toEqual({ ok: false, reason: 'conflict' });
    expect(restored.getState().lessons[lessonId]!.title).toBe('B');
    // The latest one is fine, and after it, the first one is too.
    expect(restored.undo()).toEqual({ ok: true });
    expect(restored.canUndoEntry(first.id)).toBe(true);
  });

  it('refuses an undo when the saved course moved on without its history', () => {
    const { store, lessonId } = storeWithLesson();
    store.apply([cmd('lesson.update', { lessonId, title: 'A' })], { label, source: 'teacher' });
    const history = store.exportHistory();
    store.apply([cmd('lesson.update', { lessonId, title: 'Typed as the page closed' })], { label, source: 'teacher' });
    const restored = new CourseStore(structuredClone(store.getState()), history);
    expect(restored.undo()).toEqual({ ok: false, reason: 'conflict' });
  });

  it('exports copies, keeps the undone state, and caps what it restores', () => {
    const { store, lessonId } = storeWithLesson();
    store.apply([cmd('lesson.update', { lessonId, title: 'A' })], { label, source: 'teacher' });
    const before = store.exportHistory();
    store.undo();
    expect(before.at(-1)!.undone).toBe(false);
    expect(store.exportHistory().at(-1)!.undone).toBe(true);
    expect(reload(store).getHistory().at(-1)!.undone).toBe(true);

    const many = Array.from({ length: HISTORY_LIMIT + 5 }, (_, i) => ({ ...before[0]!, id: `x_${i}` }));
    const capped = new CourseStore(store.getState(), many);
    expect(capped.getHistory()).toHaveLength(HISTORY_LIMIT);
    expect(capped.getHistory()[0]!.id).toBe('x_5');
  });

  it('drops malformed entries instead of failing', () => {
    const { store } = storeWithLesson();
    const good = store.exportHistory()[0]!;
    const restored = new CourseStore(store.getState(), [null, 'x', { id: 'x_1' }, { ...good, patches: 'nope' }, good]);
    expect(restored.getHistory().map((e) => e.id)).toEqual([good.id]);
    restored.importHistory([]);
    expect(restored.getHistory()).toEqual([]);
  });

  it('reset takes the history saved with the course', () => {
    const { store, lessonId } = storeWithLesson();
    store.apply([cmd('lesson.update', { lessonId, title: 'A' })], { label, source: 'teacher' });
    const other = new CourseStore(createCourse({ title: 'Other' }));
    other.reset(structuredClone(store.getState()), store.exportHistory());
    expect(other.undo()).toEqual({ ok: true });
    expect(other.getState().lessons[lessonId]!.title).toBe('One');
    other.reset(store.getState());
    expect(other.getHistory()).toEqual([]);
  });

  it('treats a key set to undefined as absent, as storage does', () => {
    expect(sameValue({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(sameValue({ a: 1 }, { a: 1, b: undefined })).toBe(true);
    expect(sameValue({ a: 1, b: undefined }, { a: 1, b: 2 })).toBe(false);
    expect(sameValue([1, { x: [2] }], [1, { x: [2] }])).toBe(true);
    expect(sameValue([1], { 0: 1 })).toBe(false);
  });
});

describe('discard', () => {
  it('takes back the latest entry without a trace', () => {
    const { store, lessonId } = storeWithLesson();
    const objective = { id: newId('o'), text: '' };
    const added = store.apply([cmd('objective.add', { objective, lessonId })], { label: { key: 'addedObjective' }, source: 'teacher' })!;
    const revision = store.getState().revision;
    expect(store.discard(added.id)).toBe(true);
    expect(store.getState().objectives[objective.id]).toBeUndefined();
    expect(store.getState().lessons[lessonId]!.objectiveIds).toEqual([]);
    expect(store.getState().revision).toBe(revision + 1);
    expect(store.getHistory().map((e) => e.label.key)).toEqual(['t']);
    expect(store.canRedo()).toBe(false);
  });

  it('refuses when the entry is not the latest, or was undone', () => {
    const { store, lessonId } = storeWithLesson();
    const first = store.getHistory()[0]!;
    store.apply([cmd('lesson.update', { lessonId, title: 'A' })], { label, source: 'teacher' });
    expect(store.discard(first.id)).toBe(false);
    const latest = store.getHistory().at(-1)!;
    store.undo();
    expect(store.discard(latest.id)).toBe(false);
    expect(store.getHistory()).toHaveLength(2);
  });
});
