import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { CourseStore } from '@folio/core';
import { createInference, FOLIO_OUTPUT_CAPS, InferenceError, missingTargets, runBuild, type ModelSettings } from '../src';
import { fakeInference, smallCourse } from './fake';

const folio: ModelSettings = { provider: 'folio', apiKey: '', model: 'claude-sonnet-5-5', baseUrl: 'https://folio.university/api/ai' };
const schema = z.object({ title: z.string() });

function server() {
  const seen: { url: string; body: Record<string, unknown> }[] = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    seen.push({ url, body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    const text = '{"title":"T"}';
    const body = url.includes('chat/completions')
      ? { model: 'gpt-6-luna', choices: [{ message: { content: text }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } }
      : { id: 'm', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } };
    return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { fn, seen };
}

describe('with Folio credits', () => {
  it('each job asks for an answer no longer than it needs, so the hold on the balance stays small', async () => {
    const { fn, seen } = server();
    const inference = createInference(folio, fn);
    for (const task of ['folio_plan', 'folio_study', 'folio_quiz', 'folio_plan_review', 'folio_outline']) await inference.complete({ task, system: 's', prompt: 'p', schema });
    const cap = (i: number) => seen[i]!.body.max_tokens ?? seen[i]!.body.max_completion_tokens;
    // Quizzes by Luna grow with the quiz size and cost little to hold: they get all the room there is.
    expect([0, 1, 2, 3].map(cap)).toEqual([FOLIO_OUTPUT_CAPS.folio_plan, FOLIO_OUTPUT_CAPS.folio_study, 32000, FOLIO_OUTPUT_CAPS.folio_plan_review]);
    // A job without its own cap keeps the adapter's.
    expect(cap(4)).toBe(16000);
    expect(Math.max(...Object.values(FOLIO_OUTPUT_CAPS))).toBeLessThanOrEqual(12000);
  });

  it('an answer cut off at its cap is written again with all the room there is, never kept incomplete', async () => {
    const seen: number[] = [];
    const fn = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { max_tokens: number; stream?: boolean };
      seen.push(body.max_tokens);
      const cut = body.max_tokens < 32000;
      // The longest answers come streamed, as the SDK requires.
      if (body.stream) {
        const events = [
          { type: 'message_start', message: { id: 'm', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } } },
          { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
          { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '{"title":"Long plan"}' } },
          { type: 'content_block_stop', index: 0 },
          { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 5 } },
          { type: 'message_stop' },
        ];
        return new Response(events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
      }
      return new Response(
        JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: [{ type: 'text', text: cut ? '{"title":"Lo' : '{"title":"Long plan"}' }], stop_reason: cut ? 'max_tokens' : 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }),
        { headers: { 'content-type': 'application/json' } },
      );
    }) as typeof fetch;
    expect(await createInference(folio, fn).complete({ task: 'folio_plan', system: 's', prompt: 'p', schema })).toEqual({ title: 'Long plan' });
    expect(seen).toEqual([FOLIO_OUTPUT_CAPS.folio_plan, 32000]);
  });

  it('a build stops at once when the credits run out, and leaves the rest for Resume', async () => {
    const store = new CourseStore(smallCourse());
    let calls = 0;
    const inference = fakeInference(() => {
      calls += 1;
      throw new InferenceError('credits', 'Your Folio credits have run out.');
    });
    const summary = await runBuild(
      { inference, getCourse: store.getState, commit: (_t, c) => store.apply(c, { label: { key: 'b' }, source: 'ai', undoable: false }), signal: new AbortController().signal },
      missingTargets(store.getState()),
    );
    expect(summary.fatal?.kind).toBe('credits');
    // Only the parts already started when the first answer came back.
    expect(calls).toBeLessThanOrEqual(4);
    expect(missingTargets(store.getState()).length).toBe(missingTargets(smallCourse()).length);
  });
});
