import { test, type Page } from '@playwright/test';
import { fakeAnthropic } from './fakeModel';

/**
 * A screenshot tour of every screen for design review. Runs only when
 * FOLIO_TOUR is set to an output directory.
 */
const out = process.env.FOLIO_TOUR;
test.skip(!out, 'Set FOLIO_TOUR=<dir> to take the design-review tour.');

async function shot(page: Page, name: string) {
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${out}/${name}.png` });
}

async function tour(page: Page, theme: string) {
  await fakeAnthropic(page, { delayMs: 400 });
  await page.goto('/');
  await shot(page, `${theme}-01-home`);
  await page.getByLabel('Describe your course').fill('Photosynthesis for year 7, four lessons');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('dialog').getByLabel('API key').fill('sk-ant-test');
  await shot(page, `${theme}-02-connect`);
  await page.getByRole('button', { name: 'Connect and continue' }).click();
  await page.getByText('Drafting an outline').waitFor();
  await shot(page, `${theme}-03-drafting`);
  await page.getByRole('textbox', { name: 'Title of lesson 1' }).waitFor();
  await shot(page, `${theme}-04-plan`);
  await page.getByRole('button', { name: /Build 4 lessons/ }).click();
  await page.waitForTimeout(1500);
  await shot(page, `${theme}-05-map-building`);
  await page.getByText(/Course ready/).waitFor({ timeout: 40_000 });
  await shot(page, `${theme}-06-map-ready`);
  await page.getByRole('button', { name: 'Changes', exact: true }).click();
  await shot(page, `${theme}-07-changes`);
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await shot(page, `${theme}-08-export`);
  await page.keyboard.press('Escape');
  await page.getByRole('link', { name: /Light and leaves/ }).first().click();
  await shot(page, `${theme}-09-lesson`);
  await page.keyboard.press('ControlOrMeta+k');
  await page.keyboard.type('make every quiz three questions');
  await shot(page, `${theme}-10-command`);
  await page.keyboard.press('Escape');
  await page.goto('/library');
  await shot(page, `${theme}-11-library`);
  await page.goto('/settings');
  await shot(page, `${theme}-12-settings`);
}

test('tour, light', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await tour(page, 'light');
});

test('tour, dark', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await tour(page, 'dark');
});
