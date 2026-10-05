import { expect, test } from './fixtures';
import { chooseSample } from './helpers';

test('on a phone the map is a list of lessons and the sheet fits the screen', async ({ page }) => {
  await page.goto('/');
  // On a phone the layout viewport grows to fit anything too wide, so compare with the device width.
  const width = page.viewportSize()!.width;
  const pageWidth = () => page.evaluate(() => document.documentElement.scrollWidth);
  expect(await pageWidth()).toBeLessThanOrEqual(width);
  await chooseSample(page);
  await expect(page.getByText('Open a lesson to review it.')).toBeVisible();
  await page.getByRole('link', { name: /Center and spread/ }).click();
  await expect(page.getByRole('textbox', { name: 'Title of lesson 3' })).toBeVisible();
  await page.locator('#m-rubrics').scrollIntoViewIfNeeded();
  expect(await pageWidth()).toBeLessThanOrEqual(width);
  await page.getByRole('button', { name: /To do & history/ }).click();
  await expect(page.getByRole('dialog', { name: 'To do & history' }).getByRole('button', { name: 'Close' })).toBeInViewport();
});

test('no screen is wider than a phone', async ({ page }) => {
  const width = page.viewportSize()!.width;
  await page.goto('/');
  await chooseSample(page);
  await expect(page.getByText('Open a lesson to review it.')).toBeVisible();
  const base = page.url().replace(/\/map$/, '');
  // The overview and a lesson too, signed out: their bar carries Sign in, and with its words it was 46px too wide.
  const lesson = new URL((await page.locator('a[href*="/lesson/"]').first().getAttribute('href'))!, page.url()).pathname.replace(new URL(base).pathname, '');
  for (const path of ['/map', lesson, '/m/syllabus', '/m/map', '/m/plan', '/m/slides', '/m/quiz', '/m/assignments', '/m/rubrics', '/m/study', '/m/faq', '/m/discussions']) {
    await page.goto(base + path);
    await expect(page.locator('h1').first()).toBeVisible();
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(w, path).toBeLessThanOrEqual(width);
  }
  for (const path of ['/library', '/settings']) {
    await page.goto(path);
    await expect(page.locator('h1').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth), path).toBeLessThanOrEqual(width);
  }
});

test('at every width in between, a course\'s bar keeps all its buttons on the screen', async ({ page }) => {
  await page.goto('/');
  await chooseSample(page);
  await expect(page.getByText('Open a lesson to review it.')).toBeVisible();
  const lesson = await page.locator('a[href*="/lesson/"]').first().getAttribute('href');
  for (const width of [375, 560, 640, 700, 768, 820, 1024, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(lesson!);
    await expect(page.locator('h1').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `width ${width}`).toBeLessThanOrEqual(width);
    const more = await page.getByRole('button', { name: 'More' }).boundingBox();
    expect(more!.x + more!.width, `the menu at ${width}`).toBeLessThanOrEqual(width);
  }
});

test('on a phone the slide editor steps from slide to slide, and on into the next lesson', async ({ page }) => {
  await page.goto('/');
  await chooseSample(page);
  await expect(page.getByText('Open a lesson to review it.')).toBeVisible();
  await page.goto(page.url().replace(/\/map$/, '/m/slides'));
  const title = page.getByRole('textbox', { name: 'Slide title' });
  const previous = page.getByRole('button', { name: 'Previous slide' });
  const next = page.getByRole('button', { name: 'Next slide' });
  await expect(title).toHaveText('Asking questions with data');
  await expect(page.getByText('Slide 1 of 5').filter({ visible: true })).toBeVisible();
  await expect(previous).toBeDisabled();
  await next.click();
  await expect(title).toHaveText('Which question needs data from many people?');
  await expect(page.getByText('Slide 2 of 5').filter({ visible: true })).toBeVisible();
  for (let i = 0; i < 4; i++) await next.click();
  await expect(title).toHaveText('Picturing a distribution');
  await expect(page.getByText(/^Lesson 2\s*·\s*Slide 1 of 5$/)).toBeVisible();
  await expect(page).toHaveURL(/slide=1/);
  await previous.click();
  await expect(title).toHaveText('Two kinds of variable');
  await expect(next).toBeInViewport();
});

test('on a phone a rubric stacks its levels instead of scrolling sideways', async ({ page }) => {
  await page.goto('/');
  await chooseSample(page);
  await expect(page.getByText('Open a lesson to review it.')).toBeVisible();
  await page.goto(page.url().replace(/\/map$/, '/m/rubrics'));
  await expect(page.getByRole('table')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Statistical question, Beginning' }).first()).toBeVisible();
});

test('on a phone a stacked rubric can lose a criterion and change what a level is worth', async ({ page }) => {
  await page.goto('/');
  await chooseSample(page);
  await expect(page.getByText('Open a lesson to review it.')).toBeVisible();
  await page.getByRole('link', { name: /Center and spread/ }).click();
  const rubric = page.locator('#m-rubrics');
  await rubric.scrollIntoViewIfNeeded();
  const names = rubric.getByRole('textbox', { name: /^Criterion \d$/ });
  await expect(names).toHaveText(['Calculations', 'Choice of summary', 'Comparison']);
  // Tapping into a criterion reveals its remove button.
  await rubric.getByRole('textbox', { name: 'Criterion 2', exact: true }).tap();
  await rubric.getByRole('button', { name: 'Remove: Choice of summary' }).tap();
  await expect(names).toHaveText(['Calculations', 'Comparison']);

  const points = rubric.getByRole('textbox', { name: 'Points for Good' }).first();
  await points.fill('2.5');
  await points.press('Enter');
  // Each criterion lists the levels; they all show the new worth.
  await expect(rubric.getByRole('textbox', { name: 'Points for Good' }).first()).toHaveValue('2.5');
  await expect(rubric.getByRole('textbox', { name: 'Points for Good' }).last()).toHaveValue('2.5');
});

test('on a phone the overview and every material are reached from More', async ({ page }) => {
  await page.goto('/');
  await chooseSample(page);
  await expect(page.getByText('Open a lesson to review it.')).toBeVisible();
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: 'Quiz & exam bank' }).click();
  await expect(page).toHaveURL(/\/m\/quiz$/);
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: 'Overview' }).click();
  await expect(page).toHaveURL(/\/map$/);
});

