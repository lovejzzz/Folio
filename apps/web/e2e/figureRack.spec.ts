import { expect, test } from './fixtures';
import { openSample, retype, settled } from './helpers';

const SHOTS = process.env.FOLIO_FIGURE_SHOTS;

test('a hardware demonstration: servers go into a rack until the budget stops them, and the limit that stopped it is said', async ({ page }) => {
  await openSample(page);
  await page.goto(page.url().replace(/\/map$/, '/m/slides'));
  await page.getByRole('button', { name: 'Add a rack and budget demonstration' }).click();
  const figure = page.getByRole('group', { name: 'Filling a rack, server by server' });
  const tools = page.getByRole('group', { name: 'Work the demonstration' });
  const data = page.getByRole('group', { name: 'The demonstration’s numbers' });
  const said = page.locator('.folio-figure-caption');
  const next = tools.getByRole('button', { name: 'Next step' });
  await expect(said).toHaveText('A rack with 6 slots and a budget of 40; each server takes 10.2. How many fit?');
  await expect(data.getByRole('textbox', { name: 'The number to look for' })).toHaveCount(0);
  await next.click();
  await expect(said).toHaveText('The first server goes in: 1 × 10.2 = 10.2 of 40, with 29.8 left.');
  await expect(figure.locator('[data-layer="reading"] [data-drawer]')).toHaveCount(1);
  await expect(figure.locator('[data-part="leader"]')).toHaveCount(1);
  await next.click();
  await next.click();
  await next.click();
  await expect(said).toHaveText('The fourth server would bring it to 4 × 10.2 = 40.8, over the budget of 40 by 0.8: it does not go in.');
  // The same server is refused in both layers, and the list under the slide says so in words.
  await expect(figure.locator('[data-layer="scene"] [data-state="refused"]')).toHaveCount(1);
  await expect(figure.locator('[data-layer="reading"] [data-state="refused"]')).toHaveCount(1);
  await expect(page.getByRole('list', { name: 'The list at this step' }).getByRole('listitem', { name: 'Position 4: 40.8, does not fit' })).toBeVisible();
  await settled(page);
  if (SHOTS) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${SHOTS}/desktop-rack-refused.png`, fullPage: true });
  }
  await next.click();
  await expect(said).toHaveText('3 servers fit, taking 30.6 of 40. The budget stopped it, not the room: 3 of the 6 slots stay empty.');
  await expect(next).toBeDisabled();
  // Other numbers, another limit: smaller servers fill every slot first.
  await retype(page, 'One server takes, the budget, slots', '5, 40, 4');
  for (let i = 0; i < 5; i++) await next.click();
  await expect(said).toHaveText('4 servers fit, taking 20 of 40. The room stopped it, not the budget: every slot is full and 20 is unused.');
  await retype(page, 'One server takes, the budget, slots', '5, 40, 12');
  await expect(data.getByRole('alert')).toContainText('1 to 8 slots');
  await retype(page, 'One server takes, the budget, slots', '5, 40, 4');
  await page.reload();
  await expect(page.locator('.folio-figure-caption')).toHaveText('A rack with 4 slots and a budget of 40; each server takes 5. How many fit?');
});
