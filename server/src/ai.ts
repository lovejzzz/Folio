import { charge, PRICES, reserve, settle, type Usage } from './credits';
import type { Env, User } from './types';

/**
 * Model calls paid with Folio credits. The page sends Anthropic's own request here instead of to Anthropic;
 * this holds an estimate of its cost, sends it on with Folio's key, and settles at what it really used. Only
 * the models Folio writes with can be reached, with an answer no longer than Folio asks for.
 */

const ANTHROPIC = 'https://api.anthropic.com/v1/messages';
const MAX_BODY = 2 * 1024 * 1024;
const MAX_OUTPUT = 32_000;

const error = (status: number, type: string, message: string) =>
  new Response(JSON.stringify({ type: 'error', error: { type, message } }), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

interface Body {
  model?: unknown;
  max_tokens?: unknown;
  stream?: unknown;
}

/** Tokens, as the answer reports them: once in full (JSON), or growing through a stream. */
function readUsage(u: Record<string, unknown> | undefined, into: Usage): void {
  if (!u) return;
  const n = (k: string) => (typeof u[k] === 'number' ? (u[k] as number) : 0);
  into.input = Math.max(into.input, n('input_tokens'));
  into.output = Math.max(into.output, n('output_tokens'));
  into.cacheRead = Math.max(into.cacheRead, n('cache_read_input_tokens'));
  into.cacheWrite = Math.max(into.cacheWrite, n('cache_creation_input_tokens'));
}

/** Pass a stream through untouched, reading the usage in its events on the way; `done` runs once when it ends. */
function metered(body: ReadableStream<Uint8Array>, usage: Usage, done: (chars: number) => Promise<void>): { stream: ReadableStream<Uint8Array>; finished: Promise<void> } {
  const decoder = new TextDecoder();
  let pending = '';
  let chars = 0;
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, out) {
      out.enqueue(chunk);
      pending += decoder.decode(chunk, { stream: true });
      const lines = pending.split('\n');
      pending = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const event = JSON.parse(line.slice(6)) as { type?: string; message?: { usage?: Record<string, unknown> }; usage?: Record<string, unknown>; delta?: { text?: string } };
          readUsage(event.message?.usage ?? event.usage, usage);
          if (event.delta?.text) chars += event.delta.text.length;
        } catch {
          /* a line that isn't JSON is passed on and not counted */
        }
      }
    },
  });
  // Ended, failed or stopped by the teacher: either way the call is settled, once.
  const finished = body.pipeTo(writable).catch(() => undefined).then(() => done(chars));
  return { stream: readable, finished };
}

export async function proxyMessages(request: Request, env: Env, user: User, waitUntil: (p: Promise<unknown>) => void, fetchImpl: typeof fetch = fetch): Promise<Response> {
  if (!env.ANTHROPIC_API_KEY) return error(503, 'unavailable', 'Folio credits are not available yet.');
  const raw = await request.text();
  if (raw.length > MAX_BODY) return error(413, 'invalid_request_error', 'The request is too large.');
  let body: Body;
  try {
    body = JSON.parse(raw) as Body;
  } catch {
    return error(400, 'invalid_request_error', 'The request is not JSON.');
  }
  const model = typeof body.model === 'string' ? body.model : '';
  const maxTokens = typeof body.max_tokens === 'number' ? body.max_tokens : 0;
  if (!PRICES[model] || !model.startsWith('claude-')) return error(400, 'invalid_request_error', 'That model is not available with Folio credits.');
  if (maxTokens < 1 || maxTokens > MAX_OUTPUT) return error(400, 'invalid_request_error', 'The answer asked for is too long.');

  // The most the call can cost: its input, guessed from its size, and the longest answer it may give.
  const estimate = charge(model, { input: Math.ceil(raw.length / 3), output: maxTokens, cacheRead: 0, cacheWrite: 0 });
  const held = await reserve(env.DB, user.id, estimate);
  if (held === null) return error(402, 'credits_exhausted', 'Your Folio credits have run out.');

  const usage: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  let settled = false;
  const settleWith = async (chars = 0) => {
    if (settled) return;
    settled = true;
    // Stopped before the end: the answer's length so far stands in for the count it never sent.
    const counted = { ...usage, output: Math.max(usage.output, Math.ceil(chars / 4)) };
    await settle(env.DB, user.id, held, charge(model, counted), `${model} ${counted.input}+${counted.output}`);
  };

  let upstream: Response;
  try {
    const beta = request.headers.get('anthropic-beta');
    upstream = await fetchImpl(ANTHROPIC, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', ...(beta ? { 'anthropic-beta': beta } : {}) },
      body: raw,
      signal: request.signal,
    });
  } catch {
    await settle(env.DB, user.id, held, 0, '');
    return error(502, 'api_error', 'The model could not be reached.');
  }
  if (!upstream.ok) {
    await settle(env.DB, user.id, held, 0, '');
    // Folio's own key refused is Folio's problem, not the teacher's key: never report it as theirs.
    if (upstream.status === 401 || upstream.status === 403) return error(502, 'api_error', 'Folio could not reach the model just now.');
    return new Response(upstream.body, { status: upstream.status, headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json', ...(upstream.headers.get('retry-after') ? { 'retry-after': upstream.headers.get('retry-after')! } : {}) } });
  }
  if (body.stream === true && upstream.body) {
    const { stream, finished } = metered(upstream.body, usage, settleWith);
    waitUntil(finished);
    return new Response(stream, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store' } });
  }
  const answer = await upstream.text();
  try {
    readUsage((JSON.parse(answer) as { usage?: Record<string, unknown> }).usage, usage);
  } catch {
    /* no usage to read: the call is settled at nothing */
  }
  await settleWith();
  return new Response(answer, { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}
