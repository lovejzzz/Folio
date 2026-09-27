import type { Page } from '@playwright/test';

/** Where the bridge listens (scripts/claude-bridge.mjs) and where results go. */
export const BRIDGE = process.env.BRIDGE ?? 'http://localhost:8787';
export const OUT = 'live-results';

export interface Call {
  at: number;
  ms: number;
  status: number;
  kind: string;
}

/** Send the app's Anthropic calls to the bridge, which answers through `claude -p`. */
export async function routeToBridge(page: Page, log: Call[]): Promise<void> {
  const t0 = Date.now();
  await page.route('https://api.anthropic.com/**', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
    const started = Date.now();
    const body = route.request().postData() ?? '';
    const kind = body.match(/Plan exactly|Write the lesson plan|Write a slide deck|Write a study guide|quiz questions|Write one assignment|discussion prompts|commonly ask|Turn the request into|Selected text/)?.[0] ?? 'other';
    try {
      const res = await fetch(`${BRIDGE}/v1/messages`, { method: 'POST', body, headers: { 'content-type': 'application/json' } });
      const text = await res.text();
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
