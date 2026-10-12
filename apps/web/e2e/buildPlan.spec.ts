import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { fakeAnthropic } from './fakeModel';
import { withKey } from './helpers';

const cors = { 'access-control-allow-origin': '*' };
const note = (page: Page | Locator) => page.getByRole('note', { name: 'What this will take' });
/** The upper figure of a range said in dollars. */
const upper = (text: string) => Number(text.match(/to \$([\d.]+)/)?.[1] ?? NaN);
const said = (calls: { messages: { content: unknown }[] }[], words: string) => calls.filter((c) => JSON.stringify(c).includes(words)).length;

async function planTwoLessons(page: Page) {
  await page.goto('/');
  await page.getByLabel('Describe your course').fill('Photosynthesis for year 7, two lessons');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('textbox', { name: 'Title of lesson 2' }).waitFor();
}

test('before the first build: a range at the model chosen, that follows the materials chosen', async ({ page }) => {
  await withKey(page);
  await fakeAnthropic(page);
  await planTwoLessons(page);
  // A key of one's own: dollars at the provider, for the model, and never credits.
  await expect(note(page)).toContainText(/About (?:\$[\d.]+|\d+¢) to \$[\d.]+ charged by your provider for claude-sonnet-5-5, not by Folio\./);
  await expect(note(page)).not.toContainText('credits');
  await expect(note(page)).toContainText('not a bill and not a limit');
  const all = upper((await note(page).textContent())!);
  // Fewer materials: the figure beside the button is of what will be written now.
  await page.getByRole('radio', { name: 'Essentials' }).click();
  await expect.poll(async () => upper((await note(page).textContent())!)).toBeLessThan(all);
});

test('a model with no known price gets no figure, and a dearer model a dearer one', async ({ page }) => {
  await withKey(page, { anthropic: 'claude-mystery-9' });
  await fakeAnthropic(page);
  await planTwoLessons(page);
  await expect(note(page)).toContainText(/No price is known for claude-mystery-9, so no figure can be given: \d+ parts are to be written, charged by your provider\./);
  await expect(note(page)).not.toContainText('$');
});

test('failed parts: trying them all again and Resume are priced from what is left, and run only that', async ({ page }) => {
  await withKey(page);
  const model = await fakeAnthropic(page);
  let fail = true;
  await page.route('https://api.anthropic.com/**', (route) =>
    fail && (route.request().postData() ?? '').includes('Write a slide deck') ? route.fulfill({ status: 500, headers: cors, json: { type: 'error', error: { type: 'api_error', message: 'Internal' } } }) : route.fallback(),
  );
  await planTwoLessons(page);
  const whole = upper((await note(page).textContent())!);
  await page.getByRole('button', { name: 'Write 2 lessons' }).click();
  await expect(page.getByText('2 parts couldn’t be written.')).toBeVisible({ timeout: 30_000 });
  // Paused: what is left, counted and priced from one list.
  await expect(page.getByText('Paused · 2 parts left')).toBeVisible();
  const paused = page.locator('[data-estimate]');
  await expect(paused).toHaveText(/^about (?:\$[\d.]+|\d+¢) to \$[\d.]+$/);
  const left = upper((await paused.textContent())!);
  expect(left).toBeLessThan(whole);
  // Trying both again from the list of what failed: the same two parts, the same figure.
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  const changes = page.getByRole('dialog', { name: 'To do & history' });
  await expect(note(changes)).toContainText(/About (?:\$[\d.]+|\d+¢) to \$[\d.]+ charged by your provider/);
  expect(upper((await note(changes).textContent())!)).toBe(left);
  await expect(changes.getByRole('button', { name: 'Try all 2 again' })).toBeVisible();
  await page.keyboard.press('Escape');
  // Resume writes the two decks and nothing that was written already.
  fail = false;
  const before = model.calls.length;
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.getByText(/Course ready/)).toBeVisible({ timeout: 30_000 });
  const after = model.calls.slice(before);
  expect(said(after, 'Write a slide deck')).toBe(2);
  expect(said(after, 'Write the lesson plan')).toBe(0);
  expect(said(after, 'quiz questions')).toBe(0);
  await expect(page.getByText(/^Paused/)).toHaveCount(0);
});

