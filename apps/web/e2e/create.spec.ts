import { expect, test } from './fixtures';
import { fakeAnthropic } from './fakeModel';
import { withKey } from './helpers';

test('describe, plan, build and land on a finished map', async ({ page }) => {
  const model = await fakeAnthropic(page, { delayMs: 50 });
  await page.goto('/');
  await page.getByLabel('Describe your course').fill('Photosynthesis for year 7, three lessons, with a short quiz each lesson');
  await expect(page.getByRole('combobox', { name: 'Lessons' })).toHaveValue('3');
  await page.getByRole('button', { name: 'Continue' }).click();

  // No model yet: the guided key setup appears.
  const dialog = page.getByRole('dialog', { name: 'Connect an AI' });
  await expect(dialog).toBeVisible();
  // Folio credits are offered first; this teacher brings their own key.
  await dialog.getByRole('radio', { name: /Use my API keys/ }).click({ force: true });
  await dialog.getByRole('radio', { name: /Use my Claude key/ }).click({ force: true });
  await dialog.getByLabel('API key', { exact: true }).fill('sk-ant-test');
  await dialog.getByRole('button', { name: 'Connect and continue' }).click();

  // The outline is editable before anything else is written.
  await expect(page.getByRole('heading', { name: 'How plants make food' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Title of lesson 1' })).toHaveText('Light and leaves');
  const title2 = page.getByRole('textbox', { name: 'Title of lesson 2' });
  await title2.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('Chloroplasts up close');
  await page.keyboard.press('Enter');
  await expect(title2).toHaveText('Chloroplasts up close');

  await page.getByRole('radio', { name: 'Essentials' }).click();
  await page.getByRole('button', { name: 'Write 3 lessons' }).click();

  await expect(page.getByRole('grid', { name: 'Lessons and materials' })).toBeVisible();
  await expect(page).toHaveTitle('Overview · How plants make food · Folio');
  await expect(page.getByText(/Course ready\. Please check 3 things\./)).toBeVisible({ timeout: 30_000 });
  const plan = model.calls.filter((c) => c.messages[0]!.content.includes('Write the lesson plan'));
  expect(plan).toHaveLength(3);
  // Sonnet 5.5 writes the plans, Opus checks each before the rest is written, and the run says what it cost.
  expect(plan.every((c) => c.model === 'claude-sonnet-5-5')).toBe(true);
  const reviews = model.calls.filter((c) => c.messages[0]!.content.includes('Check this plan the way'));
  expect(reviews).toHaveLength(3);
  expect(reviews.every((c) => c.model === 'claude-opus-5-5')).toBe(true);
  await expect(page.getByText(/That cost less than a cent\./)).toBeVisible();
  expect(model.calls.some((c) => c.messages[0]!.content.includes('"Chloroplasts up close"'))).toBe(true);
  expect(model.calls.some((c) => c.messages[0]!.content.includes('Write one assignment'))).toBe(false);

  // Flagged items are listed in Changes and can be cleared.
  await page.getByRole('button', { name: /To do & history/ }).click();
  const drawer = page.getByRole('dialog', { name: 'To do & history' });
  await expect(drawer.getByText('The answer is not one of the choices.').first()).toBeVisible();
  await drawer.getByRole('button', { name: 'It’s fine' }).first().click();
  await expect(drawer.getByText('The answer is not one of the choices.')).toHaveCount(2);
});

test('a plan review that fails leaves the plan as written, and the course still gets built', async ({ page }) => {
  const model = await fakeAnthropic(page);
  // Registered last, so it sees each request first: the reviewer's calls fail, the rest go on to the fake.
  const reviewed = new Set<string>();
  await page.route('https://api.anthropic.com/**', (route) => {
    const body = route.request().method() === 'POST' ? (route.request().postDataJSON() as { model?: string; messages?: { content: string }[] }) : null;
    if (body?.model !== 'claude-opus-5-5') return route.fallback();
    reviewed.add(body.messages?.[0]?.content ?? '');
    return route.fulfill({ status: 500, headers: { 'access-control-allow-origin': '*' }, json: { type: 'error', error: { type: 'api_error', message: 'Overloaded' } } });
  });
  await withKey(page);
  await page.goto('/');
  await page.getByLabel('Describe your course').fill('Photosynthesis for year 7, two lessons');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('radio', { name: 'Essentials' }).click();
  await page.getByRole('button', { name: 'Write 2 lessons' }).click();
  await expect(page.getByText(/^Course ready/)).toBeVisible({ timeout: 30_000 });
  expect(model.calls.filter((c) => c.messages[0]!.content.includes('Write the lesson plan'))).toHaveLength(2);
  // Both plans went to Opus, and each review failed.
  expect([...reviewed].filter((c) => c.includes('Check this plan the way'))).toHaveLength(2);
  await expect(page.getByRole('button', { name: /^Lesson 1, Lesson plans: 50 min/ })).toContainText('Leaf in the dark');
  // The teacher is told the plans had no second read.
  await page.getByRole('button', { name: /^Lesson 1, Lesson plans/ }).click();
  await expect(page.getByText(/Folio couldn’t check this plan for mistakes this time/).first()).toBeVisible();
});

test('what the plan review can’t fix itself is left on the plan for the teacher', async ({ page }) => {
  await fakeAnthropic(page);
  const issues = [
    { part: 'segment', number: 4, field: 'description', kind: 'consistency', why: 'The two questions are never given.', find: '', replace: '' },
    { part: 'segment', number: 1, field: 'teacherNotes', kind: 'feasibility', why: 'Say how the leaves are kept dark.', find: 'Prepare the leaves two days ahead.', replace: 'Cover a leaf with foil two days ahead.' },
  ];
  await page.route('https://api.anthropic.com/**', (route) => {
    const body = route.request().method() === 'POST' ? (route.request().postDataJSON() as { model?: string }) : null;
    if (body?.model !== 'claude-opus-5-5') return route.fallback();
    const message = { id: 'msg_review', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text: JSON.stringify({ issues }) }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 } };
    return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, json: message });
  });
  await withKey(page);
  await page.goto('/');
  await page.getByLabel('Describe your course').fill('Photosynthesis for year 7, two lessons');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('radio', { name: 'Essentials' }).click();
  await page.getByRole('button', { name: 'Write 2 lessons' }).click();
  await expect(page.getByText(/^Course ready/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /To do & history/ }).click();
  const drawer = page.getByRole('dialog', { name: 'To do & history' });
  await expect(drawer.getByText('Segment 4, Exit ticket: The two questions are never given.')).toHaveCount(2);
  // The fix the review was sure of is made, and not listed.
  await expect(drawer.getByText('Say how the leaves are kept dark.')).toHaveCount(0);
});
