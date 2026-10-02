import 'fake-indexeddb/auto';
import { createCourse, createSource, type Course } from '@folio/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./session', () => ({ activeStore: () => null, dropSession: vi.fn(), flushNow: async () => {} }));
vi.mock('./toasts', () => ({ toast: vi.fn() }));

const { db, loadCourse, saveCourse, versionOf } = await import('./db');
const { useAccount } = await import('./account');
const { toast } = await import('./toasts');
const { forgetHere, pull, refusedForGood, start, unsent } = await import('./sync');

const teacher = { id: 'u1', name: 'Ada', email: 'ada@school.edu' };

/** What happens to one request: answered by the fake account, refused with a status, or sent and its answer lost. */
type Fault = { status: number } | 'lost' | null;

/** The account's side: each course's latest copy and version, as the server keeps them. */
const account = {
  courses: new Map<string, { version: number; course: Course | null }>(),
  /** File texts, by `courseId/sourceId`, and every one that was sent. */
  texts: new Map<string, string>(),
  textsSent: [] as string[],
  fault: (_method: string, _path: string): Fault => null,
};

const gzip = async (text: string) => new Uint8Array(await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
const gunzip = async (body: BodyInit) => new Response(new Response(body).body!.pipeThrough(new DecompressionStream('gzip'))).text();

async function answer(method: string, path: string, init: RequestInit): Promise<Response> {
  if (path === 'session') return Response.json({ user: teacher });
  if (path === 'courses') return Response.json({ courses: [...account.courses].map(([id, c]) => ({ id, version: c.version, deleted: c.course === null })) });
  const [, id = '', , sourceId] = path.split('/');
  if (sourceId) return answerText(method, `${id}/${sourceId}`, init);
  const held = account.courses.get(id);
  if (method === 'GET') {
    if (!held?.course) return new Response(null, { status: 404 });
    return new Response(await gzip(JSON.stringify({ course: held.course, history: [] })), { headers: { 'x-folio-version': String(held.version) } });
  }
  if (method === 'PUT') {
    if (Number(new Headers(init.headers).get('if-match')) !== (held?.version ?? 0)) return new Response(null, { status: 409 });
    const listed = new Headers(init.headers).get('x-folio-sources');
    const needed = listed ? listed.split(',').filter(Boolean) : [];
    const missing = needed.filter((s) => !account.texts.has(`${id}/${s}`));
    if (missing.length) return Response.json({ error: 'sources-missing', missing }, { status: 422 });
    for (const key of [...account.texts.keys()]) if (listed !== null && key.startsWith(`${id}/`) && !needed.includes(key.slice(id.length + 1))) account.texts.delete(key);
    const { course } = JSON.parse(await gunzip(init.body!)) as { course: Course };
    account.courses.set(id, { version: (held?.version ?? 0) + 1, course });
    return Response.json({ version: (held?.version ?? 0) + 1 });
  }
  account.courses.set(id, { version: (held?.version ?? 0) + 1, course: null });
  return new Response(null, { status: 204 });
}

async function answerText(method: string, key: string, init: RequestInit): Promise<Response> {
  if (method === 'PUT') {
    account.texts.set(key, await gunzip(init.body!));
    account.textsSent.push(key);
    return Response.json({ ok: true });
  }
  const text = account.texts.get(key);
  return text === undefined ? new Response(null, { status: 404 }) : new Response(await gzip(text));
}

async function fakeFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const method = init.method ?? 'GET';
  const path = url.replace('/api/', '');
  const fault = account.fault(method, path);
  if (fault && fault !== 'lost') return new Response(null, { status: fault.status });
  const res = await answer(method, path, init);
  if (fault === 'lost') throw new TypeError('Failed to fetch');
  return res;
}

/**
 * Let the saves' listeners and the sends they start run to the end. Counted in turns of the event loop, which
 * is how fake IndexedDB answers, not in milliseconds: a slow machine takes as many turns as a fast one.
 */
async function settle(): Promise<void> {
  for (let i = 0; i < 50; i++) await new Promise((r) => setTimeout(r, 0));
}

