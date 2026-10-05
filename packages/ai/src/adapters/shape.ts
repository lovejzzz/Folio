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
  return shared(transformJSONSchema(plain(json) as Json) as Json);
}

/**
 * A large object that stands in two places (a page's block, in a mend's whole parts and in its single changes) is
 * written once and pointed to: written twice, the mend's shape grew past what the provider will compile. Only whole
 * objects are shared, with everything said of their fields inside them, so no description is lost to a reference.
 */
function shared(schema: Json): Json {
  const seen = new Map<string, number>();
  const count = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(count);
    if (!node || typeof node !== 'object') return;
    if ((node as Json).type === 'object' && (node as Json).properties) seen.set(JSON.stringify(node), (seen.get(JSON.stringify(node)) ?? 0) + 1);
    Object.values(node).forEach(count);
  };
  count(schema);
  // The largest first: what repeats only inside it is then written once with it.
  const [twice] = [...seen].filter(([text, n]) => n > 1 && text.length > 400).sort((a, b) => b[0].length - a[0].length);
  if (!twice) return schema;
  const swap = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(swap);
    if (!node || typeof node !== 'object') return node;
    if (JSON.stringify(node) === twice[0]) return { $ref: '#/$defs/shared' };
    return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, swap(v)]));
  };
  return { ...(swap(schema) as Json), $defs: { shared: JSON.parse(twice[0]) as Json } };
}

/** Without the defaults: the SDK would write them into the description as noise. */
function plain(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(plain);
  if (!node || typeof node !== 'object') return node;
  const { default: _unused, ...rest } = node as Json;
  return Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, plain(v)]));
}
