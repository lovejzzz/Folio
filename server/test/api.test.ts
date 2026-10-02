import { beforeEach, describe, expect, it } from 'vitest';
import { handle } from '../src/api';
import { CHUNK } from '../src/courses';
import { forgetGoogleKeys } from '../src/google';
import type { Env } from '../src/types';
import { fakeD1, fakeGoogle } from './fake';

const CLIENT = 'client-1.apps.googleusercontent.com';
let env: Env;
let google: Awaited<ReturnType<typeof fakeGoogle>>;

beforeEach(async () => {
  forgetGoogleKeys();
  env = { DB: fakeD1(), VITE_GOOGLE_CLIENT_ID: CLIENT };
  google = await fakeGoogle(CLIENT);
});

const call = (path: string, init: RequestInit & { cookie?: string } = {}) => {
  const headers = new Headers(init.headers);
  if (init.method && init.method !== 'GET') headers.set('x-folio', '1');
  if (init.cookie) headers.set('cookie', init.cookie);
  return handle(new Request(`https://folio.university/api/${path}`, { ...init, headers }), env, google.fetchImpl);
};

async function signIn(claims: Record<string, unknown> = {}): Promise<string> {
  const res = await call('session', { method: 'POST', cookie: 'folio_signin=n-1', body: JSON.stringify({ idToken: await google.token(claims) }) });
  expect(res.status).toBe(200);
  return res.headers.get('set-cookie')!.split(';')[0]!;
}

const put = (cookie: string, id: string, base: number, bytes: Uint8Array<ArrayBuffer>, title = 'The water cycle') =>
  call(`courses/${id}`, { method: 'PUT', cookie, body: bytes, headers: { 'if-match': String(base), 'x-folio-meta': encodeURIComponent(JSON.stringify({ title, lessonCount: 3, updatedAt: '2026-09-29T10:00:00Z' })) } });

