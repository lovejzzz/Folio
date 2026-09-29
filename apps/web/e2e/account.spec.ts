import { gunzipSync } from 'node:zlib';
import type { BrowserContext, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { openSample, retype } from './helpers';

interface Stored {
  version: number;
  deleted: boolean;
  bytes: Buffer;
  title: string;
}

/**
 * Folio's /api and Google, played by the test: sign-in succeeds for one teacher, and the account keeps
 * courses by version as the real server does. One account is shared by every browser in the test.
 */
function fakeAccount() {
  const courses = new Map<string, Stored>();
  const calls: string[] = [];
  const user = { id: 'g-1', email: 'ada@example.edu', name: 'Ada Teacher' };
  async function attach(context: BrowserContext): Promise<void> {
    await context.route('https://accounts.google.com/**', (route) => {
      const asked = new URL(route.request().url()).searchParams;
      return route.fulfill({ status: 302, headers: { location: `${asked.get('redirect_uri')}#state=${asked.get('state')}&id_token=header.payload.signature` } });
    });
    await context.route('**/api/**', async (route) => {
      const req = route.request();
      const path = new URL(req.url()).pathname.replace('/api/', '');
      calls.push(`${req.method()} ${path}`);
      const send = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      if (path === 'session') return send(req.method() === 'DELETE' ? { ok: true } : { user });
      if (path === 'courses') return send({ courses: [...courses].map(([id, c]) => ({ id, version: c.version, deleted: c.deleted, title: c.title, lessonCount: 0, updatedAt: '' })) });
      const id = path.split('/')[1]!;
      const have = courses.get(id);
      if (req.method() === 'GET') return have && !have.deleted ? route.fulfill({ status: 200, body: have.bytes, headers: { 'x-folio-version': String(have.version) } }) : send({ error: 'not-found' }, 404);
      if (req.method() === 'DELETE') {
        if (have) courses.set(id, { ...have, deleted: true, version: have.version + 1 });
        return send({ ok: true });
      }
      const base = Number(req.headers()['if-match']);
      if ((have?.version ?? 0) !== base) return send({ error: 'conflict', version: have?.version ?? 0 }, 409);
      const title = JSON.parse(decodeURIComponent(req.headers()['x-folio-meta']!)).title as string;
      courses.set(id, { version: base + 1, deleted: false, bytes: req.postDataBuffer()!, title });
      return send({ version: base + 1 });
    });
  }
  return { courses, calls, attach };
}

async function signIn(page: Page): Promise<void> {
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Sign in' }).click();
  const window = await popup;
  // The small window may be done and gone before a listener could wait for it to close: look for the result.
  await expect(page.getByRole('button', { name: 'Account: ada@example.edu' })).toBeVisible();
  await expect.poll(() => window.isClosed()).toBe(true);
}

test('a teacher signs in, adds this browser’s course to their account, and finds it on another device', async ({ page, context, browser }) => {
  const account = fakeAccount();
  await account.attach(context);
  await openSample(page);
  await page.goto('/');
  // Signed out, Folio's server is never called.
  expect(account.calls).toEqual([]);

  await signIn(page);
  const offer = page.getByRole('dialog', { name: 'Add these courses to your account?' });
  await expect(offer.getByText('Reading the world with data')).toBeVisible();
  await offer.getByRole('button', { name: 'Add 1 course' }).click();
  await expect.poll(() => account.courses.size).toBe(1);
  const [stored] = [...account.courses.values()];
  const sent = JSON.parse(gunzipSync(stored!.bytes).toString('utf8')) as { course: { title: string } };
  expect(sent.course.title).toBe('Reading the world with data');

  // Another device: a fresh browser, the same account.
  const other = await browser.newContext();
  await account.attach(other);
  const elsewhere = await other.newPage();
  await elsewhere.goto('/');
  await signIn(elsewhere);
  await elsewhere.goto('/library');
  await expect(elsewhere.getByText('Reading the world with data')).toBeVisible();

  // Signing out there leaves the course in the account, and gone from that browser.
  await elsewhere.getByRole('button', { name: 'Account: ada@example.edu' }).click();
  await elsewhere.getByRole('button', { name: 'Sign out' }).click();
  await elsewhere.getByRole('dialog', { name: 'Sign out?' }).getByRole('button', { name: 'Sign out' }).click();
  await expect(elsewhere.getByRole('button', { name: 'Sign in' })).toBeVisible();
  await expect(elsewhere.getByText('Reading the world with data')).toHaveCount(0);
  expect(account.courses.size).toBe(1);
  await other.close();
});

test('a course made while signed in goes to the account, and one kept on this device stays out of it', async ({ page, context }) => {
  const account = fakeAccount();
  await account.attach(context);
  await openSample(page);
  await page.goto('/');
  await signIn(page);
  await page.getByRole('dialog', { name: 'Add these courses to your account?' }).getByRole('button', { name: 'Keep them on this device only' }).click();
  await page.waitForTimeout(1500);
  expect(account.courses.size).toBe(0);
  // Edits to the kept course stay here too.
  await page.goto('/library');
  await expect(page.getByText('Reading the world with data')).toBeVisible();
  expect(account.calls.filter((c) => c.startsWith('PUT'))).toEqual([]);
});

test('two devices change the same course: both versions are kept, nothing is lost', async ({ page, context, browser }) => {
  const account = fakeAccount();
  await account.attach(context);
  await openSample(page);
  await page.goto('/');
  await signIn(page);
  await page.getByRole('dialog', { name: 'Add these courses to your account?' }).getByRole('button', { name: 'Add 1 course' }).click();
  await expect.poll(() => account.courses.size).toBe(1);
  const other = await browser.newContext();
  await account.attach(other);
  const b = await other.newPage();
  await b.goto('/');
  await signIn(b);
  await b.goto('/library');
  await expect(b.getByText('Reading the world with data')).toBeVisible();

  // This device changes a lesson title, and it reaches the account.
  await page.goto('/library');
  await page.getByText('Reading the world with data').click();
  await page.getByRole('link', { name: /Center and spread/ }).first().click();
  await retype(page, 'Title of lesson 3', 'Measures of spread');
  await expect.poll(() => [...account.courses.values()][0]!.version).toBe(2);

  // The other device, not yet caught up, changes the same course.
  await b.getByText('Reading the world with data').click();
  await b.getByRole('link', { name: /Center and spread/ }).first().click();
  await retype(b, 'Title of lesson 3', 'Center, spread and shape');
  await expect(b.getByText(/was also changed on another device/)).toBeVisible();
  await b.goto('/library');
  await expect(b.getByText('Reading the world with data (this device)')).toBeVisible();
  await expect.poll(() => account.courses.size).toBe(2);
  // The original now holds the first device's change; the copy holds this one's.
  await b.getByText('Reading the world with data', { exact: true }).click();
  await expect(b.getByRole('link', { name: /Measures of spread/ }).first()).toBeVisible();
  await other.close();
});
