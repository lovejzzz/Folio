import { readFileSync } from 'node:fs';
import { orderedLessons, parseCourse } from '@folio/core';
import { writeFolio } from '@folio/export';
import { expect, test } from './fixtures';

/**
 * A lesson Folio really wrote, in which the plan and its slide ask a paragraph of six sentences and the piece of three:
 * opened from a backup file as a teacher would, its page says so under "Yours to check", and names nothing as changed.
 */
const course = parseCourse(JSON.parse(readFileSync(new URL('../../../packages/ai/test/fixtures/r39-english-composition.json', import.meta.url), 'utf8')) as unknown);

test('a piece told two ways across a lesson\'s materials is on the lesson\'s list', async ({ page }) => {
  await page.goto('/library');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open a backup file' }).click();
  await (await chooser).setFiles({ name: 'composition.folio', mimeType: 'application/zip', buffer: Buffer.from(writeFolio(course)) });
  await expect(page.getByRole('grid', { name: 'Lessons and materials' })).toBeVisible({ timeout: 30_000 });
  const courseId = /\/c\/([^/]+)/.exec(page.url())![1]!;
  await page.goto(`/c/${courseId}/lesson/${orderedLessons(course)[0]!.id}`);
  const list = page.getByRole('region', { name: 'Yours to check' });
  await expect(list).toContainText('The same piece of work, told two ways: “Short in-class writing”, length: the plan says 6 sentences and the piece 3 sentences.');
  await expect(list).toContainText('the piece says 3 sentences and its slide 6 sentences.');
  if (process.env.FOLIO_SHOT_DIR) await list.screenshot({ path: `${process.env.FOLIO_SHOT_DIR}/terms-${test.info().project.name}.png` });
});
