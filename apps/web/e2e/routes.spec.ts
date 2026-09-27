import { expect, test } from './fixtures';
import { openSample } from './helpers';

async function sampleId(page: import('@playwright/test').Page): Promise<string> {
  await openSample(page);
  return new URL(page.url()).pathname.split('/')[2]!;
}

test('an unknown material says so inside the course, with the way back to the map', async ({ page }) => {
  const id = await sampleId(page);
  await page.goto(`/c/${id}/m/bogus`);
  await expect(page.getByRole('heading', { level: 1, name: 'No such material' })).toBeVisible();
  await expect(page.getByText('This course isn’t on this device.')).toHaveCount(0);
  await expect(page).toHaveTitle('No such material · Folio');
  // The course header is there once: no second header from a standalone page.
  await expect(page.getByRole('banner')).toHaveCount(1);
  await expect(page.getByRole('banner').getByRole('link', { name: 'Reading the world with data' })).toBeVisible();
  await page.getByRole('link', { name: 'Open the overview' }).click();
  await expect(page.getByRole('grid', { name: 'Lessons and materials' })).toBeVisible();
});

test('an unknown lesson says so inside the course, without a second header', async ({ page }) => {
  const id = await sampleId(page);
  await page.goto(`/c/${id}/lesson/l_nope`);
  await expect(page.getByRole('heading', { level: 1, name: 'This lesson isn’t in this course' })).toBeVisible();
  await expect(page.getByText('This course isn’t on this device.')).toHaveCount(0);
  await expect(page.getByRole('banner')).toHaveCount(1);
  await expect(page.getByRole('main')).toHaveCount(1);
  await expect(page).toHaveTitle('This lesson isn’t in this course · Folio');
  await page.getByRole('link', { name: 'Open the overview' }).click();
  await expect(page.getByRole('grid', { name: 'Lessons and materials' })).toBeVisible();
});

test('an unknown address gets a styled page with a link home', async ({ page }) => {
  await page.goto('/nowhere/at/all');
  await expect(page.getByRole('heading', { level: 1, name: 'There’s no page here' })).toBeVisible();
  await expect(page.getByText('Not Found', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Library' })).toBeVisible();
  await expect(page).toHaveTitle('There’s no page here · Folio');
  await page.getByRole('link', { name: 'Go to the home page' }).click();
  await expect(page.getByLabel('Describe your course')).toBeVisible();
});

test('an unknown address inside a course keeps the course header; a missing course gets its own page', async ({ page }) => {
  const id = await sampleId(page);
  await page.goto(`/c/${id}/nowhere`);
  await expect(page.getByRole('heading', { level: 1, name: 'There’s no page here' })).toBeVisible();
  await expect(page.getByRole('banner')).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Open the overview' })).toBeVisible();

  await page.goto('/c/c_missing/map');
  await expect(page.getByRole('heading', { level: 1, name: 'This course isn’t on this device.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Library' }).first()).toBeVisible();
});

test('the not-found pages are in Chinese when the interface is', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('folio.prefs', JSON.stringify({ state: { uiLanguage: 'zh-CN' }, version: 1 }));
  });
  await page.goto('/nowhere');
  await expect(page.getByRole('heading', { level: 1, name: '这里没有页面' })).toBeVisible();
  await expect(page.getByRole('link', { name: '回到首页' })).toBeVisible();
});
