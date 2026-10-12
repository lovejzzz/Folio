import { orderedLessons } from '@folio/core';
import { sampleCourse } from '@folio/core/sample';
import { expect, test } from './fixtures';

test.use({ viewport: { width: 390, height: 844 } });

/**
 * Two slides Folio really wrote (the AI-training course, lesson 3), with their own long words. On a phone 390 pixels wide
 * the two columns of the first were set in type 6.5 pixels high, and nothing else on the page held their words.
 */
const COMPARE = {
  kind: 'compare' as const,
  sides: [
    { title: 'CPU', points: ['a few strong cores (4 to 16 in a laptop)', 'large caches, fast on one task (low latency)', 'good at branching and varied code'] },
    { title: 'GPU', points: ['thousands of simple cores (2,560 CUDA cores on a T4)', 'very high memory bandwidth, many tasks in flight (high throughput)', 'good at one operation on huge arrays'] },
  ],
  ask: 'Write one sentence with your partner on why matrix multiplication fits the right-hand column.',
};
const STEPS = { kind: 'steps' as const, cycle: false, steps: ['disk', 'host RAM', 'PCIe (about 16 GB/s)', 'VRAM (about 320 GB/s on a T4)', 'on-chip cache and registers', 'cores'].map((title) => ({ title, detail: '' })) };

test('on a phone a slide\'s columns and chain are also there at reading size, inside the screen, and can be changed there', async ({ page }) => {
  const course = sampleCourse();
  const first = orderedLessons(course)[0]!;
  first.slides[0] = { ...first.slides[0]!, title: 'Few strong cores or thousands of simple ones', bullets: [], visual: COMPARE };
  first.slides[1] = { ...first.slides[1]!, title: 'Memory and VRAM: where the data lives', bullets: [], visual: STEPS };
  await page.route('**/samples/*.json', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(course) }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Or open a sample course' }).click();
  await page.getByRole('dialog', { name: 'Open a sample course' }).getByRole('button', { name: /^Introduction to ethics/ }).click();
  await expect(page).toHaveURL(/\/map$/);
  await page.goto(page.url().replace(/\/map$/, '/m/slides'));
  const read = page.getByRole('region', { name: 'This slide’s words, at reading size' });
  const sizes = () => read.locator('.folio-slide-side li, .folio-slide-side-title, .folio-slide-ask, .folio-slide-step-title').evaluateAll((all) => all.map((el) => parseFloat(getComputedStyle(el).fontSize)));
  const inside = () => read.locator('.folio-slide-side li, .folio-slide-ask, .folio-slide-step').evaluateAll((all) => all.every((el) => ((r) => r.left >= 0 && r.right <= window.innerWidth)(el.getBoundingClientRect())));
  // The slide itself stays a picture of the slide: its own type is small here, which is why the words stand again below.
  const onSlide = await page.locator('.folio-slide .folio-slide-side li').first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(onSlide).toBeLessThan(9);
  await expect(read.getByText('very high memory bandwidth, many tasks in flight (high throughput)')).toBeVisible();
  expect(Math.min(...(await sizes()))).toBeGreaterThanOrEqual(14);
  expect(await inside()).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  if (process.env.FOLIO_SHOT_DIR) await page.screenshot({ path: `${process.env.FOLIO_SHOT_DIR}/phone390-compare.png`, fullPage: true });
  // A change made in the readable copy is a change to the slide.
  const point = read.getByRole('textbox', { name: 'CPU, point 3' });
  await point.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('good at branching code');
  await page.keyboard.press('Tab');
  await expect(page.locator('.folio-slide .folio-slide-side li').nth(2)).toHaveText('good at branching code');
  // The chain, one step under another.
  await page.getByRole('button', { name: 'Next slide' }).click();
  await expect(read.getByText('VRAM (about 320 GB/s on a T4)')).toBeVisible();
  expect(Math.min(...(await sizes()))).toBeGreaterThanOrEqual(14);
  expect(await inside()).toBe(true);
  const tops = await read.locator('.folio-slide-step').evaluateAll((all) => all.map((el) => el.getBoundingClientRect().top));
  expect(tops.every((y, i) => i === 0 || y > tops[i - 1]!)).toBe(true);
  if (process.env.FOLIO_SHOT_DIR) await page.screenshot({ path: `${process.env.FOLIO_SHOT_DIR}/phone390-steps.png`, fullPage: true });
});
