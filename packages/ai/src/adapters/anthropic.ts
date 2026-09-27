import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { InferenceError, isAbort, parseJsonText, truncatedOutput, type CompletionRequest, type Inference, type ModelSettings } from '../inference';

/** Models that accept the server-side refusal fallback chain. */
const FALLBACK_MODELS = new Set(['claude-opus-5', 'claude-fable-5-1']);

/** Older and smaller models reject the effort setting. */
function acceptsEffort(model: string): boolean {
  return !/haiku|-4-5|-3-/.test(model);
}

function mapError(error: unknown): InferenceError {
  if (error instanceof InferenceError) return error;
  if (isAbort(error) || error instanceof Anthropic.APIUserAbortError) return new InferenceError('aborted', 'Stopped.');
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new InferenceError('auth', error.message);
  }
  if (error instanceof Anthropic.RateLimitError) return new InferenceError('rate', error.message);
  if (error instanceof Anthropic.InternalServerError) return new InferenceError('server', error.message);
  if (error instanceof Anthropic.APIConnectionError) return new InferenceError('network', error.message);
  if (error instanceof Anthropic.APIError) return new InferenceError('invalid', error.message);
  return new InferenceError('network', error instanceof Error ? error.message : String(error));
}

/** Bring-your-own-key Claude. The request goes straight from this browser to Anthropic. */
export function anthropicInference(settings: ModelSettings, fetchImpl?: typeof fetch): Inference {
  const client = new Anthropic({
    apiKey: settings.apiKey,
    dangerouslyAllowBrowser: true,
    maxRetries: 2,
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
  });
  const model = settings.model;
  return {
    provider: 'anthropic',
    model,
    async complete(request: CompletionRequest) {
      const format = zodOutputFormat(request.schema);
      try {
        const response = await client.beta.messages.create(
          {
            model,
            max_tokens: request.maxTokens ?? 16000,
            // The course background is the same for every call in a build: cached, it costs a tenth as much after the first call.
            system: request.context
              ? [
                  { type: 'text' as const, text: request.system },
                  { type: 'text' as const, text: request.context, cache_control: { type: 'ephemeral' as const } },
                ]
              : request.system,
            messages: [{ role: 'user', content: request.prompt }],
            output_config: {
              ...(acceptsEffort(model) ? { effort: request.effort ?? 'medium' } : {}),
              format: { type: 'json_schema', schema: format.schema },
            },
            ...(FALLBACK_MODELS.has(model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
          },
          { signal: request.signal },
        );
        if (response.stop_reason === 'refusal') {
          throw new InferenceError('refused', response.stop_details?.explanation ?? 'The model declined this request.');
        }
        const text = response.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('');
        if (response.stop_reason === 'max_tokens') throw truncatedOutput(text);
        return parseJsonText(text);
      } catch (error) {
        throw mapError(error);
      }
    },
  };
}
