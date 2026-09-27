import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { openSample } from './helpers';

async function openLesson(page: Page, title: RegExp): Promise<void> {
  await openSample(page);
  await page.getByRole('link', { name: title }).first().click();
  // Every section is on the page before anything is counted.
  await expect(page.locator('#m-faq').getByRole('button', { name: 'Add a question' })).toBeVisible();
}

/** Click somewhere neutral, so focus leaves whatever field has it. */
async function clickAway(page: Page): Promise<void> {
  await page.getByRole('main').click({ position: { x: 5, y: 5 } });
}

test('Add an objective puts the caret in an empty line; left blank it goes, and nothing goes out of date', async ({ page }) => {
  await openLesson(page, /Centre and spread/);
  const objectives = page.getByRole('textbox', { name: /^Objective \d of lesson 3$/ });
  const count = await objectives.count();
  await page.getByRole('button', { name: 'Add an objective' }).click();
  const fresh = page.getByRole('textbox', { name: `Objective ${count + 1} of lesson 3` });
  await expect(fresh).toBeFocused();
  await expect(fresh).toHaveText('');
  await expect(fresh).toHaveAttribute('data-placeholder', 'What students will be able to do');

  await clickAway(page);
  await expect(objectives).toHaveCount(count);
  await expect(page.getByText('Needs updating.')).toHaveCount(0);

  await page.getByRole('button', { name: 'Add an objective' }).click();
  await page.keyboard.type('Explain why the median resists outliers');
  await page.keyboard.press('Enter');
  await expect(objectives).toHaveCount(count + 1);
  await expect(page.getByRole('textbox', { name: `Objective ${count + 1} of lesson 3` })).toHaveText('Explain why the median resists outliers');
  await expect(page.locator('#m-quiz').getByText('Because its objectives changed.')).toBeVisible();

  await page.getByRole('button', { name: /To do & history/ }).click();
  const drawer = page.getByRole('dialog', { name: 'To do & history' });
  await expect(drawer.getByText('Added an objective')).toHaveCount(1);
});

test('Add a question starts an empty question with the caret in it, and a blank one is taken out again', async ({ page }) => {
  await openLesson(page, /Centre and spread/);
  const quiz = page.locator('#m-quiz');
  const questions = quiz.getByRole('article');
  const count = await questions.count();

  await quiz.getByRole('button', { name: 'Add a question' }).click();
  const prompt = quiz.getByRole('textbox', { name: `Question ${count + 1}` });
  await expect(prompt).toBeFocused();
  await expect(prompt).toHaveText('');
  const added = questions.nth(count);
  await expect(added.getByRole('textbox', { name: /^Choice [A-D]$/ })).toHaveText(['', '', '', '']);
  // Moving between the question's own fields keeps it.
  await added.getByRole('textbox', { name: 'Choice A' }).click();
  await expect(questions).toHaveCount(count + 1);
  await clickAway(page);
  await expect(questions).toHaveCount(count);

  await quiz.getByRole('button', { name: 'Add a question' }).click();
  await page.keyboard.type('Which summary is least affected by one very large value?');
  await added.getByRole('textbox', { name: 'Choice A' }).click();
  await page.keyboard.type('The median');
  await clickAway(page);
  await expect(questions).toHaveCount(count + 1);
  await expect(added.getByRole('textbox', { name: 'Choice A' })).toHaveText('The median');
  await expect(added.getByRole('textbox', { name: 'Choice B' })).toHaveText('');
});

test('Add a term, a step, a point: each opens empty and focused, and blank ones never stay', async ({ page }) => {
  await openLesson(page, /Centre and spread/);
  const plan = page.locator('#m-plan');

  const terms = plan.getByRole('textbox', { name: 'Term', exact: true });
  const termCount = await terms.count();
  await plan.getByRole('button', { name: 'Add a term' }).click();
  await expect(terms.nth(termCount)).toBeFocused();
  await expect(terms.nth(termCount)).toHaveText('');
  await clickAway(page);
  await expect(terms).toHaveCount(termCount);

  const steps = plan.getByRole('textbox', { name: /^Title of step \d+$/ });
  const stepCount = await steps.count();
  await plan.getByRole('button', { name: 'Add a step' }).click();
  await expect(steps.nth(stepCount)).toBeFocused();
  await page.keyboard.type('Quick check');
  await clickAway(page);
  await expect(steps).toHaveCount(stepCount + 1);
  await expect(steps.nth(stepCount)).toHaveText('Quick check');

  const ideas = plan.getByRole('list', { name: 'Key ideas' }).getByRole('listitem');
  const ideaCount = await ideas.count();
  await plan.getByRole('button', { name: 'Add a key idea' }).click();
  await expect(plan.getByRole('textbox', { name: `Key ideas ${ideaCount + 1}` })).toBeFocused();
  await clickAway(page);
  await expect(ideas).toHaveCount(ideaCount);

  const study = page.locator('#m-study');
  const headings = study.getByRole('textbox', { name: /^Heading of point \d+$/ });
  const pointCount = await headings.count();
  await study.getByRole('button', { name: 'Add a point' }).click();
  await expect(headings.nth(pointCount)).toBeFocused();
  await expect(headings.nth(pointCount)).toHaveText('');
  // Into its own explanation and out again: still blank, so it goes.
  await study.getByRole('textbox', { name: `Heading of point ${pointCount + 1}`, exact: true }).press('Tab');
  await expect(study.getByRole('textbox', { name: `Explanation ${pointCount + 1}` })).toBeFocused();
  await clickAway(page);
  await expect(headings).toHaveCount(pointCount);

  // Leaving blank items took them out without a trace: history shows only the step.
  await page.getByRole('button', { name: /To do & history/ }).click();
  const history = page.getByRole('dialog', { name: 'To do & history' }).getByRole('listitem').filter({ hasText: /^Edited the/ });
  await expect(history).toHaveText([/Edited the lesson plan for lesson 3/, /Edited the lesson plan for lesson 3/]);
});

