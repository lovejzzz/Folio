import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { costOf, createInference, fetchLivePrices, modelKey, reviewerSettings, type ModelSettings, type Usage } from '../src';

const json = (body: unknown) => (async () => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch;
const req = { task: 'folio_test', system: 'sys', prompt: 'hello', schema: z.object({ title: z.string() }) };
const settings = (provider: ModelSettings['provider'], model: string): ModelSettings => ({ provider, apiKey: 'sk-test', model, baseUrl: 'http://localhost:11434/v1' });

async function usageOf(provider: ModelSettings['provider'], model: string, body: unknown): Promise<Usage> {
  const seen: Usage[] = [];
  await createInference(settings(provider, model), json(body), (u) => seen.push(u)).complete(req);
  expect(seen).toHaveLength(1);
  return seen[0]!;
}

describe('the tokens each call used', () => {
  it('come from Anthropic with cached input apart', async () => {
    const body = { id: 'm', type: 'message', role: 'assistant', model: 'claude-sonnet-5', content: [{ type: 'text', text: '{"title":"x"}' }], stop_reason: 'end_turn', usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 900, cache_creation_input_tokens: 40 } };
    expect(await usageOf('anthropic', 'claude-sonnet-5', body)).toEqual({ provider: 'anthropic', model: 'claude-sonnet-5', input: 100, output: 50, cacheRead: 900, cacheWrite: 40 });
  });

  it('take OpenAI’s cached tokens out of the prompt count', async () => {
    const body = { model: 'gpt-6-sol', choices: [{ message: { content: '{"title":"x"}' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1000, completion_tokens: 80, prompt_tokens_details: { cached_tokens: 600 } } };
    expect(await usageOf('openai', 'gpt-6-sol', body)).toMatchObject({ input: 400, output: 80, cacheRead: 600, cacheWrite: 0 });
  });

  it('read DeepSeek’s cache hits and misses', async () => {
    const body = { choices: [{ message: { content: '{"title":"x"}' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1000, completion_tokens: 80, prompt_cache_hit_tokens: 700, prompt_cache_miss_tokens: 300 } };
    expect(await usageOf('deepseek', 'deepseek-flash', body)).toMatchObject({ model: 'deepseek-flash', input: 300, output: 80, cacheRead: 700 });
  });

  it('count Gemini’s thinking as output', async () => {
    const body = { modelVersion: 'gemini-3.8-flash', candidates: [{ content: { parts: [{ text: '{"title":"x"}' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 1000, cachedContentTokenCount: 200, candidatesTokenCount: 60, thoughtsTokenCount: 140 } };
    expect(await usageOf('google', 'gemini-3.8-flash', body)).toMatchObject({ input: 800, output: 200, cacheRead: 200 });
  });

  it('are skipped, not fatal, when a response carries none', async () => {
    const seen: Usage[] = [];
    const body = { id: 'm', type: 'message', role: 'assistant', model: 'claude-sonnet-5', content: [{ type: 'text', text: '{"title":"x"}' }], stop_reason: 'end_turn' };
    expect(await createInference(settings('anthropic', 'claude-sonnet-5'), json(body), (u) => seen.push(u)).complete(req)).toEqual({ title: 'x' });
    expect(seen).toEqual([]);
  });

  it('are not counted for a model on this computer, which costs nothing', async () => {
    const seen: Usage[] = [];
    const body = { choices: [{ message: { content: '{"title":"x"}' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5 } };
    await createInference(settings('local', 'llama3.1'), json(body), (u) => seen.push(u)).complete(req);
    expect(seen).toEqual([]);
  });
});

describe('what a course cost', () => {
  const list = {
    data: [
      { id: 'anthropic/claude-sonnet-5', pricing: { prompt: '0.000003', completion: '0.000015', input_cache_read: '0.0000003', input_cache_write: '0.00000375' } },
      { id: 'anthropic/claude-opus-5.5', pricing: { prompt: '0.000004', completion: '0.00002' } },
      { id: 'anthropic/claude-sonnet-5:thinking', pricing: { prompt: '1', completion: '1' } },
    ],
  };
  const sonnet: Usage = { provider: 'anthropic', model: 'claude-sonnet-5', input: 1_000_000, output: 100_000, cacheRead: 1_000_000, cacheWrite: 0 };

  it('names models the same way the price list does', () => {
    expect(modelKey('claude-opus-5-5')).toBe('claude-opus-5.5');
    expect(modelKey('claude-haiku-4-5-20251001')).toBe('claude-haiku-4.5');
    expect(modelKey('models/gemini-3.8-flash')).toBe('gemini-3.8-flash');
  });

  it('uses today’s prices when the list can be read', async () => {
    const live = await fetchLivePrices(json(list));
    expect(live?.has('anthropic/claude-sonnet-5:thinking')).toBe(false);
    const cost = costOf([sonnet, { ...sonnet, model: 'claude-opus-5-5', input: 1_000_000, output: 0, cacheRead: 0 }], live);
    // Sonnet: $3 + $1.50 + $0.30; Opus 5.5 at $4 a million; a missing cache price falls back to the input price.
    expect(cost.usd).toBeCloseTo(8.8, 6);
    expect(cost.source).toBe('live');
    expect(cost.unpriced).toBe(0);
  });

  it('falls back to Folio’s own list, and leaves out what neither knows', async () => {
    const offline = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    const live = await fetchLivePrices(offline);
    expect(live).toBeNull();
    const cost = costOf([sonnet, { provider: 'openai', model: 'gpt-6-sol', input: 10, output: 10, cacheRead: 0, cacheWrite: 0 }], live);
    // Built in for Sonnet 5: $2 in, $10 out, $0.20 cached.
    expect(cost.usd).toBeCloseTo(2 + 1 + 0.2, 6);
    expect(cost.source).toBe('built-in');
    expect(cost.unpriced).toBe(1);
  });

  it('has Opus review Claude plans, with the teacher’s own key, and no reviewer where none was tried', () => {
    expect(reviewerSettings(settings('anthropic', 'claude-sonnet-5'))).toMatchObject({ provider: 'anthropic', model: 'claude-opus-5-5', apiKey: 'sk-test' });
    expect(reviewerSettings(settings('openai', 'gpt-6-sol'))).toBeNull();
  });
});