test('on a phone a tall dialog fits the screen and scrolls inside itself', async ({ page }) => {
  // A small phone with the keyboard up.
  await page.setViewportSize({ width: 375, height: 560 });
  await page.goto('/');
  await page.getByLabel('Describe your course').fill('Photosynthesis for grade 7, three lessons');
  await page.getByRole('button', { name: 'Continue' }).click();
  const dialog = page.getByRole('dialog', { name: 'Connect an AI' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('radio', { name: /Use my API keys/ }).click({ force: true });
  await dialog.getByRole('radio', { name: /Use my Claude key/ }).click({ force: true });
  // The sheet around the dialog is what scrolls: it, not the content, has to fit.
  const box = (await dialog.locator('xpath=..').boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  const go = dialog.getByRole('button', { name: 'Connect and continue' });
  await go.scrollIntoViewIfNeeded();
  await expect(go).toBeInViewport();
});

test('on a phone the selection toolbar stays on screen for a word at the edge', async ({ page }) => {
  await page.goto('/');
  await chooseSample(page);
  await page.getByRole('link', { name: /Asking questions with data/ }).first().click();
  const summary = page.getByRole('textbox', { name: 'Summary of lesson 1' });
  await summary.click({ position: { x: 4, y: 8 } });
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+ArrowRight', { delay: 20 });
  for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+ArrowRight');
  const bar = page.getByRole('toolbar', { name: 'Ask about the selected text' });
  await expect(bar).toBeVisible();
  const box = (await bar.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test('on a touch screen the buttons that appear on hover are always shown', async ({ page }) => {
  await page.goto('/');
  await chooseSample(page);
  await expect(page.getByText('Open a lesson to review it.')).toBeVisible();
  await page.goto(page.url().replace(/\/map$/, '/m/faq'));
  const remove = page.getByRole('button', { name: 'Remove question' }).first();
  await expect(remove).toHaveCSS('opacity', '1');
});

test('on a phone a study guide point can be removed', async ({ page }) => {
  await page.goto('/');
  await chooseSample(page);
  await expect(page.getByText('Open a lesson to review it.')).toBeVisible();
  await page.goto(page.url().replace(/\/map$/, '/m/study'));
  const remove = page.getByRole('button', { name: /^Remove: / }).first();
  await expect(remove).toBeInViewport();
  const before = await page.getByRole('textbox', { name: /^Heading of point / }).count();
  await remove.click();
  await expect(page.getByRole('textbox', { name: /^Heading of point / })).toHaveCount(before - 1);
});

test('on a touch screen no editable text is smaller than 16px, so iOS never zooms into it', async ({ page }) => {
  await page.goto('/');
  await chooseSample(page);
  await expect(page.getByText('Open a lesson to review it.')).toBeVisible();
  const base = page.url().replace(/\/map$/, '');
  const smallest = () =>
    page.evaluate(() =>
      Math.min(
        ...Array.from(document.querySelectorAll<HTMLElement>('[contenteditable]:not([contenteditable="false"])'))
          .filter((el) => !el.closest('.folio-slide'))
          .map((el) => parseFloat(getComputedStyle(el).fontSize)),
      ),
    );
  for (const path of ['/m/rubrics', '/m/plan', '/m/quiz', '/m/study']) {
    await page.goto(base + path);
    await expect(page.locator('h1').first()).toBeVisible();
    expect(await smallest(), path).toBeGreaterThanOrEqual(16);
  }
  // On a slide the text keeps the slide's size, and reaches 16px only while it is typed in.
  await page.goto(`${base}/m/slides`);
  const subtitle = page.locator('.folio-slide [contenteditable]').nth(1);
  const resting = await subtitle.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(resting).toBeLessThan(16);
  await subtitle.focus();
  expect(await subtitle.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
});
