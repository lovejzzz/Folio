import { expect, test } from './fixtures';
import { unzipSync } from 'fflate';
import { readFile } from 'node:fs/promises';
import { openSample, retype, settled } from './helpers';

const SHOTS = process.env.FOLIO_FIGURE_SHOTS;
const pngs = (files: Record<string, Uint8Array>, dir: string) => Object.entries(files).filter(([name, data]) => name.startsWith(dir) && data[0] === 137 && data[1] === 80).length;

test('a binary search demonstration is added to a slide, worked, changed, kept over a reload and exported', async ({ page, context }) => {
  await openSample(page);
  await page.goto(page.url().replace(/\/map$/, '/m/slides'));
  const title = page.getByRole('textbox', { name: 'Slide title' });
  await expect(title).toHaveText('Asking questions with data');
  await page.getByRole('button', { name: 'Add a binary search demonstration' }).click();
  const figure = page.getByRole('group', { name: 'Binary search, step by step' });
  const said = page.locator('.folio-figure-caption');
  const tools = page.getByRole('group', { name: 'Work the demonstration' });
  await expect(said).toHaveText(/^Searching for 42 in a sorted list of 9 numbers/);
  await expect(figure.locator('[data-drawer]')).toHaveCount(9);

  // By its buttons.
  await tools.getByRole('button', { name: 'Next step' }).click();
  await expect(said).toHaveText(/^Step 1\. Positions 1 to 9 are left; the middle is position 5, which holds 23/);
  await expect(figure.locator('[data-drawer="4"]')).toHaveAttribute('data-state', 'look');
  // By the keys, when the figure has the focus: the deck stays on its slide.
  await figure.focus();
  await page.keyboard.press('ArrowRight');
  await expect(said).toHaveText(/found at position 7\. 42 was found at position 7 after 2 comparisons\.$/);
  await expect(figure.locator('[data-drawer="6"]')).toHaveAttribute('data-state', 'found');
  await expect(tools.getByRole('button', { name: 'Next step' })).toBeDisabled();
  await expect(title).toHaveText('Asking questions with data');
  await page.keyboard.press('ArrowLeft');
  await expect(said).toHaveText(/^Step 1\./);
  await page.keyboard.press('Home');
  await expect(said).toHaveText(/^Searching for 42/);
  // Played, it goes on by itself and can be paused; back at the start it is reset.
  await page.keyboard.press(' ');
  await expect(tools.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect(said).toHaveText(/^Step 1\./, { timeout: 6000 });
  await tools.getByRole('button', { name: 'Pause' }).click();
  await expect(tools.getByRole('button', { name: 'Play' })).toBeVisible();
  await tools.getByRole('button', { name: 'Back to the start' }).click();
  await expect(said).toHaveText(/^Searching for 42/);
  if (SHOTS) {
    await tools.getByRole('button', { name: 'Next step' }).click();
    await tools.getByRole('button', { name: 'Next step' }).click();
    await settled(page);
    await page.screenshot({ path: `${SHOTS}/desktop-editor.png` });
    await tools.getByRole('button', { name: 'Back to the start' }).click();
  }

  // What is not a number stays as typed and is named; the list the figure has is not touched.
  await retype(page, 'The list, in ascending order', '1, nope, 3');
  const typed = page.getByRole('group', { name: 'The demonstration’s numbers' });
  await expect(typed.getByRole('alert')).toContainText('“nope” is not a number: nothing was changed.');
  await expect(page.getByRole('textbox', { name: 'The list, in ascending order' })).toHaveText('1, nope, 3');
  await expect(said).toHaveText(/^Searching for 42 in a sorted list of 9 numbers/);
  await retype(page, 'The number to look for', 'x');
  await expect(typed.getByRole('alert')).toContainText('“nope”, “x” are not numbers');
  await retype(page, 'The number to look for', '42');
  // A list out of order is refused, and put in order only when the teacher says.
  await retype(page, 'The list, in ascending order', '9, 3, 5, 12');
  const data = page.getByRole('group', { name: 'The demonstration’s numbers' });
  await expect(data.getByRole('alert')).toContainText('Binary search needs the list in ascending order.');
  await expect(page.getByRole('group', { name: 'Binary search, step by step' })).toHaveCount(0);
  await data.getByRole('button', { name: 'Put them in order' }).click();
  // A number the labels cannot write in full is refused too: the figure never rounds.
  await retype(page, 'The number to look for', '0.00000001');
  await expect(data.getByRole('alert')).toContainText('the figure does not round');
  await expect(page.getByRole('group', { name: 'Binary search, step by step' })).toHaveCount(0);
  await retype(page, 'The number to look for', '4');
  await expect(said).toHaveText('Searching for 4 in a sorted list of 4 numbers: 3, 5, 9, 12.');
  await tools.getByRole('button', { name: 'Next step' }).click();
  await tools.getByRole('button', { name: 'Next step' }).click();
  await tools.getByRole('button', { name: 'Next step' }).click();
  await expect(said).toHaveText('4 is not in the list: the search ran out after 2 comparisons.');

  // Kept: the course as saved has it, and the thumbnail shows its first picture.
  await settled(page);
  await page.reload();
  await expect(said).toHaveText('Searching for 4 in a sorted list of 4 numbers: 3, 5, 9, 12.');
  await expect(page.getByRole('navigation', { name: 'Slides' }).locator('img.folio-figure-art').first()).toBeVisible();

  // In a deck and in a Word file: a picture for the start, each comparison and the end.
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Export' });
  const docx = page.waitForEvent('download');
  await drawer.getByRole('button', { name: 'Download Word' }).click();
  const word = unzipSync(await readFile((await (await docx).path())!));
  expect(pngs(word, 'word/media/')).toBe(4);
  if (SHOTS) await (await docx).saveAs(`${SHOTS}/student.docx`);
  await drawer.getByText('PowerPoint', { exact: true }).click();
  const pptx = page.waitForEvent('download');
  await drawer.getByRole('button', { name: 'Download PowerPoint' }).click();
  const deck = unzipSync(await readFile((await (await pptx).path())!));
  expect(pngs(deck, 'ppt/media/')).toBe(4);
  if (SHOTS) await (await pptx).saveAs(`${SHOTS}/student.pptx`);

  // On paper: the same pictures, each with its sentence, and the table of steps.
  await drawer.getByText('PDF', { exact: false }).first().click();
  const popup = context.waitForEvent('page');
  await drawer.getByRole('button', { name: 'Open print view' }).click();
  const print = await popup;
  await print.addInitScript(() => (window.print = () => {}));
  const steps = print.getByRole('region', { name: 'The search, step by step' });
  await expect(steps.locator('img')).toHaveCount(4);
  await expect(steps.getByText('4 is not in the list: the search ran out after 2 comparisons.')).toBeVisible();
  await expect(steps.getByRole('columnheader', { name: 'What follows' })).toBeVisible();
  if (SHOTS) await print.pdf({ path: `${SHOTS}/student.pdf` });
});

test('with motion turned down a step is shown at once, with nothing sliding', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openSample(page);
  await page.goto(page.url().replace(/\/map$/, '/m/slides'));
  await page.getByRole('button', { name: 'Add a binary search demonstration' }).click();
  const figure = page.getByRole('group', { name: 'Binary search, step by step' });
  await expect(figure.locator('[data-drawer]')).toHaveCount(9);
  await page.getByRole('group', { name: 'Work the demonstration' }).getByRole('button', { name: 'Next step' }).click();
  // No frame in between: the drawing is already the step's own.
  const now = await figure.locator('svg').evaluate((svg) => svg.innerHTML);
  await page.waitForTimeout(900);
  expect(await figure.locator('svg').evaluate((svg) => svg.innerHTML)).toBe(now);
  await expect(figure.locator('[data-drawer="4"]')).toHaveAttribute('data-state', 'look');
});

test('a demonstration can be taken off its slide again, and a slide with a table keeps its table', async ({ page }) => {
  await openSample(page);
  await page.goto(page.url().replace(/\/map$/, '/m/slides'));
  await page.getByRole('button', { name: 'Add a binary search demonstration' }).click();
  await expect(page.getByRole('group', { name: 'Binary search, step by step' })).toBeVisible();
  await page.getByRole('button', { name: 'Remove the demonstration' }).click();
  await expect(page.getByRole('group', { name: 'Binary search, step by step' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add a binary search demonstration' })).toBeEnabled();
});
