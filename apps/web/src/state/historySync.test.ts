import { CourseStore, HISTORY_LIMIT, cmd, createCourse, newId } from '@folio/core';
import { describe, expect, it } from 'vitest';
import { historyDelta, isEmptyWrite, mergeHistory, rowKey, sortRows, trackerFrom, type HistoryRow, type HistoryWrite } from './historySync';

const V = 2;
const label = { key: 't' };

/** A stand-in for the history table: applies writes the way db.ts does. */
function disk() {
  let rows = new Map<string, HistoryRow>();
  return {
    apply(write: HistoryWrite) {
      if (write.replace) rows = new Map([...rows].filter(([, r]) => r.courseId !== write.courseId));
      for (const key of write.remove) rows.delete(key);
      for (const row of write.put) rows.set(row.key, structuredClone(row));
    },
    rows: () => [...rows.values()],
  };
}

function setup() {
  const store = new CourseStore(createCourse({ title: 'Test' }));
  const courseId = store.getState().id;
  const lessonId = newId('l');
  const rename = (title: string) => store.apply([cmd('lesson.update', { lessonId, title })], { label, source: 'teacher' });
  store.apply([cmd('lesson.insert', { lesson: { id: lessonId, title: 'One', summary: '' }, afterId: null })], { label, source: 'teacher' });
  const db = disk();
  let tracker = trackerFrom([]);
  const save = () => {
    const { write, next } = historyDelta(courseId, store.getHistory(), tracker, V);
    db.apply(write);
    tracker = next;
    return write;
  };
  return { store, courseId, lessonId, rename, db, save };
}

describe('history rows', () => {
  it('writes only new and changed entries on each save', () => {
    const { store, rename, save } = setup();
    expect(save().put).toHaveLength(1);
    rename('Two');
    const second = save();
    expect(second.put.map((r) => r.entry.label.key)).toEqual(['t']);
    expect(second.put[0]!.seq).toBe(1);
    expect(isEmptyWrite(save())).toBe(true);
    store.undo();
    const undone = save();
    expect(undone.put).toHaveLength(1);
    expect(undone.put[0]!.entry.undone).toBe(true);
    store.redo();
    expect(save().put).toHaveLength(1);
  });

  it('restores a store that can undo what was saved', () => {
    const { store, courseId, lessonId, rename, db, save } = setup();
    rename('Two');
    rename('Three');
    save();
    const { rows, restorable } = sortRows(db.rows().reverse(), V);
    expect(rows.map((r) => r.seq)).toEqual([0, 1, 2]);
    const restored = new CourseStore(structuredClone(store.getState()), restorable);
    expect(restored.undo()).toEqual({ ok: true });
    expect(restored.getState().lessons[lessonId]!.title).toBe('Two');
    // Nothing is rewritten for entries that are already on disk.
    expect(historyDelta(courseId, restorable.map((e) => ({ ...e })), trackerFrom(rows), V).write.put).toHaveLength(0);
  });

  it('deletes rows that history dropped, and leaves out rows from another schema', () => {
    const { store, courseId, rename, db, save } = setup();
    save();
    for (let i = 0; i < HISTORY_LIMIT; i++) rename(`T${i}`);
    const write = save();
    expect(write.remove).toHaveLength(1);
    expect(db.rows()).toHaveLength(HISTORY_LIMIT);
    const old: HistoryRow = { ...db.rows()[0]!, key: rowKey(courseId, 'x_old'), schemaVersion: 1, seq: -1, entry: { ...db.rows()[0]!.entry, id: 'x_old' } };
    const { restorable } = sortRows([old, ...db.rows()], V);
    expect(restorable).toHaveLength(HISTORY_LIMIT);
    expect(restorable.some((e) => e.id === 'x_old')).toBe(false);
    expect(store.getHistory()).toHaveLength(HISTORY_LIMIT);
  });

  it('rewrites everything when this tab’s history replaces another’s', () => {
    const { store, courseId, rename, db, save } = setup();
    rename('Two');
    save();
    const foreign: HistoryRow = { ...db.rows()[0]!, key: rowKey(courseId, 'x_other'), entry: { ...db.rows()[0]!.entry, id: 'x_other' } };
    db.apply({ courseId, replace: false, put: [foreign], remove: [] });
    const tracker = { ...trackerFrom(sortRows(db.rows(), V).rows), replace: true };
    const { write } = historyDelta(courseId, store.getHistory(), tracker, V);
    expect(write.replace).toBe(true);
    db.apply(write);
    expect(sortRows(db.rows(), V).restorable.map((e) => e.id)).toEqual(store.getHistory().map((e) => e.id));
  });

  it('lays entries typed as the page closed over the saved ones', () => {
    const { store, rename, save } = setup();
    rename('Two');
    save();
    const saved = store.exportHistory();
    store.undo();
    rename('Three');
    const unsaved = historyDelta('c', store.getHistory(), trackerFrom(saved.map((entry, seq) => ({ key: '', courseId: 'c', seq, schemaVersion: V, entry }))), V).write.put.map((r) => r.entry);
    expect(unsaved.map((e) => e.undone)).toEqual([true, false]);
    const merged = mergeHistory(saved, JSON.parse(JSON.stringify(unsaved)) as typeof unsaved);
    expect(merged.map((e) => e.id)).toEqual(store.getHistory().map((e) => e.id));
    expect(merged.map((e) => e.undone)).toEqual([false, true, false]);
    const restored = new CourseStore(structuredClone(store.getState()), merged);
    expect(restored.undo()).toEqual({ ok: true });
    expect(restored.getState().lessons[Object.keys(store.getState().lessons)[0]!]!.title).toBe('One');
  });
});