describe('signing in', () => {
  it('trusts only an ID token Google signed for this app and this sign-in, and starts a session', async () => {
    const cookie = await signIn();
    expect(cookie).toMatch(/^folio_session=.{40,}$/);
    const me = await (await call('session', { cookie })).json();
    expect(me).toEqual({ user: { id: 'g-123', email: 'teacher@example.edu', name: 'Ada Teacher' } });
  });

  it('turns away a forged, stale, foreign or replayed token', async () => {
    const tries = [
      // A character changed mid-signature (the last one can carry only padding bits, and change nothing).
      { idToken: await google.token().then((tok) => { const i = tok.length - 20; return tok.slice(0, i) + (tok[i] === 'A' ? 'B' : 'A') + tok.slice(i + 1); }), nonce: 'n-1' },
      { idToken: await google.token({ aud: 'another-app' }), nonce: 'n-1' },
      { idToken: await google.token({ exp: Math.floor(Date.now() / 1000) - 60 }), nonce: 'n-1' },
      { idToken: await google.token({ iss: 'https://evil.example' }), nonce: 'n-1' },
      { idToken: await google.token(), nonce: 'another-sign-in' },
      { idToken: await google.token({}, 'unknown-key'), nonce: 'n-1' },
      // Not a token at all, however it is broken.
      { idToken: 'a.b.c', nonce: 'n-1' },
      { idToken: `${(await google.token()).split('.').slice(0, 2).join('.')}.!!!`, nonce: 'n-1' },
    ];
    for (const { idToken, nonce } of tries) expect((await call('session', { method: 'POST', cookie: `folio_signin=${nonce}`, body: JSON.stringify({ idToken }) })).status).toBe(401);
  });

  it('takes a token only from the browser its nonce was given to, and only once', async () => {
    const asked = await call('session/nonce', { method: 'POST' });
    const set = asked.headers.get('set-cookie') ?? '';
    const { nonce } = (await asked.json()) as { nonce: string };
    expect(set).toContain(`folio_signin=${nonce}`);
    expect(set).toMatch(/HttpOnly; Secure; SameSite=Lax; Max-Age=600/);
    const idToken = await google.token({ nonce });
    // Copied to another browser, nonce and all: it has no cookie, and the nonce in the body counts for nothing.
    expect((await call('session', { method: 'POST', body: JSON.stringify({ idToken, nonce }) })).status).toBe(401);
    const signedIn = await call('session', { method: 'POST', cookie: `folio_signin=${nonce}`, body: JSON.stringify({ idToken }) });
    expect(signedIn.status).toBe(200);
    expect(signedIn.headers.get('set-cookie')).toContain('folio_signin=; Path=/api/session; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
  });

  it('refuses changes without the header another site can’t send', async () => {
    const res = await handle(new Request('https://folio.university/api/session', { method: 'POST', body: '{}' }), env, google.fetchImpl);
    expect(res.status).toBe(403);
  });

  it('ends with sign-out, after which the cookie opens nothing', async () => {
    const cookie = await signIn();
    expect((await call('session', { method: 'DELETE', cookie })).headers.get('set-cookie')).toContain('Max-Age=0');
    expect(await (await call('session', { cookie })).json()).toEqual({ user: null });
    expect((await call('courses', { cookie })).status).toBe(401);
  });
});

describe('courses in an account', () => {
  it('are stored and read back as sent, each write naming the version it replaces', async () => {
    const cookie = await signIn();
    const bytes = new Uint8Array([31, 139, 8, 1, 2, 3]);
    expect(await (await put(cookie, 'c_abc', 0, bytes)).json()).toEqual({ version: 1 });
    const got = await call('courses/c_abc', { cookie });
    expect(got.headers.get('x-folio-version')).toBe('1');
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(bytes);
    expect(await (await put(cookie, 'c_abc', 1, bytes)).json()).toEqual({ version: 2 });
    const list = await (await call('courses', { cookie })).json();
    expect(list.courses).toEqual([{ id: 'c_abc', title: 'The water cycle', lessonCount: 3, updatedAt: '2026-09-29T10:00:00Z', version: 2, deleted: false }]);
  });

  it('turn away a write from a device that missed the latest version', async () => {
    const cookie = await signIn();
    await put(cookie, 'c_abc', 0, new Uint8Array([1]));
    await put(cookie, 'c_abc', 1, new Uint8Array([2]));
    const stale = await put(cookie, 'c_abc', 1, new Uint8Array([3]));
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ error: 'conflict', version: 2, deleted: false });
    expect((await put(cookie, 'c_abc', 0, new Uint8Array([4]))).status).toBe(409);
  });

  it('keep a large course whole across D1’s row limit', async () => {
    const cookie = await signIn();
    const big = new Uint8Array(CHUNK * 2 + 1234).map((_, i) => i % 251);
    await put(cookie, 'c_big', 0, big);
    const got = new Uint8Array(await (await call('courses/c_big', { cookie })).arrayBuffer());
    // Compared as bytes: an element-by-element toEqual on 1.8 MB took seconds, and timed out on CI.
    expect(got.length).toBe(big.length);
    expect(Buffer.compare(Buffer.from(got), Buffer.from(big))).toBe(0);
  });

  it('are deleted with a marker the other devices see', async () => {
    const cookie = await signIn();
    await put(cookie, 'c_abc', 0, new Uint8Array([1]));
    await call('courses/c_abc', { method: 'DELETE', cookie });
    expect((await call('courses/c_abc', { cookie })).status).toBe(404);
    expect((await (await call('courses', { cookie })).json()).courses[0]).toMatchObject({ id: 'c_abc', deleted: true, version: 2 });
  });

  it('belong to one account only', async () => {
    const mine = await signIn();
    await put(mine, 'c_abc', 0, new Uint8Array([1]));
    const theirs = await signIn({ sub: 'g-999', email: 'other@example.edu' });
    expect((await call('courses/c_abc', { cookie: theirs })).status).toBe(404);
    expect((await (await call('courses', { cookie: theirs })).json()).courses).toEqual([]);
  });

  it('go with the account when it is deleted', async () => {
    const cookie = await signIn();
    await put(cookie, 'c_abc', 0, new Uint8Array([1]));
    expect((await call('account', { method: 'DELETE', cookie })).status).toBe(200);
    const again = await signIn();
    expect((await (await call('courses', { cookie: again })).json()).courses).toEqual([]);
  });
});

