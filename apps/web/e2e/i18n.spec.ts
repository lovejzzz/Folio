import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

async function inChinese(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('folio.prefs', JSON.stringify({ state: { uiLanguage: 'zh-CN' }, version: 1 }));
  });
}

test('the Chinese interface is Chinese throughout, React Aria’s own labels included', async ({ page }) => {
  await inChinese(page);
  await page.goto('/');
  await page.getByRole('button', { name: '或者打开示例课程' }).click();
  await expect(page.getByRole('grid', { name: '课时与材料' })).toBeVisible();
  await expect(page).toHaveTitle('总览 · Reading the world with data · Folio 墨页');
  await expect(page.getByRole('button', { name: /^第 1 课，测验与题库：/ })).toBeVisible();

  await page.goto(page.url().replace(/\/map$/, '/plan'));
  await expect(page.getByRole('button', { name: /^提高/ }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Increase|Decrease/ })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: '第 2 课的第 1 个目标' })).toBeVisible();
});

test('a file that is not a course is refused in the interface language', async ({ page }) => {
  await inChinese(page);
  await page.goto('/library');
  await expect(page).toHaveTitle('课程库 · Folio 墨页');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '打开备份文件' }).click();
  await (await chooser).setFiles({ name: 'notes.folio', mimeType: 'application/zip', buffer: Buffer.from('not a course') });
  await expect(page.getByText('这不是 Folio 课程文件。')).toBeVisible();
});
