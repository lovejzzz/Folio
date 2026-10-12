import { expect, test } from './fixtures';
import { fakeAnthropic } from './fakeModel';
import { withKey } from './helpers';

test.use({ viewport: { width: 390, height: 844 } });

test('on a phone a stopped build shows about what resuming takes, opens its sentences by touch, and resumes from there', async ({ page }) => {
  await withKey(page);
  await fakeAnthropic(page, { delayMs: 400 });
  await page.goto('/');
  await page.getByLabel('Describe your course').fill('Photosynthesis for year 7, two lessons');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('textbox', { name: 'Title of lesson 2' }).waitFor();
  await page.getByRole('button', { name: 'Write 2 lessons' }).tap();
  await page.getByRole('button', { name: 'Stop', exact: true }).tap();
  await expect(page.getByText(/^Paused · \d+ parts? left$/)).toBeVisible({ timeout: 15_000 });
  // The figure itself is on the screen, whole and inside it: it was hidden on a phone.
  const figure = page.locator('[data-estimate]');
  await expect(figure).toBeVisible();
  // In the header's room: the two ends of the range. The words before it are read out and are in what it opens.
  await expect(figure.locator('[data-estimate-tight]')).toHaveText(/^(?:\$[\d.]+|\d+¢)(?:–(?:\$[\d.]+|\d+¢))?$/);
  await expect(figure).toHaveAccessibleName(/^about /);
  // Nothing in the header is pushed out or onto a second line by it: the course's name and Resume are whole.
  const resume = (await page.getByRole('banner').getByRole('button', { name: 'Resume' }).boundingBox())!;
  expect(resume.x + resume.width).toBeLessThanOrEqual(390);
  expect(Math.abs(resume.y - (await figure.boundingBox())!.y)).toBeLessThan(6);
  expect((await page.getByRole('banner').boundingBox())!.height).toBeLessThan(80);
  const box = (await figure.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  if (process.env.FOLIO_B_SHOTS) await page.screenshot({ path: `${process.env.FOLIO_B_SHOTS}/phone390-paused-line.png` });
  // By touch: who is paid, what the figure is, and Resume, before anything is started.
  await figure.tap();
  const takes = page.getByRole('dialog', { name: 'What resuming will take' });
  await expect(takes).toContainText(/Paused · \d+ parts? left/);
  await expect(takes).toContainText('charged by your provider');
  await expect(takes).toContainText('not a bill and not a limit');
  if (process.env.FOLIO_B_SHOTS) await page.screenshot({ path: `${process.env.FOLIO_B_SHOTS}/phone390-paused-what-it-takes.png` });
  const inside = (await takes.boundingBox())!;
  expect(inside.x).toBeGreaterThanOrEqual(0);
  expect(inside.x + inside.width).toBeLessThanOrEqual(390);
  await takes.getByRole('button', { name: 'Resume' }).tap();
  await expect(page.getByText(/Course ready/)).toBeVisible({ timeout: 60_000 });
});
