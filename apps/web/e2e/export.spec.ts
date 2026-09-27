import { expect, test } from './fixtures';
import { unzipSync } from 'fflate';
import { readFile } from 'node:fs/promises';
import { openSample } from './helpers';

test('exports a Word file, a deck and a Folio backup that opens again', async ({ page }) => {
  await openSample(page);
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Export' });

  const docx = page.waitForEvent('download');
  await drawer.getByRole('button', { name: 'Download Word' }).click();
  // A copy for students is the default: the one with answers is always chosen.
  expect((await docx).suggestedFilename()).toBe('Reading the world with data — Course materials (Student copy).docx');

  await drawer.getByText('PowerPoint', { exact: true }).click();
  await drawer.getByRole('radio', { name: 'You (answers)' }).click();
  await expect(drawer.getByText('Don’t hand this out.', { exact: false })).toBeVisible();
  const pptx = page.waitForEvent('download');
  await drawer.getByRole('button', { name: 'Download PowerPoint' }).click();
  expect((await pptx).suggestedFilename()).toMatch(/Slide decks \(Teacher copy, with answers\)\.pptx$/);

  await drawer.getByText('Backup file', { exact: true }).click();
  const folio = page.waitForEvent('download');
  await drawer.getByRole('button', { name: 'Download the backup file' }).click();
  const file = await folio;
  const bytes = await readFile((await file.path())!);
  expect(bytes.subarray(0, 2).toString()).toBe('PK');

  // Open the backup from the library as a new copy of the course.
  await page.goto('/library');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open a backup file' }).click();
  await (await chooser).setFiles({ name: 'backup.folio', mimeType: 'application/zip', buffer: bytes });
  await expect(page.getByRole('grid', { name: 'Lessons and materials' })).toBeVisible();
});

test('opened from a lesson, Export starts with that lesson and names the file after it', async ({ page }) => {
  await openSample(page);
  await page.getByRole('link', { name: /Picturing a distribution/ }).first().click();
  // The drawer starts from the page it opens on: wait for the lesson before opening it.
  await page.getByRole('textbox', { name: 'Title of lesson 2' }).waitFor();
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Export' });
  await expect(drawer.getByRole('radio', { name: 'One lesson' })).toBeChecked();
  await expect(drawer.getByRole('combobox', { name: 'Lesson' }).locator('option:checked')).toHaveText('Lesson 2 · Picturing a distribution');
  const docx = page.waitForEvent('download');
  await drawer.getByRole('button', { name: 'Download Word' }).click();
  expect((await docx).suggestedFilename()).toBe('Reading the world with data — Lesson 2 · Picturing a distribution — Course materials (Student copy).docx');
});

test('the print view shows the student quiz without answers', async ({ page, context }) => {
  await openSample(page);
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Export' });
  await drawer.getByRole('radio', { name: 'Choose materials' }).click();
  for (const name of ['Objectives & assessment', 'Syllabus', 'Lesson plans', 'Slide decks', 'Assignments', 'Rubrics', 'Discussions', 'Study guides', 'Course FAQ']) {
    await drawer.locator('label').filter({ hasText: new RegExp(`^${name}$`) }).click();
  }
  await drawer.getByRole('radio', { name: 'Students' }).click();
  await drawer.getByText('PDF', { exact: true }).click();
  const popup = context.waitForEvent('page');
  await drawer.getByRole('button', { name: 'Open print view' }).click();
  const print = await popup;
  await print.addInitScript(() => (window.print = () => {}));
  await expect(print.getByRole('heading', { name: 'Quiz & exam bank' })).toBeVisible();
  await expect(print.getByText('Which of these is a statistical question?')).toBeVisible();
  await expect(print.getByText('Answer key')).toHaveCount(0);
});

test('a student copy never carries the Folio backup, and a backup file is always the teacher’s', async ({ page }) => {
  await openSample(page);
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Export' });
  await drawer.getByRole('radio', { name: 'Students' }).click();
  await drawer.getByText('Everything (ZIP)', { exact: true }).click();
  const zip = page.waitForEvent('download');
  await drawer.getByRole('button', { name: 'Download Everything (ZIP)' }).click();
  const names = Object.keys(unzipSync(await readFile((await (await zip).path())!)));
  expect(names.length).toBeGreaterThan(5);
  expect(names.filter((n) => n.endsWith('.folio'))).toEqual([]);

  await drawer.getByText('Backup file', { exact: true }).click();
  await expect(drawer.getByRole('radio', { name: 'Students' })).toHaveCount(0);
  await expect(drawer.getByText(/not for students/)).toBeVisible();
});

test('printing in dark mode still prints dark ink on white paper', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await openSample(page);
  const courseId = page.url().match(/\/c\/([^/]+)/)![1];
  await page.addInitScript(() => (window.print = () => {}));
  await page.goto(`/print/${courseId}?kinds=%5B%22quiz%22%5D&audience=%22student%22`);
  const heading = page.getByRole('heading', { name: 'Quiz & exam bank' });
  await expect(heading).toBeVisible();
  const luminance = () =>
    heading.evaluate((el) => {
      const [r, g, b] = getComputedStyle(el).color.match(/\d+/g)!.map(Number);
      return (0.2126 * r! + 0.7152 * g! + 0.0722 * b!) / 255;
    });
  // On screen the print view is paper too.
  expect(await luminance()).toBeLessThan(0.3);
  await page.emulateMedia({ colorScheme: 'dark', media: 'print' });
  expect(await luminance()).toBeLessThan(0.3);
  // Leaving it restores the teacher's theme.
  await page.goBack();
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor)).not.toBe('rgb(252, 251, 247)');
});

test('the print view opened on its own (a reload, a bookmark) prints the whole course', async ({ page }) => {
  await openSample(page);
  const courseId = page.url().match(/\/c\/([^/]+)/)![1];
  await page.addInitScript(() => (window.print = () => {}));
  await page.goto(`/print/${courseId}`);
  await expect(page.getByRole('heading', { name: 'Syllabus' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Course FAQ' })).toBeVisible();
});
