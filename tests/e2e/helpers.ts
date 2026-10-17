import { expect, type Page } from '@playwright/test';
export async function login(page: Page, user: { email: string; password: string }) {
  await page.goto('/');
  await page.getByLabel('邮箱').fill(user.email);
  await page.getByLabel('密码').fill(user.password);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByText('已同步', { exact: true })).toBeVisible();
}
