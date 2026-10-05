import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { fakeAnthropic } from './fakeModel';
import { withKey } from './helpers';

async function planLessons(page: Page, brief: string) {
  await withKey(page);
  const model = await fakeAnthropic(page);
  await page.goto('/');
  await page.getByLabel('Describe your course').fill(brief);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('textbox', { name: 'Title of lesson 1' }).waitFor();
  return model;
}

const titles = (page: Page) => page.getByRole('textbox', { name: /^Title of lesson \d+$/ }).allTextContents();

test('the lesson stepper counts the lessons that are there, down to none', async ({ page }) => {
  await planLessons(page, 'Photosynthesis for year 7, two lessons');
  const stepper = page.getByRole('textbox', { name: 'Lessons' });
  await expect(stepper).toHaveValue('2');
  await page.getByRole('button', { name: 'Remove lesson 2' }).click();
  await expect(stepper).toHaveValue('1');
  await page.getByRole('button', { name: 'Remove lesson 1' }).click();
  await expect(page.getByRole('textbox', { name: /^Title of lesson/ })).toHaveCount(0);
  await expect(stepper).toHaveValue('0');
  await expect(page.getByRole('button', { name: 'Increase Lessons' })).toBeEnabled();

  await page.getByRole('button', { name: 'Increase Lessons' }).click();
  await expect(stepper).toHaveValue('1');
  await expect(page.getByRole('textbox', { name: /^Title of lesson/ })).toHaveCount(1);
  // One lesson is the least the stepper itself goes down to.
  await expect(page.getByRole('button', { name: 'Decrease Lessons' })).toBeDisabled();
});

test('dragging a lesson down drops it where the line shows', async ({ page }) => {
  // Tall enough that every row is on screen: a native drag can't scroll the page as it goes.
  await page.setViewportSize({ width: 1440, height: 1800 });
  await planLessons(page, 'Photosynthesis for year 7, four lessons');
  const before = await titles(page);
  expect(before).toHaveLength(4);
  const rows = page.locator('ol > li');
  await rows.nth(0).hover();
  const handle = rows.nth(0).locator('[draggable="true"]');

  // The top half of lesson 3: the line is drawn above lesson 3, so lesson 1 lands between 2 and 3.
  await handle.dragTo(rows.nth(2), { targetPosition: { x: 200, y: 8 } });
  await expect.poll(() => titles(page)).toEqual([before[1], before[0], before[2], before[3]]);

  // The bottom half of the last lesson: it goes to the end.
  const box = await rows.nth(3).boundingBox();
  await rows.nth(0).hover();
  await rows.nth(0).locator('[draggable="true"]').dragTo(rows.nth(3), { targetPosition: { x: 200, y: box!.height - 8 } });
  await expect.poll(() => titles(page)).toEqual([before[0], before[2], before[3], before[1]]);

  // Dragging up still lands above the line.
  await rows.nth(3).hover();
  await rows.nth(3).locator('[draggable="true"]').dragTo(rows.nth(0), { targetPosition: { x: 200, y: 8 } });
  await expect.poll(() => titles(page)).toEqual([before[1], before[0], before[2], before[3]]);
});

