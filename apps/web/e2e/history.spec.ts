import { expect, test } from './fixtures';
import { openSample, retype } from './helpers';

test('⌘Z undoes a material ticked off with its checkbox', async ({ page }) => {
  await openSample(page);
  await page.goto(page.url().replace(/\/map$/, '/plan'));
  const faq = page.getByRole('checkbox', { name: 'Course FAQ' });
  await expect(faq).toBeChecked();
  // Clicking the row puts focus on the checkbox itself: an <input>, but not one you type in.
  await page.locator('label').filter({ hasText: 'Course FAQ' }).click();
  await expect(faq).not.toBeChecked();
  await expect(faq).toBeFocused();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.getByText('Undone.')).toBeVisible();
  await expect(faq).toBeChecked();
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(faq).not.toBeChecked();
});

test('undo history survives a reload and a switch to another course', async ({ page }) => {
  await openSample(page);
  await page.getByRole('link', { name: /Centre and spread/ }).first().click();
  await retype(page, 'Title of lesson 3', 'Measures of centre');
  await retype(page, 'Summary of lesson 3', 'Mean, median and how spread out the data are.');
  await page.reload();

  await page.getByRole('button', { name: 'Changes', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Changes' });
  const renamed = drawer.getByRole('listitem').filter({ hasText: 'Renamed lesson 3' });
  await expect(renamed).toBeVisible();
  await expect(drawer.getByRole('listitem').filter({ hasText: 'Edited lesson 3' })).toBeVisible();
  await drawer.getByRole('button', { name: 'Close' }).click();

  // ⌘Z works on restored history, newest first.
  await page.getByRole('main').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.getByRole('textbox', { name: 'Summary of lesson 3' })).not.toHaveText('Mean, median and how spread out the data are.');

  // Away to the library and back into the course: still there.
  await page.goto('/library');
  await page.getByRole('link', { name: /Reading the world with data/ }).first().click();
  await page.getByRole('link', { name: /Measures of centre/ }).first().click();
  await page.getByRole('button', { name: 'Changes', exact: true }).click();
  await expect(renamed).toBeVisible();
  await renamed.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('textbox', { name: 'Title of lesson 3' })).toHaveText('Centre and spread');
});

test('an entry that can no longer be undone says why', async ({ page }) => {
  await openSample(page);
  await page.getByRole('link', { name: /Centre and spread/ }).first().click();
  await retype(page, 'Title of lesson 3', 'First try');
  await retype(page, 'Title of lesson 3', 'Second try');
  await page.getByRole('button', { name: 'Changes', exact: true }).click();
  const rows = page.getByRole('dialog', { name: 'Changes' }).getByRole('listitem').filter({ hasText: 'Renamed lesson 3' });
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0).getByRole('button', { name: 'Undo' })).toBeVisible();
  await expect(rows.nth(1).getByRole('button', { name: 'Undo' })).toHaveCount(0);
  await expect(rows.nth(1).getByText('Later changes touched this')).toBeVisible();
  await expect(rows.nth(0).getByText('Later changes touched this')).toHaveCount(0);
});
