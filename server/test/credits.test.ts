import { beforeEach, describe, expect, it } from 'vitest';
import { handle } from '../src/api';
import { addPurchase, balanceOf, charge, FREE_CREDITS, FREE_PER_ADDRESS_PER_DAY, MILLI } from '../src/credits';
import { forgetGoogleKeys } from '../src/google';
import type { Env } from '../src/types';
import { fakeD1, fakeGoogle } from './fake';

const CLIENT = 'client-1.apps.googleusercontent.com';
let env: Env;
let google: Awaited<ReturnType<typeof fakeGoogle>>;
/** What Anthropic answers next, and what it was sent. */
let reply: () => Response;
let sent: { body: Record<string, unknown>; key: string | null }[];

const usage = { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
const message = (u = usage) => new Response(JSON.stringify({ id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: [{ type: 'text', text: '{"ok":true}' }], stop_reason: 'end_turn', usage: u }), { headers: { 'content-type': 'application/json' } });
const sse = (events: object[]) => new Response(events.map((e) => `event: ${(e as { type: string }).type}\ndata: ${JSON.stringify(e)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
const streamed = () =>
  sse([
    { type: 'message_start', message: { id: 'm', type: 'message', role: 'assistant', content: [], usage: { input_tokens: 1000, output_tokens: 1 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '{"ok":true}' } },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 500 } },
    { type: 'message_stop' },
  ]);

const fetchImpl: typeof fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith('https://api.anthropic.com/')) {
    sent.push({ body: JSON.parse(String(init?.body)) as Record<string, unknown>, key: new Headers(init?.headers).get('x-api-key') });
    return reply();
  }
  return google.fetchImpl(input, init);
};

beforeEach(async () => {
  forgetGoogleKeys();
  env = { DB: fakeD1(), VITE_GOOGLE_CLIENT_ID: CLIENT, ANTHROPIC_API_KEY: 'sk-ant-folio-test' };
  google = await fakeGoogle(CLIENT);
  reply = () => message();
  sent = [];
});

const pending: Promise<unknown>[] = [];
const call = (path: string, init: RequestInit & { cookie?: string; ip?: string } = {}) => {
  const headers = new Headers(init.headers);
  if (init.method && init.method !== 'GET') headers.set('x-folio', '1');
  if (init.cookie) headers.set('cookie', init.cookie);
  headers.set('cf-connecting-ip', init.ip ?? '203.0.113.7');
  return handle(new Request(`https://folio.university/api/${path}`, { ...init, headers }), env, fetchImpl, (p) => pending.push(p));
};
const settled = async () => {
  await Promise.all(pending.splice(0));
};

async function signIn(sub = 'g-123', ip?: string): Promise<string> {
  const res = await call('session', { method: 'POST', ip, body: JSON.stringify({ idToken: await google.token({ sub, email: `${sub}@example.edu` }), nonce: 'n-1' }) });
  expect(res.status).toBe(200);
  return res.headers.get('set-cookie')!.split(';')[0]!;
}

const ask = (cookie: string, body: Record<string, unknown> = {}) =>
  call('ai/v1/messages?beta=true', { method: 'POST', cookie, body: JSON.stringify({ model: 'claude-sonnet-5-5', max_tokens: 16000, messages: [{ role: 'user', content: 'Write the lesson plan' }], ...body }) });
const balance = async (cookie: string) => (await (await call('credits', { cookie })).json()) as { balance: number; spent30: number; added: { kind: string; credits: number }[] };

describe('free credits', () => {
  it('come once, with the first sign-in', async () => {
    const cookie = await signIn();
    expect((await balance(cookie)).balance).toBe(FREE_CREDITS);
    await signIn();
    expect((await balance(cookie)).balance).toBe(FREE_CREDITS);
    expect((await balance(cookie)).added).toEqual([expect.objectContaining({ kind: 'grant', credits: FREE_CREDITS })]);
  });

  it('are limited per network address a day, so new accounts can’t farm them', async () => {
    for (let i = 0; i < FREE_PER_ADDRESS_PER_DAY; i++) expect((await balance(await signIn(`g-${i}`))).balance).toBe(FREE_CREDITS);
    expect((await balance(await signIn('g-late'))).balance).toBe(0);
    expect((await balance(await signIn('g-elsewhere', '198.51.100.9'))).balance).toBe(FREE_CREDITS);
  });
});

describe('calls paid with credits', () => {
  it('go to Anthropic with Folio’s key, and cost their tokens times the markup', async () => {
    const cookie = await signIn();
    const res = await ask(cookie);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { content: { text: string }[] }).content[0]!.text).toBe('{"ok":true}');
    expect(sent[0]!.key).toBe('sk-ant-folio-test');
    // 1000 in × $2/M + 500 out × $10/M = $0.007; × 3 = 2.1 cents = 2.1 credits.
    expect(charge('claude-sonnet-5-5', { input: 1000, output: 500, cacheRead: 0, cacheWrite: 0 })).toBe(2100);
    expect(await balanceOf(env.DB, 'g-123')).toBe(FREE_CREDITS * MILLI - 2100);
  });

  it('stream through untouched and are settled when the stream ends', async () => {
    const cookie = await signIn();
    reply = streamed;
    const res = await ask(cookie, { stream: true });
    const text = await res.text();
    expect(text).toContain('"text":"{\\"ok\\":true}"');
    await settled();
    expect(await balanceOf(env.DB, 'g-123')).toBe(FREE_CREDITS * MILLI - 2100);
  });

  it('stopped partway, cost what was written so far, not the whole hold', async () => {
    const cookie = await signIn();
    reply = streamed;
    const res = await ask(cookie, { stream: true });
    await res.body!.cancel();
    await settled();
    const spent = FREE_CREDITS * MILLI - (await balanceOf(env.DB, 'g-123'));
    expect(spent).toBeGreaterThanOrEqual(0);
    expect(spent).toBeLessThan(charge('claude-sonnet-5-5', { input: 5000, output: 16000, cacheRead: 0, cacheWrite: 0 }));
  });

  it('reach only Folio’s models, with answers no longer than Folio asks for', async () => {
    const cookie = await signIn();
    expect((await ask(cookie, { model: 'claude-fable-5-1' })).status).toBe(400);
    expect((await ask(cookie, { max_tokens: 200_000 })).status).toBe(400);
    expect(sent).toHaveLength(0);
  });

  it('stop when the credits run out, and cost nothing when Anthropic fails', async () => {
    const cookie = await signIn('g-late-joiner');
    await env.DB.prepare('UPDATE credits SET balance = 1000 WHERE user_id = ?').bind('g-late-joiner').run();
    expect((await ask(cookie)).status).toBe(402);
    await env.DB.prepare('UPDATE credits SET balance = 50000 WHERE user_id = ?').bind('g-late-joiner').run();
    reply = () => new Response('{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}', { status: 529 });
    expect((await ask(cookie)).status).toBe(529);
    expect(await balanceOf(env.DB, 'g-late-joiner')).toBe(50000);
    // Folio's own key refused is never reported as the teacher's key.
    reply = () => new Response('{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}', { status: 401 });
    expect((await ask(cookie)).status).toBe(502);
    expect(await balanceOf(env.DB, 'g-late-joiner')).toBe(50000);
  });

  it('need a signed-in teacher, and Folio’s key to be set', async () => {
    expect((await call('ai/v1/messages', { method: 'POST', body: '{}' })).status).toBe(401);
    const cookie = await signIn();
    delete env.ANTHROPIC_API_KEY;
    expect((await ask(cookie)).status).toBe(503);
  });
});

