import 'fake-indexeddb/auto';
import { orderedLessons, parseCourse, type Course, type PageBlock } from '@folio/core';
import { sampleCourse } from '@folio/core/sample';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAccount } from './account';
import { db } from './db';
import { deleteCourseMedia, getMedia, putMedia } from './media';
import { fetchMedia, sendMedia } from './mediaSync';

let n = 0;
function courseWith(ids: string[]): Course {
  const base = sampleCourse();
  const first = orderedLessons(base)[0]!;
  const page: PageBlock[] = ids.map((id, i) => ({ id: `x_${i}`, type: 'image', src: `media:${id}`, alt: '', caption: '', shows: 'What it shows.' }));
  return parseCourse({ ...base, id: `c_sync_${(n += 1)}`, delivery: 'online-async', lessons: { ...base.lessons, [first.id]: { ...first, page } } });
}

/** The account's store, as the server keeps it: what was sent, by path. */
let account: Map<string, { body: Blob; type: string; name: string }>;
let status = 200;

beforeEach(() => {
  account = new Map();
  status = 200;
  useAccount.setState({ user: { id: 'g-1', email: 't@example.edu', name: 'T' } });
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    const headers = init.headers as Record<string, string> | undefined;
    if (init.method === 'PUT') {
      if (status !== 200) return new Response('{}', { status });
      account.set(url, { body: init.body as Blob, type: headers!['content-type']!, name: headers!['x-folio-name']! });
      return new Response('{"ok":true}');
    }
    const held = account.get(url);
    return held ? new Response(held.body, { headers: { 'content-type': held.type, 'x-folio-name': held.name } }) : new Response('{}', { status: 404 });
  });
});
afterEach(() => vi.unstubAllGlobals());

const link = (id: string) => db.sync.put({ id, account: 'g-1', state: 'linked', version: 1, synced: 'v' });

describe('a course’s media and the account', () => {
  it('are sent once each after the course, and fetched by a device that lacks them', async () => {
    const a = await putMedia('pending', new Blob(['one'], { type: 'image/png' }), 'one shot.png');
    const course = courseWith([a]);
    await db.media.where('courseId').equals('pending').modify({ courseId: course.id, key: `${course.id}:${a}` });
    await link(course.id);
    await sendMedia(course);
    expect([...account.keys()]).toEqual([`/api/courses/${course.id}/media/${a}`]);
    expect((await db.sync.get(course.id))?.media).toEqual([a]);
    // Sent already: not sent again.
    account.clear();
    await sendMedia(course);
    expect(account.size).toBe(0);
    // Another device: the bytes are not here, the account has them.
    account.set(`/api/courses/${course.id}/media/${a}`, { body: new Blob(['one'], { type: 'image/png' }), type: 'image/png', name: encodeURIComponent('one shot.png') });
    await deleteCourseMedia(course.id);
    const row = await fetchMedia(course.id, a);
    expect(row).toMatchObject({ id: a, name: 'one shot.png', type: 'image/png', bytes: 3 });
    expect(await getMedia(course.id, a)).not.toBeNull();
    expect(await fetchMedia(course.id, 'm_none.png')).toBeNull();
  });

  it('stay on the device for a course that is not in the account, and when the server has nowhere to keep them', async () => {
    const id = await putMedia('c_local', new Blob(['x'], { type: 'image/png' }), 'x.png');
    const course = { ...courseWith([id]), id: 'c_local' };
    await sendMedia(course);
    expect(account.size).toBe(0);
    expect(await fetchMedia('c_local', 'm_other.png')).toBeNull();
    await link('c_local');
    status = 501;
    await sendMedia(course);
    expect((await db.sync.get('c_local'))?.media).toBeUndefined();
  });
});
