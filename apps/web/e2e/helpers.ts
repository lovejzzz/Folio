import { sampleCourse } from '@folio/core/sample';
import { expect, type Page } from '@playwright/test';

/** The statistics course the tests are written against, served in place of whichever sample is chosen. */
const STATISTICS = JSON.stringify(sampleCourse());

/** Choose a sample course from the home page or the connect dialog, as a teacher would. */
export async function chooseSample(page: Page): Promise<void> {
  await page.route('**/samples/*.json', (route) => route.fulfill({ contentType: 'application/json', body: STATISTICS }));
  await page.getByRole('button', { name: 'Or open a sample course' }).click();
  await page.getByRole('dialog', { name: 'Open a sample course' }).getByRole('button', { name: /^Introduction to ethics/ }).click();
}

/** Open the sample course and wait for its map. */
export async function openSample(page: Page): Promise<void> {
  await page.goto('/');
  await chooseSample(page);
  await expect(page.getByRole('grid', { name: 'Lessons and materials' })).toBeVisible();
}

/** Pretend a Claude key has been saved, without going through the dialog. */
export async function withKey(page: Page, models: Record<string, string> = {}): Promise<void> {
  await page.addInitScript((models) => {
    // Only the page itself: the frame that runs course code has no storage to set, and says so loudly.
    if (window !== window.top) return;
    localStorage.setItem('folio.prefs', JSON.stringify({ state: { provider: 'anthropic', keys: { anthropic: 'sk-ant-test' }, models, theme: 'system', density: 'comfortable', railCollapsed: false, localUrl: 'http://localhost:11434/v1' }, version: 1 }));
  }, models);
}

/** Replace the text of an inline editable field and commit it. */
export async function retype(page: Page, name: string | RegExp, text: string): Promise<void> {
  const field = page.getByRole('textbox', { name }).first();
  await field.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type(text);
  await field.blur();
}

/** What is on screen once nothing on it is still moving: contrast is measured on that, not on a fade half done. */
export async function settled(page: Page): Promise<void> {
  // Measure contrast on settled text: a fixed wait let a busy machine measure cards still fading in.
  await page.evaluate(() => document.fonts.ready);
  // Still for a while, not for an instant: on a slow runner a fade could start just after one quiet check (CI measured a
  // card mid-fade on the home page one run and a toolbar on the slides the next).
  await page.evaluate(async () => {
    const quiet = () => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getComputedTiming().iterations === Infinity);
    for (let still = 0, tries = 0; still < 4 && tries < 100; tries++) {
      still = quiet() ? still + 1 : 0;
      await new Promise((r) => setTimeout(r, 100));
    }
  });
  // And one painted frame after, so what axe measures is what is on screen.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}
