import { expect, test } from './fixtures';
import { fakeAnthropic } from './fakeModel';
import { withKey } from './helpers';

const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };

test('testing a connection with no key asks for the key, not for Settings', async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Paste a key first.' })).toBeVisible();
  await expect(page.getByText(/Add one in Settings/)).toHaveCount(0);
});

test('a provider becomes the one Folio uses only once it has a key', async ({ page }) => {
  await withKey(page);
  await page.goto('/settings');
  await page.getByRole('radio', { name: /Use my OpenAI key/ }).click({ force: true });
  await expect(page.getByText('Folio is still using your Claude key. It switches to this one once you’ve pasted a key.')).toBeVisible();
  // Coming back to Settings shows the provider still in use.
  await page.getByRole('link', { name: 'Library' }).click();
  await expect(page).toHaveURL(/\/library$/);
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('radio', { name: /Use my Claude key/ })).toBeChecked();

  await page.getByRole('radio', { name: /Use my OpenAI key/ }).click({ force: true });
  await page.getByLabel('API key').fill('sk-openai-test');
  await expect(page.getByText(/Folio is still using/)).toHaveCount(0);
  await page.getByRole('link', { name: 'Library' }).click();
  await expect(page).toHaveURL(/\/library$/);
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('radio', { name: /Use my OpenAI key/ })).toBeChecked();
});

test('an empty model field shows the default it will use', async ({ page }) => {
  await withKey(page);
  await page.goto('/settings');
  const model = page.getByRole('textbox', { name: 'Model' });
  await expect(model).toHaveValue('');
  await expect(model).toHaveAttribute('placeholder', 'claude-opus-5');
  await expect(page.getByText('Leave empty to use the default, claude-opus-5.')).toBeVisible();
  await model.fill('claude-fable-5-1');
  await model.fill('');
  await expect(model).toHaveAttribute('placeholder', 'claude-opus-5');
});

test('a local server that refuses the request is described as a local server', async ({ page }) => {
  await withKey(page);
  await page.route('http://localhost:11434/**', (route) =>
    route.request().method() === 'OPTIONS' ? route.fulfill({ status: 204, headers: cors }) : route.fulfill({ status: 401, headers: cors, body: 'Unauthorized' }),
  );
  await page.goto('/settings');
  await page.getByRole('radio', { name: /On this device/ }).click({ force: true });
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'The local server refused the request.' })).toBeVisible();
  await expect(page.getByText(/didn’t accept the key/)).toHaveCount(0);
  // Not connected, so Folio keeps using the Claude key.
  await expect(page.getByText('Folio is still using your Claude key. It switches to this one once the connection test passes.')).toBeVisible();
});

test('a local server that answers becomes the one Folio uses', async ({ page }) => {
  await withKey(page);
  await fakeAnthropic(page);
  await page.route('http://localhost:11434/**', (route) =>
    route.request().method() === 'OPTIONS'
      ? route.fulfill({ status: 204, headers: cors })
      : route.fulfill({ status: 200, headers: cors, json: { choices: [{ message: { content: '{"ok": true}' }, finish_reason: 'stop' }] } }),
  );
  await page.goto('/settings');
  await page.getByRole('radio', { name: /On this device/ }).click({ force: true });
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByText('Connected. Folio is ready to write.')).toBeVisible();
  await expect(page.getByText(/Folio is still using/)).toHaveCount(0);
});
