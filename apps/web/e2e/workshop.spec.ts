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
  expect(fetched.sort()).toEqual(['pyodide-lock.json', 'pyodide.asm.js', 'pyodide.asm.wasm', 'python_stdlib.zip']);
});
