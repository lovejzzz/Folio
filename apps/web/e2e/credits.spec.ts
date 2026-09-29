import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { fakeAnthropic } from './fakeModel';

/** Folio's server for a signed-in teacher with credits: sign-in, the balance, and nothing else. */
async function fakeFolio(page: Page, balance: { value: number }) {
  await page.context().route('https://accounts.google.com/**', (route) => {
    const q = new URL(route.request().url()).searchParams;
    return route.fulfill({ status: 302, headers: { location: `${q.get('redirect_uri')}#state=${q.get('state')}&id_token=a.b.c` } });
  });
  let user: { id: string; email: string; name: string } | null = null;
  await page.context().route(/\/api\/(session|credits|courses)/, async (route) => {
    const path = new URL(route.request().url()).pathname;
    const send = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (path.endsWith('/session')) {
      if (route.request().method() === 'POST') user = { id: 'g-1', email: 'ada@example.edu', name: 'Ada Teacher' };
      return send({ user });
    }
    if (path.endsWith('/credits')) return send({ available: true, balance: balance.value, spent30: 0, added: [] });
    return send({ courses: [] });
  });
}

test('a teacher with no key signs in and writes with Folio credits', async ({ page }) => {
  const balance = { value: 750 };
  await fakeFolio(page, balance);
  const model = await fakeAnthropic(page, { viaFolio: true });
  await page.goto('/');
  await page.getByLabel('Describe your course').fill('Photosynthesis for year 7, two lessons');
  await page.getByRole('button', { name: 'Continue' }).click();

  // Folio credits come first, and need only a sign-in.
  const dialog = page.getByRole('dialog', { name: 'Connect an AI' });
  await expect(dialog.getByRole('radio', { name: /Use Folio credits/ })).toBeChecked();
  await expect(dialog.getByText(/New accounts get 750 free credits/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Sign in with Google' }).click();
  await expect(dialog.getByText('You have 750 credits.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Connect and continue' }).click();

  // The outline, and the estimate beside the balance.
  await page.getByRole('textbox', { name: 'Title of lesson 2' }).waitFor();
  await expect(page.getByText(/About \d+ credits; you have 750\./)).toBeVisible();
  await page.getByRole('radio', { name: 'Essentials' }).click();
  await page.getByRole('button', { name: 'Write 2 lessons' }).click();
  balance.value = 690;
  await expect(page.getByText(/Course ready/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/That used about \d+ credits?\./)).toBeVisible();
  // Every call went to Folio's server, none to Anthropic from the page, and no key was sent.
  expect(model.calls.length).toBeGreaterThan(3);
  await page.getByRole('button', { name: 'Account: ada@example.edu' }).click();
  await expect(page.getByText('690 credits')).toBeVisible();
});
