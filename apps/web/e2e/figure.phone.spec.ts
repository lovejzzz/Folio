import { orderedLessons } from '@folio/core';
import { sampleCourse } from '@folio/core/sample';
import { expect, test } from './fixtures';

const SHOTS = process.env.FOLIO_FIGURE_SHOTS;

/** The sample course with a demonstration on its first slide, as a course file a teacher was given would have it. */
function withFigure(): string {
  const course = sampleCourse();
  const first = orderedLessons(course)[0]!;
  first.slides[0] = { ...first.slides[0]!, visual: { kind: 'figure', figure: 'binarySearch', values: [2, 4, 4, 4, 9, 15, 21], target: 4 } };
  return JSON.stringify(course);
}

test('on a phone a demonstration is worked by touch, and fits the slide', async ({ page }) => {
  await page.route('**/samples/*.json', (route) => route.fulfill({ contentType: 'application/json', body: withFigure() }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Or open a sample course' }).click();
  await page.getByRole('dialog', { name: 'Open a sample course' }).getByRole('button', { name: /^Introduction to ethics/ }).click();
  await expect(page.getByText('Open a lesson to review it.')).toBeVisible();
  await page.goto(page.url().replace(/\/map$/, '/m/slides'));
  const figure = page.getByRole('group', { name: 'Binary search, step by step' });
  const said = page.locator('.folio-figure-caption');
  const tools = page.getByRole('group', { name: 'Work the demonstration' });
  await expect(said).toHaveText(/^Searching for 4 in a sorted list of 7 numbers/);
  await tools.getByRole('button', { name: 'Next step' }).tap();
  await expect(said).toHaveText(/^Step 1\. Positions 1 to 7 are left; the middle is position 4, which holds 4\. 4 is 4: found at position 4\./);
  // A number that stands more than once: said, not passed over.
  await expect(said).toContainText('need not be the leftmost');
  // The page does not scroll sideways for it, and the picture is inside the slide.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const art = await figure.locator('svg').boundingBox();
  expect(art!.x).toBeGreaterThanOrEqual(0);
  expect(art!.x + art!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  // The title slide keeps its own line: the picture takes the room that is left, and nothing lies over the foot.
  const stage = page.locator('.folio-slide').filter({ has: figure });
  const line = await stage.locator('.folio-slide-bullets').boundingBox();
  const foot = await stage.locator('.folio-slide-footer').boundingBox();
  expect(line!.y + line!.height).toBeLessThanOrEqual(foot!.y);
  expect(art!.y + art!.height).toBeLessThanOrEqual(line!.y + 1);
  expect(art!.height).toBeGreaterThan(60);
  // Buttons a thumb can hit.
  const button = await tools.getByRole('button', { name: 'Next step' }).boundingBox();
  expect(Math.min(button!.width, button!.height)).toBeGreaterThanOrEqual(32);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/phone.png` });
});
