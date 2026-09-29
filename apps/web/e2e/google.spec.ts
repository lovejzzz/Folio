import type { BrowserContext } from '@playwright/test';
import { expect, test } from './fixtures';
import { openSample } from './helpers';

const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };

/** Google, played by the test: sign-in answers at once (or declines), and Drive keeps what it's given. */
async function fakeGoogle(context: BrowserContext, answer: 'allow' | 'decline'): Promise<{ uploads: string[] }> {
  const uploads: string[] = [];
  await context.route('https://accounts.google.com/**', (route) => {
    const asked = new URL(route.request().url()).searchParams;
    const reply = answer === 'allow' ? 'access_token=test-token&token_type=Bearer' : 'error=access_denied';
    return route.fulfill({ status: 302, headers: { location: `${asked.get('redirect_uri')}#state=${asked.get('state')}&${reply}` } });
  });
  await context.route('https://www.googleapis.com/upload/drive/v3/files**', (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    uploads.push(route.request().headers().authorization ?? '');
    return route.fulfill({ status: 200, headers: cors, json: { id: 'doc-1', webViewLink: 'https://docs.google.com/document/d/doc-1/edit' } });
  });
  await context.route('https://docs.google.com/**', (route) => route.fulfill({ contentType: 'text/html', body: '<title>The Google Doc</title>' }));
  return { uploads };
}

test('the Google Docs tab signs in, uploads the course and becomes the document', async ({ page, context }) => {
  const google = await fakeGoogle(context, 'allow');
  await openSample(page);
  const course = /\/c\/([^/]+)/.exec(page.url())![1]!;
  await page.goto(`/to-google?course=${course}`);
  await page.waitForURL('https://docs.google.com/document/d/doc-1/edit');
  expect(google.uploads).toEqual(['Bearer test-token']);
});

test('declining at Google says nothing was uploaded, and offers to try again', async ({ page, context }) => {
  const google = await fakeGoogle(context, 'decline');
  await openSample(page);
  const course = /\/c\/([^/]+)/.exec(page.url())![1]!;
  await page.goto(`/to-google?course=${course}`);
  await expect(page.getByRole('heading', { name: 'The Google Doc wasn’t made' })).toBeVisible();
  await expect(page.getByText('Google sign-in was canceled, so nothing was uploaded.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  // The address no longer carries Google's reply.
  expect(new URL(page.url()).hash).toBe('');
  expect(google.uploads).toEqual([]);
});
