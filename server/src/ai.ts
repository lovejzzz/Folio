import { charge, PRICES, reserve, settle, type Usage, type Hold as CreditHold } from './credits';
import { count } from './counts';
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

/**
 * What Folio's own requests carry, and all that is sent on. Anything else a request names (tools billed by
 * use, faster tiers, thinking) isn't in the price a call is charged at, so it never reaches Anthropic.
 */
const FIELDS = ['model', 'max_tokens', 'system', 'messages', 'stream', 'output_config'] as const;

type Body = Partial<Record<(typeof FIELDS)[number], unknown>>;

interface Checked {
  body: Body;
  model: string;
  maxTokens: number;
  /** The request's length as it came, which the hold's guess at its input is made from. */
  size: number;
}

function checked(raw: string): Checked | Response {
  if (raw.length > MAX_BODY) return error(413, 'invalid_request_error', 'The request is too large.');
  let asked: Record<string, unknown>;
  try {
    asked = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return error(400, 'invalid_request_error', 'The request is not JSON.');
  }
  if (!asked || typeof asked !== 'object') return error(400, 'invalid_request_error', 'The request is not JSON.');
  const body: Body = {};
  for (const field of FIELDS) if (asked[field] !== undefined) body[field] = asked[field];
  const model = typeof body.model === 'string' ? body.model : '';
  const maxTokens = typeof body.max_tokens === 'number' ? body.max_tokens : 0;
  if (!PRICES[model] || !model.startsWith('claude-')) return error(400, 'invalid_request_error', 'That model is not available with Folio credits.');
  if (maxTokens < 1 || maxTokens > MAX_OUTPUT) return error(400, 'invalid_request_error', 'The answer asked for is too long.');
  return { body, model, maxTokens, size: raw.length };
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

/** The beta features Folio's own requests use; any other is dropped, as it could change what a call costs. */
const BETAS = new Set(['structured-outputs-2025-12-15', 'server-side-fallback-2026-07-01']);

export function allowedBetas(header: string | null): string {
  return (header ?? '').split(',').map((b) => b.trim()).filter((b) => BETAS.has(b)).join(',');
}

interface Hold {
  db: Env['DB'];
  userId: string;
  held: CreditHold;
}

/** What Anthropic refused, passed on; Folio's own key refused is Folio's problem, never reported as the teacher's. */
function refused(upstream: Response): Response {
  if (upstream.status === 401 || upstream.status === 403) return error(502, 'api_error', 'Folio could not reach the model just now.');
  const retryAfter = upstream.headers.get('retry-after');
  return new Response(upstream.body, { status: upstream.status, headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json', ...(retryAfter ? { 'retry-after': retryAfter } : {}) } });
}

/** Send the call on and settle what was held, however it ends: answered, refused, or broken off partway. */
async function forward(request: Request, key: string, req: Checked, hold: Hold, waitUntil: (p: Promise<unknown>) => void, fetchImpl: typeof fetch): Promise<Response> {
  const usage: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  let settled = false;
  const settleWith = async (chars = 0, answered = true) => {
    if (settled) return;
    settled = true;
    // Stopped before the end: the answer's length so far stands in for the count it never sent.
    const counted = { ...usage, output: Math.max(usage.output, Math.ceil(chars / 4)) };
    await settle(hold.db, hold.userId, hold.held, answered ? charge(req.model, counted) : 0, answered ? `${req.model} ${counted.input}+${counted.output}` : '');
  };
  try {
    const beta = allowedBetas(request.headers.get('anthropic-beta'));
    const upstream = await fetchImpl(ANTHROPIC, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', ...(beta ? { 'anthropic-beta': beta } : {}) },
      body: JSON.stringify(req.body),
      signal: request.signal,
    });
    if (!upstream.ok) {
      await settleWith(0, false);
      await count(hold.db, `ai_refused:${upstream.status}`);
      return refused(upstream);
    }
    if (req.body.stream === true && upstream.body) {
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
  } catch {
    // Never reached, or the answer broke off before it could be read: nothing was had, so nothing stays held.
    await settleWith(0, false);
    await count(hold.db, 'ai_unreachable');
    return error(502, 'api_error', 'The model could not be reached.');
  }
}

export async function proxyMessages(request: Request, env: Env, user: User, waitUntil: (p: Promise<unknown>) => void, fetchImpl: typeof fetch = fetch): Promise<Response> {
  if (!env.ANTHROPIC_API_KEY) return error(503, 'unavailable', 'Folio credits are not available yet.');
  const req = checked(await request.text());
  if (req instanceof Response) return req;
  // The most the call can cost: its input, guessed from its size, and the longest answer it may give.
  const estimate = charge(req.model, { input: Math.ceil(req.size / 3), output: req.maxTokens, cacheRead: 0, cacheWrite: 0 });
  const held = await reserve(env.DB, user.id, estimate);
  if (held === null) {
    waitUntil(count(env.DB, 'credits_exhausted'));
    return error(402, 'credits_exhausted', 'Your Folio credits have run out.');
  }
  // Seen through even if the teacher's page goes away first, so what was held is always settled.
  const answer = forward(request, env.ANTHROPIC_API_KEY, req, { db: env.DB, userId: user.id, held }, waitUntil, fetchImpl);
  waitUntil(answer.catch(() => undefined));
  return answer;
}