test('a part asked for by name brings the plan it is written from: said beside the button, and written first', async ({ page }) => {
  await withKey(page);
  const model = await fakeAnthropic(page);
  await planTwoLessons(page);
  // The second lesson's plan fails: plans are written in order, so the first title seen in a plan's request is lesson 1's.
  let fail = true;
  let first = '';
  await page.route('https://api.anthropic.com/**', (route) => {
    const body = route.request().postData() ?? '';
    const title = body.includes('Write the lesson plan') ? (body.match(/This is the lesson \\"([^"\\]+)/)?.[1] ?? '') : '';
    first ||= title;
    return fail && title && title !== first ? route.fulfill({ status: 500, headers: cors, json: { type: 'error', error: { type: 'api_error', message: 'Internal' } } }) : route.fallback();
  });
  await page.getByRole('radio', { name: 'Essentials' }).click();
  await page.getByRole('button', { name: 'Write 2 lessons' }).click();
  await expect(page.getByText(/parts couldn’t be written\./)).toBeVisible({ timeout: 30_000 });
  // On the second lesson's slides: one part asked for, two to be written, and the teacher is told which and why.
  const links = await page.locator('a[href*="/lesson/"]').evaluateAll((all) => [...new Set(all.map((a) => a.getAttribute('href')!))]);
  expect(links).toHaveLength(2);
  await page.locator(`a[href="${links[1]}"]`).last().click();
  const slides = note(page).filter({ hasText: 'which the slide deck is written from' });
  await expect(slides).toContainText('Also written: the lesson plan of lesson 2, which the slide deck is written from.');
  fail = false;
  const before = model.calls.length;
  await slides.locator('xpath=..').getByRole('button', { name: 'Try again' }).click();
  await expect(slides).toHaveCount(0, { timeout: 30_000 });
  // The note goes as the parts are queued; the deck is asked for once the plan is in.
  await expect.poll(() => said(model.calls.slice(before), 'Write a slide deck'), { timeout: 30_000 }).toBeGreaterThan(0);
  const after = model.calls.slice(before);
  const planAt = after.findIndex((c) => JSON.stringify(c).includes('Write the lesson plan'));
  const deckAt = after.findIndex((c) => JSON.stringify(c).includes('Write a slide deck'));
  expect(planAt).toBeGreaterThanOrEqual(0);
  expect(deckAt).toBeGreaterThan(planAt);
});

test('stopped by hand, the page opened again: the pause says what is left and about what it takes, and Resume writes only that', async ({ page }) => {
  await withKey(page);
  const model = await fakeAnthropic(page, { delayMs: 400 });
  await planTwoLessons(page);
  const whole = upper((await note(page).textContent())!);
  await page.getByRole('button', { name: 'Write 2 lessons' }).click();
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.getByText(/^Paused · \d+ parts? left$/)).toBeVisible({ timeout: 15_000 });
  await page.reload();
  const line = (await page.getByText(/^Paused · \d+ parts? left$/).textContent())!;
  const left = Number(line.match(/(\d+) part/)![1]);
  const paused = page.locator('[data-estimate]');
  await expect(paused).toHaveText(/^about (?:\$[\d.]+|\d+¢) to \$[\d.]+$/);
  expect(upper((await paused.textContent())!)).toBeLessThanOrEqual(whole);
  // The figure is a button: pressed, it shows who is paid and that it is an estimate, with Resume under it.
  await paused.click();
  const takes = page.getByRole('dialog', { name: 'What resuming will take' });
  await expect(takes).toContainText(/charged by your provider for claude-sonnet-5-5, not by Folio\./);
  await expect(takes).toContainText('not a bill and not a limit');
  await page.keyboard.press('Escape');
  const before = model.calls.length;
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.getByText(/Course ready/)).toBeVisible({ timeout: 60_000 });
  // No part is written twice: at most one request to write each kind of part for each part that was left.
  const after = model.calls.slice(before);
  const writes = ['Write the lesson plan', 'Write a slide deck', 'quiz questions'].reduce((n, words) => n + said(after, words), 0);
  expect(writes).toBeLessThanOrEqual(left);
  await expect(page.getByText(/^Paused/)).toHaveCount(0);
});
