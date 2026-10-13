import { orderedLessons } from '@folio/core';
import { sampleCourse } from '@folio/core/sample';
import { expect, test } from './fixtures';

/**
 * A slide Folio wrote for a calculus course: a table of six rows over two lines of text. The lines ran down through the
 * slide's foot. What a slide holds under its title is now brought down in size until it stands above the foot.
 */
const TABLE = { kind: 'table' as const, columns: ['x', 'f(x)'], rows: ['0.9', '0.99', '0.999', '1.1', '1.01', '1.001'].map((x) => [x, '?']) };
const LINES = ['lim_{x→a} f(x) = L: f(x) as close to L as we like', 'by taking x close enough to a, but not equal to a'];

test('a table and its lines stand above the slide\'s foot, and a slide with room is left at its size', async ({ page }) => {
  const course = sampleCourse();
  const first = orderedLessons(course)[0]!;
  first.slides[0] = { ...first.slides[0]!, layout: 'bullets', title: 'Estimating a limit from a table', bullets: LINES, visual: TABLE };
  first.slides[1] = { ...first.slides[1]!, layout: 'bullets', title: 'A slide with room', bullets: ['One line', 'Another line'], visual: undefined };
  await page.route('**/samples/*.json', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(course) }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Or open a sample course' }).click();
  await page.getByRole('dialog', { name: 'Open a sample course' }).getByRole('button', { name: /^Introduction to ethics/ }).click();
  await expect(page).toHaveURL(/\/map$/);
  await page.goto(page.url().replace(/\/map$/, '/m/slides'));
  const stage = page.locator('.folio-slide').last();
  const last = stage.locator('.folio-slide-bullets > li').nth(1);
  await expect(last).toContainText('not equal to a');
  await expect(async () => {
    const foot = (await stage.locator('.folio-slide-footer').boundingBox())!;
    const line = (await last.boundingBox())!;
    expect(line.y + line.height).toBeLessThanOrEqual(foot.y);
  }).toPass();
  const small = await last.evaluate((el) => parseFloat(getComputedStyle(el.parentElement!).fontSize));
  if (process.env.FOLIO_SHOT_DIR) await stage.screenshot({ path: `${process.env.FOLIO_SHOT_DIR}/fit-slide.png` });
  if (process.env.FOLIO_SHOT_DIR) await page.screenshot({ path: `${process.env.FOLIO_SHOT_DIR}/fit-page.png` });
  // The thumbnail of the same slide holds it too: its table took a fixed leading from the page and ran out of the slide.
  const thumb = page.locator('.folio-slide').first();
  const box = (await thumb.boundingBox())!;
  const lastLine = (await thumb.locator('.folio-slide-bullets > li').nth(1).boundingBox())!;
  expect(lastLine.y + lastLine.height).toBeLessThanOrEqual(box.y + box.height);
  await page.getByRole('button', { name: 'Next slide' }).click();
  const roomy = page.locator('.folio-slide').last().locator('.folio-slide-bullets');
  await expect(roomy).toContainText('Another line');
  const full = await roomy.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(small).toBeLessThan(full);
  const width = (await page.locator('.folio-slide').last().boundingBox())!.width;
  expect(Math.abs(full - width * 0.031)).toBeLessThan(0.6);
});
