import { unzipSync } from 'fflate';
import { readFile } from 'node:fs/promises';
import { expect, test } from './fixtures';
import { fakeAnthropic } from './fakeModel';
import { openSample, withKey } from './helpers';

test('a slide drawn as a picture in the drawing frame, shown, and taken off again', async ({ page }) => {
  await withKey(page);
  const { calls } = await fakeAnthropic(page);
  await openSample(page);
  await page.goto(page.url().replace(/\/map$/, '/m/slides'));
  const tools = page.getByRole('group', { name: 'Draw this slide' });
  await tools.getByRole('textbox', { name: 'What to draw, if you have an idea (optional)' }).fill('as jars');
  await tools.getByRole('button', { name: 'Draw this slide' }).click();
  // Drawn in the frame and shown as a picture, with its parts' words as its alt text.
  // The slide's own picture, not the filmstrip's small copy of it.
  const picture = page.getByRole('img', { name: 'two jars; first jar; second jar' }).last();
  await expect(picture).toBeVisible({ timeout: 20_000 });
  expect(await picture.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  // Looked at once, as a picture.
  expect(calls.some((c) => c.messages[0]!.content.includes('Above is a card drawn for this slide'))).toBe(true);
  // The teacher's idea went to the call that chose how to draw it.
  expect(calls.some((c) => c.messages[0]!.content.includes('The teacher asks: "as jars"'))).toBe(true);
  // In a deck, the same picture, painted.
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Export' });
  await drawer.getByText('PowerPoint', { exact: true }).click();
  const pptx = page.waitForEvent('download');
  await drawer.getByRole('button', { name: 'Download PowerPoint' }).click();
  const files = unzipSync(await readFile((await (await pptx).path())!));
  const pngs = Object.entries(files).filter(([name, bytes]) => /^ppt\/media\/.+\.png$/.test(name) && bytes.length > 20_000);
  expect(pngs.length).toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  // Its own tools; taken off, the slide is as it was.
  await page.getByRole('button', { name: 'Remove the picture' }).click();
  await expect(page.getByRole('img', { name: 'two jars; first jar; second jar' })).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Draw this slide' })).toBeVisible();
});

test('drawing slides while a lesson is written is off until it is turned on, and its tooltip shows what it makes', async ({ page }) => {
  await page.goto('/settings');
  const toggle = page.getByRole('switch', { name: 'Draw pictures for slides' });
  await expect(toggle).not.toBeChecked();
  await page.getByRole('button', { name: 'What does this do?' }).focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  const tip = page.getByRole('tooltip');
  await expect(tip.getByRole('img', { name: /three life cycles/ })).toBeVisible();
  expect(await tip.getByRole('img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
});
