import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createInference, InferenceError, isConfigured, type ModelSettings } from '../src';

const schema = z.object({ title: z.string() });
const req = { task: 'folio_test', system: 'sys', prompt: 'hello', schema };

function mockFetch(status: number, body: unknown) {
  const seen: { url: string; init: RequestInit }[] = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    seen.push({ url: String(input instanceof Request ? input.url : input), init: init ?? {} });
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { fn, seen };
}

const settings = (provider: ModelSettings['provider'], extra: Partial<ModelSettings> = {}): ModelSettings => ({
  provider,
  apiKey: 'sk-test',
  model: provider === 'anthropic' ? 'claude-opus-5' : 'm',
  baseUrl: 'http://localhost:11434/v1',
  ...extra,
});

const anthropicMessage = (text: string, stop = 'end_turn') => ({
  id: 'msg_1',
  type: 'message',
  role: 'assistant',
  model: 'claude-opus-5',
  content: [{ type: 'text', text }],
  stop_reason: stop,
  usage: { input_tokens: 1, output_tokens: 1 },
});

describe('anthropic adapter', () => {
  it('sends a JSON-schema output format and parses the text', async () => {
    const { fn, seen } = mockFetch(200, anthropicMessage('{"title":"Cells"}'));
    const out = await createInference(settings('anthropic'), fn).complete(req);
    expect(out).toEqual({ title: 'Cells' });
    const body = JSON.parse(String(seen[0]!.init.body));
    expect(seen[0]!.url).toContain('/v1/messages');
    expect(body.output_config.format.type).toBe('json_schema');
    expect(body.output_config.format.schema.properties.title.type).toBe('string');
    expect(body.fallbacks).toBe('default');
    expect(body.system).toBe('sys');
  });

  it('sends the shared course background as a cached block, and the effort asked for', async () => {
    const { fn, seen } = mockFetch(200, anthropicMessage('{"title":"x"}'));
    await createInference(settings('anthropic'), fn).complete({ ...req, context: 'The course', effort: 'low' });
    const body = JSON.parse(String(seen[0]!.init.body));
    expect(body.system).toEqual([
      { type: 'text', text: 'sys' },
      { type: 'text', text: 'The course', cache_control: { type: 'ephemeral' } },
    ]);
    expect(body.output_config.effort).toBe('low');
  });

  it('reports refusals and bad keys plainly', async () => {
    await expect(createInference(settings('anthropic'), mockFetch(200, anthropicMessage('', 'refusal')).fn).complete(req)).rejects.toMatchObject({ kind: 'refused' });
    const bad = mockFetch(401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } });
    await expect(createInference(settings('anthropic'), bad.fn).complete(req)).rejects.toMatchObject({ kind: 'auth' });
  });

  it('omits fallbacks and effort for models that do not take them', async () => {
    const { fn, seen } = mockFetch(200, anthropicMessage('{"title":"x"}'));
    await createInference(settings('anthropic', { model: 'claude-haiku-4-5' }), fn).complete(req);
    const body = JSON.parse(String(seen[0]!.init.body));
    expect(body.fallbacks).toBeUndefined();
    expect(body.output_config.effort).toBeUndefined();
  });
});

describe('openai and local adapters', () => {
  it('uses a json_schema response format', async () => {
    const { fn, seen } = mockFetch(200, { choices: [{ message: { content: '{"title":"Maps"}' }, finish_reason: 'stop' }] });
    expect(await createInference(settings('openai'), fn).complete(req)).toEqual({ title: 'Maps' });
    expect(seen[0]!.url).toBe('https://api.openai.com/v1/chat/completions');
    const body = JSON.parse(String(seen[0]!.init.body));
    expect(body.response_format.json_schema.name).toBe('folio_test');
  });

  it('talks to a local server without a key', async () => {
    const { fn, seen } = mockFetch(200, { choices: [{ message: { content: '```json\n{"title":"Local"}\n```' } }] });
    const local = settings('local', { apiKey: '' });
    expect(isConfigured(local)).toBe(true);
    expect(await createInference(local, fn).complete(req)).toEqual({ title: 'Local' });
    expect(seen[0]!.url).toBe('http://localhost:11434/v1/chat/completions');
    expect((seen[0]!.init.headers as Record<string, string>).authorization).toBeUndefined();
  });

  it('sends DeepSeek the schema in the prompt and asks for JSON mode', async () => {
    const { fn, seen } = mockFetch(200, { choices: [{ message: { content: '{"title":"Deep"}' }, finish_reason: 'stop' }] });
    expect(await createInference(settings('deepseek'), fn).complete(req)).toEqual({ title: 'Deep' });
    expect(seen[0]!.url).toBe('https://api.deepseek.com/chat/completions');
    const body = JSON.parse(String(seen[0]!.init.body));
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.max_tokens).toBe(16000);
    expect(body.thinking).toEqual({ type: 'disabled' });
    await createInference(settings('deepseek'), fn).complete({ ...req, effort: 'medium' });
    expect(JSON.parse(String(seen[1]!.init.body)).reasoning_effort).toBe('low');
    expect(body.messages[0].content).toMatch(/JSON Schema:\n\{.*"title"/);
  });

  it('maps rate limits', async () => {
    await expect(createInference(settings('openai'), mockFetch(429, {}).fn).complete(req)).rejects.toMatchObject({ kind: 'rate' });
  });
});

describe('google adapter', () => {
  it('sends a response schema and reads the first candidate', async () => {
    const { fn, seen } = mockFetch(200, { candidates: [{ content: { parts: [{ text: '{"title":"Rivers"}' }] }, finishReason: 'STOP' }] });
    expect(await createInference(settings('google'), fn).complete(req)).toEqual({ title: 'Rivers' });
    const body = JSON.parse(String(seen[0]!.init.body));
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect((seen[0]!.init.headers as Record<string, string>)['x-goog-api-key']).toBe('sk-test');
  });
});

describe('createInference', () => {
  it('refuses to start without a key', () => {
    expect(() => createInference(settings('openai', { apiKey: ' ' }))).toThrow(InferenceError);
  });
});
