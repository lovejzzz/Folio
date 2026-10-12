import { expect, test } from './fixtures';
import { openSample, settled } from './helpers';

const SHOTS = process.env.FOLIO_FIGURE_SHOTS;

test('a demonstration drawn as both: the cabinet over the row, worked as one, and kept', async ({ page }) => {
  await openSample(page);
  await page.goto(page.url().replace(/\/map$/, '/m/slides'));
  await page.getByRole('button', { name: 'Add a binary search demonstration' }).click();
  const figure = page.getByRole('group', { name: 'Binary search, step by step' });
  const tools = page.getByRole('group', { name: 'Work the demonstration' });
  const data = page.getByRole('group', { name: 'The demonstration’s numbers' });
  await data.getByRole('radio', { name: 'Both: the cabinet over the row' }).click();
  // Two layers of one list: nine drawers in the scene, nine cells in the row.
  const scene = figure.locator('[data-layer="scene"] [data-drawer]');
  const row = figure.locator('[data-layer="reading"] [data-drawer]');
  await expect(scene).toHaveCount(9);
  await expect(row).toHaveCount(9);
  await expect(figure.locator('[data-part="leader"]')).toHaveCount(0);
  await tools.getByRole('button', { name: 'Next step' }).click();
  // The same number is out in the cabinet and framed in the row, and a line joins them under the comparison.
  await expect(scene.nth(4)).toHaveAttribute('data-state', 'look');
  await expect(row.nth(4)).toHaveAttribute('data-state', 'look');
  await expect(figure.locator('[data-part="leader"]')).toHaveCount(1);
  await expect(figure.locator('[data-part="compare"]')).toHaveCount(1);
  await settled(page);
  // The numerals are outlines of a typeface, filled: no stroke on them, live as in a file.
  expect(await row.nth(4).locator('[data-part="value"]').evaluate((el) => [getComputedStyle(el).stroke, getComputedStyle(el).fill])).toEqual(['none', 'rgb(24, 24, 26)']);
  if (SHOTS) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${SHOTS}/desktop-both-step1.png`, fullPage: true });
  }
  // Kept with the slide.
  await page.reload();
  await expect(page.getByRole('group', { name: 'The demonstration’s numbers' }).getByRole('radio', { name: 'Both: the cabinet over the row' })).toBeChecked();
  await expect(page.getByRole('group', { name: 'Binary search, step by step' }).locator('[data-layer="reading"] [data-drawer]')).toHaveCount(9);
});
