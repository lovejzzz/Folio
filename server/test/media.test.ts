import { beforeEach, describe, expect, it } from 'vitest';
import { handle } from '../src/api';
import { forgetGoogleKeys } from '../src/google';
import { MAX_ACCOUNT_MEDIA_BYTES, putMedia } from '../src/media';
import type { Stats } from '../src/stats';
import type { Env } from '../src/types';
import { fakeD1, fakeGoogle, fakeR2 } from './fake';

const CLIENT = 'client-1.apps.googleusercontent.com';
let env: Env;
let bucket: ReturnType<typeof fakeR2>;
let google: Awaited<ReturnType<typeof fakeGoogle>>;

beforeEach(async () => {
  forgetGoogleKeys();
  bucket = fakeR2();
  env = { DB: fakeD1(), VITE_GOOGLE_CLIENT_ID: CLIENT, MEDIA: bucket };
  google = await fakeGoogle(CLIENT);
});

const call = (path: string, init: RequestInit & { cookie?: string } = {}) => {
  const headers = new Headers(init.headers);
  if (init.method && init.method !== 'GET') headers.set('x-folio', '1');
  if (init.cookie) headers.set('cookie', init.cookie);
  return handle(new Request(`https://folio.university/api/${path}`, { ...init, headers }), env, google.fetchImpl);
};

async function signIn(sub = 'g-123'): Promise<string> {
  const res = await call('session', { method: 'POST', cookie: 'folio_signin=n-1', body: JSON.stringify({ idToken: await google.token({ sub, email: `${sub}@example.edu` }) }) });
  return res.headers.get('set-cookie')!.split(';')[0]!;
}

const picture = (n: number) => new Uint8Array(n).fill(7);
const send = (cookie: string, course: string, id: string, bytes = picture(10)) =>
  call(`courses/${course}/media/${id}`, { method: 'PUT', cookie, body: bytes, headers: { 'content-type': 'image/webp', 'x-folio-name': encodeURIComponent('the arena.webp') } });

describe('a course’s pictures, clips and files in the account', () => {
  it('are kept under the account and the course, and come back as they went, to their owner alone', async () => {
    const cookie = await signIn();
    expect((await send(cookie, 'c_1', 'm_abc.webp')).status).toBe(200);
    expect(bucket.keys()).toEqual(['g-123/c_1/m_abc.webp']);
    const back = await call('courses/c_1/media/m_abc.webp', { cookie });
    expect(back.status).toBe(200);
    expect(back.headers.get('content-type')).toBe('image/webp');
    expect(decodeURIComponent(back.headers.get('x-folio-name')!)).toBe('the arena.webp');
    // Never shown as a page of Folio's own, whatever the file is.
    expect(back.headers.get('content-disposition')).toBe('attachment');
    expect(back.headers.get('x-content-type-options')).toBe('nosniff');
    expect(new Uint8Array(await back.arrayBuffer())).toEqual(picture(10));
    expect(await (await call('courses/c_1/media', { cookie })).json()).toEqual({ media: [{ id: 'm_abc.webp', bytes: 10 }] });
    // Another account sees nothing of it, and nobody signed out does.
    const other = await signIn('g-999');
    expect((await call('courses/c_1/media/m_abc.webp', { cookie: other })).status).toBe(404);
    expect((await call('courses/c_1/media/m_abc.webp')).status).toBe(401);
  });

  it('take no name that could reach outside the course', async () => {
    const cookie = await signIn();
    for (const id of ['..%2F..%2Fg-999%2Fc_1%2Fm_1.webp', 'a b.webp', 'm_1.WEBP.exe.toolongextension']) expect((await send(cookie, 'c_1', id)).status).toBe(400);
    expect(bucket.keys()).toEqual([]);
  });

  it('go with the course, and with the account', async () => {
    const cookie = await signIn();
    for (const [course, id] of [['c_1', 'm_1.webp'], ['c_1', 'm_2.webp'], ['c_1', 'm_3.mp4'], ['c_2', 'm_4.webp']] as const) await send(cookie, course, id);
    await call('courses/c_1', { method: 'DELETE', cookie });
    expect(bucket.keys()).toEqual(['g-123/c_2/m_4.webp']);
    await call('account', { method: 'DELETE', cookie });
    expect(bucket.keys()).toEqual([]);
  });

  it('are held to a size each and a size for the account, and a file sent again is not counted twice', async () => {
    const cookie = await signIn();
    expect((await send(cookie, 'c_1', 'm_0.webp', picture(0))).status).toBe(413);
    const most = new ArrayBuffer(MAX_ACCOUNT_MEDIA_BYTES - 5);
    await bucket.put('g-123/c_1/m_big.mp4', most);
    expect(await putMedia(bucket, 'g-123', 'c_1', 'm_small.webp', picture(5).buffer, 'image/webp', 'a')).toBe('ok');
    expect((await send(cookie, 'c_1', 'm_more.webp')).status).toBe(507);
    expect((await send(cookie, 'c_1', 'm_small.webp', picture(5))).status).toBe(200);
  });

  it('stay on the device when the server has nowhere to keep them', async () => {
    const cookie = await signIn();
    env = { ...env, MEDIA: undefined };
    expect((await send(cookie, 'c_1', 'm_1.webp')).status).toBe(501);
  });
});

