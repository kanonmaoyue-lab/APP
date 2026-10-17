import { expect, test } from '@playwright/test';
import { createUser } from '../../scripts/local.mjs';
import { change, newEvent, write } from '../../src/domain/types';
import { today } from '../../src/domain/dates';
import { login } from './helpers';
test('explicit map substitute previews without edits; adoption and undo use the real atomic backend', async ({ page }) => {
  const u = await createUser();
  try {
    expect(
      (await u.client.rpc('apply_operation', {
        operation: write(u.userId, [
          change({
            ...newEvent(u.userId, today()),
            title: '图书馆',
            location: { label: '测试目的地', lat: 30, lon: 120 },
          }),
        ]),
      })).error,
    ).toBeNull();
    await page.route('**/functions/v1/route-service', async (route) => {
      const body = route.request().postDataJSON();
      await route.fulfill({
        json: body.action === 'search'
          ? { places: [{ label: '测试起点（替身数据）', lat: 31, lon: 121 }] }
          : { durations: [[0, 300], [300, 0]] },
      });
    });
    await login(page, u);
    await page.getByRole('button', { name: '顺路走走', exact: true }).click();
    await page.getByLabel('出发地点', { exact: true }).fill('测试起点');
    await page.getByRole('button', { name: '查找出发地点' }).click();
    await page.getByRole('button', { name: /测试起点（替身数据）/ }).click();
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: '生成顺路建议' }).click();
    await expect(page.getByRole('region', { name: '动线预览' })).toBeVisible();
    const before = await u.client.from('records').select('payload').eq('kind', 'events');
    expect(before.data?.[0].payload.startAt).toBeNull();
    const url = new URL(
      await page.getByRole('link', { name: /地图导航/ }).getAttribute('href') ?? '',
    );
    expect(url.protocol).toBe('https:');
    expect(url.searchParams.get('destination')).toBe('30,120');
    expect(url.searchParams.get('travelmode')).toBe('walking');
    await page.getByRole('button', { name: '采用建议' }).click();
    await expect.poll(async () => {
      const r = await u.client.from('records').select('payload').eq('kind', 'events');
      return r.data?.[0].payload.startAt;
    }).not.toBeNull();
    await page.getByRole('button', { name: '撤销路线调整' }).click();
    await expect.poll(async () => {
      const r = await u.client.from('records').select('payload').eq('kind', 'events');
      return r.data?.[0].payload.startAt;
    }).toBeNull();
  } finally {
    await u.cleanup();
  }
});
