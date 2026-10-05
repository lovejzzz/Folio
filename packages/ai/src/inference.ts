import type { z } from 'zod';

/**
 * The one port every model sits behind. An adapter turns a system prompt,
 * a user prompt and a JSON Schema into parsed JSON. Validation, checks and
 * repair happen above this line, the same way for every provider.
 */

/** 'folio': Folio credits, Claude through Folio's own server, paid by the teacher's balance, no key of their own. */
export type ProviderId = 'folio' | 'anthropic' | 'openai' | 'google' | 'deepseek' | 'local';

/** In the order the settings list them. */
export const PROVIDERS: readonly ProviderId[] = ['folio', 'anthropic', 'openai', 'google', 'deepseek', 'local'];

export interface ModelSettings {
  provider: ProviderId;
  apiKey: string;
  model: string;
  /** Only used by the local (OpenAI-compatible) adapter. */
  baseUrl: string;
}

export const DEFAULT_MODELS: Record<ProviderId, string> = {
  folio: 'claude-sonnet-5-5',
  anthropic: 'claude-sonnet-5-5',
  openai: 'gpt-6-sol',
  google: 'gemini-3.8-flash',
  deepseek: 'deepseek-flash',
  local: 'llama3.1',
};

/** True when there is enough to make a request. Cheap: no SDK is loaded to answer it. */
export function isConfigured(settings: ModelSettings | null | undefined): settings is ModelSettings {
  if (!settings || !settings.model.trim()) return false;
  if (settings.provider === 'local') return Boolean(settings.baseUrl.trim());
  // Folio credits need no key: the server holds one, and the page's sign-in says whose balance pays.
  if (settings.provider === 'folio') return true;
  return Boolean(settings.apiKey.trim());
}

export const DEFAULT_LOCAL_URL = 'http://localhost:11434/v1';

/** How hard the model thinks before answering. Thinking is billed as output. */
export type Effort = 'low' | 'medium' | 'high';

/** A picture as a model is sent it. */
export interface Picture {
  /** Its media type: image/png, image/jpeg, image/webp or image/gif. */
  type: string;
  /** Its bytes, base64. */
  data: string;
}

/** Providers whose models can be shown a picture. A model on the teacher's computer, or DeepSeek's, reads text only. */
export const seesPictures = (provider: ProviderId): boolean => provider === 'folio' || provider === 'anthropic' || provider === 'openai' || provider === 'google';

export interface CompletionRequest {
  /** Short name of the job, used as the schema name. */
  task: string;
  system: string;
  /**
   * Background shared by many calls (the course and its sources), sent right
   * after the system prompt so a provider can cache the common prefix.
   */
  context?: string;
  prompt: string;
  /** Defaults to medium. */
  effort?: Effort;
  /**
   * True to write straight away, with no thinking first, on a model that can be told to. A week's page thought
   * for 12,000 to 36,000 tokens before its first word, and in four runs of six that used up the whole answer:
   * nothing was written, and the call was paid for and made again. Written without it at the same effort, six
   * pages were judged blind beside six written with it and came out level (8.1 and 7.9 of 10).
   */
  write?: boolean;
  schema: z.ZodType;
  /** Pictures the prompt is about, as base64: only for a provider that can see them (see `seesPictures`). */
  images?: readonly Picture[];
  signal?: AbortSignal;
  maxTokens?: number;
  /**
   * Told the answer's text so far as it streams in, where the provider streams (Claude does); the answer is
   * still returned whole. Only for showing progress: nothing is decided on a partial answer.
   */
  onText?: (soFar: string) => void;
}

/**
 * The tokens one call used, as the provider reported them. `input` leaves out cached input, which is billed
 * apart: `cacheRead` for input served from the cache, `cacheWrite` for input written to it.
 */
