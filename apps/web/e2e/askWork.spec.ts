import { orderedLessons } from '@folio/core';
import { sampleCourse } from '@folio/core/sample';
import { writeFolio } from '@folio/export';
import { fakeAnthropic } from './fakeModel';
import { expect, test } from './fixtures';
import { withKey } from './helpers';

/**
 * A material added later by a request in words. The preview used to name the step alone ("Include study guides"), and
 * Apply went on to write a study guide for every lesson with no part named and no figure shown.
 */
function withoutStudy() {
  const course = sampleCourse();
  for (const lesson of orderedLessons(course)) delete lesson.gen.study;
  course.materials.study.enabled = false;
  // A deck the teacher changed by hand: adding another material must not write it again.
  const first = orderedLessons(course)[0]!;
  first.gen.slides = { ...first.gen.slides!, edited: true };
  return course;
}

test('⌘K says what Apply goes on to write and what it takes, writes nothing before Apply, and then writes that', async ({ page }) => {
  await withKey(page);
  const model = await fakeAnthropic(page);
  await page.goto('/library');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open a backup file' }).click();
  await (await chooser).setFiles({ name: 'no-study.folio', mimeType: 'application/zip', buffer: Buffer.from(writeFolio(withoutStudy())) });
  await expect(page.getByRole('grid', { name: 'Lessons and materials' })).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press('ControlOrMeta+k');
  await page.keyboard.type('Add study guides');
  await page.getByRole('option', { name: /Add study guides/ }).click();
  await expect(page.getByText('Include study guides')).toBeVisible();
  const work = page.getByRole('note', { name: 'Applying this then writes:' });
  await expect(work).toContainText('Study guides, lessons 1, 2, 3, 4: written for the first time');
  // A figure for those four parts, at the model chosen: with a key of the teacher's own, in the provider's money.
  await expect(work).toContainText(/\$|¢/);
  await expect(work).not.toContainText('Slide decks');
  // Only the plan itself has been asked of the model so far.
  const asked = model.calls.length;
  expect(asked).toBe(1);
  await page.waitForTimeout(600);
  expect(model.calls.length).toBe(asked);
  if (process.env.FOLIO_SHOT_DIR) await page.screenshot({ path: `${process.env.FOLIO_SHOT_DIR}/ask-preview-${test.info().project.name}.png` });
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect.poll(() => model.calls.length - asked, { timeout: 30_000 }).toBeGreaterThanOrEqual(4);
  await page.waitForTimeout(1_000);
  const prompts = model.calls.slice(asked).map((c) => JSON.stringify(c));
  expect(prompts.filter((p) => p.includes('Write a study guide'))).toHaveLength(4);
  expect(prompts.filter((p) => p.includes('Write a slide deck'))).toHaveLength(0);
  if (process.env.FOLIO_SHOT_DIR) await page.screenshot({ path: `${process.env.FOLIO_SHOT_DIR}/ask-after-${test.info().project.name}.png` });
});
