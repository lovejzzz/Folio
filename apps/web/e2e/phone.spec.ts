import { expect, test } from '@playwright/test';

test('on a phone the map is a list of lessons and the sheet fits the screen', async ({ page }) => {
  await page.goto('/');
  let overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.getByRole('button', { name: 'Or open the sample course' }).click();
  await expect(page.getByText('Open a lesson to review it.')).toBeVisible();
  await page.getByRole('link', { name: /Centre and spread/ }).click();
  await expect(page.getByRole('textbox', { name: 'Title of lesson 3' })).toBeVisible();
  overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
