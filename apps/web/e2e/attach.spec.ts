import { readFile } from 'node:fs/promises';
import { expect, test } from './fixtures';
import { fakeAnthropic } from './fakeModel';
import { openSample, withKey } from './helpers';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

test('notes attached on the home page (.md and a real .docx) reach the model and the Sources drawer', async ({ page }) => {
  // A real Word file: Folio's own export of the sample course.
  await openSample(page);
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('dialog', { name: 'Export' }).getByRole('button', { name: 'Download Word' }).click();
  const docx = await readFile((await (await download).path())!);

  await withKey(page);
  const model = await fakeAnthropic(page);
  await page.goto('/');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Attach files' }).click();
  await (await chooser).setFiles([
    { name: 'leaf notes.md', mimeType: 'text/markdown', buffer: Buffer.from('# Leaf notes\n\nStomata close at night to save water, and open again when light returns in the morning.') },
    { name: 'statistics.docx', mimeType: DOCX, buffer: docx },
  ]);
  await expect(page.getByRole('list', { name: '2 files attached' })).toBeVisible();

  await page.getByLabel('Describe your course').fill('Photosynthesis for year 7, two lessons');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('textbox', { name: 'Title of lesson 1' }).waitFor();
  const outlinePrompt = model.calls.find((c) => c.messages[0]!.content.includes('Plan exactly'))!.messages.map((m) => m.content).join('\n');
  expect(outlinePrompt).toContain('Stomata close at night');
  expect(outlinePrompt).toContain('Reading the world with data');

  await page.getByRole('button', { name: 'Write 2 lessons' }).click();
  await expect(page.getByText(/Course ready/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Sources', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Sources' });
  // The heading joins its paragraph: one passage, not two.
  await expect(drawer.getByText(/^1 part.Used/)).toBeVisible();
  await expect(drawer.getByText('statistics', { exact: true })).toBeVisible();
});

test('files that cannot be attached are refused in one message', async ({ page }) => {
  await page.goto('/');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Attach files' }).click();
  await (await chooser).setFiles([
    { name: 'broken.docx', mimeType: DOCX, buffer: Buffer.from('not a zip') },
    { name: 'huge.txt', mimeType: 'text/plain', buffer: Buffer.alloc(11 * 1024 * 1024, 'a') },
    { name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from([137, 80, 78, 71]) },
  ]);
  await expect(page.getByText('broken.docx, huge.txt, and photo.png can’t be attached. Attach PDF, Word, .txt or .md files up to 10 MB.')).toBeVisible();
  await expect(page.getByRole('status').getByText(/can’t be/)).toHaveCount(1);
});

test('a brief built on sources, with none attached, suggests attaching them', async ({ page }) => {
  await page.goto('/');
  const hint = page.getByText('Folio writes best from the sources themselves, and quotes only what you attach.');
  await page.getByLabel('Describe your course').fill('Renewable sources of energy for year 8, three lessons.');
  await expect(hint).toHaveCount(0);
  await page.getByLabel('Describe your course').fill('GCSE History, four lessons built around source analysis.');
  await expect(hint).toBeVisible();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Attach them' }).click();
  await (await chooser).setFiles({ name: 'sources.md', mimeType: 'text/markdown', buffer: Buffer.from('Source A: a 1908 cartoon of the Kaiser.') });
  await expect(page.getByRole('button', { name: /^Remove sources/ })).toBeVisible();
  await expect(hint).toHaveCount(0);
});