/** An edit made somewhere: the same course, a revision on, with its own mark as every change has. */
const editedElsewhere = (course: Course, title: string): Course => ({ ...course, title, revision: course.revision + 1, updatedAt: new Date(Date.parse(course.updatedAt) + 60_000).toISOString(), stamp: title });

async function signedInWith(course: Course): Promise<void> {
  await start(teacher);
  await saveCourse(course);
  await settle();
  expect(await unsent()).toBe(0);
}

beforeEach(async () => {
  vi.stubGlobal('fetch', vi.fn(fakeFetch));
  vi.stubGlobal('window', { addEventListener: vi.fn(), location: { assign: vi.fn() } });
  vi.stubGlobal('document', { addEventListener: vi.fn(), visibilityState: 'visible' });
  vi.stubGlobal('navigator', { onLine: true, locks: navigator.locks });
  account.courses.clear();
  account.texts.clear();
  account.textsSent = [];
  account.fault = () => null;
  vi.mocked(toast).mockClear();
});

afterEach(async () => {
  await forgetHere();
  await Promise.all([db.courses.clear(), db.sync.clear(), db.history.clear()]);
  vi.unstubAllGlobals();
});

describe('keeping the account and this device the same', () => {
  it('sends a course saved here to the account', async () => {
    const course = createCourse({ title: 'Ecology' });
    await signedInWith(course);
    expect(account.courses.get(course.id)?.course?.title).toBe('Ecology');
  });

  it('takes the account’s copy when the course changed only on another device', async () => {
    const course = createCourse({ title: 'Ecology' });
    await signedInWith(course);
    account.courses.set(course.id, { version: 2, course: editedElsewhere(course, 'Ecology II') });
    await pull();
    expect((await loadCourse(course.id))?.title).toBe('Ecology II');
    expect(await db.courses.count()).toBe(1);
  });

  it('keeps both when the course changed here and on another device', async () => {
    const course = createCourse({ title: 'Ecology' });
    await signedInWith(course);
    account.courses.set(course.id, { version: 2, course: editedElsewhere(course, 'Theirs') });
    // A change here that hasn't been sent yet.
    await saveCourse(editedElsewhere(course, 'Mine'));
    await pull();
    const titles = (await db.courses.toArray()).map((r) => (r.data as Course).title).sort();
    expect(titles).toEqual(['Mine (this device)', 'Theirs']);
    expect(toast).toHaveBeenCalled();
  });

  it('makes no copy when its own send went through but the answer was lost', async () => {
    const course = createCourse({ title: 'Ecology' });
    await signedInWith(course);
    account.fault = (method) => (method === 'PUT' ? 'lost' : null);
    await saveCourse(editedElsewhere(course, 'Sent'));
    await settle();
    await unsent();
    account.fault = () => null;
    await pull();
    expect(await db.courses.count()).toBe(1);
    expect(await unsent()).toBe(0);
    expect(account.courses.get(course.id)?.course?.title).toBe('Sent');
  });

  it('asks to sign in again when the session has ended elsewhere', async () => {
    const course = createCourse({ title: 'Ecology' });
    await signedInWith(course);
    account.fault = (_m, path) => (path === 'courses' ? { status: 401 } : null);
    await pull();
    expect(useAccount.getState().user).toBeNull();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ key: 'account' }));
  });

  it('says it couldn’t send when the account is full, and sends the change once it can', async () => {
    const course = createCourse({ title: 'Ecology' });
    await signedInWith(course);
    account.fault = (method) => (method === 'PUT' ? { status: 507 } : null);
    await saveCourse(editedElsewhere(course, 'Bigger'));
    await settle();
    expect(await unsent()).toBe(1);
    expect(useAccount.getState().sync).toBe('error');
    account.fault = () => null;
    expect(await unsent()).toBe(0);
  });

  it('sends the other courses when the account refuses one', async () => {
    const refused = createCourse({ title: 'Too big' });
    const fine = createCourse({ title: 'Ecology' });
    await signedInWith(refused);
    await saveCourse(fine);
    await settle();
    account.fault = (method, path) => (method === 'PUT' && path === `courses/${refused.id}` ? { status: 413 } : null);
    await saveCourse(editedElsewhere(refused, 'Bigger still'));
    await saveCourse(editedElsewhere(fine, 'Ecology II'));
    await pull();
    expect(account.courses.get(fine.id)?.course?.title).toBe('Ecology II');
    expect(account.courses.get(refused.id)?.course?.title).toBe('Too big');
    expect(useAccount.getState().sync).toBe('error');
  });

  it('tries again by itself only what may pass by itself', () => {
    for (const status of [400, 413, 404, 507]) expect(refusedForGood(new Error(`HTTP ${status}`))).toBe(true);
    for (const status of [408, 429, 500, 503]) expect(refusedForGood(new Error(`HTTP ${status}`))).toBe(false);
    expect(refusedForGood(new TypeError('Failed to fetch'))).toBe(false);
  });

  it('works in a browser without Web Locks', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    const course = createCourse({ title: 'Ecology' });
    await signedInWith(course);
    expect(account.courses.get(course.id)?.version).toBe(1);
  });

  it('leaves this device’s copy alone when the account’s is from a newer Folio', async () => {
    const course = createCourse({ title: 'Ecology' });
    await signedInWith(course);
    account.courses.set(course.id, { version: 2, course: { ...editedElsewhere(course, 'Future'), schemaVersion: 99 } as unknown as Course });
    await pull();
    expect((await loadCourse(course.id))?.title).toBe('Ecology');
    expect(versionOf((await loadCourse(course.id))!)).toBe(versionOf(course));
    expect(useAccount.getState().sync).toBe('error');
  });
});

