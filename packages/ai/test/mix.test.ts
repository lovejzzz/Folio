import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createInference, FOLIO_MIX, InferenceError, priceUsage, REVIEW_MODELS, reviewerSettings, type ModelSettings, type Usage } from '../src';

const schema = z.object({ title: z.string() });
const folio: ModelSettings = { provider: 'folio', apiKey: '', model: 'claude-sonnet-5-5', baseUrl: 'https://folio.university/api/ai' };

/** Folio's server, answering Claude's messages and OpenAI's chat completions alike. */
function folioServer(status = 200) {
  const seen: { url: string; body: Record<string, unknown>; headers: Headers }[] = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    seen.push({ url, body: JSON.parse(String(init?.body)) as Record<string, unknown>, headers: new Headers(init?.headers) });
    const text = '{"title":"Cells"}';
    const body = url.includes('chat/completions')
      ? { model: 'gpt-6-luna', choices: [{ message: { content: text }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5 } }
      : { id: 'm', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } };
    return new Response(JSON.stringify(status === 200 ? body : { error: { message: 'no credits' } }), { status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { fn, seen };
}

const ask = (task: string, effort: 'low' | 'medium' | 'high' = 'medium') => ({ task, system: 'sys', prompt: 'hello', schema, effort });

describe('Folio credits: each part by its own model', () => {
  it('sends quizzes and assignments to GPT-6 Luna at high effort, through Folio’s server, with no key', async () => {
    const { fn, seen } = folioServer();
    const inference = createInference(folio, fn);
    expect(await inference.complete(ask('folio_quiz'))).toEqual({ title: 'Cells' });
    await inference.complete(ask('folio_assignments', 'low'));
    for (const call of seen) {
      expect(call.url).toBe('https://folio.university/api/ai/openai/v1/chat/completions');
      expect(call.body).toMatchObject({ model: 'gpt-6-luna', reasoning_effort: 'high' });
      expect(call.headers.get('x-folio')).toBe('1');
      expect(call.headers.get('authorization')).toBeNull();
    }
  });

  it('keeps plans, slides, study guides, discussions, FAQ and everything else with Claude', async () => {
    const { fn, seen } = folioServer();
    const inference = createInference(folio, fn);
    for (const task of ['folio_plan', 'folio_slides', 'folio_study', 'folio_discussions', 'folio_faq', 'folio_outline']) await inference.complete(ask(task));
    expect(seen.every((c) => c.url.startsWith('https://folio.university/api/ai/v1/messages') && c.body.model === 'claude-sonnet-5-5')).toBe(true);
  });

  it('has GPT-6.1 Sol check each plan at low effort', async () => {
    const { fn, seen } = folioServer();
    expect(REVIEW_MODELS.folio).toBe('gpt-6.1-sol');
    const reviewer = createInference(reviewerSettings(folio)!, fn);
    await reviewer.complete(ask('folio_plan_review', 'medium'));
    expect(seen[0]!.body).toMatchObject({ model: 'gpt-6.1-sol', reasoning_effort: 'low' });
    expect(FOLIO_MIX.folio_plan_review).toEqual({ model: 'gpt-6.1-sol', effort: 'low' });
  });

  it('says so when the credits run out, whichever model was asked', async () => {
    const { fn } = folioServer(402);
    await expect(createInference(folio, fn).complete(ask('folio_quiz'))).rejects.toMatchObject({ kind: 'credits' });
    expect(new InferenceError('credits', 'x').kind).toBe('credits');
  });

  it('prices each call as its maker does', async () => {
    const usages: Usage[] = [
      { provider: 'folio', model: 'gpt-6-luna', input: 1_000_000, output: 1_000_000, cacheRead: 0, cacheWrite: 0 },
      { provider: 'folio', model: 'claude-sonnet-5-5', input: 1_000_000, output: 0, cacheRead: 0, cacheWrite: 0 },
    ];
    const cost = await priceUsage(usages, (async () => new Response('nope', { status: 500 })) as typeof fetch);
    // Luna $0.10 + $0.50, Sonnet $2 input.
    expect(cost.usd).toBeCloseTo(2.6, 5);
    expect(cost.unpriced).toBe(0);
  });
});

describe('OpenAI with the teacher’s own key', () => {
  it('asks reasoning models for Folio’s effort, and older models for none', async () => {
    const { fn, seen } = folioServer();
    await createInference({ provider: 'openai', apiKey: 'sk-test', model: 'gpt-6-sol', baseUrl: '' }, fn).complete(ask('folio_slides', 'low'));
    await createInference({ provider: 'openai', apiKey: 'sk-test', model: 'gpt-4o', baseUrl: '' }, fn).complete(ask('folio_slides', 'low'));
    expect(seen[0]!.body.reasoning_effort).toBe('low');
    expect(seen[1]!.body.reasoning_effort).toBeUndefined();
    expect(seen[0]!.headers.get('authorization')).toBe('Bearer sk-test');
  });
});
