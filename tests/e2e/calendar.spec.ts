import { expect, test } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.goto('/tests/harness.html');
});
test('precise minute and cross-midnight visibility', async ({ page }) => {
  await page.getByRole('button', { name: '新增事项' }).click();
  await page.getByLabel('事项名称').fill('夜读');
  await page.getByLabel('开始时间', { exact: true }).fill('23:30');
  await page.getByLabel('预计时长（分钟）').fill('60');
  await page.getByRole('button', { name: '保存事项' }).click();
  await expect(page.getByText('夜读', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '下一个日期' }).click();
  await expect(page.getByText('夜读', { exact: true })).toBeVisible();
});
test('mouse movement snaps to quarter hour and undo restores exact original minute', async ({ page }) => {
  await page.getByRole('button', { name: '新增事项' }).click();
  await page.getByLabel('事项名称').fill('图书馆');
  await page.getByLabel('开始时间', { exact: true }).fill('09:07');
  await page.getByRole('button', { name: '保存事项' }).click();
  const box = await page.getByRole('button', { name: '拖动图书馆' }).boundingBox();
  if (!box) throw Error('handle missing');
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 20, box.y + 43, { steps: 10 });
  await page.mouse.up();
  await expect(page.getByText('09:30 · 30 分钟')).toBeVisible();
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(page.getByText('09:07 · 30 分钟')).toBeVisible();
});
test('touch scrolling does not reschedule a card', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'CDP touch injection only');
  await page.getByRole('button', { name: '新增事项' }).click();
  await page.getByLabel('事项名称').fill('散步');
  await page.getByLabel('开始时间', { exact: true }).fill('09:07');
  await page.getByRole('button', { name: '保存事项' }).click();
  const box = await page.getByRole('button', { name: /^散步/ }).boundingBox();
  if (!box) throw Error('card missing');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: box.x + 15, y: box.y + 20 }],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: box.x + 15, y: box.y - 20 }],
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.getByText('09:07 · 30 分钟')).toBeVisible();
});
test('long-press touch handle adjusts a card', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'CDP touch injection only');
  await page.getByRole('button', { name: '新增事项' }).click();
  await page.getByLabel('事项名称').fill('散步');
  await page.getByLabel('开始时间', { exact: true }).fill('09:07');
  await page.getByRole('button', { name: '保存事项' }).click();
  const box = await page.getByRole('button', { name: '拖动散步' }).boundingBox();
  if (!box) throw Error('handle missing');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: box.x + 20, y: box.y + 20 }],
  });
  await page.waitForTimeout(350);
  for (let dy = 5; dy <= 30; dy += 5) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: box.x + 20, y: box.y + 20 + dy }],
    });
    await page.evaluate(() => new Promise(requestAnimationFrame));
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.getByText('09:30 · 30 分钟')).toBeVisible();
});
