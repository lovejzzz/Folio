import { writeFileSync } from 'node:fs';
import { expect, test } from '../e2e/fixtures';
import { withKey } from '../e2e/helpers';
import { OUT, readCourses, routeToBridge, type Call } from './helpers';

/**
 * A whole course, built by a real model: api.anthropic.com is routed to the
 * bridge (scripts/claude-bridge.mjs), which answers through `claude -p`.
 *   LIVE=zh pnpm test:live build   (scenarios: en, zh, stats, sources, vague)
 */

const SOURCE = `# How we found out how plants grow

In the 1640s the Flemish chemist Jan Baptist van Helmont planted a 2.3 kg willow in 90 kg of dried soil. For five years he added only rainwater. The willow then weighed 76.7 kg, but the soil had lost only about 57 g. He concluded, wrongly, that the tree's mass came from water.

In 1771 Joseph Priestley put a mint sprig in a sealed jar with a candle that had burned out. After 27 days the candle could burn again. He showed that plants "restore" air that burning had spoiled; we now know the plant had made oxygen.

In 1779 Jan Ingenhousz showed that plants only restore air in sunlight, and only their green parts do so. In the dark, plants spoil air just as animals do.

In 1804 Nicolas-Théodore de Saussure weighed plants and the air around them and showed that the gain in mass came from carbon dioxide in the air and from water, not from the soil.`;

const SCENARIOS: Record<string, { brief: string; lessons: number; files?: { name: string; text: string }[] }> = {
  sources: { brief: 'Two lessons for Year 8 on the history of photosynthesis experiments, built on my notes.', lessons: 2, files: [{ name: 'history notes.md', text: SOURCE }] },
  vague: { brief: 'teach my kids about money', lessons: 4 },
  en: { brief: 'Photosynthesis for Year 7, four lessons of 50 minutes. Hands-on practicals, and a short quiz to close every lesson.', lessons: 4 },
  zh: { brief: '唐诗入门，三节课，初中二年级，每节课45分钟。重点是李白和杜甫，要有朗读和小组讨论。', lessons: 3 },
  stats: { brief: 'Descriptive statistics for grade 11: mean, median, range and interquartile range, with lots of worked numeric examples. Three lessons.', lessons: 3 },
};

const name = process.env.LIVE ?? 'en';
test(`live build: ${name}`, async ({ page }) => {
  test.setTimeout(40 * 60_000);
  const scenario = SCENARIOS[name]!;
  const calls: Call[] = [];
  await withKey(page);
  await routeToBridge(page, calls);
  const marks: Record<string, number> = {};
  const t0 = Date.now();
  await page.goto('/');
  if (scenario.files) {
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Attach files' }).click();
    await (await chooser).setFiles(scenario.files.map((f) => ({ name: f.name, mimeType: 'text/markdown', buffer: Buffer.from(f.text) })));
  }
  await page.getByLabel(/Describe your course|描述/).fill(scenario.brief);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${name}-01-brief.png` });
  await page.getByRole('button', { name: /Continue|继续/ }).click();
  await page.getByRole('textbox', { name: /Title of lesson 1|第 1 课/ }).waitFor({ timeout: 5 * 60_000 });
  marks.outline = Date.now() - t0;
  await page.screenshot({ path: `${OUT}/${name}-02-plan.png`, fullPage: true });
  await page.getByRole('button', { name: /Build \d+ lessons?|生成/ }).click();
  const done = page.getByText(/Course ready|could not be built|课程已就绪|没能生成|didn’t accept|stopped/).first();
  await done.waitFor({ timeout: 35 * 60_000 });
  marks.build = Date.now() - t0;
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/${name}-03-map.png` });
  const toast = await page.getByRole('status').textContent();
  const courses = await readCourses(page);
  writeFileSync(`${OUT}/live-${name}.json`, JSON.stringify({ marks, toast, calls, course: courses.at(-1) }, null, 2));
  await page.getByRole('link', { name: /Lessons|课时/ }).first().click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/${name}-04-lesson.png`, fullPage: true });
  expect(toast).toBeTruthy();
});
