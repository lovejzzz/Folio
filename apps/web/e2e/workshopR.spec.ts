import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from './fixtures';

/** R's own files, from the installed package: enough for R without added packages. */
const DIST = join(import.meta.dirname, '../../../packages/run/node_modules/webr/dist');
const BASE = 'https://folio.university/api/runtime/webr-0.6.0/';
/** The site as teachers reach it: R's folder is then on the page's own address, which is where its worker would not start. */
const SITE = 'https://folio.university';
const TYPES: Record<string, string> = { wasm: 'application/wasm', js: 'text/javascript' };

test('R runs in a frame with no origin that can reach only the folder holding R, and says why a line stops', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'R is tried where the suite runs its own Chromium');
  test.setTimeout(180_000);
  const asked: string[] = [];
  await page.route(`${BASE}**`, (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/runtime/webr-0.6.0/', '');
    asked.push(path);
    const file = join(DIST, path);
    const shared = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-length' };
    if (path.includes('..') || !existsSync(file) || !statSync(file).isFile()) return route.fulfill({ status: 404, headers: shared });
    const body = readFileSync(file);
    return route.fulfill({ status: 200, headers: { ...shared, 'content-length': String(body.length), 'content-type': TYPES[path.split('.').pop()!] ?? 'application/octet-stream' }, body: route.request().method() === 'HEAD' ? '' : body });
  });
  const said: string[] = [];
  page.on('console', (m) => said.push(`${m.type()}: ${m.text().slice(0, 300)}`));
  // The runner page at the site's own address, as teachers get it: the page and its policy as built, under a bare page of that address.
  const local = await page.request.get('/runner-r/');
  await page.route(`${SITE}/runner-r/`, async (route) => route.fulfill({ status: 200, contentType: 'text/html', headers: { 'content-security-policy': local.headers()['content-security-policy']! }, body: await local.text() }));
  await page.route(`${SITE}/`, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Folio</title>' }));
  await page.goto(`${SITE}/`);
  const answers = await page.evaluate(async ([base, site]) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.hidden = true;
    frame.src = `${site}/runner-r/`;
    const lines = ['x <- c(38, 41, 44, 46, 49, 54, 58, 63, 70)', 'stopifnot(round(sd(x), 2) == 10.65)', 'setwd("~/stats")', 'hist(x)'];
    const out: (string | null)[] = [];
    return new Promise<(string | null)[] | string>((resolve) => {
      setTimeout(() => resolve('R did not answer in time'), 150_000);
      addEventListener('message', (event) => {
        if (event.source !== frame.contentWindow) return;
        const m = event.data as { t: string; id?: number; error?: string | null; message?: string };
        const run = () => frame.contentWindow!.postMessage({ t: 'run', id: out.length + 1, line: lines[out.length] }, '*');
        if (m.t === 'hello') frame.contentWindow!.postMessage({ t: 'boot', base }, '*');
        else if (m.t === 'failed') resolve(`failed: ${m.message}`);
        else if (m.t === 'ready') run();
        else if (m.t === 'done') {
          out.push(m.error ?? null);
          if (out.length === lines.length) resolve(out);
          else run();
        }
      });
      document.body.append(frame);
    });
  }, [BASE, SITE] as const);
  expect(answers, said.join('\n')).toEqual([null, null, expect.stringMatching(/cannot change working directory/), null]);
  // Its policy: scripts and connections from R's folder alone, and no address of ours or anyone's beside it.
  const policy = (await page.request.get('/runner-r/')).headers()['content-security-policy']!;
  expect(policy).toContain(`connect-src ${BASE};`);
  expect(policy).toContain("default-src 'none'");
  expect(policy).not.toContain("'self' https");
  expect(asked).toContain('R.wasm');
});
