import { expect, test } from './fixtures';
import { fakeAnthropic } from './fakeModel';
import { withKey } from './helpers';

test('a course taught online on the students\u2019 own time is written as a page a week, for the student', async ({ page }) => {
  await withKey(page);
  const model = await fakeAnthropic(page, { delayMs: 20 });
  await page.goto('/');
  await page.getByLabel('Describe your course').fill('Photosynthesis for first-year undergraduates: an asynchronous online course, three weeks');
  // The brief says how the course meets, and the chip follows it.
  await expect(page.getByRole('combobox', { name: 'How the course meets' })).toHaveValue('online-async');
  await page.getByRole('button', { name: 'Continue' }).click();

  // Weeks, and hours of work: there are no meetings to give a length to.
  await expect(page.getByRole('heading', { name: 'How plants make food' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Hours of work a week' })).toHaveValue('9');
  await expect(page.getByRole('textbox', { name: 'Minutes each' })).toHaveCount(0);
  await page.getByRole('button', { name: /^Write 3/ }).click();

  await expect(page.getByRole('grid', { name: 'Lessons and materials' })).toBeVisible();
  await expect(page.getByText(/Course ready/)).toBeVisible({ timeout: 30_000 });
  // The outline was asked for in weeks, each page was read a second time, and no deck was written.
  expect(model.calls.some((c) => c.messages[0]!.content.includes('one for each week'))).toBe(true);
  expect(model.calls.filter((c) => c.messages[0]!.content.includes('Read this page as the student will'))).toHaveLength(3);
  expect(model.calls.some((c) => c.messages[0]!.content.includes('Write a slide deck'))).toBe(false);
  await expect(page.getByRole('columnheader', { name: 'Weekly modules' })).toBeVisible();

  // The week's page: what to do and by when, steps with the picture to make, a checkpoint, code that can be copied.
  await page.getByRole('link', { name: /Light and leaves/ }).first().click();
  await expect(page.getByRole('heading', { name: 'This week', exact: true })).toBeVisible();
  await expect(page.getByText('About 9 hours of work')).toBeVisible();
  await expect(page.getByText('Due Thursday')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Draw the leaf' })).toBeVisible();
  await expect(page.getByText('Screenshot to add')).toBeVisible();
  await expect(page.getByText('Clip to add')).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Checkpoint' })).toContainText('stomata labelled on the underside');
  await expect(page.getByRole('button', { name: 'Copy' })).toBeVisible();
  // The forum is graded by one rule, stated the same every week; the instructor has a kit of their own.
  await expect(page.getByText(/How posts are graded, every week/)).toBeVisible();
  await expect(page.getByText('Students never see this part.')).toBeVisible();
});
