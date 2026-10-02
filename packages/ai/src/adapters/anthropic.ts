import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { InferenceError, isAbort, parseJsonText, truncatedOutput, type CompletionRequest, type Inference, type ModelSettings, type OnUsage } from '../inference';

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
  if (error instanceof Anthropic.APIError && error.status === 402) return new InferenceError('credits', error.message);
  if (error instanceof Anthropic.RateLimitError) return new InferenceError('rate', error.message);
  if (error instanceof Anthropic.InternalServerError) return new InferenceError('server', error.message);
  if (error instanceof Anthropic.APIConnectionError) return new InferenceError('network', error.message);
  if (error instanceof Anthropic.APIError) return new InferenceError('invalid', error.message);
  return new InferenceError('network', error instanceof Error ? error.message : String(error));
}

/** The request for one completion. */
function requestBody(model: string, request: CompletionRequest) {
  const format = zodOutputFormat(request.schema);
  return {
    model,
    max_tokens: request.maxTokens ?? 16000,
    // Folio's own instructions are the system prompt; the course and the teacher's files are material, in the
    // teacher's turn, so nothing in an attached file carries the system prompt's weight. The background is the
    // same for every call in a build: cached, it costs a tenth as much after the first call.
    system: request.system,
    messages: [
      {
        role: 'user' as const,
        content: request.context
          ? [
              { type: 'text' as const, text: request.context, cache_control: { type: 'ephemeral' as const } },
              { type: 'text' as const, text: request.prompt },
            ]
          : request.prompt,
      },
    ],
    output_config: {
      ...(acceptsEffort(model) ? { effort: request.effort ?? 'medium' } : {}),
      format: { type: 'json_schema' as const, schema: format.schema },
    },
    ...(FALLBACK_MODELS.has(model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
  };
}

/** Send it, streamed when someone is watching the text arrive: the answer is the same either way. */
async function send(client: Anthropic, body: ReturnType<typeof requestBody>, request: CompletionRequest) {
  const { onText } = request;
  // The SDK refuses a long answer unstreamed (it could outlast its ten minutes), so those are streamed too.
  if (!onText && body.max_tokens <= 16000) return client.beta.messages.create(body, { signal: request.signal });
  const stream = client.beta.messages.stream(body, { signal: request.signal });
  stream.on('text', (_delta, soFar) => {
    // Showing progress must never cost the answer.
    try {
      onText?.(soFar);
    } catch {
      /* ignored */
    }
  });
  return stream.finalMessage();
}

/**
 * Claude. With the teacher's own key the request goes straight from this browser to Anthropic; with Folio
 * credits it goes to Folio's server (settings.baseUrl), which sends it on with Folio's key and charges the
 * signed-in teacher's balance: the same request either way.
 */
export function anthropicInference(settings: ModelSettings, fetchImpl?: typeof fetch, onUsage?: OnUsage): Inference {
  const viaFolio = settings.provider === 'folio';
  const client = new Anthropic({
    apiKey: viaFolio ? 'folio-credits' : settings.apiKey,
    dangerouslyAllowBrowser: true,
    maxRetries: 2,
    ...(viaFolio ? { baseURL: settings.baseUrl, defaultHeaders: { 'x-folio': '1' } } : {}),
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
  });
  const model = settings.model;
  return {
    provider: settings.provider,
    model,
    async complete(request: CompletionRequest) {
      try {
        const response = await send(client, requestBody(model, request), request);
        // Counting is a courtesy: a response without usage is still an answer.
        const u = response.usage as typeof response.usage | undefined;
        if (u) {
          onUsage?.({
            provider: settings.provider,
            model: response.model || model,
            input: u.input_tokens ?? 0,
            output: u.output_tokens ?? 0,
            cacheRead: u.cache_read_input_tokens ?? 0,
            cacheWrite: u.cache_creation_input_tokens ?? 0,
          });
        }
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
