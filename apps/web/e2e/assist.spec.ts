import { expect, test } from './fixtures';
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

test('a pending suggestion is dropped when you move to another lesson, never written there', async ({ page }) => {
  await withKey(page);
  await fakeAnthropic(page);
  await openSample(page);
  await page.getByRole('link', { name: /Asking questions with data/ }).first().click();
  await page.getByRole('textbox', { name: 'Summary of lesson 1' }).selectText();
  await page.getByRole('toolbar', { name: 'Ask about the selected text' }).getByRole('button', { name: 'Simplify' }).click();
  await expect(page.locator('mark.folio-highlight')).toBeVisible();
  const summary2 = page.getByRole('textbox', { name: 'Summary of lesson 2' });
  await page.getByRole('navigation', { name: 'Lessons' }).getByRole('link', { name: /Picturing a distribution/ }).first().click();
  await expect(summary2).toBeVisible();
  const before = await summary2.textContent();
  await expect(page.getByRole('button', { name: 'Accept' })).toHaveCount(0);
  await expect(summary2).toHaveText(before!);
});

test('an explanation closes with Esc or a click elsewhere, and the bar stays with its text on scroll', async ({ page }) => {
  await withKey(page);
  await fakeAnthropic(page);
  await openSample(page);
  await page.getByRole('link', { name: /Asking questions with data/ }).first().click();
  const summary = page.getByRole('textbox', { name: 'Summary of lesson 1' });
  await summary.selectText();
  const bar = page.getByRole('toolbar', { name: 'Ask about the selected text' });
  const y0 = (await bar.boundingBox())!.y;
  await page.mouse.wheel(0, 120);
  await expect.poll(async () => (await bar.boundingBox())?.y ?? 0).toBeLessThan(y0 - 60);

  await bar.getByRole('button', { name: 'Explain' }).click();
  await expect(page.getByText('This is the key idea of the lesson.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByText('This is the key idea of the lesson.')).toHaveCount(0);

  await summary.selectText();
  await bar.getByRole('button', { name: 'Explain' }).click();
  await expect(page.getByText('This is the key idea of the lesson.')).toBeVisible();
  await page.mouse.click(1300, 700);
  await expect(page.getByText('This is the key idea of the lesson.')).toHaveCount(0);
});

test('⌘K leaves out steps that can’t be done, and says why', async ({ page }) => {
  await withKey(page);
  await fakeAnthropic(page);
  await openSample(page);
  await page.keyboard.press('ControlOrMeta+k');
  await page.keyboard.type('remove lesson 99, make quizzes 40 questions and rename lesson 1');
  await page.getByRole('option', { name: /remove lesson 99/ }).click();
  await expect(page.getByText('Rename lesson 1 to “Asking good questions”')).toBeVisible();
  await expect(page.getByText('Left out 2 steps that can’t be done:')).toBeVisible();
  await expect(page.getByText('Remove lesson 99: the course has only 4 lessons.')).toBeVisible();
  await expect(page.getByText('Make every quiz 40 questions: it has to be between 1 and 30.')).toBeVisible();
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByRole('link', { name: /Asking good questions/ }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: /Samples and bias/ }).first()).toBeVisible();
});

test('⌘K shows there is nothing to do when no step can be done', async ({ page }) => {
  await withKey(page);
  await fakeAnthropic(page);
  await openSample(page);
  await page.keyboard.press('ControlOrMeta+k');
  await page.keyboard.type('remove lesson 99');
  await page.getByRole('option', { name: /remove lesson 99/ }).click();
  await expect(page.getByText('There’s nothing to change.')).toBeVisible();
  await expect(page.getByText('Remove lesson 99: the course has only 4 lessons.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apply' })).toBeDisabled();
});
