import type { z } from 'zod';

/**
 * The one port every model sits behind. An adapter turns a system prompt,
 * a user prompt and a JSON Schema into parsed JSON. Validation, checks and
 * repair happen above this line, the same way for every provider.
 */

export type ProviderId = 'anthropic' | 'openai' | 'google' | 'deepseek' | 'local';

/** In the order the settings list them. */
export const PROVIDERS: readonly ProviderId[] = ['anthropic', 'openai', 'google', 'deepseek', 'local'];

export interface ModelSettings {
  provider: ProviderId;
  apiKey: string;
  model: string;
  /** Only used by the local (OpenAI-compatible) adapter. */
  baseUrl: string;
}

export const DEFAULT_MODELS: Record<ProviderId, string> = {
  anthropic: 'claude-sonnet-5',
  openai: 'gpt-5',
  google: 'gemini-2.5-flash',
  deepseek: 'deepseek-flash',
  local: 'llama3.1',
};

/** True when there is enough to make a request. Cheap: no SDK is loaded to answer it. */
export function isConfigured(settings: ModelSettings | null | undefined): settings is ModelSettings {
  if (!settings || !settings.model.trim()) return false;
  if (settings.provider === 'local') return Boolean(settings.baseUrl.trim());
  return Boolean(settings.apiKey.trim());
}

export const DEFAULT_LOCAL_URL = 'http://localhost:11434/v1';

/** How hard the model thinks before answering. Thinking is billed as output. */
export type Effort = 'low' | 'medium';

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
  schema: z.ZodType;
  signal?: AbortSignal;
  maxTokens?: number;
}

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
  | 'aborted';

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
  return new MalformedOutputError(text, 'It was cut off before it finished. Give a complete answer that is more concise.');
}

export function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
