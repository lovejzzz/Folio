import 'fake-indexeddb/auto';
import { CourseStore, SCHEMA_VERSION, cmd, orderedLessons, parseCourse, type Course, type PageBlock } from '@folio/core';
import { sampleCourse } from '@folio/core/sample';
import { describe, expect, it } from 'vitest';
import { db, deleteCourse, saveCourse } from './db';
import { historyDelta, trackerFrom } from './historySync';
import { copyCourseMedia, deleteCourseMedia, dropUnusedMedia, getMedia, mediaOf, putMedia, restoreMedia } from './media';

const HOUR = 60 * 60 * 1000;
const png = (text = 'picture') => new Blob([text], { type: 'image/png' });

let n = 0;
/** A course of its own for each test, taught online, whose first week shows the given pictures. */
function courseWith(srcs: string[]): Course {
  const base = sampleCourse();
  const first = orderedLessons(base)[0]!;
  const page: PageBlock[] = srcs.map((src, i) => ({ id: `x_${i}`, type: 'image', src, alt: '', caption: '', shows: 'What it shows.' }));
  return parseCourse({ ...base, id: `c_media_${(n += 1)}`, delivery: 'online-async', lessons: { ...base.lessons, [first.id]: { ...first, page } } });
}

const idsOf = async (courseId: string) => (await db.media.where('courseId').equals(courseId).toArray()).map((r) => r.id).sort();

describe('media kept on the device', () => {
  it('keeps a file under an ID that ends with its extension, and gives it back', async () => {
    const id = await putMedia('c_a', png(), 'Screen Shot.PNG');
    expect(id).toMatch(/^m_[0-9a-f]{12}\.png$/);
    const row = await getMedia('c_a', id);
    expect(row).toMatchObject({ courseId: 'c_a', id, name: 'Screen Shot.PNG', type: 'image/png', bytes: 7 });
    expect(await getMedia('c_other', id)).toBeNull();
    expect((await mediaOf('c_a', `media:${id}`))?.id).toBe(id);
    expect(await mediaOf('c_a', '/samples/unity/media/x.webp')).toBeNull();
  });

  it('names by type what was re-encoded, and by name what has no telling type', async () => {
    expect(await putMedia('c_a', new Blob(['x'], { type: 'image/webp' }), 'big.png')).toMatch(/\.webp$/);
    expect(await putMedia('c_a', new Blob(['x'], { type: 'video/quicktime' }), 'clip.MOV')).toMatch(/\.mov$/);
    expect(await putMedia('c_a', new Blob(['x'], { type: 'image/jpeg' }), 'photo')).toMatch(/\.jpg$/);
    expect(await putMedia('c_a', new Blob(['x']), 'HopStart.zip')).toMatch(/\.zip$/);
    expect(await putMedia('c_a', new Blob(['x']), 'README')).toMatch(/^m_[0-9a-f]{12}$/);
  });

  it('copies a course’s media to its copy, and deletes one course’s without the other’s', async () => {
    const a = await putMedia('c_from', png('a'), 'a.png');
    const b = await putMedia('c_from', png('b'), 'b.png');
    await copyCourseMedia('c_from', 'c_to');
    expect(await idsOf('c_to')).toEqual([a, b].sort());
    await deleteCourseMedia('c_from');
    expect(await idsOf('c_from')).toEqual([]);
    expect((await getMedia('c_to', a))?.name).toBe('a.png');
  });

  it('restores media from a backup under the ID the course knows it by', async () => {
    await restoreMedia('c_back', { id: 'm_abc.png', name: 'a.png', type: 'image/png', bytes: new Uint8Array([1, 2, 3]) });
    expect(await getMedia('c_back', 'm_abc.png')).toMatchObject({ name: 'a.png', type: 'image/png', bytes: 3 });
  });

  it('goes with its course when the course is deleted, and stays when the device only forgets the course', async () => {
    const course = courseWith([]);
    await saveCourse(course);
    const id = await putMedia(course.id, png(), 'a.png');
    await deleteCourse(course.id, { forget: true });
    expect(await idsOf(course.id)).toEqual([id]);
    await saveCourse(course);
    await deleteCourse(course.id);
    expect(await idsOf(course.id)).toEqual([]);
  });
});

