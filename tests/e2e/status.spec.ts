import { expect, test } from '@playwright/test';
import { createUser } from '../../scripts/local.mjs';
import { login } from './helpers';
test('locally saved unsent edits do not retain a synced label', async ({ page, context }) => {
  const u = await createUser();
  try {
    await login(page, u);
    await context.setOffline(true);
    await page.getByRole('button', { name: '新增事项' }).click();
    await page.getByLabel('事项名称').fill('未上传的小事');
    await page.getByRole('button', { name: '保存事项' }).click();
    await expect(page.getByText('未上传的小事', { exact: true })).toBeVisible();
    await expect(page.getByRole('status').first()).not.toHaveText('已同步', { timeout: 500 });
  } finally {
    await u.cleanup();
  }
});
