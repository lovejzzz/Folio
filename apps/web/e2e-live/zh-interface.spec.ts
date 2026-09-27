import { writeFileSync } from 'node:fs';
import { expect, test } from '../e2e/fixtures';
import { OUT, readCourses, routeToBridge, type Call } from './helpers';

/** A Chinese course, used from the Chinese interface: build, selection actions and ⌘K in Chinese. */
test('live zh interface', async ({ page }) => {
  test.setTimeout(30 * 60_000);
  const calls: Call[] = [];
  const results: Record<string, unknown> = {};
  await page.addInitScript(() => {
    localStorage.setItem('folio.prefs', JSON.stringify({ state: { provider: 'anthropic', keys: { anthropic: 'sk-ant-test' }, models: {}, theme: 'system', uiLanguage: 'zh-CN', density: 'comfortable', railCollapsed: false, localUrl: 'http://localhost:11434/v1' }, version: 1 }));
  });
  await routeToBridge(page, calls);
  page.setDefaultTimeout(180_000);
  const step = (s: string) => console.error(new Date().toISOString().slice(11, 19), s);
  await page.goto('/');
  await page.getByRole('textbox').first().fill('古诗词鉴赏入门，两节课，初中一年级，每节40分钟，重点是王维的山水诗。');
  await page.getByRole('button', { name: '继续' }).click();
  await page.getByRole('textbox', { name: /第 1 课/ }).first().waitFor({ timeout: 5 * 60_000 });
  await page.getByRole('button', { name: /生成/ }).click();
  await page.getByText(/课程已就绪|没能生成/).first().waitFor({ timeout: 20 * 60_000 });
  await page.screenshot({ path: `${OUT}/zhui-map.png` });

  step('built');
  await page.getByRole('link', { name: '课时' }).first().click();
  const summary = page.getByRole('textbox', { name: /第 1 课.*(简介|概要|摘要)/ }).first();
  await summary.waitFor();
  results.original = await summary.textContent();
  const bar = page.getByRole('toolbar');
  for (const action of ['简化', '翻译', '解释']) {
    step(action);
    await summary.selectText();
    await bar.getByRole('button', { name: action }).click();
    if (action === '解释') {
      const box = bar.locator('p.font-reading');
      await box.waitFor({ timeout: 3 * 60_000 });
      results[action] = await box.textContent();
      await page.keyboard.press('Escape');
    } else {
      await page.locator('mark.folio-highlight').waitFor({ timeout: 3 * 60_000 });
      results[action] = await page.locator('mark.folio-highlight').textContent();
      await page.getByRole('button', { name: '不采纳' }).click();
    }
  }

  results.plans = [];
  for (const request of ['在第一课后面加一课，讲孟浩然的田园诗', '每节课改成45分钟']) {
    step(request);
    await page.keyboard.press('ControlOrMeta+k');
    await page.keyboard.type(request);
    await page.getByRole('option', { name: new RegExp(request.slice(0, 6)) }).click();
    const panel = page.getByRole('dialog');
    await expect(panel.getByText(/将会|没能|没有需要/).first()).toBeVisible({ timeout: 3 * 60_000 });
    (results.plans as unknown[]).push({ request, preview: (await panel.innerText()).slice(0, 600) });
    await page.screenshot({ path: `${OUT}/zhui-plan-${(results.plans as unknown[]).length}.png` });
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
  }
  const courses = await readCourses(page);
  writeFileSync(`${OUT}/live-zhui.json`, JSON.stringify({ results, calls, course: courses.at(-1) }, null, 2));
});
