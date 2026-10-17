import { expect, test } from '@playwright/test';
import { createUser } from '../../scripts/local.mjs';
import { login } from './helpers';
test('production static cache reopens offline, queues edits and syncs after reconnect, with secret-free JSON download', async ({ page, context }) => {
  const u = await createUser();
  try {
    await login(page, u);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await context.setOffline(true);
    await page.reload();
    const offlineFonts = await page.evaluate(async () =>
      (await document.fonts.load('18px "LittleDays Round"', '规划复习小日子')).length
    );
    expect(offlineFonts).toBeGreaterThan(0);
    await expect.poll(() =>
      page.locator('img.cat').evaluateAll((images) =>
        images.length > 0 &&
        images.every((image) =>
          (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0
        )
      )
    ).toBe(true);
    await page.getByRole('button', { name: '新增事项' }).click();
    await page.getByLabel('事项名称').fill('离线也能记下的小事');
    await page.getByRole('button', { name: '保存事项' }).click();
    await expect(page.getByText('离线也能记下的小事', { exact: true })).toBeVisible();
    await context.setOffline(false);
    await page.getByRole('button', { name: '立即同步' }).click();
    await expect.poll(async () => {
      const r = await u.client.from('records').select('payload').eq('kind', 'events');
      return r.data?.[0]?.payload.title;
    }, { timeout: 15000 }).toBe('离线也能记下的小事');
    const paths = await page.evaluate(async () => {
      const lists = await Promise.all(
        (await caches.keys()).map(async (name) =>
          (await (await caches.open(name)).keys()).map((r) => new URL(r.url).pathname)
        ),
      );
      return lists.flat();
    });
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.some((path) => /^\/(auth|rest|functions)\//.test(path))).toBe(false);
    await page.getByRole('button', { name: '设置', exact: true }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出 JSON 备份' }).click();
    expect((await download).suggestedFilename()).toContain('.json');
  } finally {
    await u.cleanup();
  }
});
