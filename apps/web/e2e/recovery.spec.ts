import { expect, test } from './fixtures';
import { fakeAnthropic } from './fakeModel';
import { withKey } from './helpers';
import type { Page } from '@playwright/test';

const cors = { 'access-control-allow-origin': '*' };

async function planTwoLessons(page: Page) {
  await page.goto('/');
  await page.getByLabel('Describe your course').fill('Photosynthesis for year 7, two lessons');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('textbox', { name: 'Title of lesson 1' }).waitFor();
}

test('a key that stops working mid-build is fixed from the toast, and the build carries on', async ({ page }) => {
  await withKey(page);
  await fakeAnthropic(page);
  let bad = false;
  await page.route('https://api.anthropic.com/**', (route) =>
    bad ? route.fulfill({ status: 401, headers: cors, json: { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } } }) : route.fallback(),
  );
  await planTwoLessons(page);
  bad = true;
  await page.getByRole('button', { name: 'Build 2 lessons' }).click();
  await expect(page.getByText('The model provider didn’t accept the key. Check it in Settings.')).toBeVisible();
  await expect(page.getByText(/^Paused · \d+ sections left$/)).toBeVisible();

  await page.getByRole('button', { name: 'Fix the key' }).click();
  const dialog = page.getByRole('dialog', { name: 'Connect a model' });
  await dialog.getByLabel('API key').fill('sk-ant-new');
  bad = false;
  await dialog.getByRole('button', { name: 'Connect and continue' }).click();
  await expect(page.getByText(/Course ready/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Couldn’t build')).toHaveCount(0);
});

test('sections that failed on a server error are rebuilt by Resume', async ({ page }) => {
  await withKey(page);
  await fakeAnthropic(page);
  let fail = true;
  await page.route('https://api.anthropic.com/**', (route) =>
    fail && (route.request().postData() ?? '').includes('Write a slide deck')
      ? route.fulfill({ status: 500, headers: cors, json: { type: 'error', error: { type: 'api_error', message: 'Internal' } } })
      : route.fallback(),
  );
  await planTwoLessons(page);
  await page.getByRole('button', { name: 'Build 2 lessons' }).click();
  await expect(page.getByText('2 sections could not be built.')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Couldn’t build')).toHaveCount(2);
  fail = false;
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.getByText(/Course ready/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Couldn’t build')).toHaveCount(0);
  // The newer result replaced the failure toast rather than stacking under it.
  await expect(page.getByText('2 sections could not be built.')).toHaveCount(0);
});

test('an outline that could not be drafted offline is drafted on Try again', async ({ page }) => {
  await withKey(page);
  await fakeAnthropic(page);
  let down = true;
  await page.route('https://api.anthropic.com/**', (route) => (down ? route.abort('internetdisconnected') : route.fallback()));
  await page.goto('/');
  await page.getByLabel('Describe your course').fill('Photosynthesis for year 7, two lessons');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('The outline could not be drafted.')).toBeVisible({ timeout: 30_000 });
  down = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('textbox', { name: 'Title of lesson 1' })).toBeVisible();
});
