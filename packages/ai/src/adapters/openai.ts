import { z } from 'zod';
import {
  InferenceError,
  errorFromStatus,
  isAbort,
  parseJsonText,
  truncatedOutput,
  type CompletionRequest,
  type Inference,
  type ModelSettings,
  type OnUsage,
} from '../inference';

const BASES: Partial<Record<ModelSettings['provider'], string>> = {
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com',
};

const NAMES: Partial<Record<ModelSettings['provider'], string>> = { openai: 'OpenAI', deepseek: 'DeepSeek', folio: 'Folio' };

/** OpenAI's reasoning models take an effort; older ones reject it. */
const reasons = (model: string) => /^(gpt-[5-9]|o\d)/.test(model);

/**
 * DeepSeek thinks at length by default. Jobs Folio runs at medium effort
 * (plans, quizzes, where answers must be right) think briefly; the rest
 * don't think at all, which in live runs cost no quality.
 */
function deepseekThinking(effort: CompletionRequest['effort']) {
  if (effort === 'high') return { reasoning_effort: 'medium' };
  return effort === 'medium' ? { reasoning_effort: 'low' } : { thinking: { type: 'disabled' } };
}

interface OpenAiUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
  /** DeepSeek reports its cache this way. */
  prompt_cache_hit_tokens?: number;
  prompt_cache_miss_tokens?: number;
}

/** OpenAI counts cached input inside the prompt; DeepSeek splits hits from misses. */
function fromOpenAi(u: OpenAiUsage): { input: number; output: number; cacheRead: number; cacheWrite: number } {
  const cached = u.prompt_cache_hit_tokens ?? u.prompt_tokens_details?.cached_tokens ?? 0;
  const input = u.prompt_cache_miss_tokens ?? Math.max(0, (u.prompt_tokens ?? 0) - cached);
  return { input, output: u.completion_tokens ?? 0, cacheRead: cached, cacheWrite: 0 };
}

/**
 * OpenAI chat completions with a JSON Schema response format. The same
 * adapter talks to DeepSeek and to local OpenAI-compatible servers such as
 * Ollama or LM Studio, which is how "on this device" works without a browser
 * download. DeepSeek takes only JSON mode, so the schema goes into the system
 * prompt, last, after the shared course context it can cache.
 */
export function openaiInference(settings: ModelSettings, fetchImpl: typeof fetch = fetch, onUsage?: OnUsage): Inference {
  const local = settings.provider === 'local';
  // Folio credits: OpenAI's API as Folio's server passes it on, beside Claude's (settings.baseUrl is /api/ai).
  const viaFolio = settings.provider === 'folio';
  const base = (local ? settings.baseUrl : viaFolio ? `${settings.baseUrl}/openai/v1` : (BASES[settings.provider] ?? '')).replace(/\/+$/, '');
  const jsonMode = settings.provider === 'deepseek';
  return {
    provider: settings.provider,
    model: settings.model,
    async complete(request: CompletionRequest) {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (viaFolio) headers['x-folio'] = '1';
      else if (settings.apiKey) headers.authorization = `Bearer ${settings.apiKey}`;
      const schema = z.toJSONSchema(request.schema);
      const schemaNote = jsonMode ? `Answer with one JSON object that matches this JSON Schema:\n${JSON.stringify(schema)}` : '';
      const body = {
        model: settings.model,
        messages: [
          { role: 'system', content: [request.system, request.context, schemaNote].filter(Boolean).join('\n\n') },
          { role: 'user', content: request.prompt },
        ],
        // DeepSeek stops at 4K output tokens unless asked for more, and its thinking counts against the cap:
        // a two-hour seminar plan thought for 7K tokens and was cut off at 8K. A runaway at 16K costs two cents.
        ...(jsonMode ? { max_tokens: request.maxTokens ?? 16000, ...deepseekThinking(request.effort) } : {}),
        // Folio's effort per job, as it asks Claude for it: without it OpenAI thinks at its default for every job.
        ...(!jsonMode && !local && reasons(settings.model) ? { reasoning_effort: request.effort ?? 'medium' } : {}),
        response_format: jsonMode
          ? { type: 'json_object' }
          : { type: 'json_schema', json_schema: { name: request.task, schema, strict: false } },
      };
      let response: Response;
      try {
        response = await fetchImpl(`${base}/chat/completions`, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: request.signal ?? null,
        });
      } catch (error) {
        if (isAbort(error)) throw new InferenceError('aborted', 'Stopped.');
        throw new InferenceError('network', `Could not reach ${local ? base : NAMES[settings.provider]}.`);
      }
      if (!response.ok) throw errorFromStatus(response.status, await response.text());
      const data = (await response.json()) as {
        choices?: { message?: { content?: string | null; refusal?: string | null }; finish_reason?: string }[];
        model?: string;
        usage?: OpenAiUsage;
      };
      // A model on this computer costs nothing, so there is nothing to count.
      if (data.usage && !local) onUsage?.({ provider: settings.provider, model: data.model || settings.model, ...fromOpenAi(data.usage) });
      const choice = data.choices?.[0];
      if (choice?.message?.refusal) throw new InferenceError('refused', choice.message.refusal);
      const text = choice?.message?.content ?? '';
      if (choice?.finish_reason === 'length') throw truncatedOutput(text);
      return parseJsonText(text);
    },
  };
}