describe('free credits for school accounts only', () => {
  it('come with a confirmed .edu address, not with any other', async () => {
    const edu = await call('session', { method: 'POST', body: JSON.stringify({ idToken: await google.token({ sub: 'g-edu', email: 'Ada@Cs.Example.EDU' }), nonce: 'n-1' }) });
    expect((await balance(edu.headers.get('set-cookie')!.split(';')[0]!)).balance).toBe(FREE_CREDITS);
    for (const [sub, claims] of [['g-gmail', { email: 'ada@gmail.com' }], ['g-unconfirmed', { email: 'ada@example.edu', email_verified: false }]] as const) {
      const res = await call('session', { method: 'POST', body: JSON.stringify({ idToken: await google.token({ sub, ...claims }), nonce: 'n-1' }) });
      const cookie = res.headers.get('set-cookie')!.split(';')[0]!;
      const got = (await (await call('credits', { cookie })).json()) as { balance: number; school: boolean };
      expect(got.balance).toBe(0);
      expect(got.school).toBe(sub === 'g-unconfirmed');
    }
  });
});

describe('purchases', () => {
  it('add credits once per payment, however often it is reported', async () => {
    await signIn();
    expect(await addPurchase(env.DB, 'g-123', 1000 * MILLI, 'stripe:cs_1', '$10 pack')).toBe(true);
    expect(await addPurchase(env.DB, 'g-123', 1000 * MILLI, 'stripe:cs_1', '$10 pack')).toBe(false);
    expect(await balanceOf(env.DB, 'g-123')).toBe((FREE_CREDITS + 1000) * MILLI);
  });
});
