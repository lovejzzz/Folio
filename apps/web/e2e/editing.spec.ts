import { expect, test } from './fixtures';
import { fakeAnthropic } from './fakeModel';
import { openSample, retype, withKey } from './helpers';

test('edit in place, undo, and see the change in history', async ({ page }) => {
  await openSample(page);
  await page.getByRole('link', { name: /Centre and spread/ }).first().click();
  await expect(page.getByRole('textbox', { name: 'Title of lesson 3' })).toHaveText('Centre and spread');
  await retype(page, 'Title of lesson 3', 'Measures of centre and spread');
  await expect(page.getByRole('link', { name: /Measures of centre and spread/ })).toBeVisible();

  await page.getByRole('main').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.getByText('Undone.')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Title of lesson 3' })).toHaveText('Centre and spread');

  await page.getByRole('button', { name: 'Changes', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Changes' }).getByText('Renamed lesson 3')).toBeVisible();
});

test('changing an objective makes dependent materials out of date, and Update refreshes them', async ({ page }) => {
  await withKey(page);
  const model = await fakeAnthropic(page);
  await openSample(page);
  await page.getByRole('link', { name: /Picturing a distribution/ }).first().click();
  await retype(page, 'Objective', 'Read a histogram and describe its shape');
  const quiz = page.locator('#m-quiz');
  await expect(quiz.getByText('Out of date.')).toBeVisible();
  await expect(quiz.getByText('Because its objectives changed.')).toBeVisible();
  await quiz.getByRole('button', { name: 'Update' }).click();
  await expect(quiz.getByText('Out of date.')).toHaveCount(0);
  expect(model.calls.some((c) => c.messages[0]!.content.includes('Read a histogram and describe its shape'))).toBe(true);
  await expect(quiz.getByText(/which gas do plants take in/).first()).toBeVisible();

  // Keep mine leaves the teacher's content alone.
  const slides = page.locator('#m-slides');
  await slides.getByRole('button', { name: 'Keep mine' }).click();
  await expect(slides.getByText('Out of date.')).toHaveCount(0);
});

test('an edited section shows the update beside the teacher’s version', async ({ page }) => {
  await withKey(page);
  await fakeAnthropic(page);
  await openSample(page);
  await page.getByRole('link', { name: /Samples and bias/ }).first().click();
  await retype(page, 'Question 1', 'A phone-in radio poll is which kind of sample?');
  await retype(page, 'Objective', 'Explain what a population is');
  await page.locator('#m-quiz').getByRole('button', { name: 'Update' }).click();
  const drawer = page.getByRole('dialog', { name: 'Changes' });
  await drawer.getByRole('button', { name: 'Compare' }).click();
  const compare = page.getByRole('dialog', { name: /Proposed update/ });
  await compare.getByRole('radio', { name: 'Yours' }).click();
  await expect(compare.getByText('A phone-in radio poll is which kind of sample?')).toBeVisible();
  await compare.getByRole('button', { name: 'Use the update' }).click();
  await expect(page.locator('#m-quiz').getByText(/which gas do plants take in/).first()).toBeVisible();
});
