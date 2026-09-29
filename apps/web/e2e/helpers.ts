import { expect, type Page } from '@playwright/test';

/** Open the bundled sample course and wait for its map. */
export async function openSample(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Or open the sample course' }).click();
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
