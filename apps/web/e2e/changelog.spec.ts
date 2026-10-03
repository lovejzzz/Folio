import { expect, test } from './fixtures';
import { VERSION } from '../src/version';

test('About shows the version, which opens the changelog with its pictures', async ({ page }) => {
  await page.goto('/about');
  await page.getByRole('link', { name: /What’s new/ }).click();
  await expect(page).toHaveURL(/\/changelog$/);
  await expect(page.getByRole('heading', { level: 1, name: 'What’s new in Folio' })).toBeVisible();
  await expect(page.getByText(`v${VERSION}`, { exact: true }).first()).toBeVisible();
  const first = page.locator('article img').first();
  await first.scrollIntoViewIfNeeded();
  await expect.poll(() => first.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
});
