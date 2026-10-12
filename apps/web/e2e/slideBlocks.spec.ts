import { orderedLessons } from '@folio/core';
import { sampleCourse } from '@folio/core/sample';
import { expect, test } from './fixtures';

const SHOTS = process.env.FOLIO_BLOCK_SHOTS;

function withBlocks(): string {
  const course = sampleCourse();
  const first = orderedLessons(course)[0]!;
  first.slides[1] = { ...first.slides[1]!, title: 'One step of training', bullets: [], visual: { kind: 'steps', cycle: true, steps: [{ title: 'Forward pass', detail: 'Predictions from the batch' }, { title: 'Loss', detail: 'How wrong they are' }, { title: 'Backward pass', detail: 'A gradient for every weight' }, { title: 'Update', detail: 'Each weight moves a little' }] } };
  first.slides[2] = { ...first.slides[2]!, title: 'CPU and GPU: two designs', bullets: [], visual: { kind: 'compare', ask: 'Which would you give a matrix product, and why?', sides: [{ title: 'CPU', points: ['A few fast cores', 'Good at branching work', 'Shares the machine’s memory'] }, { title: 'GPU', points: ['Thousands of small cores', 'The same sum on many numbers at once', 'Its own memory, and a limit to it'] }] } };
  return JSON.stringify(course);
}

test('a chain of steps and things side by side are on the slide, reworded where they stand, and kept', async ({ page }) => {
  await page.route('**/samples/*.json', (route) => route.fulfill({ contentType: 'application/json', body: withBlocks() }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Or open a sample course' }).click();
  await page.getByRole('dialog', { name: 'Open a sample course' }).getByRole('button', { name: /^Introduction to ethics/ }).click();
  await expect(page).toHaveURL(/\/map$/);
  const slides = page.url().replace(/\/map$/, '/m/slides');
  await page.goto(`${slides}?slide=2`);
  const chain = page.getByRole('group', { name: '4 steps, in order' }).last();
  await expect(chain.getByRole('listitem')).toHaveCount(4);
  await expect(chain).toContainText('Then back to “Forward pass”.');
  // Frames of one height in one row, left to right, inside the slide.
  const boxes = await chain.locator('.folio-slide-step').evaluateAll((all) => all.map((el) => el.getBoundingClientRect()).map((r) => [Math.round(r.left), Math.round(r.top), Math.round(r.height)]));
  expect(new Set(boxes.map((b) => b[1])).size).toBe(1);
  expect(new Set(boxes.map((b) => b[2])).size).toBe(1);
  expect(boxes.map((b) => b[0]!)).toEqual([...boxes.map((b) => b[0]!)].sort((a, b) => a - b));
  if (SHOTS) await page.locator('.folio-slide').last().screenshot({ path: `${SHOTS}/steps.png` });
  // A step is reworded where it stands, and the change is kept.
  const title = chain.getByRole('textbox', { name: 'Step 2', exact: true });
  await title.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('Loss on the batch');
  await title.blur();
  await page.goto(`${slides}?slide=3`);
  const sides = page.getByRole('group', { name: 'Side by side: CPU, GPU' }).last();
  await expect(sides.getByRole('listitem')).toHaveCount(6);
  await expect(sides).toContainText('Which would you give a matrix product, and why?');
  const cols = await sides.locator('.folio-slide-side').evaluateAll((all) => all.map((el) => Math.round(el.getBoundingClientRect().width)));
  expect(Math.abs(cols[0]! - cols[1]!)).toBeLessThanOrEqual(1);
  if (SHOTS) await page.locator('.folio-slide').last().screenshot({ path: `${SHOTS}/compare.png` });
  await page.reload();
  await page.goto(`${slides}?slide=2`);
  await expect(page.getByRole('group', { name: '4 steps, in order' }).last()).toContainText('Loss on the batch');
});
