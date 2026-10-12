import { expect, test } from './fixtures';
import { unzipSync } from 'fflate';
import { readFile } from 'node:fs/promises';
import { openSample, retype, settled } from './helpers';

const SHOTS = process.env.FOLIO_FIGURE_SHOTS;
const pngs = (files: Record<string, Uint8Array>, dir: string) => Object.entries(files).filter(([name, data]) => name.startsWith(dir) && data[0] === 137 && data[1] === 80).length;

test('a demonstration drawn as a row of numbers: chosen, worked, kept, and exported as it is drawn', async ({ page, context }) => {
  // Pictures are painted in the page for each file made: with the rest of the suite running beside it, a minute was once not enough.
  test.setTimeout(150_000);
  await openSample(page);
  await page.goto(page.url().replace(/\/map$/, '/m/slides'));
  await page.getByRole('button', { name: 'Add a binary search demonstration' }).click();
  const figure = page.getByRole('group', { name: 'Binary search, step by step' });
  const tools = page.getByRole('group', { name: 'Work the demonstration' });
  const said = page.locator('.folio-figure-caption');
  await expect(figure.locator('[data-drawer]')).toHaveCount(9);
  if (SHOTS) {
    await tools.getByRole('button', { name: 'Next step' }).click();
    await settled(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${SHOTS}/desktop-cabinet-step1.png`, fullPage: true });
    await tools.getByRole('button', { name: 'Back to the start' }).click();
  }

  // The look is the slide's own choice, one of two by name.
  const data = page.getByRole('group', { name: 'The demonstration’s numbers' });
  await data.getByRole('radio', { name: 'A row of numbers' }).click();
  await expect(figure.locator('path.flat').first()).toBeVisible();
  await expect(figure.locator('[data-drawer]')).toHaveCount(9);
  await expect(said).toHaveText(/^Searching for 42 in a sorted list of 9 numbers/);

  // Worked the same way, the same states step for step.
  await tools.getByRole('button', { name: 'Next step' }).click();
  await expect(said).toHaveText(/^Step 1\. Positions 1 to 9 are left; the middle is position 5, which holds 23/);
  await expect(figure.locator('[data-drawer="4"]')).toHaveAttribute('data-state', 'look');
  if (SHOTS) {
    await settled(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${SHOTS}/desktop-flat-step1.png`, fullPage: true });
  }
  await figure.focus();
  await page.keyboard.press('ArrowRight');
  await expect(figure.locator('[data-drawer="6"]')).toHaveAttribute('data-state', 'found');
  await expect(figure.locator('[data-drawer="0"]')).toHaveAttribute('data-state', 'aside');
  await page.keyboard.press('Home');
  await expect(said).toHaveText(/^Searching for 42/);

  // A number not there, a number standing three times, an empty list: each drawn and said.
  await retype(page, 'The number to look for', '40');
  for (let i = 0; i < 4; i++) await tools.getByRole('button', { name: 'Next step' }).click();
  await expect(said).toHaveText('40 is not in the list: the search ran out after 3 comparisons.');
  await expect(figure.locator('[data-state="aside"]')).toHaveCount(9);
  await retype(page, 'The list, in ascending order', '2, 4, 4, 4, 9');
  await retype(page, 'The number to look for', '4');
  await tools.getByRole('button', { name: 'Next step' }).click();
  await expect(said).toContainText('need not be the leftmost');
  // Cleared by the keyboard, as a teacher would.
  await page.getByRole('textbox', { name: 'The list, in ascending order' }).click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Backspace');
  await page.getByRole('textbox', { name: 'The list, in ascending order' }).blur();
  await expect(said).toHaveText('The list is empty, so 4 is not in it: there is nothing to compare.');
  await expect(figure.locator('[data-drawer]')).toHaveCount(0);
  await retype(page, 'The list, in ascending order', '3, 8, 12, 17, 23, 31, 42, 56, 71');
  await retype(page, 'The number to look for', '40');

  // Kept with its look over a reload; the thumbnail is the same look, still.
  await settled(page);
  await page.reload();
  await expect(figure.locator('path.flat').first()).toBeVisible();
  await expect(page.getByRole('group', { name: 'The demonstration’s numbers' }).getByRole('radio', { name: 'A row of numbers' })).toBeChecked();

  // Exported as it is drawn: a picture for the start, each comparison and the end.
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Export' });
  for (const who of ['student', 'teacher'] as const) {
    if (who === 'teacher') await drawer.getByRole('radio', { name: 'You (answers)' }).click();
    await drawer.getByText('Word', { exact: true }).first().click();
    const docx = page.waitForEvent('download');
    await drawer.getByRole('button', { name: 'Download Word' }).click();
    expect(pngs(unzipSync(await readFile((await (await docx).path())!)), 'word/media/')).toBe(5);
    if (SHOTS) await (await docx).saveAs(`${SHOTS}/flat-${who}.docx`);
    await drawer.getByText('PowerPoint', { exact: true }).click();
    const pptx = page.waitForEvent('download');
    await drawer.getByRole('button', { name: 'Download PowerPoint' }).click();
    expect(pngs(unzipSync(await readFile((await (await pptx).path())!)), 'ppt/media/')).toBe(5);
    if (SHOTS) await (await pptx).saveAs(`${SHOTS}/flat-${who}.pptx`);
    await drawer.getByText('PDF', { exact: false }).first().click();
    const popup = context.waitForEvent('page');
    await drawer.getByRole('button', { name: 'Open print view' }).click();
    const print = await popup;
    await print.addInitScript(() => (window.print = () => {}));
    const steps = print.getByRole('region', { name: 'Binary search, step by step' });
    await expect(steps.locator('img')).toHaveCount(5);
    await expect(steps.getByRole('columnheader', { name: 'What follows' })).toBeVisible();
    if (SHOTS) await print.pdf({ path: `${SHOTS}/flat-${who}.pdf` });
    await print.close();
  }
});

test('the row of numbers stands still when motion is turned down', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openSample(page);
  await page.goto(page.url().replace(/\/map$/, '/m/slides'));
  await page.getByRole('button', { name: 'Add a binary search demonstration' }).click();
  await page.getByRole('group', { name: 'The demonstration’s numbers' }).getByRole('radio', { name: 'A row of numbers' }).click();
  const figure = page.getByRole('group', { name: 'Binary search, step by step' });
  await expect(figure.locator('[data-drawer]')).toHaveCount(9);
  await page.getByRole('group', { name: 'Work the demonstration' }).getByRole('button', { name: 'Next step' }).click();
  const now = await figure.locator('svg').evaluate((svg) => svg.innerHTML);
  await page.waitForTimeout(900);
  expect(await figure.locator('svg').evaluate((svg) => svg.innerHTML)).toBe(now);
});
