import { charge, PRICES, reserve, settle, type Usage, type Hold } from './credits';
import { count } from './counts';
import type { Env, User } from './types';

/**
 * OpenAI's chat completions paid with Folio credits, beside Claude's (ai.ts): the page sends OpenAI's own
 * request here; this holds an estimate of its cost, sends it on with Folio's key and settles at what it used.
 * Only the models Folio writes with, at the efforts it asks for, and no longer an answer than it allows.
 */

const OPENAI = 'https://api.openai.com/v1/chat/completions';
const MAX_BODY = 2 * 1024 * 1024;
const MAX_OUTPUT = 32_000;
const EFFORTS = new Set(['low', 'medium', 'high']);

const error = (status: number, message: string) =>
  new Response(JSON.stringify({ error: { message } }), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

/**
 * What Folio's own requests carry, and all that is sent on: anything else a request names (several answers
 * at once, faster tiers, tools, sound) isn't in the price a call is charged at.
 */
const FIELDS = ['model', 'messages', 'stream', 'reasoning_effort', 'response_format', 'max_completion_tokens'] as const;

type Body = Partial<Record<(typeof FIELDS)[number], unknown>>;

interface OpenAiUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
}

/** Cached input is counted inside the prompt; reasoning inside the completion. */
function usageOf(u: OpenAiUsage | undefined): Usage {
  const cached = u?.prompt_tokens_details?.cached_tokens ?? 0;
  return { input: Math.max(0, (u?.prompt_tokens ?? 0) - cached), output: u?.completion_tokens ?? 0, cacheRead: cached, cacheWrite: 0 };
}

/** The request as sent on: checked, and capped so the hold can cover the longest answer. */
function checked(raw: string): { body: Body; model: string; cap: number } | Response {
  if (raw.length > MAX_BODY) return error(413, 'The request is too large.');
  let asked: Record<string, unknown>;
  try {
    asked = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return error(400, 'The request is not JSON.');
  }
  if (!asked || typeof asked !== 'object') return error(400, 'The request is not JSON.');
  const body: Body = {};
  for (const field of FIELDS) if (asked[field] !== undefined) body[field] = asked[field];
  const model = typeof body.model === 'string' ? body.model : '';
  if (!PRICES[model] || !model.startsWith('gpt-')) return error(400, 'That model is not available with Folio credits.');
  if (body.stream === true) return error(400, 'Streaming is not available here.');
  if (body.reasoning_effort !== undefined && !EFFORTS.has(String(body.reasoning_effort))) return error(400, 'That effort is not available with Folio credits.');
  const asking = typeof body.max_completion_tokens === 'number' ? body.max_completion_tokens : MAX_OUTPUT;
  const cap = Math.max(1, Math.min(MAX_OUTPUT, asking));
  return { body: { ...body, max_completion_tokens: cap }, model, cap };
}

/** What OpenAI refused, passed on; Folio's own key refused is Folio's problem, never reported as the teacher's. */
function refused(upstream: Response): Response {
  if (upstream.status === 401 || upstream.status === 403) return error(502, 'Folio could not reach the model just now.');
  const retryAfter = upstream.headers.get('retry-after');
  return new Response(upstream.body, { status: upstream.status, headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json', ...(retryAfter ? { 'retry-after': retryAfter } : {}) } });
}

/** Send the call on and settle what was held, however it ends: answered, refused, or broken off partway. */
async function forward(request: Request, key: string, req: { body: Body; model: string }, db: Env['DB'], userId: string, held: Hold, fetchImpl: typeof fetch): Promise<Response> {
  let settled = false;
  const settleAt = async (cost: number, detail: string) => {
    if (settled) return;
    settled = true;
    await settle(db, userId, held, cost, detail);
  };
  try {
    const upstream = await fetchImpl(OPENAI, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify(req.body),
      signal: request.signal,
    });
    if (!upstream.ok) {
      await settleAt(0, '');
      await count(db, `ai_refused:${upstream.status}`);
      return refused(upstream);
    }
    const answer = await upstream.text();
    let usage: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    try {
      usage = usageOf((JSON.parse(answer) as { usage?: OpenAiUsage }).usage);
    } catch {
      /* no usage to read: the call is settled at nothing */
    }
    await settleAt(charge(req.model, usage), `${req.model} ${usage.input + usage.cacheRead}+${usage.output}`);
    return new Response(answer, { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  } catch {
    // Never reached, or the answer broke off before it could be read: nothing was had, so nothing stays held.
    await settleAt(0, '');
    await count(db, 'ai_unreachable');
    return error(502, 'The model could not be reached.');
  }
}

export async function proxyChat(request: Request, env: Env, user: User, waitUntil: (p: Promise<unknown>) => void = () => {}, fetchImpl: typeof fetch = fetch): Promise<Response> {
  if (!env.OPENAI_API_KEY) return error(503, 'Folio credits are not available yet.');
  const raw = await request.text();
  const req = checked(raw);
  if (req instanceof Response) return req;
  const estimate = charge(req.model, { input: Math.ceil(raw.length / 3), output: req.cap, cacheRead: 0, cacheWrite: 0 });
  const held = await reserve(env.DB, user.id, estimate);
  if (held === null) {
    waitUntil(count(env.DB, 'credits_exhausted'));
    return error(402, 'Your Folio credits have run out.');
  }
  // Seen through even if the teacher's page goes away first, so what was held is always settled.
  const answer = forward(request, env.OPENAI_API_KEY, req, env.DB, user.id, held, fetchImpl);
  waitUntil(answer.catch(() => undefined));
  return answer;
}
