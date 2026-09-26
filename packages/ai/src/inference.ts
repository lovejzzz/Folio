import type { z } from 'zod';

/**
 * The one port every model sits behind. An adapter turns a system prompt,
 * a user prompt and a JSON Schema into parsed JSON. Validation, checks and
 * repair happen above this line, the same way for every provider.
 */

export type ProviderId = 'anthropic' | 'openai' | 'google' | 'local';

export interface ModelSettings {
  provider: ProviderId;
  apiKey: string;
  model: string;
  /** Only used by the local (OpenAI-compatible) adapter. */
  baseUrl: string;
}

export const DEFAULT_MODELS: Record<ProviderId, string> = {
  anthropic: 'claude-opus-5',
  openai: 'gpt-5',
  google: 'gemini-2.5-flash',
  local: 'llama3.1',
};

export const DEFAULT_LOCAL_URL = 'http://localhost:11434/v1';

export interface CompletionRequest {
  /** Short name of the job, used as the schema name. */
  task: string;
  system: string;
  prompt: string;
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

export function parseJsonText(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new InferenceError('invalid', 'The model did not return valid JSON.', text);
  }
}

export function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
