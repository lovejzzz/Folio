import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { crc32, deflateSync } from 'node:zlib';
import { unzipSync } from 'fflate';
import { orderedLessons, parseCourse, type PageBlock } from '@folio/core';
import { sampleCourse } from '@folio/core/sample';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { retype, settled } from './helpers';

/** A small PNG of one colour, made here so the test carries no binary file. */
function png(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x66)]);
  const pixels = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
}

/** Two frames of grey, 32 by 18, as WebM: every Chromium plays it. */
const CLIP = Buffer.from('GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAAIAEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHYTbuMU6uEElTDZ1OsggElTbuMU6uEHFO7a1OsggHq7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsirXsYMPQkBNgI1MYXZmNjIuMTIuMTAyV0GNTGF2ZjYyLjEyLjEwMkSJiEB5AAAAAAAAFlSua8iuAQAAAAAAAD/XgQFzxYgof/H0FR++vpyBACK1nIN1bmSIgQCGhVZfVlA4g4EBI+ODhAvrwgDgkLCBILqBEpqBAlWwhFW5gQESVMNn/HNzoGPAgGfImkWjh0VOQ09ERVJEh41MYXZmNjIuMTIuMTAyc3PWY8CLY8WIKH/x9BUfvr5nyKFFo4dFTkNPREVSRIeUTGF2YzYyLjI4LjEwMiBsaWJ2cHhnyKFFo4hEVVJBVElPTkSHkzAwOjAwOjAwLjQwMDAwMDAwMAAfQ7Z1v+eBAKOjgQAAgDACAJ0BKiAAEgAARwiFhYiFhIgCAgAHkPPJwP73VICjlYEAyACxAQABEBAAGAAYWC/0AAhwABxTu2uRu4+zgQC3iveBAfGCAabwgQM=', 'base64');

const slot = { src: '', caption: '', alt: 'The arena seen from above', shows: 'The whole arena, with the ball at its centre.' };
const PAGE: PageBlock[] = [
  { id: 'x_lead', type: 'text', text: 'This week you build the arena.' },
  { id: 'x_part', type: 'heading', level: 2, text: 'Build the arena' },
  { id: 'x_steps', type: 'steps', items: [{ id: 'x_s1', text: 'Make a cube and name it Floor.' }] },
  { id: 'x_pic', type: 'image', ...slot },
  { id: 'x_away', type: 'image', ...slot, src: 'media:m_elsewhere.png', shows: 'The scoreboard.' },
  { id: 'x_clip', type: 'video', src: '', poster: '', caption: 'Rolling the ball', alt: 'The ball rolls to the wall', shows: 'The ball rolling.', minutes: 0, transcript: '', clip: true },
  { id: 'x_file', type: 'file', href: '', label: '', role: 'starter', shows: 'The project as it starts.' },
];

/** The statistics course, taught online, its first week a page with a picture and a file still to add. */
function onlineCourse() {
  const base = sampleCourse();
  const first = orderedLessons(base)[0]!;
  const course = parseCourse({ ...base, delivery: 'online-async', lessons: { ...base.lessons, [first.id]: { ...first, page: PAGE } } });
  return { course, week: first.title };
}

async function openWeek(page: Page): Promise<void> {
  const { course, week } = onlineCourse();
  await page.route('**/samples/*.json', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(course) }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Or open a sample course' }).click();
  await page.getByRole('dialog', { name: 'Open a sample course' }).getByRole('button', { name: /^Introduction to ethics/ }).click();
  await expect(page.getByRole('grid', { name: 'Lessons and materials' })).toBeVisible();
  await page.getByRole('link', { name: new RegExp(week) }).first().click();
  await expect(page.getByText('Screenshot to add').first()).toBeVisible();
}

