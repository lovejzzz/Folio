import { z } from 'zod';
import {
  InferenceError,
  parseJsonText,
  postJson,
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
        systemInstruction: { parts: [{ text: request.system }] },
        // The course and the teacher's files are material, in the teacher's turn, ahead of the ask.
        contents: [{ role: 'user', parts: [...(request.context ? [{ text: request.context }] : []), ...(request.images ?? []).map((p) => ({ inlineData: { mimeType: p.type, data: p.data } })), { text: request.prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseJsonSchema: z.toJSONSchema(request.schema),
        },
      };
      const data = await postJson<{
        candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
        promptFeedback?: { blockReason?: string };
        modelVersion?: string;
        usageMetadata?: { promptTokenCount?: number; cachedContentTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
      }>(fetchImpl, url, { headers: { 'content-type': 'application/json', 'x-goog-api-key': settings.apiKey }, body: JSON.stringify(body), signal: request.signal }, 'Could not reach Google.');
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
