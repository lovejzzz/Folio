import { expect, test } from './fixtures';
import { openSample, retype, settled } from './helpers';

const SHOTS = process.env.FOLIO_FIGURE_SHOTS;

test('a third demonstration, whose reading is a number line: gradient descent is added, worked, and shows a learning rate that is too large', async ({ page }) => {
  await openSample(page);
  await page.goto(page.url().replace(/\/map$/, '/m/slides'));
  await page.getByRole('button', { name: 'Add a gradient descent demonstration' }).click();
  const figure = page.getByRole('group', { name: 'Gradient descent, step by step' });
  const tools = page.getByRole('group', { name: 'Work the demonstration' });
  const data = page.getByRole('group', { name: 'The demonstration’s numbers' });
  const said = page.locator('.folio-figure-caption');
  await expect(said).toHaveText('The loss is lowest at w = 1. w starts at 4, where the loss is 9; the learning rate is 0.3.');
  await expect(figure.locator('[data-layer="scene"]')).toHaveCount(1);
  await expect(figure.locator('[data-part="step"]')).toHaveCount(0);
  await tools.getByRole('button', { name: 'Next step' }).click();
  await expect(said).toHaveText('Step 1. At w = 4 the loss is 9 and the slope is 6. The step is 0.3 × 6 = 1.8, so w goes down to 2.2, where the loss is 1.44.');
  await expect(figure.locator('[data-part="step"]')).toHaveCount(1);
  await expect(figure.locator('[data-part="leader"]')).toHaveCount(1);
  await settled(page);
  if (SHOTS) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${SHOTS}/desktop-descent-step1.png`, fullPage: true });
  }
  await tools.getByRole('button', { name: 'Next step' }).click();
  const strip = page.getByRole('list', { name: 'The list at this step' });
  await expect(strip.getByRole('listitem', { name: 'Position 2: 2.2, where w is now' })).toBeVisible();
  // The lesson of it: the same walk with a learning rate over 1 runs away, and the last sentence says why.
  await retype(page, 'Start, learning rate, steps', '4, 1.1, 4');
  await tools.getByRole('button', { name: 'Next step' }).click();
  await tools.getByRole('button', { name: 'Next step' }).click();
  await tools.getByRole('button', { name: 'Next step' }).click();
  await tools.getByRole('button', { name: 'Next step' }).click();
  await tools.getByRole('button', { name: 'Next step' }).click();
  await expect(said).toContainText('the learning rate is too large, and the loss grows.');
  // What cannot be walked is said, and kept as typed.
  await retype(page, 'Start, learning rate, steps', '4, 0, 4');
  await expect(data.getByRole('alert')).toContainText('a learning rate above 0');
  await retype(page, 'Start, learning rate, steps', '4, 0.8, 4');
  await retype(page, 'The lowest point (the best w)', '2');
  await expect(said).toHaveText('The loss is lowest at w = 2. w starts at 4, where the loss is 4; the learning rate is 0.8.');
  await page.reload();
  await expect(page.locator('.folio-figure-caption')).toHaveText('The loss is lowest at w = 2. w starts at 4, where the loss is 4; the learning rate is 0.8.');
});
