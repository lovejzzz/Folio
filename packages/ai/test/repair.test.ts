import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createInference, InferenceError, MalformedOutputError, parseJsonText, runJob, type ModelSettings } from '../src';
import { fakeInference, fakeTextInference } from './fake';

const schema = z.object({ n: z.number() });
const job = { task: 't', system: '', prompt: 'Count the lessons.', schema };
const tooBig = (v: { n: number }) => (v.n > 3 ? [{ index: null, flag: { code: 'note' as const, values: { text: 'Too big' } } }] : []);

describe('parseJsonText', () => {
  it('reads JSON, with or without a code fence', () => {
    expect(parseJsonText('{"n":1}')).toEqual({ n: 1 });
    expect(parseJsonText('```json\n{"n":2}\n```')).toEqual({ n: 2 });
  });

  it('keeps the text and says what is wrong when it is not JSON', () => {
    const error = (() => {
      try {
        parseJsonText('Sure! Here is {n: 1}');
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(MalformedOutputError);
    expect(error).toBeInstanceOf(InferenceError);
    expect(error).toMatchObject({ kind: 'invalid', text: 'Sure! Here is {n: 1}' });
    expect((error as MalformedOutputError).problem).toMatch(/^It is not valid JSON/);
    expect(() => parseJsonText('  ')).toThrow(MalformedOutputError);
  });
});

describe('repairing malformed output', () => {
  it('quotes invalid JSON back to the model once and uses the repaired answer', async () => {
    const inf = fakeTextInference((_req, call) => (call === 1 ? '{"n": 1,,}' : '{"n": 1}'));
    const r = await runJob(inf, job);
    expect(r).toEqual({ value: { n: 1 }, problems: [], repaired: true });
    expect(inf.calls).toHaveLength(2);
    const repair = inf.calls[1]!.prompt;
    expect(repair).toContain('Count the lessons.');
    expect(repair).toContain('Your previous answer was:\n{"n": 1,,}');
    expect(repair).toContain('- root: It is not valid JSON');
  });

  it('fails with a plain "invalid" error when the repair is not JSON either', async () => {
    const inf = fakeTextInference(() => 'I cannot answer in JSON.');
    await expect(runJob(inf, job)).rejects.toMatchObject({ kind: 'invalid' });
    await expect(runJob(inf, job)).rejects.not.toBeInstanceOf(MalformedOutputError);
    expect(inf.calls).toHaveLength(4);
  });

  it('repairs JSON that does not fit the schema, quoting the issue', async () => {
    const inf = fakeTextInference((_req, call) => (call === 1 ? '{"n": "one"}' : '{"n": 1}'));
    const r = await runJob(inf, job);
    expect(r.repaired).toBe(true);
    expect(inf.calls[1]!.prompt).toContain('{"n":"one"}');
    expect(inf.calls[1]!.prompt).toMatch(/- n: .*number/i);
  });

  it('fails when the answer fits the schema neither time, one of them not JSON', async () => {
    const inf = fakeTextInference((_req, call) => (call === 1 ? '{"n": "one"}' : 'oops'));
    await expect(runJob(inf, job)).rejects.toBeInstanceOf(InferenceError);
    expect(inf.calls).toHaveLength(2);
  });

  it('flags what the checks found when the repair of a malformed answer still has problems', async () => {
    const inf = fakeTextInference((_req, call) => (call === 1 ? 'not json' : '{"n": 5}'));
    const r = await runJob(inf, { ...job, check: tooBig });
    expect(r).toEqual({ value: { n: 5 }, problems: [{ index: null, flag: { code: 'note', values: { text: 'Too big' } } }], repaired: true });
  });

  it('keeps a usable first answer, flagged, when the repair comes back malformed', async () => {
    const inf = fakeTextInference((_req, call) => (call === 1 ? '{"n": 5}' : '{"n": '));
    const r = await runJob(inf, { ...job, check: tooBig });
    expect(r).toEqual({ value: { n: 5 }, problems: [{ index: null, flag: { code: 'note', values: { text: 'Too big' } } }], repaired: false });
    expect(inf.calls).toHaveLength(2);
  });

  it('does not retry errors that a repair cannot fix', async () => {
    const inf = fakeInference(() => {
      throw new InferenceError('auth', 'bad key');
    });
    await expect(runJob(inf, job)).rejects.toMatchObject({ kind: 'auth' });
    expect(inf.calls).toHaveLength(1);
  });

  it('asks for a shorter answer when the first was cut off', async () => {
    const settings: ModelSettings = { provider: 'openai', apiKey: 'sk-test', model: 'm', baseUrl: '' };
    const bodies: string[] = [];
    const replies = [
      { choices: [{ message: { content: '{"n": 12, "notes": "a very long' }, finish_reason: 'length' }] },
      { choices: [{ message: { content: '{"n": 12}' }, finish_reason: 'stop' }] },
    ];
    const fetchImpl = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      bodies.push(String(init?.body));
      return new Response(JSON.stringify(replies[bodies.length - 1]), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    const r = await runJob(createInference(settings, fetchImpl), job);
    expect(r).toMatchObject({ value: { n: 12 }, repaired: true });
    const repair = JSON.parse(bodies[1]!) as { messages: { content: string }[] };
    expect(repair.messages[1]!.content).toContain('It was cut off before it finished');
    expect(repair.messages[1]!.content).toContain('{"n": 12, "notes": "a very long');
  });
});
