import { charge, PRICES, reserve, settle, type Usage } from './credits';
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

interface Body {
  model?: unknown;
  stream?: unknown;
  reasoning_effort?: unknown;
  max_completion_tokens?: unknown;
}

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
function checked(raw: string): { body: Body & Record<string, unknown>; model: string; cap: number } | Response {
  if (raw.length > MAX_BODY) return error(413, 'The request is too large.');
  let body: Body & Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Body & Record<string, unknown>;
  } catch {
    return error(400, 'The request is not JSON.');
  }
  const model = typeof body.model === 'string' ? body.model : '';
  if (!PRICES[model] || !model.startsWith('gpt-')) return error(400, 'That model is not available with Folio credits.');
  if (body.stream === true) return error(400, 'Streaming is not available here.');
  if (body.reasoning_effort !== undefined && !EFFORTS.has(String(body.reasoning_effort))) return error(400, 'That effort is not available with Folio credits.');
  const asked = typeof body.max_completion_tokens === 'number' ? body.max_completion_tokens : MAX_OUTPUT;
  const cap = Math.max(1, Math.min(MAX_OUTPUT, asked));
  return { body: { ...body, max_completion_tokens: cap }, model, cap };
}

export async function proxyChat(request: Request, env: Env, user: User, fetchImpl: typeof fetch = fetch): Promise<Response> {
  if (!env.OPENAI_API_KEY) return error(503, 'Folio credits are not available yet.');
  const raw = await request.text();
  const req = checked(raw);
  if (req instanceof Response) return req;
  const estimate = charge(req.model, { input: Math.ceil(raw.length / 3), output: req.cap, cacheRead: 0, cacheWrite: 0 });
  const held = await reserve(env.DB, user.id, estimate);
  if (held === null) return error(402, 'Your Folio credits have run out.');
  let upstream: Response;
  try {
    upstream = await fetchImpl(OPENAI, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify(req.body),
      signal: request.signal,
    });
  } catch {
    await settle(env.DB, user.id, held, 0, '');
    return error(502, 'The model could not be reached.');
  }
  if (!upstream.ok) {
    await settle(env.DB, user.id, held, 0, '');
    // Folio's own key refused is Folio's problem, not the teacher's: never report it as theirs.
    if (upstream.status === 401 || upstream.status === 403) return error(502, 'Folio could not reach the model just now.');
    return new Response(upstream.body, { status: upstream.status, headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' } });
  }
  const answer = await upstream.text();
  let usage: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  try {
    usage = usageOf((JSON.parse(answer) as { usage?: OpenAiUsage }).usage);
  } catch {
    /* no usage to read: the call is settled at nothing */
  }
  await settle(env.DB, user.id, held, charge(req.model, usage), `${req.model} ${usage.input + usage.cacheRead}+${usage.output}`);
  return new Response(answer, { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}
