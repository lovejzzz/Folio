import { expect, test } from './fixtures';
import { fakeAnthropic } from './fakeModel';
import { withKey } from './helpers';

test('readings and the grading scheme carry from the brief to the plan and the syllabus', async ({ page }) => {
  await withKey(page);
  await fakeAnthropic(page);
  await page.goto('/');
  await page.getByLabel('Describe your course').fill('Photosynthesis for year 7, three lessons, reading from Campbell Biology. Lab notebook 30%, weekly quizzes 20%, end-of-unit test 50%.');
  await page.getByRole('button', { name: 'Continue' }).click();

  // The plan shows each lesson's reading under its objectives; a lesson without one just offers to add it.
  // A reading the brief never names (the model's handout) is left out; the book is the brief's, and its sections, which the
  // brief did not give, say they are still to be confirmed.
  const second = page.getByRole('region', { name: 'Reading for lesson 2' });
  await expect(second.getByRole('textbox', { name: 'Reading 1 for lesson 2' })).toHaveText('Campbell Biology, ch. 10.2–10.3 (to confirm)');
  await expect(second.getByRole('textbox')).toHaveCount(1);
  await expect(page.getByRole('region', { name: 'Reading for lesson 3' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Add a reading' }).nth(2).click();
  await page.keyboard.type('Leaf anatomy worksheet');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('textbox', { name: 'Reading 1 for lesson 3' })).toHaveText('Leaf anatomy worksheet');
  await page.getByRole('textbox', { name: 'Reading 1 for lesson 3' }).hover();
  await page.getByRole('button', { name: 'Remove reading 1 for lesson 3' }).click();
  await expect(page.getByRole('region', { name: 'Reading for lesson 3' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Add a reading' }).nth(2).click();
  await page.keyboard.type('Leaf anatomy worksheet');
  await page.keyboard.press('Enter');

  await page.getByRole('button', { name: 'Write 3 lessons' }).click();
  await expect(page.getByText(/Course ready/)).toBeVisible({ timeout: 30_000 });

  // The syllabus schedules the reading and puts the stated grading first under assessment.
  await page.goto(page.url().replace(/\/map$/, '/m/syllabus'));
  const schedule = page.getByRole('table').first();
  await expect(schedule.getByRole('columnheader', { name: 'Reading' })).toBeVisible();
  await expect(schedule.getByRole('row').nth(3)).toContainText('Leaf anatomy worksheet');
  const grading = page.getByRole('table', { name: 'Grading' });
  await expect(grading.getByRole('textbox', { name: /^Graded component \d$/ })).toHaveText(['Lab notebook', 'Weekly quizzes', 'End-of-unit test']);
  await expect(grading.getByRole('row', { name: /Total/ })).toContainText('100%');

  // Weights that stop adding up get a gentle note; a new component takes what is left.
  const quizzes = grading.getByRole('textbox', { name: 'Weight of Weekly quizzes' });
  await quizzes.fill('10');
  await quizzes.press('Enter');
  await expect(grading.getByRole('row', { name: /Total/ })).toContainText('90%');
  await expect(grading.getByText('Weights usually add up to 100%.')).toBeVisible();
  await page.getByRole('button', { name: 'Add a graded component' }).click();
  await page.keyboard.type('Presentation');
  await page.keyboard.press('Enter');
  await expect(grading.getByRole('textbox', { name: 'Weight of Presentation' })).toHaveValue('10');
  await expect(grading.getByRole('row', { name: /Total/ })).toContainText('100%');
  await expect(grading.getByText('Weights usually add up to 100%.')).toHaveCount(0);

  // How a component runs is shown as every page was told it, and changed with a press; it is still there after a reload.
  const who = grading.getByRole('button', { name: 'Who does Lab notebook: each student alone, pairs, or groups' });
  await expect(who).toHaveText('Each student alone');
  await who.click();
  await expect(who).toHaveText('In pairs');
  const handIn = grading.getByRole('button', { name: 'How Lab notebook is handed in: not said, on paper, online, or not at all' });
  await expect(handIn).toHaveText('How it is handed in: not said');
  await handIn.click();
  await expect(handIn).toHaveText('Handed in on paper');
  await page.reload();
  await expect(page.getByRole('table', { name: 'Grading' }).getByRole('button', { name: 'Who does Lab notebook: each student alone, pairs, or groups' })).toHaveText('In pairs');
});
