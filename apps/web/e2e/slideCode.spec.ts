import { readFileSync } from 'node:fs';
import { orderedLessons } from '@folio/core';
import { sampleCourse } from '@folio/core/sample';
import { expect, test } from './fixtures';

/**
 * The twelve lines of binary_search a lesson Folio wrote showed on three slides, here on one: a block of code, each line
 * on its own line with its indentation, all of it inside the slide.
 */
const real = JSON.parse(readFileSync(new URL('../../../packages/ai/test/fixtures/algorithms-code-cut.json', import.meta.url), 'utf8')) as { shown: string[] };
const code = real.shown.filter((x) => /^`[^`]+`$/.test(x.trim()));

test('a function of twelve lines stands whole on one slide, as a block of code', async ({ page }) => {
  const course = sampleCourse();
  const first = orderedLessons(course)[0]!;
  first.slides[0] = { ...first.slides[0]!, layout: 'bullets', title: 'Binary search: halving a sorted list', bullets: code, visual: undefined };
  await page.route('**/samples/*.json', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(course) }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Or open a sample course' }).click();
  await page.getByRole('dialog', { name: 'Open a sample course' }).getByRole('button', { name: /^Introduction to ethics/ }).click();
  await expect(page).toHaveURL(/\/map$/);
  await page.goto(page.url().replace(/\/map$/, '/m/slides'));
  const stage = page.locator('.folio-slide').last();
  const lines = stage.locator('.folio-slide-code');
  await expect(lines).toHaveCount(code.length);
  const box = (await stage.boundingBox())!;
  const footer = (await stage.locator('.folio-slide-footer').boundingBox())!;
  const boxes = await lines.evaluateAll((all) => all.map((el) => ((r) => ({ top: r.top, bottom: r.bottom, right: r.right, height: r.height }))(el.getBoundingClientRect())));
  // Every line inside the slide and above its foot, one under another, none wrapped onto a second line.
  for (const b of boxes) {
    expect(b.bottom).toBeLessThanOrEqual(footer.y);
    expect(b.right).toBeLessThanOrEqual(box.x + box.width);
  }
  expect(boxes.every((b, i) => i === 0 || b.top >= boxes[i - 1]!.bottom - 1)).toBe(true);
  expect(Math.max(...boxes.map((b) => b.height))).toBeLessThan(Math.min(...boxes.map((b) => b.height)) * 1.5);
  // Indentation kept: the line under `while` starts to the right of it.
  const lefts = await lines.locator('code').evaluateAll((all) => all.map((el) => (el.textContent ?? '').length - (el.textContent ?? '').trimStart().length));
  expect(Math.max(...lefts)).toBeGreaterThanOrEqual(8);
  if (process.env.FOLIO_SHOT_DIR) await stage.screenshot({ path: `${process.env.FOLIO_SHOT_DIR}/code-block-slide.png` });
});
