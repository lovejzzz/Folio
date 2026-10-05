import { expect, test } from './fixtures';
import { openSample } from './helpers';

async function sampleId(page: import('@playwright/test').Page): Promise<string> {
  await openSample(page);
  return new URL(page.url()).pathname.split('/')[2]!;
}

test('an unknown material says so inside the course, with the way back to the map', async ({ page }) => {
  const id = await sampleId(page);
  await page.goto(`/c/${id}/m/bogus`);
  await expect(page.getByRole('heading', { level: 1, name: 'No such material' })).toBeVisible();
  await expect(page.getByText('This course isn’t on this device.')).toHaveCount(0);
  await expect(page).toHaveTitle('No such material · Folio');
  // The course header is there once: no second header from a standalone page.
  await expect(page.getByRole('banner')).toHaveCount(1);
  await expect(page.getByRole('banner').getByRole('link', { name: 'Reading the world with data' })).toBeVisible();
  await page.getByRole('link', { name: 'Open the overview' }).click();
  await expect(page.getByRole('grid', { name: 'Lessons and materials' })).toBeVisible();
});

test('an unknown lesson says so inside the course, without a second header', async ({ page }) => {
  const id = await sampleId(page);
  await page.goto(`/c/${id}/lesson/l_nope`);
  await expect(page.getByRole('heading', { level: 1, name: 'This lesson isn’t in this course' })).toBeVisible();
  await expect(page.getByText('This course isn’t on this device.')).toHaveCount(0);
  await expect(page.getByRole('banner')).toHaveCount(1);
  await expect(page.getByRole('main')).toHaveCount(1);
  await expect(page).toHaveTitle('This lesson isn’t in this course · Folio');
  await page.getByRole('link', { name: 'Open the overview' }).click();
  await expect(page.getByRole('grid', { name: 'Lessons and materials' })).toBeVisible();
});

test('an unknown address gets a styled page with a link home', async ({ page }) => {
  await page.goto('/nowhere/at/all');
  await expect(page.getByRole('heading', { level: 1, name: 'There’s no page here' })).toBeVisible();
  await expect(page.getByText('Not Found', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Library' })).toBeVisible();
  await expect(page).toHaveTitle('There’s no page here · Folio');
  await page.getByRole('link', { name: 'Go to the home page' }).click();
  await expect(page.getByLabel('Describe your course')).toBeVisible();
});

test('an unknown address inside a course keeps the course header; a missing course gets its own page', async ({ page }) => {
  const id = await sampleId(page);
  await page.goto(`/c/${id}/nowhere`);
  await expect(page.getByRole('heading', { level: 1, name: 'There’s no page here' })).toBeVisible();
  await expect(page.getByRole('banner')).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Open the overview' })).toBeVisible();

  await page.goto('/c/c_missing/map');
  await expect(page.getByRole('heading', { level: 1, name: 'This course isn’t on this device.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Library' }).first()).toBeVisible();
});

test('the home page keeps to the new course: courses are in the library, and About says who makes Folio', async ({ page }) => {
  await openSample(page);
  await page.goto('/');
  await expect(page.getByText('Reading the world with data')).toHaveCount(0);
  // The footer sits at the bottom of the window, not straight under the examples.
  const footer = (await page.getByRole('contentinfo').boundingBox())!;
  expect(footer.y + footer.height).toBeGreaterThan(page.viewportSize()!.height - 8);
  await page.getByRole('contentinfo').getByRole('link', { name: 'About' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'A whole course, written to fit together.' })).toBeVisible();
  // Who makes it is said once, with one way to write to them.
  await expect(page.getByText('Tian Xing')).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'xingpicture@gmail.com' })).toHaveAttribute('href', 'mailto:xingpicture@gmail.com');
  await expect(page).toHaveTitle('About Folio · Folio');
});

test('a link to one material of a lesson opens on that material, after a reload too', async ({ page }) => {
  await openSample(page);
  await page.getByRole('link', { name: /Center and spread/ }).first().click();
  // The address a teacher copies after opening the quiz from the overview: opened cold, it showed the top of the plan.
  await page.goto(`${new URL(page.url()).pathname}?m=quiz`);
  const quiz = page.locator('#m-quiz');
  await expect(quiz).toBeInViewport();
  await expect.poll(async () => (await quiz.boundingBox())?.y ?? 9999).toBeLessThan(200);
});
