import { expect, test } from './fixtures';
import { fakeAnthropic } from './fakeModel';
import { withKey } from './helpers';

const outlineCall = (model: Awaited<ReturnType<typeof fakeAnthropic>>) =>
  model.calls.find((c) => /Plan exactly|Plan one lesson for each/.test(c.messages[0]!.content))!.messages[0]!.content;

test('Folio asks about what the brief leaves unclear, one question at a time, and plans from the answers', async ({ page }) => {
  await withKey(page);
  const model = await fakeAnthropic(page);
  await page.goto('/');
  await page.getByLabel('Describe your course').fill('Photosynthesis for year 7 (ask me)');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'How many lessons should the unit have?' })).toBeVisible();
  await expect(page.getByText('1 of 2')).toBeVisible();
  // Nothing chosen yet: the way on is to skip.
  await expect(page.getByRole('button', { name: 'Skip', exact: true })).toBeVisible();
  // Choosing an answer moves on by itself.
  await page.getByText('6 lessons over three weeks').click();
  await expect(page.getByRole('heading', { name: 'How is the unit assessed?' })).toBeVisible();
  await expect(page.getByText('2 of 2')).toBeVisible();

  // Back keeps the answer; Next goes on again.
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('radio', { name: /6 lessons over three weeks/ })).toBeChecked();
  await page.getByRole('button', { name: 'Next' }).click();

  // The teacher's own answer, then the plan.
  await page.getByPlaceholder('Write your own answer…').fill('A poster at the end');
  await page.getByRole('button', { name: 'Plan the course' }).click();
  await expect(page.getByRole('textbox', { name: 'Title of lesson 6' })).toBeVisible();
  const prompt = outlineCall(model);
  expect(prompt).toContain('Before planning, the teacher answered:');
  expect(prompt).toContain('How is the unit assessed? A poster at the end');
});

test('number keys pick an answer, and all the questions can be skipped', async ({ page }) => {
  await withKey(page);
  const model = await fakeAnthropic(page);
  await page.goto('/');
  await page.getByLabel('Describe your course').fill('Photosynthesis for year 7 (ask me)');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'How many lessons should the unit have?' })).toBeVisible();
  await page.keyboard.press('3');
  await expect(page.getByRole('heading', { name: 'How is the unit assessed?' })).toBeVisible();
  await page.getByRole('button', { name: 'Skip the questions' }).click();
  await expect(page.getByRole('textbox', { name: 'Title of lesson 1' })).toBeVisible();
  expect(outlineCall(model)).toContain('How many lessons should the unit have? 2 long lessons');
  expect(outlineCall(model)).not.toContain('How is the unit assessed?');
});

test('a clear brief goes straight to the outline, with no questions', async ({ page }) => {
  await withKey(page);
  await fakeAnthropic(page);
  await page.goto('/');
  await page.getByLabel('Describe your course').fill('Photosynthesis for year 7, three lessons');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('textbox', { name: 'Title of lesson 3' })).toBeVisible();
  await expect(page.getByText('1 of')).toHaveCount(0);
});

test('with a syllabus attached, the number of lessons is read from it', async ({ page }) => {
  await withKey(page);
  const model = await fakeAnthropic(page);
  await page.goto('/');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Attach files' }).click();
  const weeks = Array.from({ length: 5 }, (_, i) => `Week ${i + 1}: topic ${i + 1}`).join('\n');
  await (await chooser).setFiles([{ name: 'BIO 110 syllabus.md', mimeType: 'text/markdown', buffer: Buffer.from(`# BIO 110\n\n${weeks}`) }]);
  const lessons = page.getByRole('combobox', { name: 'Lessons' });
  await expect(lessons).toHaveValue('files');
  await expect(lessons.locator('option:checked')).toHaveText('Lessons from syllabus');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('textbox', { name: 'Title of lesson 5' })).toBeVisible();
  expect(outlineCall(model)).toContain('Plan exactly 5 lessons');

  // A count in the brief is the teacher's word, and wins.
  await page.goto('/');
  await page.getByLabel('Describe your course').fill('Ecology, eight lessons');
  const again = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Attach files' }).click();
  await (await again).setFiles([{ name: 'BIO 110 syllabus.md', mimeType: 'text/markdown', buffer: Buffer.from(weeks) }]);
  await expect(lessons).toHaveValue('8');
});