export interface Usage {
  provider: ProviderId;
  model: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/** Told the tokens of every call that returns, so what a course cost can be worked out afterwards. */
export type OnUsage = (usage: Usage) => void;

export interface Inference {
  readonly provider: ProviderId;
  readonly model: string;
  /** Returns the model's JSON output, parsed but not yet validated. */
  complete(request: CompletionRequest): Promise<unknown>;
}

export type InferenceErrorKind =
  | 'config'
  | 'auth'
  | 'rate'
  | 'network'
  | 'server'
  | 'refused'
  | 'invalid'
  | 'aborted'
  /** Folio credits have run out. */
  | 'credits';

export class InferenceError extends Error {
  constructor(
    readonly kind: InferenceErrorKind,
    message: string,
    readonly raw?: string,
  ) {
    super(message);
    this.name = 'InferenceError';
  }
}

export function errorFromStatus(status: number, detail: string): InferenceError {
  if (status === 401 || status === 403) return new InferenceError('auth', detail);
  // Folio's server: the signed-in teacher's credits have run out.
  if (status === 402) return new InferenceError('credits', detail);
  if (status === 429) return new InferenceError('rate', detail);
  if (status >= 500) return new InferenceError('server', detail);
  return new InferenceError('invalid', detail);
}

/**
 * The model answered, but not with usable JSON: it is malformed, or it was
 * cut off. Unlike other errors this one can be repaired, so runJob quotes
 * the text back to the model once instead of giving up.
 */
export class MalformedOutputError extends InferenceError {
  constructor(
    readonly text: string,
    /** What is wrong, worded for the repair prompt. */
    readonly problem: string,
    /** The answer stopped at the length it was allowed, rather than going wrong. */
    readonly truncated = false,
  ) {
    super('invalid', 'The model did not return valid JSON.', text);
    this.name = 'MalformedOutputError';
  }
}

export function parseJsonText(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(trimmed);
  } catch (error) {
    // A line break or tab typed straight into a string is the one slip that has one meaning: take it as meant.
    try {
      return JSON.parse(escapeControlsInStrings(trimmed));
    } catch {
      /* fall through to the repair call */
    }
    const detail = error instanceof Error ? ` (${error.message})` : '';
    throw new MalformedOutputError(text, trimmed ? `It is not valid JSON${detail}.` : 'It was empty.');
  }
}

/** Raw control characters inside JSON strings, escaped; everything outside strings is left as it is. */
function escapeControlsInStrings(text: string): string {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inString && ch === '\\') {
      out += ch + (text[++i] ?? '');
      continue;
    }
    if (ch === '"') inString = !inString;
    if (inString && ch < ' ') out += ch === '\n' ? '\\n' : ch === '\t' ? '\\t' : ch === '\r' ? '\\r' : '';
    else out += ch;
  }
  return out;
}

/** An answer that stopped at the token limit: kept so the repair call can ask for a shorter one. */
export function truncatedOutput(text: string): MalformedOutputError {
  return new MalformedOutputError(text, 'It was cut off before it finished. Give a complete answer that is more concise.', true);
}

export function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/** Waits, unless stopped first. */
const pause = (ms: number, signal?: AbortSignal | null) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => (clearTimeout(timer), reject(new InferenceError('aborted', 'Stopped.'))), { once: true });
  });

/** How long before asking again: what the provider says, up to 20 s, else a little longer each time. */
function retryDelay(response: Response | null, tries: number): number {
  const said = Number(response?.headers.get('retry-after'));
  return response?.headers.get('retry-after') && Number.isFinite(said) ? Math.min(20_000, Math.max(0, said * 1000)) : 1000 * 2 ** tries;
}

/**
 * POST a request and read its JSON answer. A busy or failing provider (429, 5xx) and a dropped connection are
 * asked again, `retries` times; every failure, reading the answer included, comes out as an InferenceError.
 */
/** Longer than any answer takes: a call still open after this is a connection that will never answer. */
export const CALL_TIMEOUT = 10 * 60 * 1000;

/** The caller's stop, or the time limit, whichever comes first. */
function withTimeout(signal: AbortSignal | null | undefined, ms: number): AbortSignal {
  const timeout = AbortSignal.timeout(ms);
  return signal && typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, timeout]) : (signal ?? timeout);
}

export async function postJson<T>(
  fetchImpl: typeof fetch,
  url: string,
  init: { headers: Record<string, string>; body: string; signal?: AbortSignal | null },
  unreachable: string,
  retries = 2,
  timeoutMs = CALL_TIMEOUT,
): Promise<T> {
  for (let tries = 0; ; tries++) {
    let failure: InferenceError;
    let response: Response | null = null;
    const signal = withTimeout(init.signal, timeoutMs);
    try {
      response = await fetchImpl(url, { method: 'POST', ...init, signal });
      if (response.ok) return (await response.json()) as T;
      failure = errorFromStatus(response.status, await response.text());
    } catch (error) {
      if (init.signal?.aborted) throw new InferenceError('aborted', 'Stopped.');
      // Out of time: not tried again, which would only make the teacher wait as long once more.
      if (signal.aborted) throw new InferenceError('network', 'The model took too long to answer.');
      if (isAbort(error)) throw new InferenceError('aborted', 'Stopped.');
      // An answer that isn't JSON came from something in between, not the model.
      failure = error instanceof SyntaxError ? new InferenceError('server', 'The answer could not be read.') : new InferenceError('network', unreachable);
    }
    if (tries >= retries || !['rate', 'server', 'network'].includes(failure.kind)) throw failure;
    await pause(retryDelay(response, tries), init.signal);
  }
}