test('a course with only course-level materials finishes building and opens like any other', async ({ page }) => {
  const model = await planLessons(page, 'Photosynthesis for year 7, two lessons');
  for (const name of ['Lesson plans', 'Slide decks', 'Assignments', 'Rubrics', 'Discussions', 'Quiz & exam bank', 'Study guides', 'Course FAQ', 'Objectives & assessment']) {
    const box = page.getByRole('checkbox', { name, exact: true });
    if (await box.isChecked()) await box.uncheck({ force: true });
  }
  await expect(page.getByRole('checkbox', { name: 'Syllabus', exact: true })).toBeChecked();
  const calls = model.calls.length;
  await page.getByRole('button', { name: 'Write 2 lessons' }).click();

  await expect(page.getByText(/^Course ready\./)).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Course views' });
  await expect(nav.getByRole('link', { name: 'Overview' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Lessons' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeVisible();
  expect(model.calls.length).toBe(calls);

  // It stays ready after a reload, and the library doesn't list it as still planning.
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Course views' }).getByRole('link', { name: 'Overview' })).toBeVisible();
  await page.goto('/library');
  await expect(page.getByText('Outline', { exact: true })).toHaveCount(0);
});

test('suggested further reading stays apart until the teacher adds it', async ({ page }) => {
  await planLessons(page, 'A graduate seminar on the social contract, three sessions');
  const suggestion = 'Okin, Justice, Gender, and the Family, ch. 5';
  const suggested = page.getByRole('region', { name: 'Suggested further reading' });
  await expect(suggested.getByText(suggestion)).toBeVisible();
  // The brief names nothing to read, so the lesson has no reading of its own until the teacher adds one.
  await expect(page.getByRole('textbox', { name: 'Reading 1 for lesson 1' })).toHaveCount(0);
  await suggested.getByRole('button', { name: `Add “${suggestion}” to the reading for lesson 1` }).click();
  await expect(page.getByRole('textbox', { name: 'Reading 1 for lesson 1' })).toHaveText(suggestion);
  await expect(suggested).toHaveCount(0);
});

test('a brief with a lecture and a seminar plans both, and the lesson plan is timed per session', async ({ page }) => {
  await planLessons(page, 'Political philosophy, two weeks, each a 50-minute lecture and a 50-minute seminar.');
  await expect(page.getByText('Each lesson', { exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Kind of session 1' })).toHaveValue('lecture');
  await expect(page.getByRole('combobox', { name: 'Kind of session 2' })).toHaveValue('seminar');
  await page.getByRole('button', { name: 'Write 2 lessons' }).click();
  await expect(page.getByText('Lecture 50 min + Seminar 50 min')).toBeVisible();
  await expect(page.getByText(/Course ready/)).toBeVisible({ timeout: 30_000 });
  await page.locator('a[href*="/lesson/"]').first().click();
  const plan = page.locator('#m-plan');
  await expect(plan.getByRole('heading', { name: 'Lecture · 50 min' })).toBeVisible();
  await expect(plan.getByRole('heading', { name: 'Seminar · 50 min' })).toBeVisible();
});

test('a lesson taught in a room comes with the sheets its plan hands out, their answers kept apart', async ({ page }) => {
  await planLessons(page, 'Photosynthesis for year 7, two lessons');
  await page.getByRole('button', { name: /^Write 2/ }).click();
  await expect(page.getByText(/^Course ready/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('link', { name: /Light and leaves/ }).first().click();
  const sheets = page.getByRole('region', { name: 'Handouts' });
  await expect(sheets.getByRole('heading', { name: 'Exit ticket' })).toBeVisible();
  await expect(sheets.getByText('What goes into a leaf, and what comes out?')).toBeVisible();
  await expect(sheets.getByText('One per student · Used in Exit ticket')).toBeVisible();
  // The key is the teacher's: beside the sheet, never on it.
  await expect(sheets.getByText('Answer key, for you only')).toBeVisible();
  await expect(sheets.getByText('Light, water and carbon dioxide go in; sugar and oxygen come out.')).toBeVisible();
  // A copy with supports for students still learning the language, when the teacher asks: after its sheet, which stays as it was.
  await sheets.getByRole('button', { name: 'Add a copy with language supports' }).click();
  await expect(sheets.getByText('Slips · with language supports')).toBeVisible();
  await expect(sheets.getByRole('heading', { name: 'Exit ticket' })).toHaveCount(2);
  await expect(sheets.getByRole('cell', { name: 'a gas in the air' })).toBeVisible();
  await expect(sheets.getByText('Into a leaf go … Out of a leaf come …')).toBeVisible();
  await expect(sheets.getByRole('button', { name: 'Add a copy with language supports' })).toHaveCount(0);
});
