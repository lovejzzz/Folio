import { readFileSync } from 'node:fs';
import { expect, test } from './fixtures';

const titleOf = (name: string): string => JSON.parse(readFileSync(new URL(`../public/samples/${name}.json`, import.meta.url), 'utf8')).title;

for (const [name, stage] of [['elementary', 'Elementary school'], ['middle', 'Middle school'], ['university', 'University']] as const) {
  test(`the ${name} sample opens from the home page, and opens the same copy again`, async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Or open a sample course' }).click();
    await page.getByRole('dialog', { name: 'Open a sample course' }).getByRole('button', { name: new RegExp(`^${stage}`) }).click();
    await expect(page.getByRole('grid', { name: 'Lessons and materials' })).toBeVisible();
    await expect(page.getByText(titleOf(name)).first()).toBeVisible();
    const first = page.url();
    await page.goto('/');
    await page.getByRole('button', { name: 'Or open a sample course' }).click();
    await page.getByRole('dialog', { name: 'Open a sample course' }).getByRole('button', { name: new RegExp(`^${stage}`) }).click();
    await expect(page).toHaveURL(first);
  });
}

test('a sample that cannot be fetched says so and leaves the choice open', async ({ page }) => {
  await page.route('**/samples/*.json', (route) => route.fulfill({ status: 503, body: '' }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Or open a sample course' }).click();
  const dialog = page.getByRole('dialog', { name: 'Open a sample course' });
  await dialog.getByRole('button', { name: /^Middle school/ }).click();
  await expect(dialog.getByRole('alert')).toContainText('could not be opened');
  await expect(dialog.getByRole('button', { name: /^Middle school/ })).toBeEnabled();
});

test('“just looking” in the connect dialog offers the samples', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Describe your course').fill('Photosynthesis for grade 7, three lessons');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('dialog', { name: 'Connect an AI' }).getByRole('button', { name: /Just looking/ }).click();
  await expect(page.getByRole('dialog', { name: 'Connect an AI' })).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Open a sample course' }).getByRole('button')).toHaveCount(3);
});
