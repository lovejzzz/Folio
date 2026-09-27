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
} from '../inference';

const BASES: Partial<Record<ModelSettings['provider'], string>> = {
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com',
};

const NAMES: Partial<Record<ModelSettings['provider'], string>> = { openai: 'OpenAI', deepseek: 'DeepSeek' };

/**
 * DeepSeek thinks at length by default. Jobs Folio runs at medium effort
 * (plans, quizzes, where answers must be right) think briefly; the rest
 * don't think at all, which in live runs cost no quality.
 */
function deepseekThinking(effort: CompletionRequest['effort']) {
  return effort === 'medium' ? { reasoning_effort: 'low' } : { thinking: { type: 'disabled' } };
}

/**
 * OpenAI chat completions with a JSON Schema response format. The same
 * adapter talks to DeepSeek and to local OpenAI-compatible servers such as
 * Ollama or LM Studio, which is how "on this device" works without a browser
 * download. DeepSeek takes only JSON mode, so the schema goes into the system
 * prompt, last, after the shared course context it can cache.
 */
export function openaiInference(settings: ModelSettings, fetchImpl: typeof fetch = fetch): Inference {
  const local = settings.provider === 'local';
  const base = (local ? settings.baseUrl : (BASES[settings.provider] ?? '')).replace(/\/+$/, '');
  const jsonMode = settings.provider === 'deepseek';
  return {
    provider: settings.provider,
    model: settings.model,
    async complete(request: CompletionRequest) {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (settings.apiKey) headers.authorization = `Bearer ${settings.apiKey}`;
      const schema = z.toJSONSchema(request.schema);
      const schemaNote = jsonMode ? `Answer with one JSON object that matches this JSON Schema:\n${JSON.stringify(schema)}` : '';
      const body = {
        model: settings.model,
        messages: [
          { role: 'system', content: [request.system, request.context, schemaNote].filter(Boolean).join('\n\n') },
          { role: 'user', content: request.prompt },
        ],
        // DeepSeek stops at 4K output tokens unless asked for more; a lesson plan can run past that.
        ...(jsonMode ? { max_tokens: request.maxTokens ?? 8000, ...deepseekThinking(request.effort) } : {}),
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
      };
      const choice = data.choices?.[0];
      if (choice?.message?.refusal) throw new InferenceError('refused', choice.message.refusal);
      const text = choice?.message?.content ?? '';
      if (choice?.finish_reason === 'length') throw truncatedOutput(text);
      return parseJsonText(text);
    },
  };
}
