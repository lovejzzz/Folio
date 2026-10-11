import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { expect, test } from './fixtures';

/**
 * Courses Folio really wrote, opened in the app from their backup files and printed for each audience: the pages are
 * looked at (screenshots kept) and the PDFs are kept to be read. Runs only when FOLIO_REAL_DIR names a folder holding
 * `backups/*.folio`; the suite's other tests use a stand-in model and a sample course.
 */
const dir = process.env.FOLIO_REAL_DIR;
const KINDS = ['syllabus', 'plan', 'slides', 'assignments', 'rubrics', 'discussions', 'quiz', 'study', 'faq'];

for (const file of dir ? readdirSync(`${dir}/backups`).filter((f) => f.endsWith('.folio')) : []) {
  const name = file.replace('.folio', '');
  test(`a course Folio wrote opens, shows its lessons, and prints for students and for the teacher: ${name}`, async ({ page }) => {
    test.setTimeout(180_000);
    const out = `${dir}/render/${name}`;
    mkdirSync(out, { recursive: true });
    await page.goto('/library');
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Open a backup file' }).click();
    await (await chooser).setFiles({ name: file, mimeType: 'application/zip', buffer: readFileSync(`${dir}/backups/${file}`) });
    await expect(page.getByRole('grid', { name: 'Lessons and materials' })).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: `${out}/map.png`, fullPage: true });
    const courseId = /\/c\/([^/]+)/.exec(page.url())![1]!;
    // The lesson plans, the decks and the quizzes, as their pages show them.
    for (const kind of ['plan', 'slides', 'quiz']) {
      await page.goto(`/c/${courseId}/m/${kind}`);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: `${out}/${kind}.png`, fullPage: true });
    }
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    for (const audience of ['student', 'teacher'] as const) {
      await page.goto(`/print/${courseId}?kinds=${encodeURIComponent(JSON.stringify(KINDS))}&audience=${encodeURIComponent(JSON.stringify(audience))}`);
      await expect(page.locator('main, article, body').first()).toBeVisible();
      await page.waitForLoadState('networkidle');
      writeFileSync(`${out}/${audience}.txt`, await page.locator('body').innerText());
      writeFileSync(`${out}/${audience}.pdf`, await page.pdf({ format: 'Letter', printBackground: false }));
    }
    const student = readFileSync(`${out}/student.txt`, 'utf8');
    const teacher = readFileSync(`${out}/teacher.txt`, 'utf8');
    expect(student).not.toContain('Answer key');
    expect(teacher).toContain('Answer key');
    expect(student.length).toBeGreaterThan(5_000);
    expect(errors).toEqual([]);
  });
}

test('real courses are checked only when a folder of them is named', () => {
  test.skip(Boolean(dir), 'a folder is named: the tests above ran');
  expect(dir).toBeUndefined();
});
