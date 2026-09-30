import { beforeEach, describe, expect, it } from 'vitest';
import { handle } from '../src/api';
import { balanceOf, charge, FREE_CREDITS, MILLI } from '../src/credits';
import { forgetGoogleKeys } from '../src/google';
import type { Env } from '../src/types';
import { fakeD1, fakeGoogle } from './fake';

const CLIENT = 'client-1.apps.googleusercontent.com';
let env: Env;
let google: Awaited<ReturnType<typeof fakeGoogle>>;
let reply: () => Response;
let sent: { body: Record<string, unknown>; auth: string | null }[];

const usage = { prompt_tokens: 3000, completion_tokens: 2000, prompt_tokens_details: { cached_tokens: 1000 }, completion_tokens_details: { reasoning_tokens: 1500 } };
const completion = () => new Response(JSON.stringify({ id: 'chatcmpl-1', model: 'gpt-6-luna', choices: [{ index: 0, message: { role: 'assistant', content: '{"ok":true}' }, finish_reason: 'stop' }], usage }), { headers: { 'content-type': 'application/json' } });

const fetchImpl: typeof fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith('https://api.openai.com/')) {
    sent.push({ body: JSON.parse(String(init?.body)) as Record<string, unknown>, auth: new Headers(init?.headers).get('authorization') });
    return reply();
  }
  return google.fetchImpl(input, init);
};

beforeEach(async () => {
  forgetGoogleKeys();
  env = { DB: fakeD1(), VITE_GOOGLE_CLIENT_ID: CLIENT, ANTHROPIC_API_KEY: 'sk-ant-folio-test', OPENAI_API_KEY: 'sk-openai-folio-test' };
  google = await fakeGoogle(CLIENT);
  reply = completion;
  sent = [];
});

const call = (path: string, init: RequestInit & { cookie?: string } = {}) => {
  const headers = new Headers(init.headers);
  if (init.method && init.method !== 'GET') headers.set('x-folio', '1');
  if (init.cookie) headers.set('cookie', init.cookie);
  headers.set('cf-connecting-ip', '203.0.113.7');
  return handle(new Request(`https://folio.university/api/${path}`, { ...init, headers }), env, fetchImpl);
};

async function signIn(): Promise<string> {
  const res = await call('session', { method: 'POST', body: JSON.stringify({ idToken: await google.token({ sub: 'g-123', email: 'ada@example.edu' }), nonce: 'n-1' }) });
  return res.headers.get('set-cookie')!.split(';')[0]!;
}

const chat = (cookie: string, body: Record<string, unknown> = {}) =>
  call('ai/openai/v1/chat/completions', { method: 'POST', cookie, body: JSON.stringify({ model: 'gpt-6-luna', reasoning_effort: 'high', messages: [{ role: 'user', content: 'Write the quiz' }], ...body }) });

describe('OpenAI calls paid with credits', () => {
  it('go to OpenAI with Folio’s key and cost their tokens times the markup, cached input at its own price', async () => {
    const cookie = await signIn();
    const res = await chat(cookie);
    expect(res.status).toBe(200);
    expect(sent[0]!.auth).toBe('Bearer sk-openai-folio-test');
    // The longest answer is capped, so the hold can cover it.
    expect(sent[0]!.body.max_completion_tokens).toBe(32000);
    const cost = charge('gpt-6-luna', { input: 2000, output: 2000, cacheRead: 1000, cacheWrite: 0 });
    // 2000 × $0.1/M + 2000 × $0.5/M + 1000 × $0.01/M = $0.00121; × 3 = 0.363 credits.
    expect(cost).toBe(363);
    expect(await balanceOf(env.DB, 'g-123')).toBe(FREE_CREDITS * MILLI - cost);
  });

  it('reach only Folio’s OpenAI models, at the efforts Folio uses, and never stream', async () => {
    const cookie = await signIn();
    expect((await chat(cookie, { model: 'gpt-6-astra' })).status).toBe(400);
    expect((await chat(cookie, { model: 'claude-sonnet-5-5' })).status).toBe(400);
    expect((await chat(cookie, { reasoning_effort: 'xhigh' })).status).toBe(400);
    expect((await chat(cookie, { stream: true })).status).toBe(400);
    expect(sent).toHaveLength(0);
  });

  it('cost nothing when OpenAI fails, and never report Folio’s key as the teacher’s', async () => {
    const cookie = await signIn();
    reply = () => new Response('{"error":{"message":"overloaded"}}', { status: 503 });
    expect((await chat(cookie)).status).toBe(503);
    reply = () => new Response('{"error":{"message":"bad key"}}', { status: 401 });
    expect((await chat(cookie)).status).toBe(502);
    expect(await balanceOf(env.DB, 'g-123')).toBe(FREE_CREDITS * MILLI);
  });

  it('stop when the credits run out, and wait for Folio’s key to be set', async () => {
    const cookie = await signIn();
    await env.DB.prepare('UPDATE credits SET balance = 1000 WHERE user_id = ?').bind('g-123').run();
    expect((await chat(cookie, { model: 'gpt-6.1-sol' })).status).toBe(402);
    delete env.OPENAI_API_KEY;
    expect((await chat(cookie)).status).toBe(503);
  });

  it('keep Claude’s route to Claude’s models', async () => {
    const cookie = await signIn();
    const res = await call('ai/v1/messages', { method: 'POST', cookie, body: JSON.stringify({ model: 'gpt-6-luna', max_tokens: 1000, messages: [] }) });
    expect(res.status).toBe(400);
  });
});
