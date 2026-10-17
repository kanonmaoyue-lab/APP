import { expect, test } from '@playwright/test';
test('portrait and landscape have usable controls, modal focus and no page overflow', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const viewport of [{ width: 834, height: 1194 }, { width: 1194, height: 834 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/tests/harness.html');
    await expect(page.getByRole('navigation')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const small = await page.getByRole('button').evaluateAll((buttons) =>
      buttons.filter((b) => {
        const r = b.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && (r.width < 43.5 || r.height < 43.5);
      }).map((b) => b.textContent)
    );
    expect(small).toEqual([]);
    await page.getByRole('button', { name: '新增事项' }).click();
    await expect(page.getByLabel('事项名称')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    if (viewport.width <= 1050) {
      await page.getByRole('button', { name: '复习花园', exact: true }).click();
      const header = await page.getByRole('complementary').boundingBox();
      expect(header?.height).toBeLessThan(220);
    }
  }
});
