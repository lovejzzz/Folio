import { expect, test } from './fixtures';

test('on a phone the map is a list of lessons and the sheet fits the screen', async ({ page }) => {
  await page.goto('/');
  // On a phone the layout viewport grows to fit anything too wide, so compare with the device width.
  const width = page.viewportSize()!.width;
  const pageWidth = () => page.evaluate(() => document.documentElement.scrollWidth);
  expect(await pageWidth()).toBeLessThanOrEqual(width);
  await page.getByRole('button', { name: 'Or open the sample course' }).click();
  await expect(page.getByText('Open a lesson to review it.')).toBeVisible();
  await page.getByRole('link', { name: /Centre and spread/ }).click();
  await expect(page.getByRole('textbox', { name: 'Title of lesson 3' })).toBeVisible();
  await page.locator('#m-rubrics').scrollIntoViewIfNeeded();
  expect(await pageWidth()).toBeLessThanOrEqual(width);
  await page.getByRole('button', { name: 'Changes', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Changes' }).getByRole('button', { name: 'Close' })).toBeInViewport();
});

test('no screen is wider than a phone', async ({ page }) => {
  const width = page.viewportSize()!.width;
  await page.goto('/');
  await page.getByRole('button', { name: 'Or open the sample course' }).click();
  await expect(page.getByText('Open a lesson to review it.')).toBeVisible();
  const base = page.url().replace(/\/map$/, '');
  for (const path of ['/m/syllabus', '/m/map', '/m/plan', '/m/slides', '/m/quiz', '/m/assignments', '/m/rubrics', '/m/study', '/m/faq', '/m/discussions']) {
    await page.goto(base + path);
    await page.waitForTimeout(300);
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(w, path).toBeLessThanOrEqual(width);
  }
  for (const path of ['/library', '/settings']) {
    await page.goto(path);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), path).toBeLessThanOrEqual(width);
  }
});
