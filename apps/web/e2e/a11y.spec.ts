import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { openSample } from './helpers';

async function audit(page: Page, label: string) {
  // Measure contrast on settled text: a fixed wait let a busy machine measure cards still fading in.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getComputedTiming().iterations === Infinity));
  await page.waitForTimeout(100);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const summary = results.violations.map((v) => `${label}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target.join(' ')}`);
  expect(summary).toEqual([]);
}

for (const scheme of ['light', 'dark'] as const) {
  test(`every main screen passes axe (${scheme})`, async ({ page }) => {
    // Nine screens, each audited in full.
    test.setTimeout(150_000);
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
