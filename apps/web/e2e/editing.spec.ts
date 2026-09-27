import { expect, test } from './fixtures';
import { fakeAnthropic } from './fakeModel';
import { openSample, retype, withKey } from './helpers';

test('edit in place, undo, and see the change in history', async ({ page }) => {
  await openSample(page);
  await page.getByRole('link', { name: /Centre and spread/ }).first().click();
  await expect(page.getByRole('textbox', { name: 'Title of lesson 3' })).toHaveText('Centre and spread');
  await expect(page).toHaveTitle('Centre and spread · Reading the world with data · Folio');
  await retype(page, 'Title of lesson 3', 'Measures of centre and spread');
  await expect(page.getByRole('link', { name: /Measures of centre and spread/ })).toBeVisible();

  await page.getByRole('main').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.getByText('Undone.')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Title of lesson 3' })).toHaveText('Centre and spread');

  await page.getByRole('button', { name: /^To do & history\b/ }).click();
  await expect(page.getByRole('dialog', { name: 'To do & history' }).getByText('Renamed lesson 3')).toBeVisible();
});

test('changing an objective makes dependent materials out of date, and Update refreshes them', async ({ page }) => {
  await withKey(page);
  const model = await fakeAnthropic(page);
  await openSample(page);
  await page.getByRole('link', { name: /Picturing a distribution/ }).first().click();
  await retype(page, 'Objective 1 of lesson 2', 'Read a histogram and describe its shape');
  const quiz = page.locator('#m-quiz');
  await expect(quiz.getByText('Needs updating.')).toBeVisible();
  await expect(quiz.getByText('Because its objectives changed.')).toBeVisible();
  await quiz.getByRole('button', { name: 'Update' }).click();
  await expect(quiz.getByText('Needs updating.')).toHaveCount(0);
  expect(model.calls.some((c) => c.messages[0]!.content.includes('Read a histogram and describe its shape'))).toBe(true);
  await expect(quiz.getByText(/which gas do plants take in/).first()).toBeVisible();

  // Keep mine leaves the teacher's content alone.
  const slides = page.locator('#m-slides');
  await slides.getByRole('button', { name: 'Keep mine' }).click();
  await expect(slides.getByText('Needs updating.')).toHaveCount(0);
});

test('an edited section shows the update beside the teacher’s version', async ({ page }) => {
  await withKey(page);
  await fakeAnthropic(page);
  await openSample(page);
  await page.getByRole('link', { name: /Samples and bias/ }).first().click();
  await retype(page, 'Question 1', 'A phone-in radio poll is which kind of sample?');
  await retype(page, 'Objective 1 of lesson 4', 'Explain what a population is');
  await page.locator('#m-quiz').getByRole('button', { name: 'Update' }).click();
  const drawer = page.getByRole('dialog', { name: 'To do & history' });
  await drawer.getByRole('button', { name: 'Compare' }).click();
  const compare = page.getByRole('dialog', { name: /Proposed update/ });
  await compare.getByRole('radio', { name: 'Yours' }).click();
  await expect(compare.getByText('A phone-in radio poll is which kind of sample?')).toBeVisible();
  await compare.getByRole('button', { name: 'Use the update' }).click();
  await expect(page.locator('#m-quiz').getByText(/which gas do plants take in/).first()).toBeVisible();
});

test('a source added in the drawer is cited by regenerated questions', async ({ page }) => {
  await withKey(page);
  await fakeAnthropic(page);
  await openSample(page);
  await page.getByRole('button', { name: 'Sources', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Sources' });
  await drawer.getByLabel('Title').fill('Class survey results');
  await drawer.getByLabel('Source text').fill('Twenty-four students answered the survey in March. Each gave their usual way of getting to school and how many minutes the journey takes on a normal day.\n\nMost walk to school; six take the bus and three come by car. Journeys range from four minutes to forty, with most between ten and fifteen minutes long.');
  await drawer.getByRole('button', { name: 'Add source' }).click();
  await expect(drawer.getByText(/^2 parts.Not used yet$/)).toBeVisible();
  await page.getByRole('link', { name: /Asking questions with data/ }).first().click();
  await page.locator('#m-quiz').getByRole('button', { name: 'Update' }).click();
  const chip = page.locator('#m-quiz').getByRole('button', { name: 'Source: Class survey results' });
  await expect(chip).toBeVisible();
  await chip.hover();
  await expect(page.getByRole('tooltip')).toHaveText('Twenty-four students answered the survey in March. Each gave their usual way of getting to school and how many minutes the journey takes on a normal day.');
});

test('rewording a summary leaves the lesson up to date; an objective puts its sections in one card to update or keep', async ({ page }) => {
  await openSample(page);
  await page.getByRole('link', { name: /Picturing a distribution/ }).first().click();
  await retype(page, 'Summary of lesson 2', 'Dot plots and histograms, and what their shape tells us.');
  await expect(page.getByText('Needs updating.')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /to do/ })).toHaveCount(0);

  await retype(page, 'Objective 1 of lesson 2', 'Read a histogram and describe its shape, centre and spread');
  await page.getByRole('button', { name: 'To do & history, 6 to do' }).click();
  const changes = page.getByRole('dialog', { name: 'To do & history' });
  await expect(changes.getByText('Because its objectives changed. These 6 were written from it:')).toHaveCount(1);
  await expect(changes.getByRole('button', { name: 'Update 6' })).toBeVisible();
  await changes.getByRole('button', { name: 'Keep as they are' }).click();
  await expect(changes.getByText('Everything is up to date.')).toBeVisible();
  await expect(changes.getByText('Kept 6 parts of lesson 2 as they are')).toBeVisible();
  await expect(page.getByRole('button', { name: /to do/ })).toHaveCount(0);
});
