import { beforeEach, describe, expect, it } from 'vitest';
import { handle } from '../src/api';
import { forgetGoogleKeys } from '../src/google';
import { MAX_ACCOUNT_MEDIA_BYTES, putMedia } from '../src/media';
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