test('segment minutes take whole numbers from 1 to 600 and say so', async ({ page }) => {
  await openLesson(page, /Centre and spread/);
  const plan = page.locator('#m-plan');
  const minutes = plan.getByRole('textbox', { name: 'Minutes for step 1' });
  await expect(minutes).toHaveValue('6');

  await minutes.fill('99999');
  await minutes.press('Enter');
  await expect(minutes).toHaveValue('600');
  await expect(plan.getByRole('status').filter({ hasText: 'Whole minutes, 1 to 600.' })).toBeVisible();
  await expect(plan.getByText(/^\d+ of 50 minutes planned$/)).toHaveText(/^6\d\d of 50 minutes planned$/);

  await minutes.fill('12');
  await minutes.press('Tab');
  await expect(minutes).toHaveValue('12');

  await minutes.click();
  await minutes.press('ControlOrMeta+A');
  // Letters are refused as they are typed, and the hint says what the field takes.
  await page.keyboard.type('abc');
  await expect(minutes).toHaveValue('12');
  await expect(plan.getByRole('status').filter({ hasText: 'Whole minutes, 1 to 600.' })).toBeVisible();
  await minutes.blur();
  await expect(minutes).toHaveValue('12');

  await minutes.click();
  await minutes.press('ControlOrMeta+A');
  await page.keyboard.type('-5');
  await minutes.press('Enter');
  await expect(minutes).toHaveValue('5');
});

test('rubric criteria can be removed and level points edited', async ({ page }) => {
  await openLesson(page, /Centre and spread/);
  const rubric = page.locator('#m-rubrics');
  await expect(rubric.getByRole('textbox', { name: /^Criterion \d$/ })).toHaveCount(3);
  await rubric.getByRole('button', { name: 'Remove: Choice of summary' }).click();
  await expect(rubric.getByRole('textbox', { name: /^Criterion \d$/ })).toHaveText(['Calculations', 'Comparison']);

  const points = rubric.getByRole('textbox', { name: 'Points for Excellent' });
  await expect(points).toHaveValue('4');
  await points.fill('5');
  await points.press('Enter');
  await expect(points).toHaveValue('5');
  await points.fill('250');
  await points.press('Enter');
  await expect(points).toHaveValue('100');
  await expect(rubric.getByRole('status').filter({ hasText: 'Points from 0 to 100.' })).toBeVisible();

  // A criterion added and left blank goes again.
  await rubric.getByRole('button', { name: 'Add a criterion' }).click();
  await expect(rubric.getByRole('textbox', { name: 'Criterion 3', exact: true })).toBeFocused();
  await clickAway(page);
  await expect(rubric.getByRole('textbox', { name: /^Criterion \d$/ })).toHaveCount(2);
});

test('pasted text keeps its paragraphs without gaining line breaks', async ({ page }) => {
  await openLesson(page, /Centre and spread/);
  const paste = async (name: string, text: string) => {
    const field = page.getByRole('textbox', { name });
    await field.click();
    await page.keyboard.press('ControlOrMeta+A');
    await field.evaluate((el, t) => {
      const data = new DataTransfer();
      data.setData('text/plain', t);
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    }, text);
    await field.blur();
  };
  await paste('Summary of lesson 3', 'First line\r\n\r\nSecond line\r\n');
  await paste('Title of lesson 3', 'Centre\nand spread\n');
  await page.reload();
  const text = (name: string) => page.getByRole('textbox', { name }).evaluate((el) => el.textContent);
  await expect.poll(() => text('Summary of lesson 3')).toBe('First line\n\nSecond line');
  await expect.poll(() => text('Title of lesson 3')).toBe('Centre and spread');
});

test('a new slide starts empty with the caret in its title', async ({ page }) => {
  await openSample(page);
  await page.goto(page.url().replace(/\/map$/, '/m/slides'));
  const title = page.getByRole('textbox', { name: 'Slide title' });
  await expect(title).toHaveText('Asking questions with data');
  await page.getByRole('button', { name: 'Add a slide' }).click();
  await expect(title).toBeFocused();
  await expect(title).toHaveText('');
  await page.keyboard.type('Why ask with data?');
  await page.keyboard.press('Enter');
  await expect(title).toHaveText('Why ask with data?');
});
