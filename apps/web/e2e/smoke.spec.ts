import { expect, test } from './fixtures';
import { openSample, retype } from './helpers';

/**
 * Safari's engine, which many teachers use: the paths every visit takes. The rest of the suite runs in Chromium;
 * this catches what only WebKit gets wrong (storage, downloads, popups, the CSP).
 */
test('the sample course opens, keeps an edit through a reload, exports and prints', async ({ page }) => {
  await openSample(page);
  await page.getByRole('link', { name: /Center and spread/ }).first().click();
  await retype(page, 'Title of lesson 3', 'Measures of center');
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Title of lesson 3' })).toHaveText('Measures of center');

  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Export' });
  const docx = page.waitForEvent('download');
  await drawer.getByRole('button', { name: 'Download Word' }).click();
  expect((await docx).suggestedFilename()).toMatch(/\.docx$/);

  const popup = page.waitForEvent('popup');
  await drawer.getByText('PDF', { exact: true }).click();
  await drawer.getByRole('button', { name: 'Open print view' }).click();
  const print = await popup;
  await print.addInitScript(() => (window.print = () => {}));
  await expect(print.getByRole('heading', { level: 1 }).first()).toBeVisible();
});
