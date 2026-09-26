import { expect, test } from '@playwright/test';
import { fakeAnthropic } from './fakeModel';

test('describe, plan, build and land on a finished map', async ({ page }) => {
  const model = await fakeAnthropic(page, { delayMs: 50 });
  await page.goto('/');
  await page.getByLabel('Describe your course').fill('Photosynthesis for year 7, three lessons, with a short quiz each lesson');
  await expect(page.getByRole('combobox', { name: 'Lessons' })).toHaveValue('3');
  await page.getByRole('button', { name: 'Continue' }).click();

  // No model yet: the guided key setup appears.
  const dialog = page.getByRole('dialog', { name: 'Connect a model' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('API key').fill('sk-ant-test');
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

  await page.getByRole('radio', { name: 'Core set' }).click();
  await page.getByRole('button', { name: 'Build 3 lessons' }).click();

  await expect(page.getByRole('grid', { name: 'Lessons and materials' })).toBeVisible();
  await expect(page.getByText(/Course ready\. 3 items need a look\./)).toBeVisible({ timeout: 30_000 });
  const plan = model.calls.filter((c) => c.messages[0]!.content.includes('Write the lesson plan'));
  expect(plan).toHaveLength(3);
  expect(model.calls.some((c) => c.messages[0]!.content.includes('"Chloroplasts up close"'))).toBe(true);
  expect(model.calls.some((c) => c.messages[0]!.content.includes('Write one assignment'))).toBe(false);

  // Flagged items are listed in Changes and can be cleared.
  await page.getByRole('button', { name: 'Changes', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Changes' });
  await expect(drawer.getByText('The answer is not one of the choices.').first()).toBeVisible();
  await drawer.getByRole('button', { name: 'Mark as fine' }).first().click();
  await expect(drawer.getByText('The answer is not one of the choices.')).toHaveCount(2);
});
