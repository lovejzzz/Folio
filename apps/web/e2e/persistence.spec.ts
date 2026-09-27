import { expect, test } from './fixtures';
import { openSample } from './helpers';

test('an edit survives a reload straight after it, even one still being typed', async ({ page }) => {
  await openSample(page);
  await page.getByRole('link', { name: /Centre and spread/ }).first().click();
  const title = page.getByRole('textbox', { name: 'Title of lesson 3' });
  await title.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('Measures of centre');
  await title.blur();
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Title of lesson 3' })).toHaveText('Measures of centre');

  // Still focused, never blurred: the page going away commits it.
  const again = page.getByRole('textbox', { name: 'Title of lesson 3' });
  await again.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('Measures of centre and spread');
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Title of lesson 3' })).toHaveText('Measures of centre and spread');
});

test('a second tab follows edits, and edits made at once in two tabs are never silently lost', async ({ page, context }) => {
  await openSample(page);
  const lessonUrl = await (async () => {
    await page.getByRole('link', { name: /Centre and spread/ }).first().click();
    return page.url();
  })();
  const other = await context.newPage();
  await other.goto(lessonUrl);
  await expect(other.getByRole('textbox', { name: 'Title of lesson 3' })).toHaveText('Centre and spread');

  // An idle tab quietly takes the other's saved change.
  const title = page.getByRole('textbox', { name: 'Title of lesson 3' });
  await title.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('Spread');
  await title.blur();
  await expect(other.getByRole('textbox', { name: 'Title of lesson 3' })).toHaveText('Spread');

  // Both tabs edit before either save lands: one of them pauses and asks.
  const edit = async (p: typeof page, name: string, text: string) => {
    const field = p.getByRole('textbox', { name });
    await field.click();
    await p.keyboard.press('ControlOrMeta+A');
    await p.keyboard.type(text);
    await field.blur();
  };
  await Promise.all([edit(page, 'Title of lesson 3', 'From tab one'), edit(other, 'Summary of lesson 3', 'From tab two')]);
  const banners = [page, other].map((p) => p.getByRole('alert').filter({ hasText: 'changed in another tab' }));
  await expect.poll(async () => (await banners[0]!.count()) + (await banners[1]!.count())).toBe(1);
  const paused = (await banners[0]!.count()) ? page : other;
  await paused.getByRole('button', { name: 'Keep this version' }).click();
  await expect(paused.getByRole('alert')).toHaveCount(0);
  await paused.reload();
  const kept = paused === page ? ['Title of lesson 3', 'From tab one'] : ['Summary of lesson 3', 'From tab two'];
  await expect(paused.getByRole('textbox', { name: kept[0]! })).toHaveText(kept[1]!);
});
