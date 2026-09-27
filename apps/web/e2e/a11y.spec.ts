import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { openSample } from './helpers';

async function audit(page: Page, label: string) {
  // Let the 120 ms reduced-motion fades finish so contrast is measured on settled text.
  await page.waitForTimeout(400);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const summary = results.violations.map((v) => `${label}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target.join(' ')}`);
  expect(summary).toEqual([]);
}

for (const scheme of ['light', 'dark'] as const) {
  test(`every main screen passes axe (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await page.goto('/');
    await audit(page, 'home');
    await openSample(page);
    await audit(page, 'map');
    await page.getByRole('link', { name: /Picturing a distribution/ }).first().click();
    await page.locator('#m-quiz').waitFor();
    await audit(page, 'lesson');
    await page.getByRole('button', { name: /To do & history/ }).click();
    await audit(page, 'changes');
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await audit(page, 'export');
    await page.goto(page.url().replace(/lesson\/.*/, 'm/quiz'));
    await page.getByRole('heading', { name: 'Quiz & exam bank' }).waitFor();
    await audit(page, 'quiz bank');
    await page.goto(page.url().replace(/m\/quiz/, 'm/slides'));
    await audit(page, 'slides');
    await page.goto('/library');
    await audit(page, 'library');
    await page.goto('/settings');
    await audit(page, 'settings');
  });
}
