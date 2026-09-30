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
  await page.context().route('**/api/billing/checkout', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ url: `https://checkout.stripe.com/c/pay/${(route.request().postDataJSON() as { pack: string }).pack}` }) }));
  await page.context().route('https://checkout.stripe.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Stripe Checkout</h1>' }));
  await page.context().route(/\/api\/(session|credits|courses)/, async (route) => {
    const path = new URL(route.request().url()).pathname;
    const send = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (path.endsWith('/session')) {
      if (route.request().method() === 'POST') user = { id: 'g-1', email: 'ada@example.edu', name: 'Ada Teacher' };
      return send({ user });
    }
    if (path.endsWith('/credits')) return send({ available: true, balance: balance.value, spent30: 0, added: [], packs: [{ id: 'p10', usd: 10, credits: 1000 }, { id: 'p25', usd: 25, credits: 2750 }, { id: 'p50', usd: 50, credits: 6000 }, { id: 'p100', usd: 100, credits: 13000 }] });
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
  await expect(dialog.getByText(/school email \(ending in \.edu\) and you get 750 free credits/)).toBeVisible();
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
  // Folio's mix: Sonnet writes the plans; GPT-6.1 Sol checks each at low effort; GPT-6 Luna writes the quizzes at high.
  const sent = (m: string) => model.calls.filter((c) => c.model === m) as { reasoning_effort?: string }[];
  expect(sent('gpt-6.1-sol').length).toBe(2);
  expect(sent('gpt-6.1-sol').every((c) => c.reasoning_effort === 'low')).toBe(true);
  expect(sent('gpt-6-luna').length).toBeGreaterThan(0);
  expect(sent('gpt-6-luna').every((c) => c.reasoning_effort === 'high')).toBe(true);
  expect(sent('claude-sonnet-5-5').length).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Account: ada@example.edu' }).click();
  await expect(page.getByText('690 credits')).toBeVisible();
});

test('a teacher buys more credits on Stripe’s page, and sees them when they come back', async ({ page }) => {
  const balance = { value: 12 };
  await fakeFolio(page, balance);
  await page.addInitScript(() => localStorage.setItem('folio.prefs', JSON.stringify({ state: { provider: 'folio', keys: {}, models: {}, theme: 'light', density: 'comfortable', railCollapsed: false, localUrl: '' }, version: 1 })));
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: 'Account: ada@example.edu' }).waitFor();
  // Beside Continue: 12 credits won't write four lessons, so the home page leads to the packs.
  await expect(page.getByText('Not enough credits')).toBeVisible();
  await page.getByRole('link', { name: 'Add credits' }).click();
  await expect(page).toHaveURL(/\/settings#credits$/);
  await expect(page.getByText('You have 12 credits.')).toBeVisible();
  // The more you add, the more bonus credits come with it.
  await expect(page.getByRole('button', { name: '$10 for 1,000 credits' })).toBeVisible();
  // The bonus is part of each pack's credits, not added on top.
  await expect(page.getByText('Includes 250 bonus')).toBeVisible();
  await expect(page.getByText('10% bonus')).toBeVisible();
  await expect(page.getByText('Includes 3,000 bonus')).toBeVisible();
  await expect(page.getByText('30% bonus')).toBeVisible();
  await expect(page.getByRole('button', { name: '$100 for 13,000 credits, including 3,000 bonus' })).toBeVisible();
  await page.getByRole('button', { name: '$25 for 2,750 credits, including 250 bonus' }).click();
  await expect(page.getByRole('heading', { name: 'Stripe Checkout' })).toBeVisible();
  expect(page.url()).toContain('/c/pay/p25');

  // Stripe sends the teacher back, and confirms the payment a moment later.
  balance.value = 2762;
  await page.goto('/settings?purchase=done');
  await expect(page.getByText(/Thank you\. Your credits are added/)).toBeVisible();
  await expect(page.getByText('You have 2,762 credits.')).toBeVisible();
  expect(page.url()).not.toContain('purchase=');
  await page.goto('/');
  await expect(page.getByText('2,762 credits left')).toBeVisible();
});

test('in Settings, a signed-in teacher switches from their own key to Folio credits in one click', async ({ page }) => {
  await fakeFolio(page, { value: 750 });
  await page.addInitScript(() => {
    if (!localStorage.getItem('folio.prefs'))
      localStorage.setItem('folio.prefs', JSON.stringify({ state: { provider: 'anthropic', keys: { anthropic: 'sk-ant-test' }, models: {}, theme: 'light', density: 'comfortable', railCollapsed: false, localUrl: '' }, version: 1 }));
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: 'Account: ada@example.edu' }).waitFor();
  await page.goto('/settings');
  await page.getByText('Use Folio credits').click();
  await expect(page.getByText('You have 750 credits.')).toBeVisible();
  // No key to test, and nothing else to press: credits are what Folio now writes with.
  await expect(page.getByRole('button', { name: 'Test connection' })).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('folio.prefs')!).state.provider)).toBe('folio');
});

test('the terms say credits aren’t refunded, and deleting an account warns that its credits end', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Terms' }).click();
  await expect(page.getByRole('heading', { name: 'Terms of Service' })).toBeVisible();
  await expect(page.getByText(/Folio credits are not refundable, including credits you haven’t used/)).toBeVisible();
  await expect(page.getByText(/Any credits left in the account end with it/)).toBeVisible();

  await fakeFolio(page, { value: 640 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: 'Account: ada@example.edu' }).waitFor();
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Delete my account and courses' }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete your account?' });
  await expect(dialog.getByText('This account still has 640 Folio credits. Deleting it ends them: they can’t be restored or refunded.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
});
