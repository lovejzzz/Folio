import { transformJSONSchema } from '@anthropic-ai/sdk/lib/transform-json-schema';
import { z } from 'zod';

type Json = Record<string, unknown>;

/**
 * The shape Claude is held to, with what each field is for. The SDK's own helper names every field that has a
 * default (and every reused one) by reference, and drops whatever stands beside a reference: of 160 descriptions
 * written in Folio's shapes, 44 reached the model. Here nothing is named by reference, so all of them do.
 *
 * Every field stays required. Left optional, a block's empty fields (a fifth of what a week's page costs) were
 * not written, but five pages of six came back as a few blocks and the word "Placeholder".
 */
export function claudeShape(schema: z.ZodType): Json {
  const json = z.toJSONSchema(schema) as Json;
  delete json.$schema;
  return transformJSONSchema(plain(json) as Json) as Json;
}

/** Without the defaults: the SDK would write them into the description as noise. */
function plain(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(plain);
  if (!node || typeof node !== 'object') return node;
  const { default: _unused, ...rest } = node as Json;
  return Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, plain(v)]));
}
