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

/** Gemini with a JSON response schema. */
export function googleInference(settings: ModelSettings, fetchImpl: typeof fetch = fetch, onUsage?: OnUsage): Inference {
  return {
    provider: 'google',
    model: settings.model,
    async complete(request: CompletionRequest) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(settings.model)}:generateContent`;
      const body = {
        systemInstruction: { parts: [{ text: [request.system, request.context].filter(Boolean).join('\n\n') }] },
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
        modelVersion?: string;
        usageMetadata?: { promptTokenCount?: number; cachedContentTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
      };
      const u = data.usageMetadata;
      if (u) {
        // Gemini counts cached input inside the prompt, and bills thinking as output.
        const cached = u.cachedContentTokenCount ?? 0;
        onUsage?.({
          provider: 'google',
          model: data.modelVersion || settings.model,
          input: Math.max(0, (u.promptTokenCount ?? 0) - cached),
          output: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0),
          cacheRead: cached,
          cacheWrite: 0,
        });
      }
      if (data.promptFeedback?.blockReason) throw new InferenceError('refused', data.promptFeedback.blockReason);
      const candidate = data.candidates?.[0];
      if (candidate?.finishReason === 'SAFETY') throw new InferenceError('refused', 'Blocked by safety settings.');
      const text = candidate?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
      if (candidate?.finishReason === 'MAX_TOKENS') throw truncatedOutput(text);
      return parseJsonText(text);
    },
  };
}
