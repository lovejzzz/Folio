import { expect, test } from './fixtures';
import { openSample } from './helpers';

test('code marked with backticks reads as code, and edits with its marks', async ({ page }) => {
  await openSample(page);
  await page.getByRole('link', { name: /Centre and spread/ }).first().click();
  const field = page.getByRole('textbox', { name: 'Objective 1 of lesson 3' });
  await field.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('Find the mean with `mean(x)` in R');
  await field.blur();

  await expect(field.locator('code')).toHaveText('mean(x)');
  await expect(field).toHaveText('Find the mean with mean(x) in R');

  // Click just before the final "R": the marks appear, and the caret stays by the R.
  const r = await field.evaluate((el) => {
    const text = el.lastChild!;
    const range = document.createRange();
    range.setStart(text, text.textContent!.length - 1);
    range.setEnd(text, text.textContent!.length);
    const box = range.getBoundingClientRect();
    return { x: box.left + 1, y: box.top + box.height / 2 };
  });
  await page.mouse.click(r.x, r.y);
  await expect(field).toHaveText('Find the mean with `mean(x)` in R');
  await page.keyboard.type('base ');
  await page.getByRole('main').click({ position: { x: 5, y: 5 } });
  await expect(field).toHaveText('Find the mean with mean(x) in base R');
  await expect(field.locator('code')).toHaveText('mean(x)');
});

test('a named subscript reads as a subscript, and edits as typed', async ({ page }) => {
  await openSample(page);
  await page.getByRole('link', { name: /Centre and spread/ }).first().click();
  const field = page.getByRole('textbox', { name: 'Objective 1 of lesson 3' });
  await field.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('Compare x̄_boys with x̄_girls');
  await field.blur();
  await expect(field.locator('sub')).toHaveText(['boys', 'girls']);
  await expect(field).toHaveText('Compare x̄boys with x̄girls');
  await field.click();
  await expect(field).toHaveText('Compare x̄_boys with x̄_girls');
});
