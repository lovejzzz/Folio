import { expect, test } from './fixtures';

test.use({ viewport: { width: 390, height: 844 } });

/**
 * On a phone: the film of Folio, offered on the home page under the examples, the card inside the screen once scrolled to. Nothing is asked of YouTube until the card is
 * pressed; then its player opens in a dialog, from the address the site's policy lets in, and closes again.
 */
test('on a phone the tour card asks nothing of YouTube until pressed, then plays in a dialog that closes', async ({ page }) => {
  const asked: string[] = [];
  await page.route(/youtube/, (route) => { asked.push(route.request().url()); return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>player</title><p>player</p>' }); });
  page.on('request', (r) => { if (/youtube|ytimg|googlevideo/.test(r.url())) asked.push(r.url()); });
  await page.goto('/');
  const card = page.getByRole('button', { name: /See Folio make three courses/ });
  await expect(card).toBeVisible();
  // The card stands under the examples and the sample link, inside the screen's width.
  const box = (await card.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  const sample = (await page.getByRole('button', { name: 'Or open a sample course' }).boundingBox())!;
  expect(box.y).toBeGreaterThan(sample.y);
  await page.waitForTimeout(500);
  expect(asked).toEqual([]);
  if (process.env.FOLIO_SHOT_DIR) await page.screenshot({ path: `${process.env.FOLIO_SHOT_DIR}/tour-home-${test.info().project.name}.png`, fullPage: true });
  await card.click();
  const dialog = page.getByRole('dialog', { name: 'Folio in two minutes' });
  await expect(dialog).toBeVisible();
  const player = dialog.locator('iframe');
  await expect(player).toHaveAttribute('src', /^https:\/\/www\.youtube-nocookie\.com\/embed\/nvdMP4tHG0I\?autoplay=1/);
  await expect(player).toHaveAttribute('title', 'Folio in two minutes');
  await expect.poll(() => asked.length).toBeGreaterThan(0);
  expect(asked.every((u) => u.startsWith('https://www.youtube-nocookie.com/'))).toBe(true);
  // The player fits the screen, at 16:9.
  const frame = (await player.boundingBox())!;
  expect(frame.x + frame.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(Math.abs(frame.width / frame.height - 16 / 9)).toBeLessThan(0.05);
  if (process.env.FOLIO_SHOT_DIR) await page.screenshot({ path: `${process.env.FOLIO_SHOT_DIR}/tour-open-${test.info().project.name}.png` });
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toHaveCount(0);
  await card.click();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('iframe')).toHaveCount(0);
});
