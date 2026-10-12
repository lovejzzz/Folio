import { expect, test } from './fixtures';
import { openSample, settled } from './helpers';

/**
 * Each demonstration's pictures on paper are headed with that demonstration's name. They were all headed "The search,
 * step by step", so a sort's passes and a rack's servers were printed under a search's title.
 */
const KINDS = [
  { add: 'Add a binary search demonstration', name: 'Binary search, step by step' },
  { add: 'Add a selection sort demonstration', name: 'Selection sort, pass by pass' },
  { add: 'Add a gradient descent demonstration', name: 'Gradient descent, step by step' },
  { add: 'Add a rack and budget demonstration', name: 'Filling a rack, server by server' },
];

for (const kind of KINDS) {
  test(`on paper, a demonstration is headed with its own name: ${kind.name}`, async ({ page }) => {
    await openSample(page);
    const courseId = /\/c\/([^/]+)/.exec(page.url())![1]!;
    await page.goto(page.url().replace(/\/map$/, '/m/slides'));
    await page.getByRole('button', { name: kind.add }).click();
    await expect(page.getByRole('group', { name: kind.name })).toBeVisible();
    await settled(page);
    await page.addInitScript(() => (window.print = () => {}));
    await page.goto(`/print/${courseId}?kinds=${encodeURIComponent(JSON.stringify(['slides']))}&audience=${encodeURIComponent(JSON.stringify('student'))}`);
    const steps = page.getByRole('region', { name: kind.name });
    await expect(steps.first()).toBeVisible();
    await expect(steps.first().getByRole('heading', { name: kind.name })).toBeVisible();
    for (const other of KINDS.filter((k) => k !== kind)) await expect(page.getByRole('heading', { name: other.name })).toHaveCount(0);
  });
}
