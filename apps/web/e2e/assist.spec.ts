import { expect, test } from '@playwright/test';
import { fakeAnthropic } from './fakeModel';
import { openSample, withKey } from './helpers';

test('⌘K plans a course change, previews it, and applies it', async ({ page }) => {
  await withKey(page);
  await fakeAnthropic(page);
  await openSample(page);
  await page.keyboard.press('ControlOrMeta+k');
  await page.keyboard.type('make every quiz three questions');
  await page.getByRole('option', { name: /make every quiz three questions/ }).click();
  await expect(page.getByText('Make every quiz 3 questions')).toBeVisible();
  await expect(page.getByText('Then update 4 sections that depend on it.')).toBeVisible();
  await page.getByRole('button', { name: 'Apply' }).click();
  await page.getByRole('link', { name: 'Open Quiz & exam bank' }).click();
  await expect(page.getByRole('article', { name: 'Question 12' })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Question 13' })).toHaveCount(0);
});

test('⌘K navigates to a lesson', async ({ page }) => {
  await openSample(page);
  await page.keyboard.press('ControlOrMeta+k');
  await page.keyboard.type('samples');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/lesson\//);
  await expect(page.getByRole('textbox', { name: 'Title of lesson 4' })).toHaveText('Samples and bias');
});

test('selecting text offers a rewrite that is accepted inline', async ({ page }) => {
  await withKey(page);
  await fakeAnthropic(page);
  await openSample(page);
  await page.getByRole('link', { name: /Asking questions with data/ }).first().click();
  const summary = page.getByRole('textbox', { name: 'Summary of lesson 1' });
  await summary.selectText();
  await page.getByRole('toolbar', { name: 'Ask about the selected text' }).getByRole('button', { name: 'Simplify' }).click();
  await expect(page.locator('mark.folio-highlight')).toHaveText('A clearer version of the sentence.');
  await page.getByRole('button', { name: 'Accept' }).click();
  await expect(summary).toHaveText('A clearer version of the sentence.');
});
