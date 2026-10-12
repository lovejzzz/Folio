import { orderedLessons } from '@folio/core';
import { sampleCourse } from '@folio/core/sample';
import { expect, test } from './fixtures';

const SHOTS = process.env.FOLIO_FIGURE_SHOTS;
test.use({ viewport: { width: 390, height: 844 } });

test('on a phone the descent is read in pixels of the screen at every step, beside its buttons', async ({ page }) => {
  test.setTimeout(120_000);
  const course = sampleCourse();
  const first = orderedLessons(course)[0]!;
  first.slides[0] = { ...first.slides[0]!, bullets: [], visual: { kind: 'figure', figure: 'gradientDescent', look: 'composite', values: [4, 0.3, 5], target: 1 } };
  await page.route('**/samples/*.json', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(course) }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Or open a sample course' }).click();
  await page.getByRole('dialog', { name: 'Open a sample course' }).getByRole('button', { name: /^Introduction to ethics/ }).click();
  await expect(page).toHaveURL(/\/map$/);
  await page.goto(page.url().replace(/\/map$/, '/m/slides'));
  const large = page.getByRole('group', { name: 'The demonstration, larger' });
  const tools = page.getByRole('group', { name: 'Work the demonstration' });
  const next = tools.getByRole('button', { name: 'Next step' });
  const least = (marks: string) => large.locator(marks).evaluateAll((all) => Math.min(...all.map((el) => el.getBoundingClientRect().height)));
  await expect(large.locator('[data-layer="reading"]')).toHaveCount(1);
  for (let step = 1; step <= 6 && !(await next.isDisabled()); step++) {
    await next.tap();
    const last = await next.isDisabled();
    await tools.evaluate((el) => el.scrollIntoView({ block: 'end' }));
    await expect(async () => {
      expect(await large.locator('[data-part="step"]').count()).toBe(last ? 0 : 1);
      // The numbers (w, loss, slope, the step) thirteen pixels high at the least; the names and the axis's ends nine.
      expect(await least('[data-part="value"], [data-part="readout"], [data-part="compare"]')).toBeGreaterThanOrEqual(13);
      expect(await least('[data-part="place"]')).toBeGreaterThanOrEqual(9);
      // The names are words in small letters at the same size as those numbers: "loss" and "slope" stand as tall by
      // their l and p; "w" alone has no tall letter and is as high as a small letter of that size is.
      const names = await large.locator('[data-part="name"]').evaluateAll((all) => all.map((el) => el.getBoundingClientRect().height).sort((a, b) => a - b));
      expect(names[0]).toBeGreaterThanOrEqual(6);
      expect(names[1]).toBeGreaterThanOrEqual(9);
      const frame = (await large.boundingBox())!;
      const w = (await large.locator('[data-part="compare"]').boundingBox())!;
      expect(w.x).toBeGreaterThanOrEqual(frame.x - 1);
      expect(w.x + w.width).toBeLessThanOrEqual(frame.x + frame.width + 1);
      const button = (await next.boundingBox())!;
      expect(frame.y).toBeGreaterThanOrEqual(-1);
      expect(button.y + button.height).toBeLessThanOrEqual(845);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }).toPass({ timeout: 15_000 });
    if (SHOTS && step === 2) await page.screenshot({ path: `${SHOTS}/phone390-descent-step2.png` });
  }
});