test('a teacher adds a picture to a page, captions it, removes it and brings it back', async ({ page }) => {
  // Busy machines build and store slowly: the steps are few, the waits generous.
  test.setTimeout(120_000);
  await openWeek(page);
  const picture = page.locator('.mod-figure img');
  const empty = page.locator('.mod-slot[data-slot="image"]').filter({ hasText: 'The whole arena' });
  // A picture the course names and this device does not hold shows as its place, and says why.
  await expect(page.locator('.mod-slot').filter({ hasText: 'The scoreboard.' })).toContainText('This was added on another device. Add it here to see it.');
  await expect(empty).toContainText('The whole arena, with the ball at its centre.');
  await expect(empty.getByRole('button', { name: 'Add picture' })).toBeVisible();

  // What is not a picture is refused where it was offered, in words.
  await empty.locator('input[type=file]').setInputFiles({ name: 'notes.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF') });
  await expect(empty.getByRole('alert')).toHaveText('That file is not a picture Folio can show. Use a PNG, JPEG, WebP or GIF.');

  await empty.locator('input[type=file]').setInputFiles({ name: 'arena.png', mimeType: 'image/png', buffer: png(64, 36) });
  await expect(picture).toBeVisible({ timeout: 20_000 });
  await expect(picture).toHaveAttribute('alt', 'The arena seen from above');
  await expect(picture).toHaveJSProperty('naturalWidth', 64);
  await expect(empty).toHaveCount(0);

  await retype(page, 'Caption', 'The finished arena');
  await expect(page.getByRole('textbox', { name: 'Description for students who can’t see it' })).toHaveText('The arena seen from above');
  await expect(page.locator('.mod-figure figcaption')).toHaveText('The finished arena');

  // The page with a picture, its fields and buttons, and the places still empty beside it, passes axe in both schemes.
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    // A busy machine measured the objectives' heading while the page was still fading in.
    await settled(page);
    const results = await new AxeBuilder({ page }).include('.mod').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    expect(results.violations.map((v) => `${colorScheme}: ${v.id} ${v.nodes[0]?.target.join(' ')}`)).toEqual([]);
  }

  // The picture is on this device, not in the page that was open: a reload reads it again.
  await page.reload();
  await expect(picture).toBeVisible({ timeout: 20_000 });
  await expect(picture).toHaveJSProperty('naturalWidth', 64);
  await expect(page.locator('.mod-figure figcaption')).toHaveText('The finished arena');

  await page.getByRole('button', { name: 'Remove picture' }).click();
  await expect(picture).toHaveCount(0);
  await expect(empty).toContainText('The whole arena, with the ball at its centre.');

  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.getByText('Undone.')).toBeVisible();
  await expect(picture).toBeVisible({ timeout: 20_000 });
  await expect(picture).toHaveJSProperty('naturalWidth', 64);
});

test('an attached file takes its own name and downloads under it', async ({ page }) => {
  test.setTimeout(120_000);
  await openWeek(page);
  const row = page.locator('.mod-file-row');
  await expect(row.getByText('File to add')).toBeVisible();
  await row.locator('input[type=file]').setInputFiles({ name: 'ArenaStart.zip', mimeType: 'application/zip', buffer: Buffer.from('the starter project') });
  const link = row.getByRole('link', { name: /ArenaStart\.zip/ });
  await expect(link).toBeVisible({ timeout: 20_000 });
  const [download] = await Promise.all([page.waitForEvent('download'), link.click()]);
  expect(download.suggestedFilename()).toBe('ArenaStart.zip');
  await row.getByRole('button', { name: 'Remove file' }).click();
  await expect(row.getByText('File to add')).toBeVisible();
});

