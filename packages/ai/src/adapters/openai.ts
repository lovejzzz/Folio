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

/**
 * OpenAI chat completions with a JSON Schema response format. The same
 * adapter talks to local OpenAI-compatible servers such as Ollama or
 * LM Studio, which is how "on this device" works without a browser download.
 */
export function openaiInference(settings: ModelSettings, fetchImpl: typeof fetch = fetch): Inference {
  const local = settings.provider === 'local';
  const base = (local ? settings.baseUrl : 'https://api.openai.com/v1').replace(/\/+$/, '');
  return {
    provider: settings.provider,
    model: settings.model,
    async complete(request: CompletionRequest) {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (settings.apiKey) headers.authorization = `Bearer ${settings.apiKey}`;
      const body = {
        model: settings.model,
        messages: [
          { role: 'system', content: request.system },
          { role: 'user', content: request.prompt },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: request.task, schema: z.toJSONSchema(request.schema), strict: false },
        },
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
        throw new InferenceError('network', local ? `Could not reach ${base}.` : 'Could not reach OpenAI.');
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
