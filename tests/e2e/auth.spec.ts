import { expect, test } from '@playwright/test';
import { createUser } from '../../scripts/local.mjs';
import { login } from './helpers';
test('real login restores after reload; switching accounts never shows prior titles', async ({ page }) => {
  const a = await createUser(), b = await createUser();
  try {
    await login(page, a);
    await page.getByRole('button', { name: '新增事项' }).click();
    await page.getByLabel('事项名称').fill('A的私人日程');
    await page.getByRole('button', { name: '保存事项' }).click();
    await expect.poll(async () => {
      const r = await a.client.from('records').select('id').eq('kind', 'events');
      return r.data?.length;
    }).toBe(1);
    await page.reload();
    await expect(page.getByText('A的私人日程', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: '退出登录' }).click();
    await page.getByLabel('邮箱').fill(b.email);
    await page.getByLabel('密码').fill(b.password);
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await expect(page.getByText('已同步', { exact: true })).toBeVisible();
    await expect(page.getByText('A的私人日程', { exact: true })).toHaveCount(0);
  } finally {
    await a.cleanup();
    await b.cleanup();
  }
});
test('captured local emails verify signup and password recovery', async ({ page, request }) => {
  const helper = await createUser(),
    email = `mail-${crypto.randomUUID()}@little-days.test`,
    password = `pass-${crypto.randomUUID()}`;
  async function link(subject: string) {
    let id = '';
    await expect.poll(async () => {
      const inbox = await (await request.get('http://127.0.0.1:54324/api/v1/messages')).json();
      const m = inbox.messages.find((m: { To: { Address: string }[]; Subject: string }) =>
        m.To.some((to) => to.Address === email) && m.Subject.includes(subject)
      );
      id = m?.ID ?? '';
      return !!id;
    }).toBe(true);
    const mail = await (await request.get('http://127.0.0.1:54324/api/v1/message/' + id)).json();
    const url = (mail.HTML as string).match(/href="(http[^\"]+)"/i)?.[1]?.replaceAll('&amp;', '&');
    if (!url) throw Error('Mail callback absent');
    return url;
  }
  try {
    await page.goto('/');
    await page.getByRole('button', { name: '注册新账号' }).click();
    await page.getByLabel('邮箱').fill(email);
    await page.getByLabel('密码').fill(password);
    await page.getByRole('button', { name: '发送验证邮件' }).click();
    await expect(page.getByText(/请到邮箱/)).toBeVisible();
    await page.goto(await link('Confirm'));
    await expect(page.getByText('已同步', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: '退出登录' }).click();
    await page.getByRole('button', { name: '忘记密码' }).click();
    await page.getByLabel('邮箱').fill(email);
    await page.getByRole('button', { name: '发送重置邮件' }).click();
    await page.goto(await link('Reset'));
    await page.getByLabel('新密码').fill('new-' + crypto.randomUUID());
    await page.getByRole('button', { name: '保存新密码' }).click();
    await expect(page.getByRole('button', { name: '新增事项' })).toBeVisible();
  } finally {
    const { data } = await helper.admin.auth.admin.listUsers();
    const user = data.users.find((u) => u.email === email);
    if (user) await helper.admin.auth.admin.deleteUser(user.id);
    await helper.cleanup();
  }
});
