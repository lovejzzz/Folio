import { expect, test } from './fixtures';
import { openSample, retype } from './helpers';

test('numbers the cabinet draws too small are said, with the row of numbers one press away; the larger picture opens by its button', async ({ page }) => {
  await openSample(page);
  await page.goto(page.url().replace(/\/map$/, '/m/slides'));
  await page.getByRole('button', { name: 'Add a binary search demonstration' }).click();
  const data = page.getByRole('group', { name: 'The demonstration’s numbers' });
  const tools = page.getByRole('group', { name: 'Work the demonstration' });
  const note = data.getByRole('note').filter({ hasText: 'The cabinet’s labels are small for these numbers' });
  // Nine short numbers: the cabinet has room, and nothing is said.
  await expect(page.getByRole('group', { name: 'Binary search, step by step' }).locator('[data-drawer]')).toHaveCount(9);
  await expect(note).toHaveCount(0);
  // Long numbers: drawn all the same, and the teacher is told. Nothing is switched unasked.
  await retype(page, 'The list, in ascending order', '-9999, -12.5, 0.001, 1.25, 480, 12345, 99999');
  await expect(note).toBeVisible();
  await expect(data.getByRole('radio', { name: 'A cabinet of drawers' })).toBeChecked();
  await note.getByRole('button', { name: 'Draw it as a row of numbers' }).click();
  await expect(data.getByRole('radio', { name: 'A row of numbers' })).toBeChecked();
  await expect(note).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Binary search, step by step' }).locator('path.flat').first()).toBeVisible();
  // On a wide screen the larger picture is closed until asked for; it steps with the slide's picture.
  const large = page.getByRole('group', { name: 'The demonstration, larger' });
  await expect(large).toHaveCount(0);
  await tools.getByRole('button', { name: 'Show the picture larger' }).click();
  await expect(large.locator('[data-drawer]')).toHaveCount(7);
  await tools.getByRole('button', { name: 'Next step' }).click();
  await expect(large.locator('[data-drawer="3"]')).toHaveAttribute('data-state', 'look');
  await tools.getByRole('button', { name: 'Hide the larger picture' }).click();
  await expect(large).toHaveCount(0);
});
