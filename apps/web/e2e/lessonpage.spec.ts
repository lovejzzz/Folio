import { expect, test } from './fixtures';
import { openSample } from './helpers';

test('a lesson is opened and left in a browser whose scrolling gives back a promise', async ({ page }) => {
  // Newer browsers return a promise from scrollTo. The lesson page returned it from an effect, React took it for the clean-up,
  // and leaving the lesson put "Something went wrong" over the whole page.
  await page.addInitScript(() => {
    const scroll = window.scrollTo.bind(window) as (...args: unknown[]) => void;
    window.scrollTo = ((...args: unknown[]) => (scroll(...args), Promise.resolve())) as typeof window.scrollTo;
  });
  await openSample(page);
  await page.getByRole('link', { name: 'Lessons', exact: true }).click();
  await expect(page).toHaveURL(/\/lesson\//);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.getByRole('link', { name: 'Overview', exact: true }).click();
  await expect(page.getByRole('grid', { name: 'Lessons and materials' })).toBeVisible();
  await expect(page.getByText(/Something went wrong/)).toHaveCount(0);
});