describe('clearing media nothing can show again', () => {
  const old = Date.now() - 2 * HOUR;

  it('keeps what the course shows and drops what nothing mentions, once it is no longer new', async () => {
    const shown = await putMedia('c_x', png(), 'shown.png', old);
    const course = { ...courseWith([`media:${shown}`]), id: 'c_x' };
    await saveCourse(course);
    const unused = await putMedia('c_x', png(), 'unused.png', old);
    const fresh = await putMedia('c_x', png(), 'just-added.png');
    const elsewhere = await putMedia('c_y', png(), 'another-course.png', old);
    expect(await dropUnusedMedia('c_x', course)).toEqual([unused]);
    expect(await idsOf('c_x')).toEqual([shown, fresh].sort());
    expect(await idsOf('c_y')).toEqual([elsewhere]);
  });

  it('keeps a picture only the history mentions: undo can bring it back', async () => {
    const start = courseWith([]);
    const removed = await putMedia(start.id, png(), 'removed.png', old);
    const orphan = await putMedia(start.id, png(), 'orphan.png', old);
    const first = orderedLessons(start)[0]!;
    const store = new CourseStore(parseCourse({ ...start, lessons: { ...start.lessons, [first.id]: { ...first, page: [{ id: 'x_0', type: 'image', src: `media:${removed}`, alt: '', caption: '', shows: '' }] } } }));
    // The teacher removes the picture: the page no longer names it, the step that removed it does.
    store.apply([cmd('plan.update', { lessonId: first.id, page: [{ id: 'x_0', type: 'image', src: '', alt: '', caption: '', shows: '' }] })], { label: { key: 't' }, source: 'teacher' });
    const course = store.getState();
    expect(JSON.stringify(course)).not.toContain(removed);
    const { write } = historyDelta(course.id, store.getHistory(), trackerFrom([]), SCHEMA_VERSION);
    await saveCourse(course, write);
    expect(await dropUnusedMedia(course.id, course)).toEqual([orphan]);
    expect(await idsOf(course.id)).toEqual([removed]);
    // And it is what undo puts back.
    store.undo();
    expect(JSON.stringify(store.getState())).toContain(`media:${removed}`);
  });

  it('keeps what the open course mentions and has not saved yet', async () => {
    const saved = courseWith([]);
    await saveCourse(saved);
    const id = await putMedia(saved.id, png(), 'typed-as-the-page-closed.png', old);
    const open = { ...courseWith([`media:${id}`]), id: saved.id };
    expect(await dropUnusedMedia(saved.id, [open, []])).toEqual([]);
    expect(await dropUnusedMedia(saved.id, [saved, []])).toEqual([id]);
  });

  it('never keeps a file as something that could run: a backup or a server that calls it a page or an SVG gets a download', async () => {
    await restoreMedia('c_t', { id: 'm_1.svg', name: 'chart.svg', type: 'image/svg+xml', bytes: new TextEncoder().encode('<svg onload="alert(1)"/>') });
    await restoreMedia('c_t', { id: 'm_2.html', name: 'notes.html', type: 'text/html', bytes: new TextEncoder().encode('<script>1</script>') });
    await restoreMedia('c_t', { id: 'm_3.png', name: 'a.png', type: 'IMAGE/PNG', bytes: new Uint8Array([1]) });
    expect((await getMedia('c_t', 'm_1.svg'))!.blob.type).toBe('application/octet-stream');
    expect((await getMedia('c_t', 'm_2.html'))!.blob.type).toBe('application/octet-stream');
    expect((await getMedia('c_t', 'm_3.png'))!.blob.type).toBe('image/png');
    const id = await putMedia('c_t', new Blob(['<svg/>'], { type: 'image/svg+xml' }), 'drawn.svg');
    expect((await getMedia('c_t', id))!.type).toBe('application/octet-stream');
  });
});
