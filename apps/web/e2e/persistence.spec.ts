import { expect, test } from './fixtures';
import { openSample } from './helpers';

test('an edit survives a reload straight after it, even one still being typed', async ({ page }) => {
  await openSample(page);
  await page.getByRole('link', { name: /Center and spread/ }).first().click();
  const title = page.getByRole('textbox', { name: 'Title of lesson 3' });
  await title.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('Measures of center');
  await title.blur();
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Title of lesson 3' })).toHaveText('Measures of center');

  // Still focused, never blurred: the page going away commits it.
  const again = page.getByRole('textbox', { name: 'Title of lesson 3' });
  await again.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('Measures of center and spread');
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Title of lesson 3' })).toHaveText('Measures of center and spread');
});

test('a second tab follows edits, and edits made at once in two tabs are never silently lost', async ({ page, context }) => {
  await openSample(page);
  const lessonUrl = await (async () => {
    await page.getByRole('link', { name: /Center and spread/ }).first().click();
    return page.url();
  })();
  const other = await context.newPage();
  await other.goto(lessonUrl);
  await expect(other.getByRole('textbox', { name: 'Title of lesson 3' })).toHaveText('Center and spread');

  // An idle tab quietly takes the other's saved change.
  const title = page.getByRole('textbox', { name: 'Title of lesson 3' });
  await title.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('Spread');
  await title.blur();
  await expect(other.getByRole('textbox', { name: 'Title of lesson 3' })).toHaveText('Spread');

  // Both tabs are mid-edit when the first save lands: one of them pauses and asks. Both edits are typed before
  // either is committed, so the overlap doesn't depend on how fast a busy machine runs each tab.
  const start = async (p: typeof page, name: string, text: string) => {
    await p.getByRole('textbox', { name }).click();
    await p.keyboard.press('ControlOrMeta+A');
    await p.keyboard.type(text);
  };
  await start(page, 'Title of lesson 3', 'From tab one');
  await start(other, 'Summary of lesson 3', 'From tab two');
  await Promise.all([page.getByRole('textbox', { name: 'Title of lesson 3' }).blur(), other.getByRole('textbox', { name: 'Summary of lesson 3' }).blur()]);
  const banners = [page, other].map((p) => p.getByRole('alert').filter({ hasText: 'changed in another tab' }));
  // On a busy machine one tab's save can land before the other commits: that tab then follows and adds its own
  // edit, with nothing to ask about. Either way, nothing typed is lost.
  const asked = async () => (await banners[0]!.count()) + (await banners[1]!.count());
  const bothKept = async (p: typeof page) =>
    (await p.getByRole('textbox', { name: 'Title of lesson 3' }).textContent()) === 'From tab one' && (await p.getByRole('textbox', { name: 'Summary of lesson 3' }).textContent()) === 'From tab two';
  await expect.poll(async () => (await asked()) === 1 || ((await bothKept(page)) && (await bothKept(other)))).toBe(true);
  if ((await asked()) === 0) {
    await page.reload();
    await expect.poll(() => bothKept(page)).toBe(true);
    return;
  }
  const paused = (await banners[0]!.count()) ? page : other;
  await paused.getByRole('button', { name: 'Keep this version' }).click();
  await expect(paused.getByRole('alert')).toHaveCount(0);
  await paused.reload();
  const kept = paused === page ? ['Title of lesson 3', 'From tab one'] : ['Summary of lesson 3', 'From tab two'];
  await expect(paused.getByRole('textbox', { name: kept[0]! })).toHaveText(kept[1]!);
});

test('a browser that blocks storage is told why nothing can be saved', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', {
      get() {
        throw new DOMException('The user denied permission to access the database.', 'SecurityError');
      },
    });
  });
  await page.goto('/');
  await expect(page.getByRole('alert').filter({ hasText: 'isn’t letting Folio save anything' })).toBeVisible();
  await page.goto('/settings');
  await expect(page.getByRole('alert').filter({ hasText: 'isn’t letting Folio save anything' })).toBeVisible();
});

test('a browser that keeps storage shows no such warning', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'What do you want to teach?' })).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.getByRole('alert').filter({ hasText: 'isn’t letting Folio save anything' })).toHaveCount(0);
});
