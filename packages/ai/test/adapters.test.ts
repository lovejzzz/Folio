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

  it('sends the course and the teacher’s files in the teacher’s turn, cached, and the effort asked for', async () => {
    const { fn, seen } = mockFetch(200, anthropicMessage('{"title":"x"}'));
    await createInference(settings('anthropic'), fn).complete({ ...req, context: 'The course', effort: 'low' });
    const body = JSON.parse(String(seen[0]!.init.body));
    // Only Folio's own words carry the system prompt's weight.
    expect(body.system).toBe('sys');
    expect(body.messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'The course', cache_control: { type: 'ephemeral' } },
          { type: 'text', text: 'hello' },
        ],
      },
    ]);
    expect(body.output_config.effort).toBe('low');
  });

  it('shows the model a picture ahead of the words about it', async () => {
    const { fn, seen } = mockFetch(200, anthropicMessage('{"title":"x"}'));
    await createInference(settings('anthropic'), fn).complete({ ...req, images: [{ type: 'image/webp', data: 'AAAA' }] });
    expect(JSON.parse(String(seen[0]!.init.body)).messages[0].content).toEqual([
      { type: 'image', source: { type: 'base64', media_type: 'image/webp', data: 'AAAA' } },
      { type: 'text', text: 'hello' },
    ]);
    const openai = mockFetch(200, { choices: [{ message: { content: '{"title":"x"}' }, finish_reason: 'stop' }] });
    await createInference(settings('openai'), openai.fn).complete({ ...req, images: [{ type: 'image/png', data: 'BBBB' }] });
    expect(JSON.parse(String(openai.seen[0]!.init.body)).messages.at(-1).content[0]).toEqual({ type: 'image_url', image_url: { url: 'data:image/png;base64,BBBB' } });
  });

  it('reports refusals and bad keys plainly', async () => {
    await expect(createInference(settings('anthropic'), mockFetch(200, anthropicMessage('', 'refusal')).fn).complete(req)).rejects.toMatchObject({ kind: 'refused' });
    const bad = mockFetch(401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } });
    await expect(createInference(settings('anthropic'), bad.fn).complete(req)).rejects.toMatchObject({ kind: 'auth' });
  });

  it('tells Claude what every field is for: a field with a default keeps its description', async () => {
    const { fn, seen } = mockFetch(200, anthropicMessage('{"blocks":[]}'));
    const block = z.object({ kind: z.string().default('').describe('callout: checkpoint or stuck'), items: z.array(z.string().min(1)).default([]).describe('list: the items') });
    await createInference(settings('anthropic'), fn).complete({ ...req, schema: z.object({ blocks: z.array(block) }) });
    const sent = JSON.stringify(JSON.parse(String(seen[0]!.init.body)).output_config.format.schema);
    // Named by reference, as the SDK's helper names them, both descriptions were dropped on the way.
    expect(sent).toContain('callout: checkpoint or stuck');
    expect(sent).toContain('list: the items');
    expect(sent).not.toMatch(/\$ref|default/);
    expect(sent).toContain('"required":["kind","items"]');
  });

  it('asks for writing at once only of a model that takes it', async () => {
    const sent = async (model: string, write: boolean) => {
      const { fn, seen } = mockFetch(200, anthropicMessage('{"title":"x"}'));
      await createInference(settings('anthropic', { model }), fn).complete({ ...req, write });
      return JSON.parse(String(seen[0]!.init.body)).thinking;
    };
    expect(await sent('claude-sonnet-5-5', true)).toEqual({ type: 'between_tools' });
    expect(await sent('claude-sonnet-5-5', false)).toBeUndefined();
    // Every other model refuses the setting: it thinks as it did.
    expect(await sent('claude-opus-5-5', true)).toBeUndefined();
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
    const withCourse = mockFetch(200, { choices: [{ message: { content: '{"title":"Maps"}' }, finish_reason: 'stop' }] });
    await createInference(settings('openai'), withCourse.fn).complete({ ...req, context: 'The course' });
    expect(JSON.parse(String(withCourse.seen[0]!.init.body)).messages).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'The course' },
      { role: 'user', content: 'hello' },
    ]);
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
    const withCourse = mockFetch(200, { candidates: [{ content: { parts: [{ text: '{"title":"Rivers"}' }] }, finishReason: 'STOP' }] });
    await createInference(settings('google'), withCourse.fn).complete({ ...req, context: 'The course' });
    const sent = JSON.parse(String(withCourse.seen[0]!.init.body));
    expect(sent.systemInstruction.parts).toEqual([{ text: 'sys' }]);
    expect(sent.contents).toEqual([{ role: 'user', parts: [{ text: 'The course' }, { text: 'hello' }] }]);
    expect((seen[0]!.init.headers as Record<string, string>)['x-goog-api-key']).toBe('sk-test');
  });
});

describe('createInference', () => {
  it('refuses to start without a key', () => {
    expect(() => createInference(settings('openai', { apiKey: ' ' }))).toThrow(InferenceError);
  });
});
