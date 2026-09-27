import { readFile } from 'node:fs/promises';
import { expect, test } from './fixtures';
import { fakeAnthropic } from './fakeModel';
import { openSample, retype, withKey } from './helpers';

test('opening a backup of a course that is already here adds a copy and changes nothing', async ({ page }) => {
  await openSample(page);
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Export' });
  await drawer.getByText('Folio file', { exact: true }).click();
  const download = page.waitForEvent('download');
  await drawer.getByRole('button', { name: 'Download Folio file' }).click();
  const bytes = await readFile((await (await download).path())!);
  await page.keyboard.press('Escape');

  await page.getByRole('link', { name: /Centre and spread/ }).first().click();
  await retype(page, 'Title of lesson 3', 'Renamed after the backup');
  await page.goto('/library');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open a Folio file' }).click();
  await (await chooser).setFiles({ name: 'backup.folio', mimeType: 'application/zip', buffer: bytes });
  await expect(page.getByRole('grid', { name: 'Lessons and materials' })).toBeVisible();
  await page.goto('/library');
  await expect(page.getByRole('link', { name: /Reading the world with data/ })).toHaveCount(2);

  // The original keeps its rename.
  await page.getByRole('link', { name: /^Reading the world with data/ }).filter({ hasNotText: '(copy)' }).first().click();
  await page.getByRole('link', { name: 'Lessons', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Lessons' }).getByText('Renamed after the backup')).toBeVisible();
});

test('a deleted course stays deleted, even after going Back to it', async ({ page }) => {
  await openSample(page);
  const url = page.url();
  await page.getByRole('link', { name: 'Home' }).first().click();
  await page.getByRole('link', { name: 'Library' }).click();
  await page.getByRole('button', { name: /Actions for Reading the world with data/ }).click();
  await page.getByRole('menuitem', { name: 'Delete course' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Course deleted.')).toBeVisible();
  await page.goBack();
  await page.goBack();
  await expect(page).toHaveURL(url);
  await expect(page.getByRole('grid')).toHaveCount(0);
  await page.goto('/library');
  await expect(page.getByRole('link', { name: /Reading the world with data/ })).toHaveCount(0);
});

test('opening another course during a build stops it, and says so', async ({ page }) => {
  await withKey(page);
  const model = await fakeAnthropic(page, { delayMs: 700 });
  await page.goto('/');
  await page.getByLabel('Describe your course').fill('Photosynthesis for year 7, three lessons');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Build 3 lessons' }).click();
  await expect(page.getByText(/Building lesson/)).toBeVisible();
  await page.getByRole('link', { name: 'Home' }).first().click();
  await page.getByRole('button', { name: 'Or open the sample course' }).click();
  await expect(page.getByText(/Building “How plants make food” stopped when another course was opened/)).toBeVisible();
  const calls = model.calls.length;
  await page.waitForTimeout(2000);
  expect(model.calls.length).toBe(calls);
  await expect(page.getByText(/Building lesson/)).toHaveCount(0);
});
