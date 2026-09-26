import { z } from 'zod';
import {
  InferenceError,
  errorFromStatus,
  isAbort,
  parseJsonText,
  type CompletionRequest,
  type Inference,
  type ModelSettings,
} from '../inference';

/** Gemini with a JSON response schema. */
export function googleInference(settings: ModelSettings, fetchImpl: typeof fetch = fetch): Inference {
  return {
    provider: 'google',
    model: settings.model,
    async complete(request: CompletionRequest) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(settings.model)}:generateContent`;
      const body = {
        systemInstruction: { parts: [{ text: request.system }] },
        contents: [{ role: 'user', parts: [{ text: request.prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseJsonSchema: z.toJSONSchema(request.schema),
        },
      };
      let response: Response;
      try {
        response = await fetchImpl(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': settings.apiKey },
          body: JSON.stringify(body),
          signal: request.signal ?? null,
        });
      } catch (error) {
        if (isAbort(error)) throw new InferenceError('aborted', 'Stopped.');
        throw new InferenceError('network', 'Could not reach Google.');
      }
      if (!response.ok) throw errorFromStatus(response.status, await response.text());
      const data = (await response.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
        promptFeedback?: { blockReason?: string };
      };
      if (data.promptFeedback?.blockReason) throw new InferenceError('refused', data.promptFeedback.blockReason);
      const candidate = data.candidates?.[0];
      if (candidate?.finishReason === 'SAFETY') throw new InferenceError('refused', 'Blocked by safety settings.');
      if (candidate?.finishReason === 'MAX_TOKENS') throw new InferenceError('invalid', 'The answer was cut off before it finished.');
      return parseJsonText(candidate?.content?.parts?.map((p) => p.text ?? '').join('') ?? '');
    },
  };
}
