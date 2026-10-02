import type { ProviderId, Usage } from './inference';

/**
 * What a course cost, from the tokens each call actually used and today's
 * prices. Prices change, so they are read when a course is finished from
 * OpenRouter's public model list (it lists the providers' own prices,
 * cached input included); Folio's own list stands in when that can't be had.
 */

/** US dollars per token. */
export interface Price {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export type PriceSource = 'live' | 'built-in';

/** Per million tokens, as providers publish them: input, output, cache read, cache write. Checked 28 September 2026. */
const BUILT_IN: Partial<Record<ProviderId, Record<string, [number, number, number, number]>>> = {
  anthropic: {
    'claude-sonnet-5.5': [2, 10, 0.2, 2.5],
    'claude-sonnet-5': [2, 10, 0.2, 2.5],
    'claude-opus-5.5': [4, 20, 0.2, 5],
    'claude-opus-5': [5, 25, 0.5, 6.25],
  },
  openai: {
    'gpt-6-luna': [0.1, 0.5, 0.01, 0.1],
    'gpt-6.1-sol': [2, 10, 0.1, 2],
  },
};

const PRICE_LIST = 'https://openrouter.ai/api/v1/models';
const VENDOR: Partial<Record<ProviderId, string>> = { anthropic: 'anthropic', openai: 'openai', google: 'google', deepseek: 'deepseek' };

/** Folio credits mix Claude and OpenAI's models, each priced as its maker prices it (Folio's markup is added on top, as credits). */
const vendorOf = (u: Usage): ProviderId | undefined => (u.provider === 'folio' ? (u.model.startsWith('gpt-') ? 'openai' : 'anthropic') : u.provider);

/** "claude-opus-5-5" and "anthropic/claude-opus-5.5" name the same model; dated snapshots price as their family. */
export function modelKey(model: string): string {
  return model
    .toLowerCase()
    .replace(/^models\//, '')
    .replace(/-\d{8}$|-\d{4}-\d{2}-\d{2}$/, '')
    .replace(/(\d)-(?=\d)/g, '$1.');
}

interface Listed {
  id?: string;
  pricing?: { prompt?: string; completion?: string; input_cache_read?: string; input_cache_write?: string };
}

/** Today's prices, keyed "vendor/model". Null when the list can't be read. */
export async function fetchLivePrices(fetchImpl: typeof fetch = fetch, timeoutMs = 6000): Promise<Map<string, Price> | null> {
  try {
    const response = await fetchImpl(PRICE_LIST, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return null;
    const body = (await response.json()) as { data?: Listed[] };
    const prices = new Map<string, Price>();
    for (const m of body.data ?? []) {
      const [vendor, name] = (m.id ?? '').split('/');
      const input = Number(m.pricing?.prompt);
      const output = Number(m.pricing?.completion);
      // Variants such as ":free" or ":thinking" are not what a key is billed at.
      if (!vendor || !name || name.includes(':') || !(input >= 0) || !(output >= 0)) continue;
      const cacheRead = Number(m.pricing?.input_cache_read);
      const cacheWrite = Number(m.pricing?.input_cache_write);
      prices.set(`${vendor}/${modelKey(name)}`, {
        input,
        output,
        cacheRead: Number.isFinite(cacheRead) ? cacheRead : input,
        cacheWrite: Number.isFinite(cacheWrite) ? cacheWrite : input,
      });
    }
    return prices.size ? prices : null;
  } catch {
    return null;
  }
}

function builtInPrice(provider: ProviderId, model: string): Price | null {
  const row = BUILT_IN[provider === 'folio' ? 'anthropic' : provider]?.[modelKey(model)];
  return row ? { input: row[0] / 1e6, output: row[1] / 1e6, cacheRead: row[2] / 1e6, cacheWrite: row[3] / 1e6 } : null;
}

export interface Cost {
  usd: number;
  /** Where the prices came from: "built-in" if any call had to fall back to Folio's own list. */
  source: PriceSource;
  /** Calls to a model with no known price, left out of `usd`. */
  unpriced: number;
}

export function costOf(usages: readonly Usage[], live: Map<string, Price> | null): Cost {
  let usd = 0;
  let unpriced = 0;
  let fellBack = false;
  for (const u of usages) {
    const maker = vendorOf(u);
    const vendor = maker && VENDOR[maker];
    const fromList = vendor ? live?.get(`${vendor}/${modelKey(u.model)}`) : undefined;
    const price = fromList ?? (maker ? builtInPrice(maker, u.model) : null);
    if (!price) {
      unpriced += 1;
      continue;
    }
    if (!fromList) fellBack = true;
    usd += u.input * price.input + u.output * price.output + u.cacheRead * price.cacheRead + u.cacheWrite * price.cacheWrite;
  }
  return { usd, source: fellBack || !live ? 'built-in' : 'live', unpriced };
}

/** The list is read at most once an hour: prices don't move by the minute, and it is a large file. */
const TTL = 60 * 60 * 1000;
let cached: { at: number; prices: Promise<Map<string, Price> | null> } | null = null;

/** What these calls cost at today's prices. */
export async function priceUsage(usages: readonly Usage[], fetchImpl: typeof fetch = fetch): Promise<Cost> {
  if (!cached || Date.now() - cached.at > TTL) cached = { at: Date.now(), prices: fetchLivePrices(fetchImpl) };
  const live = await cached.prices;
  if (!live) cached = null;
  return costOf(usages, live);
}
