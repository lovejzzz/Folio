import { expect, test } from './fixtures';
import { openSample, retype, settled } from './helpers';

const SHOTS = process.env.FOLIO_FIGURE_SHOTS;

test('a second demonstration by the same means: selection sort is added, worked, changed and kept', async ({ page }) => {
  await openSample(page);
  await page.goto(page.url().replace(/\/map$/, '/m/slides'));
  await page.getByRole('button', { name: 'Add a selection sort demonstration' }).click();
  const figure = page.getByRole('group', { name: 'Selection sort, pass by pass' });
  const tools = page.getByRole('group', { name: 'Work the demonstration' });
  const data = page.getByRole('group', { name: 'The demonstration’s numbers' });
  const said = page.locator('.folio-figure-caption');
  const row = figure.locator('[data-layer="reading"] [data-drawer]');
  await expect(row).toHaveCount(7);
  await expect(figure.locator('[data-layer="scene"] [data-drawer]')).toHaveCount(7);
  await expect(said).toHaveText('Sorting 7 numbers by selection: 31, 8, 56, 3, 42, 17, 23.');
  // A sort looks for no number, and asks no order of its list.
  await expect(data.getByRole('textbox', { name: 'The number to look for' })).toHaveCount(0);
  await expect(data.getByRole('radio', { name: 'Both: the blocks over the row' })).toBeChecked();
  await tools.getByRole('button', { name: 'Next step' }).click();
  await expect(said).toHaveText('Pass 1. Positions 1 to 7 are unsorted; the smallest of them is 3, at position 4. It changes places with 31 at position 1.');
  await expect(row.nth(3)).toHaveAttribute('data-state', 'min');
  await expect(row.nth(0)).toHaveAttribute('data-state', 'place');
  await expect(figure.locator('[data-part="leader"]')).toHaveCount(1);
  await expect(figure.locator('[data-part="swap"]')).toHaveCount(1);
  // The list under the slide is in the order the list has now, each with its state in words.
  const strip = page.getByRole('list', { name: 'The list at this step' });
  await expect(strip.getByRole('listitem', { name: 'Position 4: 3, the smallest of the rest' })).toBeVisible();
  await settled(page);
  if (SHOTS) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${SHOTS}/desktop-sort-pass1.png`, fullPage: true });
  }
  await tools.getByRole('button', { name: 'Next step' }).click();
  await expect(strip.getByRole('listitem').first()).toHaveAccessibleName('Position 1: 3, sorted');
  // Its numbers are the teacher's: changed, the sort starts again from them; something not a number is kept and said.
  await retype(page, 'The list to sort', '5, 2, 9');
  await expect(said).toHaveText('Sorting 3 numbers by selection: 5, 2, 9.');
  await expect(row).toHaveCount(3);
  await retype(page, 'The list to sort', '5, two, 9');
  await expect(data.getByRole('alert')).toContainText('“two” is not a number');
  await retype(page, 'The list to sort', '5, 2, 9');
  await page.reload();
  await expect(page.getByRole('group', { name: 'Selection sort, pass by pass' }).locator('[data-layer="reading"] [data-drawer]')).toHaveCount(3);
});
