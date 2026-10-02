import 'fake-indexeddb/auto';
import { CourseStore, SCHEMA_VERSION, cmd, createSource, type Course, type HistoryEntry } from '@folio/core';
import { sampleCourse } from '@folio/core/sample';
import Dexie from 'dexie';
import { describe, expect, it, vi } from 'vitest';
import { historyDelta, trackerFrom, type HistoryRow, type HistoryTracker } from './historySync';

const book = 'A chapter of the textbook. '.repeat(20_000);

/** A course as Folio stored it before version 4: whole, in one row, files and all. */
async function seedVersion3(course: Course, history: HistoryRow[]): Promise<void> {
  const old = new Dexie('folio');
  old.version(3).stores({ courses: 'id, updatedAt', history: 'key, courseId', sync: 'id, account' });
  await old.table('courses').put({ id: course.id, title: course.title, createdAt: course.createdAt, updatedAt: course.updatedAt, status: course.status, language: course.language, lessonCount: course.lessonOrder.length, kinds: [], data: course });
  await old.table('history').bulkPut(history);
  old.close();
}

function withFile() {
  const store = new CourseStore(sampleCourse());
  const file = createSource('Textbook', book, 'file');
  store.apply([cmd('source.add', { source: file })], { label: { key: 't' }, source: 'teacher' });
  return { store, file };
}

/** The store's history as the session writes it. */
const delta = (store: CourseStore, tracker: HistoryTracker) => historyDelta(store.getState().id, store.getHistory(), tracker, SCHEMA_VERSION);

// One database for the file, upgraded from version 3 on first use, as a teacher's browser would be.
const seeded = withFile();
const seededRows = delta(seeded.store, trackerFrom([])).write.put;
await seedVersion3(seeded.store.getState(), seededRows);
const { db, deleteCourse, listCourses, loadCourse, loadCourseWithHistory, saveCourse } = await import('./db');

describe('courses kept in parts', () => {
  it('come up from version 3 exactly as they were, files and history included', async () => {
    const loaded = await loadCourseWithHistory(seeded.store.getState().id);
    expect(loaded?.course).toEqual(seeded.store.getState());
    expect(loaded?.history.map((r) => r.entry)).toEqual(seededRows.map((r) => r.entry));
    // The file's text is kept once, apart from the course.
    const body = await db.courses.get(seeded.store.getState().id);
    expect(JSON.stringify(body)).not.toContain('A chapter of the textbook');
    expect(JSON.stringify(body).length).toBeLessThan(book.length / 5);
    expect(await db.sources.count()).toBe(1);
  });

  it('write a file’s text once: a later change writes none', async () => {
    const { store } = withFile();
    let tracker = trackerFrom([]);
    const first = delta(store, tracker);
    await saveCourse(store.getState(), first.write);
    tracker = first.next;
    const put = vi.spyOn(db.sources, 'bulkPut');
    store.apply([cmd('course.update', { title: 'A new title' })], { label: { key: 't' }, source: 'teacher' });
    await saveCourse(store.getState(), delta(store, tracker).write);
    expect(put).not.toHaveBeenCalled();
    put.mockRestore();
    expect((await loadCourse(store.getState().id))?.title).toBe('A new title');
  });

  it('list the Library from summaries alone', async () => {
    const read = vi.spyOn(db.courses, 'toArray');
    const get = vi.spyOn(db.courses, 'get');
    const list = await listCourses();
    expect(list.length).toBeGreaterThan(0);
    expect(list[0]).not.toHaveProperty('data');
    expect(read).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
    read.mockRestore();
    get.mockRestore();
  });

  it('keep a removed file’s text while undo can bring it back, and let it go once nothing can', async () => {
    const { store, file } = withFile();
    const id = store.getState().id;
    let tracker = trackerFrom([]);
    const save = async () => {
      const d = delta(store, tracker);
      await saveCourse(store.getState(), d.write);
      tracker = d.next;
    };
    await save();
    store.apply([cmd('source.remove', { sourceId: file.id })], { label: { key: 't' }, source: 'teacher' });
    await save();
    expect((await loadCourse(id))?.sources[file.id]).toBeUndefined();
    store.undo();
    await save();
    expect((await loadCourse(id))?.sources[file.id]?.text).toBe(file.text);
    // Removed again, and every step that held the file dropped from history: its text goes.
    store.apply([cmd('source.remove', { sourceId: file.id })], { label: { key: 't' }, source: 'teacher' });
    const rows = await db.history.where('courseId').equals(id).primaryKeys();
    await saveCourse(store.getState(), { courseId: id, replace: true, put: [], remove: rows });
    expect(await db.sources.where('courseId').equals(id).count()).toBe(0);
  });

  it('go entirely when the course is deleted', async () => {
    const { store } = withFile();
    const id = store.getState().id;
    await saveCourse(store.getState());
    await deleteCourse(id);
    for (const table of [db.summaries, db.courses, db.sources, db.history]) expect(await table.where(table === db.summaries || table === db.courses ? 'id' : 'courseId').equals(id).count()).toBe(0);
  });

  it('keep history steps without the file’s text in them', async () => {
    const { store } = withFile();
    await saveCourse(store.getState(), delta(store, trackerFrom([])).write);
    const rows = await db.history.where('courseId').equals(store.getState().id).toArray();
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(JSON.stringify(row.entry as HistoryEntry)).not.toContain('A chapter of the textbook');
  });
});
