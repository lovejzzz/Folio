import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '../e2e/fixtures';
import { withKey } from '../e2e/helpers';
import { OUT, readCourses, routeToBridge, type Call } from './helpers';

/**
 * A university lecturer's pass: a whole course from a university brief,
 * then every material looked at in turn.
 *   PROF=econ pnpm test:live professor   (econ, phil, psych)
 */

const NOTES = `# Week 3 notes: OLS in matrix form

The multiple regression model is y = Xβ + u, where X is n × (k+1) and includes a column of ones.

The OLS estimator minimises the sum of squared residuals and is β̂ = (X'X)⁻¹X'y. It exists when X has full column rank (no perfect collinearity).

Under MLR.1–MLR.4, β̂ is unbiased. Adding MLR.5 (homoskedasticity), Var(β̂ | X) = σ²(X'X)⁻¹, and OLS is BLUE (Gauss–Markov).

Worked example (wage1 data, n = 526): log(wage) = 0.284 + 0.092 educ + 0.0041 exper + 0.022 tenure. One more year of education is associated with about 9.2% higher wages, holding experience and tenure fixed.

Common student error: reading the R² as the share of the "effect" explained, or thinking a low R² means the estimates are biased.`;

const SCENARIOS: Record<string, { brief: string; locale?: string; files?: { name: string; text: string }[] }> = {
  econ: {
    brief:
      'Introductory econometrics for second-year economics undergraduates. A four-week module of weekly 90-minute lectures. Students know basic calculus and probability. Cover simple and multiple regression with OLS, then inference with t tests. Main text: Wooldridge, Introductory Econometrics. Assessment: weekly problem sets (30%), a midterm (30%) and a final exam (40%). Problem sets use real datasets in R.',
    files: [{ name: 'week 3 notes.md', text: NOTES }],
  },
  phil: {
    brief:
      'Graduate seminar in political philosophy on the social contract. Four two-hour seminars. Readings: Hobbes, Leviathan ch. 13–17; Locke, Second Treatise ch. 2, 5, 8, 9; Rawls, A Theory of Justice §§3–4, 24; Pateman, The Sexual Contract ch. 1. Each week one student presents; the course ends with a 3,000-word essay.',
  },
  psych: {
    brief:
      '认知心理学导论，面向心理学专业本科二年级，共4周，每周一次100分钟的课。内容包括知觉、注意、记忆和决策。教材是Goldstein《认知心理学》，每周布置阅读。成绩：平时作业40%，期末课程论文60%。',
  },
};

const name = process.env.PROF ?? 'econ';
test(`professor: ${name}`, async ({ page }) => {
  test.setTimeout(60 * 60_000);
  const scenario = SCENARIOS[name]!;
  const dir = `${OUT}/prof-${name}`;
  mkdirSync(dir, { recursive: true });
  const calls: Call[] = [];
  await withKey(page);
  await routeToBridge(page, calls);
  const t0 = Date.now();
  const marks: Record<string, number> = {};
  await page.goto('/');
  if (scenario.files) {
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Attach files' }).click();
    await (await chooser).setFiles(scenario.files.map((f) => ({ name: f.name, mimeType: 'text/markdown', buffer: Buffer.from(f.text) })));
  }
  await page.getByLabel(/Describe your course|描述/).fill(scenario.brief);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${dir}/01-brief.png` });
  await page.getByRole('button', { name: /Continue|继续/ }).click();
  await page.getByRole('textbox', { name: /Title of lesson 1|第 1 课/ }).waitFor({ timeout: 5 * 60_000 });
  marks.outline = Date.now() - t0;
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${dir}/02-plan.png`, fullPage: true });
  await page.getByRole('button', { name: /Build \d+ lessons?|生成/ }).click();
  await page.waitForTimeout(20_000);
  await page.screenshot({ path: `${dir}/03-building.png` });
  await page.getByText(/Course ready|could not be built|课程已就绪|没能生成|didn’t accept|stopped/).first().waitFor({ timeout: 50 * 60_000 });
  marks.build = Date.now() - t0;
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${dir}/04-map.png`, fullPage: true });
  const courses = (await readCourses(page)) as { id: string; lessonOrder: string[] }[];
  const course = courses.at(-1)!;
  writeFileSync(`${dir}/course.json`, JSON.stringify({ marks, calls, course }, null, 2));

  for (const kind of ['syllabus', 'plan', 'slides', 'quiz', 'assignments', 'rubrics', 'discussions', 'study', 'faq']) {
    await page.goto(`/c/${course.id}/m/${kind}`);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${dir}/m-${kind}.png`, fullPage: true });
  }
  await page.goto(`/c/${course.id}/lesson/${course.lessonOrder[2]}`);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${dir}/lesson-3.png`, fullPage: true });
  await page.goto(`/print/${course.id}`);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${dir}/print.png` });
  expect(marks.build).toBeGreaterThan(0);
});
