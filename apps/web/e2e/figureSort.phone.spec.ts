import { orderedLessons } from '@folio/core';
import { sampleCourse } from '@folio/core/sample';
import { expect, test } from './fixtures';

const SHOTS = process.env.FOLIO_FIGURE_SHOTS;
test.use({ viewport: { width: 390, height: 844 } });

test('on a phone the sort is read in pixels of the screen, at every pass, beside its buttons', async ({ page }) => {
  test.setTimeout(120_000);
  const course = sampleCourse();
  const first = orderedLessons(course)[0]!;
  first.slides[0] = { ...first.slides[0]!, bullets: [], visual: { kind: 'figure', figure: 'selectionSort', look: 'composite', values: [31, 8, 56, 3, 42, 17, 23, -12.5], target: 0 } };
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
  await expect(large.locator('[data-layer="reading"] [data-drawer]')).toHaveCount(8);
  for (let step = 1; step <= 9 && !(await next.isDisabled()); step++) {
    await next.tap();
    const last = await next.isDisabled();
    await tools.evaluate((el) => el.scrollIntoView({ block: 'end' }));
    await expect(async () => {
      expect(await least('[data-part="value"]')).toBeGreaterThanOrEqual(13);
      expect(await least('[data-part="place"]')).toBeGreaterThanOrEqual(9);
      const frame = (await large.boundingBox())!;
      const min = large.locator('[data-layer="reading"] [data-state="min"] [data-part="value"]');
      // Every picture but the last has a smallest in hand: measured once the picture has come to it, never on the way.
      expect(await min.count()).toBe(last ? 0 : 1);
      if (!last) {
        const at = (await min.boundingBox())!;
        expect(at.x).toBeGreaterThanOrEqual(frame.x - 1);
        expect(at.x + at.width).toBeLessThanOrEqual(frame.x + frame.width + 1);
      }
      const button = (await next.boundingBox())!;
      expect(frame.y).toBeGreaterThanOrEqual(-1);
      expect(button.y + button.height).toBeLessThanOrEqual(845);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }).toPass({ timeout: 15_000 });
    if (SHOTS && step <= 2) await page.screenshot({ path: `${SHOTS}/phone390-sort-pass${step}.png` });
  }
});
