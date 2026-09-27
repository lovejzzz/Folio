import { expect, test } from './fixtures';
import { openSample } from './helpers';

test('a slide in the lesson view opens that slide, and ← → step through the deck', async ({ page }) => {
  await openSample(page);
  await page.getByRole('link', { name: /Picturing a distribution/ }).first().click();
  await page.locator('#m-slides').getByRole('link', { name: /^Slide 4 of 5/ }).click();
  await expect(page).toHaveURL(/\/m\/slides\?.*slide=4/);
  const title = page.getByRole('textbox', { name: 'Slide title' });
  await expect(title).toHaveText('Histograms');
  const filmstrip = page.getByRole('navigation', { name: 'Slides' });
  await expect(filmstrip.getByRole('button', { name: 'Slide 4 of 5: Histograms' })).toHaveAttribute('aria-current', 'true');

  await page.keyboard.press('ArrowRight');
  await expect(title).toHaveText('Describe with SOCS');
  await page.keyboard.press('ArrowRight');
  await expect(title).toHaveText('Centre and spread');
  await expect(filmstrip.getByRole('button', { name: 'Slide 1 of 5: Centre and spread' })).toBeInViewport();
  await page.keyboard.press('ArrowLeft');
  await expect(title).toHaveText('Describe with SOCS');

  // Arrow keys inside a text field move the caret, not the deck.
  await page.getByRole('textbox', { name: 'Speaker notes' }).click();
  await page.keyboard.press('ArrowLeft');
  await expect(title).toHaveText('Describe with SOCS');

  // The step buttons do the same, and the URL keeps the place.
  await page.getByRole('button', { name: 'Previous slide' }).click();
  await expect(title).toHaveText('Histograms');
  await page.reload();
  await expect(title).toHaveText('Histograms');
});

test('the map says how many material columns are out of view and scrolls to them', async ({ page }) => {
  await openSample(page);
  const more = page.getByRole('button', { name: /^Show \d+ more materials?$/ });
  await expect(more).toBeVisible();
  const faq = page.getByRole('link', { name: 'Open Course FAQ' });
  await expect(faq).not.toBeInViewport({ ratio: 1 });
  await more.focus();
  await page.keyboard.press('Enter');
  await expect(faq).toBeInViewport({ ratio: 1 });
  await expect(more).toHaveCount(0);
  // Focus moves to the button that goes back, rather than getting lost.
  await expect(page.getByRole('button', { name: 'Show earlier materials' })).toBeFocused();
});
