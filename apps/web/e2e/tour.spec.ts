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
  await page.getByRole('button', { name: /Write 4 lessons/ }).click();
  await page.waitForTimeout(1500);
  await shot(page, `${theme}-05-map-building`);
  await page.getByText(/Course ready/).waitFor({ timeout: 40_000 });
  await shot(page, `${theme}-06-map-ready`);
  await page.getByRole('button', { name: /^To do & history\b/ }).click();
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

test('tour, sample course', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Or open the sample course' }).click();
  await page.getByRole('grid').waitFor();
  const base = page.url().replace(/\/map$/, '');
  for (const kind of ['syllabus', 'map', 'quiz', 'plan', 'rubrics', 'discussions']) {
    await page.goto(`${base}/m/${kind}`);
    await shot(page, `sample-m-${kind}`);
  }
  await page.goto('/settings');
  await page.getByRole('radio', { name: 'Counts only' }).click();
  await page.goto(`${base}/map`);
  await shot(page, 'sample-map-compact');
  await page.goto('/settings');
  await page.getByRole('radio', { name: 'With a preview' }).click();
  await page.getByRole('radio', { name: '简体中文' }).click();
  await page.goto('/');
  await shot(page, 'zh-home');
  await page.goto(`${base}/map`);
  await shot(page, 'zh-map');
  await page.goto('/library');
  await shot(page, 'zh-library');
});

test('tour, phone', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto('/');
  await shot(page, 'phone-home');
  await page.getByRole('button', { name: 'Or open the sample course' }).click();
  await page.getByText('Open a lesson to review it.').waitFor();
  await shot(page, 'phone-map');
  await page.getByRole('link', { name: /Picturing a distribution/ }).click();
  await shot(page, 'phone-lesson');
  await page.getByRole('button', { name: /^To do & history\b/ }).click();
  await shot(page, 'phone-changes');
  await page.close();
});

test('tour, readme', async ({ browser }) => {
  const make = async (scheme: 'light' | 'dark') => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: scheme });
    return context.newPage();
  };
  const page = await make('light');
  await page.goto('/');
  await page.getByLabel('Describe your course').fill('A four-lesson introduction to statistics for grade 11. Real data from our school, lots of practice, one short quiz a lesson.');
  await shot(page, 'readme-home');
  await page.getByRole('button', { name: 'Or open the sample course' }).click();
  await page.getByRole('grid').waitFor();
  await shot(page, 'readme-map');
  const base = page.url().replace(/\/map$/, '');
  await page.getByRole('link', { name: /Picturing a distribution/ }).first().click();
  await page.locator('#m-plan').waitFor();
  await page.evaluate(() => window.scrollTo(0, 560));
  await shot(page, 'readme-lesson');
  await page.goto(`${base}/m/slides`);
  await shot(page, 'readme-slides');
  const dark = await make('dark');
  await dark.goto('/');
  await dark.getByRole('button', { name: 'Or open the sample course' }).click();
  await dark.getByRole('grid').waitFor();
  await dark.goto(dark.url().replace(/\/map$/, '/m/quiz'));
  await dark.getByRole('button', { name: /^Show (answer|why)$/ }).first().click();
  await shot(dark, 'readme-quiz-dark');
});
