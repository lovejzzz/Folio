import { sampleCourse } from '@folio/core/sample';
import { expect, type Page } from '@playwright/test';

/** The statistics course the tests are written against, served in place of whichever sample is chosen. */
const STATISTICS = JSON.stringify(sampleCourse());

/** Choose a sample course from the home page or the connect dialog, as a teacher would. */
export async function chooseSample(page: Page): Promise<void> {
  await page.route('**/samples/*.json', (route) => route.fulfill({ contentType: 'application/json', body: STATISTICS }));
  await page.getByRole('button', { name: 'Or open a sample course' }).click();
  await page.getByRole('dialog', { name: 'Open a sample course' }).getByRole('button', { name: /^University/ }).click();
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
