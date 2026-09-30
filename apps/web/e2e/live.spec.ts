import { expect, test } from './fixtures';
import { fakeAnthropic } from './fakeModel';
import { withKey } from './helpers';

test('a course is seen being written: a card follows each part, the plan check among them, and leaves when done', async ({ page }) => {
  const model = await fakeAnthropic(page, { delayMs: 400 });
  // Opus finds one thing to fix in each plan.
  await page.route('https://api.anthropic.com/**', async (route) => {
    const body = route.request().method() === 'POST' ? (route.request().postDataJSON() as { model?: string }) : null;
    if (body?.model !== 'claude-opus-5-5') return route.fallback();
    const issues = [{ part: 'segment', number: 1, field: 'teacherNotes', kind: 'fact', why: 'Say how to keep the leaf dark.', find: 'Prepare the leaves two days ahead.', replace: 'Cover a leaf with foil two days ahead.' }];
    const message = { id: 'msg_review', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text: JSON.stringify({ issues }) }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 } };
    return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, json: message });
  });
  await withKey(page);
  await page.goto('/');
  await page.getByLabel('Describe your course').fill('Photosynthesis for year 7, two lessons');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('radio', { name: 'Essentials' }).click();
  await page.getByRole('button', { name: 'Write 2 lessons' }).click();

  const card = page.getByRole('region', { name: 'What Folio is writing' });
  await expect(card).toBeVisible();
  await expect(card.getByText('Writing your course')).toBeVisible();
  await expect(card.getByText('Lesson 1 · Lesson plan')).toBeVisible();
  await expect(card.getByText(/The check fixed 1 thing/).first()).toBeVisible();
  await expect(card.getByText('Say how to keep the leaf dark.').first()).toBeVisible();
  await expect(page.getByText(/^Course ready/)).toBeVisible({ timeout: 30_000 });
  await expect(card).toBeHidden();
  // The sections were streamed; the plan's review was not.
  expect(model.calls.filter((c) => c.messages[0]!.content.includes('Write the lesson plan')).every((c) => c.stream === true)).toBe(true);
});
