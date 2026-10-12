import { readFile } from 'node:fs/promises';
import { expect, test } from './fixtures';


/**
 * Pictures of the comparison sample for a reader to look at: nine numbers, fifteen with decimals and a negative, and
 * long numbers, at a comparison, with numbers set aside, and found. Run only when asked for
 * (FOLIO_FIGURE_SHOTS and FOLIO_FIGURE_SAMPLE): it checks nothing a test elsewhere does not.
 */
export function sampleShots(): void {
  const SHOTS = process.env.FOLIO_FIGURE_SHOTS;
  const SAMPLE = process.env.FOLIO_FIGURE_SAMPLE;
  const CASES: [string, string, number, number][] = [['nine-flat', 'l1', 2, 2], ['fifteen-flat', 'l1', 5, 2], ['long-flat', 'l2', 1, 3], ['long-cabinet', 'l2', 2, 3], ['fifteen-cabinet', 'l2', 3, 2]];

  test('pictures of the sample, for looking at', async ({ page, context }, info) => {
    test.skip(!SHOTS || !SAMPLE, 'asked for by FOLIO_FIGURE_SHOTS and FOLIO_FIGURE_SAMPLE');
    test.setTimeout(180_000);
    const body = await readFile(SAMPLE!, 'utf8');
    const course = JSON.parse(body) as { lessonOrder: string[] };
    await page.route('**/samples/*.json', (route) => route.fulfill({ contentType: 'application/json', body }));
    await page.goto('/');
    await page.getByRole('button', { name: 'Or open a sample course' }).click();
    await page.getByRole('dialog', { name: 'Open a sample course' }).getByRole('button', { name: /^Introduction to ethics/ }).click();
    await expect(page).toHaveURL(/\/map$/);
    const base = page.url().replace(/\/map$/, '/m/slides');
    for (const [name, lesson, slide, steps] of CASES) {
      await page.goto(`${base}?lesson=${course.lessonOrder[lesson === 'l1' ? 0 : 1]}&slide=${slide}`);
      const figure = page.getByRole('group', { name: 'Binary search, step by step' });
      await expect(figure.locator('[data-drawer]').first()).toBeVisible();
      const next = page.getByRole('group', { name: 'Work the demonstration' }).getByRole('button', { name: 'Next step' });
      for (let i = 1; i <= steps; i++) {
        if (await next.isDisabled()) break;
        await next.click();
        await page.waitForTimeout(900);
        await page.locator('.folio-slide').filter({ has: figure }).screenshot({ path: `${SHOTS}/${info.project.name}-${name}-step${i}.png` });
      }
    }
    // The print view of the student's decks, as a PDF: the same pictures on paper.
    if (info.project.name !== 'desktop') return;
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const drawer = page.getByRole('dialog', { name: 'Export' });
    await drawer.getByText('PDF', { exact: false }).first().click();
    const popup = context.waitForEvent('page');
    await drawer.getByRole('button', { name: 'Open print view' }).click();
    const print = await popup;
    await print.addInitScript(() => (window.print = () => {}));
    await expect(print.getByRole('region', { name: 'Binary search, step by step' }).first()).toBeVisible();
    await print.pdf({ path: `${SHOTS}/sample-student.pdf` });
  });
}