test('a picture and a clip go out with the Word file, the zip and the backup, and print', async ({ page, context }) => {
  test.setTimeout(180_000);
  await openWeek(page);
  await page.locator('.mod-slot[data-slot="image"] input[type=file]').first().setInputFiles({ name: 'arena.png', mimeType: 'image/png', buffer: png(64, 36) });
  await expect(page.locator('.mod-figure img')).toBeVisible({ timeout: 20_000 });
  // The clip plays from this device, under the policy the site is served with, and gets its first frame as a poster.
  await expect(page.getByText('Clip to add')).toBeVisible();
  await page.locator('.mod-slot[data-slot="video"] input[type=file]').setInputFiles({ name: 'roll.webm', mimeType: 'video/webm', buffer: CLIP });
  const clip = page.locator('.mod-figure video');
  await expect(clip).toBeVisible({ timeout: 30_000 });
  await expect(clip).toHaveAttribute('poster', /^blob:/);
  await expect.poll(() => clip.evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: 20_000 }).toBe(32);

  // Word, for this week: the picture and the clip's poster are in the file, not only named.
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Export' });
  await drawer.getByRole('radio', { name: 'You (answers)' }).click();
  const word = page.waitForEvent('download');
  await drawer.getByRole('button', { name: 'Download Word' }).click();
  const docx = unzipSync(await readFile((await (await word).path())!));
  expect(Object.keys(docx).filter((n) => /^word\/media\/.+\.(png|jpg)$/.test(n))).toHaveLength(2);

  // Everything: the files themselves, named for where they go, and a backup that holds them.
  await drawer.getByRole('radio', { name: 'Whole course', exact: true }).click();
  await drawer.getByText('Everything (ZIP)', { exact: true }).click();
  const everything = page.waitForEvent('download');
  await drawer.getByRole('button', { name: 'Download Everything (ZIP)' }).click();
  const zip = unzipSync(await readFile((await (await everything).path())!));
  expect(Object.keys(zip).filter((n) => n.startsWith('media/')).sort()).toEqual(['media/week-1-1-the-arena-seen-from-above.png', 'media/week-1-3-rolling-the-ball.webm']);
  const backup = zip[Object.keys(zip).find((n) => n.endsWith('.folio'))!]!;
  expect(Object.keys(unzipSync(backup)).filter((n) => n.startsWith('media/'))).toHaveLength(3);

  // The backup opens as a copy with its picture and clip.
  await page.goto('/library');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open a backup file' }).click();
  await (await chooser).setFiles({ name: 'backup.folio', mimeType: 'application/zip', buffer: Buffer.from(backup) });
  await expect(page.getByRole('grid', { name: 'Lessons and materials' })).toBeVisible();
  const copyId = new URL(page.url()).pathname.split('/')[2]!;
  await page.getByRole('link', { name: new RegExp(onlineCourse().week) }).first().click();
  await expect(page.locator('.mod-figure img')).toHaveJSProperty('naturalWidth', 64);
  await expect(page.locator('.mod-figure video')).toBeVisible();

  // Print waits for the pictures: when it is asked for, both are loaded.
  const print = await context.newPage();
  await print.addInitScript(() => {
    window.print = () => {
      const pictures = [...document.querySelectorAll<HTMLImageElement>('#main img')];
      document.body.dataset.printed = `${pictures.filter((i) => i.complete && i.naturalWidth > 0).length} of ${pictures.length}`;
    };
  });
  await print.goto(`/print/${copyId}`);
  await expect(print.locator('body')).toHaveAttribute('data-printed', '2 of 2', { timeout: 30_000 });
});

test('a picture dropped on its place, or pasted while its button has the focus, is taken', async ({ page }) => {
  test.setTimeout(120_000);
  await openWeek(page);
  const empty = page.locator('.mod-slot[data-slot="image"]').filter({ hasText: 'The whole arena' });
  const picture = page.locator('.mod-figure img');
  /** Hand the place a file the way the browser does for a drop or a paste. */
  const give = (event: 'drop' | 'paste', bytes: number[]) =>
    empty.getByRole('button', { name: 'Add picture' }).evaluate(
      (button, { event, bytes }) => {
        const data = new DataTransfer();
        data.items.add(new File([new Uint8Array(bytes)], 'arena.png', { type: 'image/png' }));
        const init = { bubbles: true, cancelable: true };
        button.focus();
        button.dispatchEvent(event === 'drop' ? new DragEvent('drop', { ...init, dataTransfer: data }) : new ClipboardEvent('paste', { ...init, clipboardData: data }));
      },
      { event, bytes },
    );
  await give('drop', [...png(48, 27)]);
  await expect(picture).toHaveJSProperty('naturalWidth', 48, { timeout: 20_000 });
  await page.getByRole('button', { name: 'Remove picture' }).click();
  await expect(picture).toHaveCount(0);
  await give('paste', [...png(40, 20)]);
  await expect(picture).toHaveJSProperty('naturalWidth', 40, { timeout: 20_000 });
});
