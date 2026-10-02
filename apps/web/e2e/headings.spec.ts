import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { openSample } from './helpers';

/** The levels of the headings a screen reader lists, in order. */
const levels = (page: Page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6'))
      .filter((h) => (h as HTMLElement).offsetParent !== null)
      .map((h) => ({ level: Number(h.tagName[1]), text: (h.textContent ?? '').trim() })),
  );

test('every screen has one titled h1, and its headings never skip a level', async ({ page }) => {
  await openSample(page);
  const base = page.url().replace(/\/map$/, '');
  const paths = ['/map', '/m/syllabus', '/m/map', '/m/plan', '/m/slides', '/m/quiz', '/m/rubrics', '/m/faq', '/m/discussions', '/m/study', '/m/assignments'].map((p) => base + p);
  for (const path of [...paths, '/', '/library', '/settings', '/privacy', '/terms']) {
    await page.goto(path);
    await expect(page.locator('h1').first()).toBeVisible();
    const hs = await levels(page);
    expect(hs.filter((h) => h.level === 1), path).toHaveLength(1);
    expect(hs[0]!.text, path).not.toBe('');
    hs.forEach((h, i) => i > 0 && expect(h.level - hs[i - 1]!.level, `${path}: ${h.text}`).toBeLessThanOrEqual(1));
  }
  await page.goto(`${base}/map`);
  await page.getByRole('link', { name: /Asking questions with data/ }).first().click();
  await expect(page.getByRole('heading', { level: 2, name: 'Lesson plan' })).toBeVisible();
  const hs = await levels(page);
  hs.forEach((h, i) => i > 0 && expect(h.level - hs[i - 1]!.level, `lesson: ${h.text}`).toBeLessThanOrEqual(1));
});