describe('the running totals', () => {
  it('say what was spent on which model, what was bought, and how much the busiest accounts used, without naming one', async () => {
    const owner = await call('session', { method: 'POST', cookie: 'folio_signin=n-1', body: JSON.stringify({ idToken: await google.token({ sub: 'g-owner', email: 'xingpicture@gmail.com' }) }) });
    const cookie = owner.headers.get('set-cookie')!.split(';')[0]!;
    const now = Date.now();
    const add = (id: string, user: string, kind: string, amount: number, detail: string) => env.DB.prepare('INSERT INTO credit_ledger (id, user_id, kind, amount, ref, detail, created_at) VALUES (?, ?, ?, ?, NULL, ?, ?)').bind(id, user, kind, amount, detail, now).run();
    await add('a', 'g-1', 'spend', -40_000, 'claude-sonnet-5-5 9000+12000');
    await add('b', 'g-1', 'spend', -2_000, 'gpt-6-luna 3000+9000');
    await add('c', 'g-2', 'spend', -10_000, 'claude-sonnet-5-5 4000+3000');
    await add('d', 'g-2', 'purchase', 1_000_000, '1,000 credits ($10.00)');
    await env.DB.prepare("INSERT INTO courses (user_id, id, title, lesson_count, updated_at, version, size) VALUES ('g-1', 'c_1', 'T', 14, ?, 1, 5000), ('g-1', 'c_2', 'T', 4, ?, 1, 1000)").bind(new Date(now).toISOString(), '2026-01-01T00:00:00Z').run();
    const body = (await (await call('admin/stats', { cookie })).json()) as Stats;
    expect(body.models).toEqual([{ model: 'claude-sonnet-5-5', calls: 2, credits: 50 }, { model: 'gpt-6-luna', calls: 1, credits: 2 }]);
    expect(body.heaviest).toEqual([42, 10]);
    expect(body.credits).toMatchObject({ spent30: 52, bought30: 1000, purchases30: 1, dollars30: 10 });
    expect(body.accounts).toMatchObject({ writing30: 2, paying: 1, withCourses: 1 });
    expect(body.courses).toMatchObject({ kept: 2, lessons: 18, changed7: 1, short: 1, medium: 1, long: 0, mostInOneAccount: 2 });
    expect(JSON.stringify(body)).not.toMatch(/g-1|g-2/);
  });

  it('are shown to the account that runs Folio and to no one else, and name nobody', async () => {
    const owner = await call('session', { method: 'POST', cookie: 'folio_signin=n-1', body: JSON.stringify({ idToken: await google.token({ sub: 'g-owner', email: 'XingPicture@gmail.com' }) }) });
    const ownerCookie = owner.headers.get('set-cookie')!.split(';')[0]!;
    const other = await signIn('g-teacher');
    await send(other, 'c_1', 'm_1.webp');
    expect((await call('admin/stats', { cookie: other })).status).toBe(404);
    expect((await call('admin/stats')).status).toBe(401);
    const res = await call('admin/stats', { cookie: ownerCookie });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Stats;
    expect(body.accounts).toMatchObject({ all: 2, week: 2, school: 1, withCourses: 0, writing30: 0, paying: 0 });
    expect(body.media).toEqual({ files: 1, bytes: 10, pictures: 1, clips: 0, other: 0 });
    expect(body.days[0]!.counts).toMatchObject({ sign_in: 2, new_accounts: 2 });
    expect(body.calls).toEqual({ made30: 0, refused30: 0, unreachable30: 0, ranOut30: 0 });
    expect(JSON.stringify(body)).not.toMatch(/g-teacher|example\.edu|gmail/i);
  });
});
