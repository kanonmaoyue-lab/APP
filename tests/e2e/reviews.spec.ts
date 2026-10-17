import { expect, test } from '@playwright/test';
import { createUser } from '../../scripts/local.mjs';
import { login } from './helpers';
import { addDays, today } from '../../src/domain/dates';
test('notes can schedule and score offline, then sync a single grade and complete the linked event', async ({ page, context }) => {
  const u = await createUser();
  try {
    await login(page, u);
    await page.getByRole('button', { name: '复习花园', exact: true }).click();
    await page.getByRole('button', { name: '记录学习内容' }).click();
    await page.getByLabel('主题', { exact: true }).fill('高数 · 极限');
    await page.getByLabel('笔记', { exact: true }).fill('先看定义，再做三道例题。');
    await page.getByLabel('学习日期').fill(addDays(today(), -1));
    await page.getByRole('button', { name: '保存主题' }).click();
    await expect(page.getByRole('heading', { name: '高数 · 极限' })).toBeVisible();
    await expect.poll(async () => {
      const r = await u.client.from('records').select('id').eq('kind', 'reviewItems');
      return r.data?.length;
    }).toBe(1);
    await context.setOffline(true);
    await page.getByRole('button', { name: '放入今日日程' }).click();
    await page.getByRole('button', { name: '记住了', exact: true }).click();
    await page.getByRole('button', { name: '全部主题' }).click();
    await expect(page.getByText(/今天已评分/)).toBeVisible();
    await context.setOffline(false);
    await page.getByRole('button', { name: '立即同步' }).click();
    await expect.poll(async () => {
      const r = await u.client.from('records').select('payload').eq('kind', 'reviewLogs');
      return r.data?.length;
    }, { timeout: 15000 }).toBe(1);
    const item = await u.client.from('records').select('payload').eq('kind', 'reviewItems');
    expect(item.data?.[0].payload.nextReviewOn).toBe(addDays(today(), 3));
    const event = await u.client.from('records').select('payload').eq('kind', 'events');
    expect(event.data?.[0].payload.completedAt).toBeTruthy();
    await page.screenshot({ path: 'test-results/reviews-ipad.png', fullPage: true });
  } finally {
    await u.cleanup();
  }
});