describe('a course with a file', () => {
  const book = 'A chapter of the textbook. '.repeat(20_000);
  const withFile = () => {
    const course = createCourse({ title: 'Ecology' });
    const file = createSource('Textbook', book, 'file');
    return { course: { ...course, sources: { [file.id]: file }, sourceOrder: [file.id] }, file };
  };
  /** As another device: the same account, nothing of this course on it yet. */
  const otherDevice = () => Promise.all([db.courses.clear(), db.summaries.clear(), db.sources.clear(), db.history.clear(), db.sync.clear()]);

  it('sends the file once; a later change sends only the body', async () => {
    const { course, file } = withFile();
    await signedInWith(course);
    expect(account.textsSent).toEqual([`${course.id}/${file.id}`]);
    expect(JSON.stringify(account.courses.get(course.id)?.course)).not.toContain('A chapter of the textbook');
    await saveCourse(editedElsewhere(course, 'Ecology II'));
    await settle();
    expect(await unsent()).toBe(0);
    expect(account.textsSent).toHaveLength(1);
    expect(account.courses.get(course.id)?.course?.title).toBe('Ecology II');
  });

  it('reaches another device whole, its file fetched once', async () => {
    const { course, file } = withFile();
    await signedInWith(course);
    await otherDevice();
    vi.mocked(fetch).mockClear();
    await pull();
    expect((await loadCourse(course.id))?.sources[file.id]?.text).toBe(file.text);
    const fetched = vi.mocked(fetch).mock.calls.filter(([url, init]) => String(url).includes('/sources/') && !(init as RequestInit | undefined)?.method);
    expect(fetched).toHaveLength(1);
  });

  it('sends a file again when the account turns out not to have it', async () => {
    const { course } = withFile();
    await signedInWith(course);
    account.texts.clear();
    await saveCourse(editedElsewhere(course, 'Ecology II'));
    await settle();
    expect(await unsent()).toBe(0);
    expect(account.textsSent).toHaveLength(2);
    expect(account.texts.size).toBe(1);
  });

  it('opens an account copy saved before files were kept apart', async () => {
    const { course, file } = withFile();
    await start(teacher);
    account.courses.set(course.id, { version: 1, course });
    await pull();
    expect((await loadCourse(course.id))?.sources[file.id]?.text).toBe(file.text);
  });
});
