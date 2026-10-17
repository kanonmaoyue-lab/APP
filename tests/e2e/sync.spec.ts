import { expect, test } from '@playwright/test';
import { createUser } from '../../scripts/local.mjs';
import { login } from './helpers';
test('offline consecutive edits converge; simultaneous edits retain explicit conflicts', async ({ browser }) => {
  const u = await createUser(),
    a = await browser.newContext(),
    b = await browser.newContext(),
    p = await a.newPage(),
    q = await b.newPage();
  try {
    await login(p, u);
    await login(q, u);
    await a.setOffline(true);
    await p.getByRole('button', { name: '新增事项' }).click();
    await p.getByLabel('事项名称').fill('离线初稿');
    await p.getByRole('button', { name: '保存事项' }).click();
    await p.getByText('离线初稿', { exact: true }).click();
    await p.getByLabel('事项名称').fill('离线定稿');
    await p.getByRole('button', { name: '保存事项' }).click();
    await a.setOffline(false);
    await p.getByRole('button', { name: '立即同步' }).click();
    await expect(q.getByText('离线定稿', { exact: true })).toBeVisible({ timeout: 15000 });
    await a.setOffline(true);
    await b.setOffline(true);
    await p.getByText('离线定稿', { exact: true }).click();
    await p.getByLabel('事项名称').fill('A版本');
    await p.getByRole('button', { name: '保存事项' }).click();
    await q.getByText('离线定稿', { exact: true }).click();
    await q.getByLabel('事项名称').fill('B版本');
    await q.getByRole('button', { name: '保存事项' }).click();
    await a.setOffline(false);
    await p.getByRole('button', { name: '立即同步' }).click();
    await expect.poll(async () => {
      const r = await u.client.from('records').select('payload').eq('kind', 'events');
      return r.data?.[0].payload.title;
    }).toBe('A版本');
    await b.setOffline(false);
    await q.getByRole('button', { name: '立即同步' }).click();
    await expect(q.getByRole('region', { name: '同步冲突' })).toBeVisible({ timeout: 15000 });
    await q.getByRole('button', { name: '采用云端' }).click();
    await expect(q.getByText('A版本', { exact: true })).toBeVisible();
  } finally {
    await a.close();
    await b.close();
    await u.cleanup();
  }
});
