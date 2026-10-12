import { orderedLessons } from '@folio/core';
import { sampleCourse } from '@folio/core/sample';
import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';

const SHOTS = process.env.FOLIO_FIGURE_SHOTS;
const NINE = [3, 8, 12, 17, 23, 31, 42, 56, 71];
const FIFTEEN = [-2.5, -1, 0, 0.5, 1.25, 3, 7, 12, 18, 25, 40, 64, 99, 120, 480];
const LONG = [-9999, -12.5, 0.001, 1.25, 480, 12345, 99999];
const CASES: [string, 'flat' | 'cabinet' | 'composite', number[], number][] = [['nine', 'flat', NINE, 42], ['fifteen', 'flat', FIFTEEN, 64], ['long', 'flat', LONG, 480], ['long-cabinet', 'cabinet', LONG, 480], ['fifteen-cabinet', 'cabinet', FIFTEEN, 64], ['nine-cabinet', 'cabinet', NINE, 42], ['nine-both', 'composite', NINE, 42], ['fifteen-both', 'composite', FIFTEEN, 64], ['long-both', 'composite', LONG, 480]];

// The phone a reader held this to: 390 by 844.
test.use({ viewport: { width: 390, height: 844 } });

/** The sample course with one demonstration to a slide of its first lesson. */
function withFigures(): string {
  const course = sampleCourse();
  const first = orderedLessons(course)[0]!;
  CASES.forEach(([, look, values, target], i) => (first.slides[i] = { ...(first.slides[i] ?? { ...first.slides[0]!, id: `figure-${i}` }), bullets: [], visual: { kind: 'figure', figure: 'binarySearch', look, values, target } }));
  return JSON.stringify(course);
}

/** The least height, in pixels of the screen, of the marks of one kind in the larger picture. */
const least = (large: Locator, marks: string) => large.locator(marks).evaluateAll((all) => Math.min(...all.map((el) => el.getBoundingClientRect().height)));

/** What a person holding the phone has in front of them at one step: read in pixels of the screen, never in the picture's units. */
async function readable(page: Page, large: Locator, look: string): Promise<void> {
  const tools = page.getByRole('group', { name: 'Work the demonstration' });
  if (look !== 'cabinet') {
    expect(await least(large, '[data-part="value"]')).toBeGreaterThanOrEqual(13);
    expect(await least(large, '[data-part="place"]')).toBeGreaterThanOrEqual(9);
    if (await large.locator('[data-part="compare"]').count()) expect(await least(large, '[data-part="compare"]')).toBeGreaterThanOrEqual(13);
  } else {
    expect(await least(large, '.fig-numeral')).toBeGreaterThanOrEqual(9);
  }
  // The number compared, or found, is written inside the frame, whole.
  const frame = (await large.boundingBox())!;
  const cell = look === 'cabinet' ? large.locator('[data-state="look"], [data-state="found"]').first().locator('.fig-numeral').first() : large.locator('[data-state="look"] [data-part="value"], [data-state="found"] [data-part="value"]').first();
  if (await cell.count()) {
    const at = (await cell.boundingBox())!;
    expect(at.x).toBeGreaterThanOrEqual(frame.x - 1);
    expect(at.x + at.width).toBeLessThanOrEqual(frame.x + frame.width + 1);
  }
  // The picture and its buttons are on the screen together, and the page itself never scrolls sideways.
  const next = (await tools.getByRole('button', { name: 'Next step' }).boundingBox())!;
  expect(frame.y).toBeGreaterThanOrEqual(-1);
  expect(next.y + next.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test('on a phone the larger picture is open, read in pixels of the screen, and worked beside its buttons', async ({ page }) => {
  test.setTimeout(360_000);
  await page.route('**/samples/*.json', (route) => route.fulfill({ contentType: 'application/json', body: withFigures() }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Or open a sample course' }).click();
  await page.getByRole('dialog', { name: 'Open a sample course' }).getByRole('button', { name: /^Introduction to ethics/ }).click();
  await expect(page).toHaveURL(/\/map$/);
  const base = page.url().replace(/\/map$/, '/m/slides');
  for (const [name, look] of CASES) {
    await page.goto(`${base}?slide=${CASES.findIndex((c) => c[0] === name) + 1}`);
    const large = page.getByRole('group', { name: 'Binary search, larger picture' });
    const tools = page.getByRole('group', { name: 'Work the demonstration' });
    await expect(large.locator('[data-drawer]').first()).toBeVisible();
    const next = tools.getByRole('button', { name: 'Next step' });
    const seen = new Set<string>();
    for (let step = 1; step <= 8 && !(await next.isDisabled()); step++) {
      await next.tap();
      // The parts come to rest, then the frame slides to the number compared: measured after both.
      await page.waitForTimeout(2000);
      await tools.evaluate((el) => el.scrollIntoView({ block: 'end' }));
      // With the rest of the suite running beside it the slide of the frame can take longer: tried until it holds.
      await expect(async () => readable(page, large, look)).toPass({ timeout: 15_000 });
      for (const state of ['look', 'aside', 'found']) if (await large.locator(`[data-state="${state}"]`).count()) seen.add(state);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/phone390-${name}-step${step}.png` });
    }
    // The whole search was walked: a comparison, numbers set aside, and the number found.
    expect([...seen].sort()).toEqual(['aside', 'found', 'look']);
    // The picture closes and opens by its button.
    await tools.getByRole('button', { name: 'Hide the larger picture' }).tap();
    await expect(large).toHaveCount(0);
    await tools.getByRole('button', { name: 'Show the picture larger' }).tap();
    await expect(large).toBeVisible();
  }
});
