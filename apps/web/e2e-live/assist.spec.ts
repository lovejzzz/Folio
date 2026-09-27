import { writeFileSync } from 'node:fs';
import { expect, test } from '../e2e/fixtures';
import { openSample, retype, withKey } from '../e2e/helpers';
import { OUT, readCourses, routeToBridge, type Call } from './helpers';

/** Selection actions, ⌘K plans and a ripple update, against the real model. */
test('live assist', async ({ page }) => {
  test.setTimeout(30 * 60_000);
  const calls: Call[] = [];
  const results: Record<string, unknown> = {};
  await withKey(page);
  await routeToBridge(page, calls);
  await openSample(page);
  await page.getByRole('link', { name: /Asking questions with data/ }).first().click();

  // Selection actions on the lesson summary.
  const summary = page.getByRole('textbox', { name: 'Summary of lesson 1' });
  results.original = await summary.textContent();
  for (const action of ['Simplify', 'Harder', 'Translate', 'Explain']) {
    await summary.selectText();
    await page.getByRole('toolbar', { name: 'Ask about the selected text' }).getByRole('button', { name: action }).click();
    if (action === 'Explain') {
      const box = page.getByRole('toolbar').locator('p.font-reading');
      await box.waitFor({ timeout: 3 * 60_000 });
      results[action] = await box.textContent();
      await page.keyboard.press('Escape');
    } else {
      await page.locator('mark.folio-highlight').waitFor({ timeout: 3 * 60_000 });
      results[action] = await page.locator('mark.folio-highlight').textContent();
      await page.screenshot({ path: `${OUT}/assist-${action}.png` });
      await page.getByRole('button', { name: 'Reject' }).click();
    }
  }

  // ⌘K plans.
  const requests = [
    'add a lesson on sampling bias after lesson 2',
    'make every lesson 60 minutes and quizzes 8 questions',
    'remove the last lesson',
    'what is the weather tomorrow?',
    '把第三课改名为“集中趋势与离散程度”',
    'swap lessons 2 and 3',
  ];
  results.plans = [];
  for (const request of requests) {
    await page.keyboard.press('ControlOrMeta+k');
    await page.keyboard.type(request);
    await page.getByRole('option', { name: new RegExp(request.slice(0, 12).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click();
    const panel = page.getByRole('dialog');
    await expect(panel.getByText(/This will:|couldn’t turn|nothing to change/i).first()).toBeVisible({ timeout: 3 * 60_000 });
    (results.plans as unknown[]).push({ request, preview: (await panel.innerText()).slice(0, 800) });
    await page.screenshot({ path: `${OUT}/assist-plan-${(results.plans as unknown[]).length}.png` });
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
  }

  // Ripple: change an objective, regenerate the quiz.
  await retype(page, 'Objective 1 of lesson 1', 'Tell a statistical question from a non-statistical one and explain why');
  const quiz = page.locator('#m-quiz');
  await quiz.getByRole('button', { name: 'Update' }).click();
  await expect(quiz.getByText('Needs updating.')).toHaveCount(0, { timeout: 5 * 60_000 });
  await page.waitForTimeout(1000);
  await quiz.screenshot({ path: `${OUT}/assist-quiz-updated.png` });
  const courses = await readCourses(page);
  writeFileSync(`${OUT}/live-assist.json`, JSON.stringify({ results, calls, course: courses.at(-1) }, null, 2));
});
