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
  expect((await docx).suggestedFilename()).toBe('Reading the world with data — Course materials (Teacher copy).docx');

  await drawer.getByText('PowerPoint', { exact: true }).click();
  await drawer.getByRole('radio', { name: 'Student copy' }).click();
  const pptx = page.waitForEvent('download');
  await drawer.getByRole('button', { name: 'Download PowerPoint' }).click();
  expect((await pptx).suggestedFilename()).toMatch(/Slide decks \(Student copy\)\.pptx$/);

  await drawer.getByText('Folio file', { exact: true }).click();
  const folio = page.waitForEvent('download');
  await drawer.getByRole('button', { name: 'Download Folio file' }).click();
  const file = await folio;
  const bytes = await readFile((await file.path())!);
  expect(bytes.subarray(0, 2).toString()).toBe('PK');

  // Open the backup from the library as a new copy of the course.
  await page.goto('/library');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open a Folio file' }).click();
  await (await chooser).setFiles({ name: 'backup.folio', mimeType: 'application/zip', buffer: bytes });
  await expect(page.getByRole('grid', { name: 'Lessons and materials' })).toBeVisible();
});

test('the print view shows the student quiz without answers', async ({ page, context }) => {
  await openSample(page);
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Export' });
  await drawer.getByRole('radio', { name: 'Choose materials' }).click();
  for (const name of ['Course map', 'Syllabus', 'Lesson plans', 'Slide decks', 'Assignments', 'Rubrics', 'Discussions', 'Study guides', 'Course FAQ']) {
    await drawer.locator('label').filter({ hasText: new RegExp(`^${name}$`) }).click();
  }
  await drawer.getByRole('radio', { name: 'Student copy' }).click();
  await drawer.getByText('PDF', { exact: true }).click();
  const popup = context.waitForEvent('page');
  await drawer.getByRole('button', { name: 'Open print view' }).click();
  const print = await popup;
  await print.addInitScript(() => (window.print = () => {}));
  await expect(print.getByRole('heading', { name: 'Quiz & exam bank' })).toBeVisible();
  await expect(print.getByText('Which of these is a statistical question?')).toBeVisible();
  await expect(print.getByText('Answer key')).toHaveCount(0);
});

test('a student copy never carries the Folio backup, and a Folio file is always the teacher’s', async ({ page }) => {
  await openSample(page);
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Export' });
  await drawer.getByRole('radio', { name: 'Student copy' }).click();
  await drawer.getByText('Everything (ZIP)', { exact: true }).click();
  const zip = page.waitForEvent('download');
  await drawer.getByRole('button', { name: 'Download Everything (ZIP)' }).click();
  const names = Object.keys(unzipSync(await readFile((await (await zip).path())!)));
  expect(names.length).toBeGreaterThan(5);
  expect(names.filter((n) => n.endsWith('.folio'))).toEqual([]);

  await drawer.getByText('Folio file', { exact: true }).click();
  await expect(drawer.getByRole('radio', { name: 'Student copy' })).toHaveCount(0);
  await expect(drawer.getByText(/not for students/)).toBeVisible();
});
