import { expect, test } from './fixtures';
import { fakeAnthropic } from './fakeModel';
import { withKey } from './helpers';

const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };

test('testing a connection with no key asks for the key, not for Settings', async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('radio', { name: /Use my Claude key/ }).click({ force: true });
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Paste a key first.' })).toBeVisible();
  await expect(page.getByText(/Add one in Settings/)).toHaveCount(0);
});

test('a new visitor starts on Folio credits, and a teacher who chooses their own key keeps it', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByRole('radio', { name: /Use Folio credits/ })).toBeChecked();
  await page.getByRole('radio', { name: /Use my Claude key/ }).click({ force: true });
  await page.getByLabel('API key').fill('sk-ant-test');
  await page.reload();
  await expect(page.getByRole('radio', { name: /Use my Claude key/ })).toBeChecked();
  await expect(page.getByLabel('API key')).toHaveValue('sk-ant-test');
  // Writing with their own key, the home page shows no credits.
  await page.goto('/');
  await expect(page.getByText(/credits left|Not enough credits/)).toHaveCount(0);
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

test('the model list comes from the provider, with Folio’s default picked', async ({ page }) => {
  await withKey(page);
  await page.route('https://api.anthropic.com/v1/models**', (route) =>
    route.request().method() === 'OPTIONS'
      ? route.fulfill({ status: 204, headers: { ...cors, 'access-control-allow-methods': 'GET, OPTIONS' } })
      : route.fulfill({
          status: 200,
          headers: cors,
          json: { data: [{ id: 'claude-fable-5-1', display_name: 'Claude Fable 5.1' }, { id: 'claude-sonnet-5-5', display_name: 'Claude Sonnet 5.5' }] },
        }),
  );
  await page.goto('/settings');
  const model = page.getByRole('combobox', { name: 'Model' });
  await expect(model).toBeEnabled();
  await expect(model).toHaveValue('claude-sonnet-5-5');
  await expect(model.getByRole('option')).toHaveText(['Claude Fable 5.1', 'Claude Sonnet 5.5 (recommended)']);
  await model.selectOption('claude-fable-5-1');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('folio.prefs')!).state.models.anthropic)).toBe('claude-fable-5-1');
  // Choosing the default again stores nothing, so Folio's default can move on later.
  await model.selectOption('claude-sonnet-5-5');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('folio.prefs')!).state.models.anthropic)).toBe('');
});

test('when the model list can’t be loaded, the model can still be typed', async ({ page }) => {
  await withKey(page);
  await page.route('https://api.anthropic.com/v1/models**', (route) => route.fulfill({ status: 401, headers: cors, body: '{}' }));
  await page.goto('/settings');
  const model = page.getByRole('textbox', { name: 'Model' });
  await expect(model).toHaveAttribute('placeholder', 'claude-sonnet-5-5');
  await expect(page.getByText('Couldn’t load the model list. Type a model name, or leave it empty for claude-sonnet-5-5.')).toBeVisible();
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
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page).toHaveURL(/\/$/);
});
