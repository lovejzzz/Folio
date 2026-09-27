import { appendFileSync, mkdirSync } from 'node:fs';
import type { Page } from '@playwright/test';

/**
 * Where the bridge listens (scripts/claude-bridge.mjs) and where results go.
 * BRIDGE=direct sends the app's own requests to the Anthropic API instead,
 * exactly as a teacher's browser would, with ANTHROPIC_API_KEY swapped into
 * the request here so the key never reaches the page or the logs.
 */
export const BRIDGE = process.env.BRIDGE ?? 'http://localhost:8787';
export const OUT = 'live-results';
const DIRECT = BRIDGE === 'direct';
const DIRECT_LOG = process.env.DIRECT_LOG ?? `${OUT}/direct.jsonl`;
/** Stop spending past this, per run. */
const DIRECT_BUDGET = Number(process.env.DIRECT_BUDGET_USD ?? 3);
/** $ per million tokens: input, cache write, cache read, output. */
const PRICES: Record<string, [number, number, number, number]> = {
  'claude-sonnet-5': [2, 2.5, 0.2, 10],
  'claude-opus-5-5': [4, 5, 0.4, 20],
  'claude-opus-5': [5, 6.25, 0.5, 25],
};
let directSpend = 0;
let directSeq = 0;

interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

/** One API call, logged in the bridge's format so scripts/token-report.py reads it unchanged. */
function logDirect(request: string, response: { model?: string; usage?: Usage; content?: { type: string; text?: string }[] }, ms: number): void {
  const body = JSON.parse(request) as { model: string; system?: string | { text: string }[]; messages: { content: string }[]; output_config?: { effort?: string } };
  const u = response.usage;
  if (!u) return;
  const [pin, pwrite, pread, pout] = PRICES[body.model] ?? PRICES['claude-sonnet-5']!;
  const read = u.cache_read_input_tokens ?? 0;
  const write = u.cache_creation_input_tokens ?? 0;
  const cost = (u.input_tokens * pin + write * pwrite + read * pread + u.output_tokens * pout) / 1e6;
  directSpend += cost;
  const system = typeof body.system === 'string' ? body.system : (body.system ?? []).map((b) => b.text).join('\n');
  mkdirSync(OUT, { recursive: true });
  appendFileSync(
    DIRECT_LOG,
    `${JSON.stringify({
      id: ++directSeq,
      at: new Date().toISOString(),
      ms,
      model: response.model ?? body.model,
      effort: body.output_config?.effort ?? null,
      system,
      prompt: body.messages.map((m) => m.content).join('\n\n'),
      text: (response.content ?? []).flatMap((b) => (b.type === 'text' ? [b.text ?? ''] : [])).join(''),
      usage: { in: u.input_tokens + read + write, cacheRead: read, cacheWrite: write, out: u.output_tokens },
      overhead: 0,
      cost,
    })}\n`,
  );
}

/** The app's request, sent on to the Anthropic API with the real key. */
async function forwardDirect(url: string, method: string, headers: Record<string, string>, body: string): Promise<Response> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('BRIDGE=direct needs ANTHROPIC_API_KEY.');
  if (directSpend >= DIRECT_BUDGET) throw new Error(`Stopped: this run has spent $${directSpend.toFixed(2)} of its $${DIRECT_BUDGET} budget.`);
  const keep = Object.fromEntries(Object.entries(headers).filter(([k]) => k.startsWith('anthropic-') || k === 'content-type'));
  return fetch(url, { method, headers: { ...keep, 'x-api-key': key }, body });
}

export interface Call {
  at: number;
  ms: number;
  status: number;
  kind: string;
}

/** Send the app's Anthropic calls to the bridge, which answers through `claude -p`, or with BRIDGE=direct to the API itself. */
export async function routeToBridge(page: Page, log: Call[]): Promise<void> {
  const t0 = Date.now();
  await page.route('https://api.anthropic.com/**', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
    const started = Date.now();
    const body = route.request().postData() ?? '';
    const kind = body.match(/Plan exactly|Write the lesson plan|Write a slide deck|Write a study guide|quiz questions|Write one assignment|discussion prompts|commonly ask|Turn the request into|Selected text/)?.[0] ?? 'other';
    try {
      const res = DIRECT
        ? await forwardDirect(route.request().url(), 'POST', route.request().headers(), body)
        : await fetch(`${BRIDGE}/v1/messages`, { method: 'POST', body, headers: { 'content-type': 'application/json' } });
      const text = await res.text();
      if (DIRECT && res.ok) logDirect(body, JSON.parse(text), Date.now() - started);
      log.push({ at: started - t0, ms: Date.now() - started, status: res.status, kind });
      await route.fulfill({ status: res.status, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: text });
    } catch (error) {
      log.push({ at: started - t0, ms: Date.now() - started, status: 0, kind });
      await route.abort('failed').catch(() => {});
      throw error;
    }
  });
}

/** Every course in the page's IndexedDB. */
export async function readCourses(page: Page): Promise<unknown[]> {
  return page.evaluate(
    () =>
      new Promise<unknown[]>((resolve, reject) => {
        const open = indexedDB.open('folio');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const all = open.result.transaction('courses', 'readonly').objectStore('courses').getAll();
          all.onsuccess = () => resolve(all.result.map((r: { data: unknown }) => r.data));
        };
      }),
  );
}