/** A small real PDF, one line of text per line given: enough for pdf.js to read like a syllabus. */
function pdf(lines: string[]): Buffer {
  const text = lines.map((l, i) => `BT /F1 12 Tf 72 ${720 - i * 18} Td (${l.replace(/[()\\]/g, '\\$&')}) Tj ET`).join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets = objects.map((body, i) => {
    const at = out.length;
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return at;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

test('a PDF syllabus is read, and its schedule sets the lessons', async ({ page }) => {
  await withKey(page);
  const model = await fakeAnthropic(page);
  await page.goto('/');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Attach files' }).click();
  const lines = ['ENV 101 Introduction to Environmental Science', 'Week 1: Systems and cycles', 'Week 2: Energy flow', 'Week 3: Water', 'Week 4: Soils'];
  await (await chooser).setFiles([{ name: 'ENV 101 syllabus.pdf', mimeType: 'application/pdf', buffer: pdf(lines) }]);
  await expect(page.getByRole('list', { name: '1 file attached' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Lessons' })).toHaveValue('files');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('textbox', { name: 'Title of lesson 4' })).toBeVisible();
  const prompt = outlineCall(model);
  expect(prompt).toContain('Plan exactly 4 lessons');
  expect(prompt).toContain('Week 3: Water');
});

test('a syllabus the teacher brings is theirs: Folio checks it instead of writing one', async ({ page }) => {
  await withKey(page);
  const model = await fakeAnthropic(page);
  await page.goto('/');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Attach files' }).click();
  const text = ['# BIO 110 Introduction to Biology', '', 'Grading: quizzes 30%, lab reports 40%, final exam 20%.', '', 'Week 1: Cells', 'Week 2: Genes', 'Week 3: Evolution'].join('\n');
  await (await chooser).setFiles([{ name: 'BIO 110 syllabus.md', mimeType: 'text/markdown', buffer: Buffer.from(text) }]);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('textbox', { name: 'Title of lesson 3' })).toBeVisible();
  // The check was asked for, with the syllabus itself.
  await expect.poll(() => model.calls.some((c) => JSON.stringify(c.messages).includes('A teacher attached this syllabus'))).toBe(true);

  await page.goto(page.url().replace(/\/plan$/, '/m/syllabus'));
  await expect(page.getByText(/You brought your own syllabus, so Folio didn’t write one/)).toBeVisible();
  await expect(page.getByText('What Folio’s check found')).toBeVisible();
  await expect(page.getByText('The weights add up to 90%, not 100%. Give the final exam 30%.')).toBeVisible();
  await expect(page.getByText('Your syllabus', { exact: true })).toBeVisible();
  await expect(page.getByText('Week 2: Genes')).toBeVisible();
  // Folio's own schedule table is not drawn.
  await expect(page.getByRole('table')).toHaveCount(0);
});

test('arrow keys move through the answers without moving on; Enter does', async ({ page }) => {
  await withKey(page);
  await fakeAnthropic(page);
  await page.goto('/');
  await page.getByLabel('Describe your course').fill('Photosynthesis for year 7 (ask me)');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'How many lessons should the unit have?' })).toBeVisible();
  await page.getByRole('radio').first().focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('radio').nth(2)).toBeChecked();
  // Longer than the pause before a chosen answer moves on.
  await page.waitForTimeout(600);
  await expect(page.getByRole('heading', { name: 'How many lessons should the unit have?' })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'How is the unit assessed?' })).toBeVisible();
});
