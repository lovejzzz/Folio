import { expect, test } from './fixtures';

test('the level is a stage, or a grade within a school stage, chosen from a second menu', async ({ page }) => {
  await page.goto('/');
  const level = page.getByRole('button', { name: 'Level' });
  await expect(level).toHaveText('Any level');
  await level.click();
  const menu = page.getByRole('menu', { name: 'Level' });
  for (const stage of ['Elementary school', 'Middle school', 'High school', 'Undergraduate', 'Graduate (master’s)', 'Doctoral (PhD)', 'Adult learners']) {
    await expect(menu.getByRole('menuitem', { name: stage })).toBeVisible();
  }
  await menu.getByRole('menuitem', { name: 'Middle school' }).click();
  const grades = page.getByRole('menu', { name: 'Middle school' });
  await expect(grades.getByRole('menuitem')).toHaveText(['Any grade in middle school', 'Grade 6', 'Grade 7', 'Grade 8']);
  await grades.getByRole('menuitem', { name: 'Grade 7' }).click();
  await expect(level).toHaveText('Grade 7');

  // A stage past school has no grades: it is chosen at once.
  await level.click();
  await page.getByRole('menu', { name: 'Level' }).getByRole('menuitem', { name: 'Doctoral (PhD)' }).click();
  await expect(level).toHaveText('Doctoral (PhD)');

  // A level read from the brief is one the menu offers, until the teacher picks one.
  await page.reload();
  await page.getByLabel('Describe your course').fill('Organic chemistry for high school juniors, 4 lessons');
  await expect(page.getByRole('button', { name: 'Level' })).toHaveText('Grade 11');
});

test('the examples write a model brief into the box, and say what they are', async ({ page }) => {
  await page.goto('/');
  const brief = page.getByLabel('Describe your course');
  await expect(brief).toHaveAttribute('placeholder', 'Describe your course, or drop in your syllabus and other files (PDF, Word, Markdown or plain text).');
  await expect(page.getByText('Try', { exact: true })).toBeVisible();
  const examples = page.getByRole('list', { name: 'Try' }).getByRole('button');
  await expect(examples).toHaveCount(3);
  const label = await examples.first().textContent();
  await examples.first().click();
  // The brief arrives with its own small file, a moment after the click.
  await expect(brief).not.toHaveValue('');
  const written = await brief.inputValue();
  expect(written.length).toBeGreaterThan(250);
  expect(written).not.toBe(label);
  // The chips follow the brief: its lesson count is the one the example names.
  const count = label!.match(/(\d+) lessons$/)?.[1];
  if (count) await expect(page.getByRole('combobox', { name: 'Lessons' })).toHaveValue(count);
});
