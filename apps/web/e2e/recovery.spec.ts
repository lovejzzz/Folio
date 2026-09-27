import { expect, test } from './fixtures';
import { fakeAnthropic } from './fakeModel';
import { openSample, retype, withKey } from './helpers';
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
  await page.getByRole('button', { name: 'Write 2 lessons' }).click();
  await expect(page.getByText('The AI service didn’t accept the key. Check that it was copied in full.')).toBeVisible();
  await expect(page.getByText(/^Paused · \d+ parts left$/)).toBeVisible();

  await page.getByRole('button', { name: 'Fix the key' }).click();
  const dialog = page.getByRole('dialog', { name: 'Connect an AI' });
  await dialog.getByLabel('API key').fill('sk-ant-new');
  bad = false;
  await dialog.getByRole('button', { name: 'Connect and continue' }).click();
  await expect(page.getByText(/Course ready/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Couldn’t write')).toHaveCount(0);
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
  await page.getByRole('button', { name: 'Write 2 lessons' }).click();
  await expect(page.getByText('2 parts couldn’t be written.')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Couldn’t write')).toHaveCount(2);
  // Review lists what failed and why.
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  const changes = page.getByRole('dialog', { name: 'To do & history' });
  await expect(changes.getByRole('heading', { name: /Couldn’t write\W*2/ })).toBeVisible();
  await page.keyboard.press('Escape');
  fail = false;
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.getByText(/Course ready/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Couldn’t write')).toHaveCount(0);
  // The newer result replaced the failure toast rather than stacking under it.
  await expect(page.getByText('2 parts couldn’t be written.')).toHaveCount(0);
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

test('offline, the banner says what waits, and Update says you’re offline instead of failing', async ({ page, context }) => {
  await withKey(page);
  const model = await fakeAnthropic(page);
  await openSample(page);
  await page.getByRole('link', { name: /Picturing a distribution/ }).first().click();
  await retype(page, 'Objective 1 of lesson 2', 'Read a histogram and describe its shape');
  const quiz = page.locator('#m-quiz');
  await expect(quiz.getByText('Needs updating.')).toBeVisible();

  await context.setOffline(true);
  await expect(page.getByText('You’re offline. Reading and editing still work; writing and updates need a connection.')).toBeVisible();
  const calls = model.calls.length;
  await quiz.getByRole('button', { name: 'Update' }).click();
  await expect(page.getByText('You’re offline. Connect to the internet, then try again.')).toBeVisible();
  await expect(page.getByText(/couldn’t reach the model provider/)).toHaveCount(0);
  await expect(quiz.getByText('Needs updating.')).toBeVisible();
  expect(model.calls.length).toBe(calls);

  await context.setOffline(false);
  await quiz.getByRole('button', { name: 'Update' }).click();
  await expect(quiz.getByText('Needs updating.')).toHaveCount(0);
});

test('offline, Build keeps the plan open and says why; back online it builds', async ({ page, context }) => {
  await withKey(page);
  await fakeAnthropic(page);
  await planTwoLessons(page);
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Write 2 lessons' }).click();
  await expect(page.getByText('You’re offline. Connect to the internet, then try again.')).toBeVisible();
  await expect(page).toHaveURL(/\/plan$/);
  await expect(page.getByRole('textbox', { name: 'Title of lesson 1' })).toBeVisible();

  await context.setOffline(false);
  await page.getByRole('button', { name: 'Write 2 lessons' }).click();
  await expect(page.getByText(/Course ready/)).toBeVisible({ timeout: 30_000 });
});