describe('a course’s file texts, kept apart', () => {
  const putWith = (cookie: string, id: string, base: number, sources: string[] | null, bytes: Uint8Array<ArrayBuffer> = new Uint8Array([1, 2, 3])) =>
    call(`courses/${id}`, {
      method: 'PUT',
      cookie,
      body: bytes,
      headers: { 'if-match': String(base), 'x-folio-meta': encodeURIComponent(JSON.stringify({ title: 'Biology', lessonCount: 3, updatedAt: '2026-10-02T10:00:00Z' })), ...(sources ? { 'x-folio-sources': sources.join(',') } : {}) },
    });
  const putSource = (cookie: string, id: string, sid: string, bytes: Uint8Array<ArrayBuffer>) => call(`courses/${id}/sources/${sid}`, { method: 'PUT', cookie, body: bytes });
  const rows = async () => (await env.DB.prepare('SELECT DISTINCT source_id FROM source_chunks').all<{ source_id: string }>()).results.map((r) => r.source_id).sort();

  it('are sent once and read back, and sending one again changes nothing', { timeout: 20_000 }, async () => {
    const cookie = await signIn();
    // Past one chunk (900 KB), so a text kept in several pieces comes back whole.
    const text = new Uint8Array(1_000_000);
    for (let i = 0; i < text.length; i++) text[i] = i % 251;
    expect((await putSource(cookie, 'c_1', 's_a', text)).status).toBe(200);
    expect((await putSource(cookie, 'c_1', 's_a', text)).status).toBe(200);
    expect(new Uint8Array(await (await call('courses/c_1/sources/s_a', { cookie })).arrayBuffer())).toEqual(text);
    expect((await call('courses/c_1/sources/s_b', { cookie })).status).toBe(404);
  });

  it('must all be there before a body that refers to them is taken, and the missing ones are named', async () => {
    const cookie = await signIn();
    await putSource(cookie, 'c_1', 's_a', new Uint8Array([9]));
    const res = await putWith(cookie, 'c_1', 0, ['s_a', 's_b']);
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ missing: ['s_b'] });
    await putSource(cookie, 'c_1', 's_b', new Uint8Array([8]));
    expect((await putWith(cookie, 'c_1', 0, ['s_a', 's_b'])).status).toBe(200);
  });

  it('go when the body no longer refers to them, or the course or account goes', async () => {
    const cookie = await signIn();
    await putSource(cookie, 'c_1', 's_a', new Uint8Array([9]));
    await putSource(cookie, 'c_1', 's_b', new Uint8Array([8]));
    expect((await putWith(cookie, 'c_1', 0, ['s_a', 's_b'])).status).toBe(200);
    expect((await putWith(cookie, 'c_1', 1, ['s_a'])).status).toBe(200);
    expect(await rows()).toEqual(['s_a']);
    await call('courses/c_1', { method: 'DELETE', cookie });
    expect(await rows()).toEqual([]);
    await putSource(cookie, 'c_2', 's_c', new Uint8Array([7]));
    await call('account', { method: 'DELETE', cookie });
    expect(await rows()).toEqual([]);
  });

  it('are the account’s alone, within a size, and an older page that sends none still saves', async () => {
    const ada = await signIn();
    await putSource(ada, 'c_1', 's_a', new Uint8Array([9]));
    const bob = await signIn({ sub: 'g-other', email: 'bob@example.edu' });
    expect((await call('courses/c_1/sources/s_a', { cookie: bob })).status).toBe(404);
    expect((await putSource(ada, 'c_1', 's_big', new Uint8Array(4 * 1024 * 1024 + 1))).status).toBe(413);
    // No list: an older page's body carries its own text, and nothing kept apart is touched.
    expect((await putWith(ada, 'c_1', 0, null)).status).toBe(200);
    expect(await rows()).toEqual(['s_a']);
  });
});
