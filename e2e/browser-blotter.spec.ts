/**
 * Starter spec for apps/demos/e2e-browser-blotter/.
 *
 * Asserts the app boots, the mode banner shows the resolved URL mode,
 * MarketsGrid mounts, and the in-app ticker actually produces row
 * updates (price field drifts within 500ms).
 *
 * Adds the first canonical Playwright entry pointing at port 5180.
 * More specs target this app as the new e2e taxonomy fills out.
 */
import { test, expect } from '@playwright/test';

const APP_URL = 'http://localhost:5180';

test.describe('browser-blotter — boot + ticker smoke', () => {
  test('default mode resolves to "full" and mounts the grid', async ({ page }) => {
    await page.goto(`${APP_URL}/`);
    const banner = page.getByTestId('browser-blotter-mode-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toHaveAttribute('data-mode', 'full');

    const gridHost = page.getByTestId('browser-blotter-grid-host');
    await expect(gridHost).toBeVisible();
    await expect(page.locator('.ag-body-viewport .ag-row').first()).toBeVisible({ timeout: 10_000 });
  });

  test('?mode=standalone is wired and exposes the AG-Grid api on window', async ({ page }) => {
    await page.goto(`${APP_URL}/?mode=standalone`);
    const banner = page.getByTestId('browser-blotter-mode-banner');
    await expect(banner).toHaveAttribute('data-mode', 'standalone');
    await expect(banner).toHaveAttribute('data-status', 'wired');

    await expect(page.locator('.ag-body-viewport .ag-row').first()).toBeVisible({ timeout: 10_000 });

    // Wait for window hook to be installed by the App's onGridReady.
    await page.waitForFunction(() => typeof (window as any).__browserBlotterApi !== 'undefined', null, { timeout: 5_000 });
    const rowCount = await page.evaluate(() => {
      const api = (window as any).__browserBlotterApi;
      return api?.getDisplayedRowCount?.() ?? 0;
    });
    expect(rowCount).toBe(500);
  });

  test('in-app ticker actually mutates row data', async ({ page }) => {
    await page.goto(`${APP_URL}/?mode=standalone`);
    await page.waitForFunction(() => typeof (window as any).__browserBlotterApi !== 'undefined', null, { timeout: 10_000 });

    const sampleRow = async () => page.evaluate(() => {
      const api = (window as any).__browserBlotterApi;
      const node = api?.getDisplayedRowAtIndex?.(0);
      return node?.data ? { price: node.data.price, yield: node.data.yield } : null;
    });

    const before = await sampleRow();
    expect(before).not.toBeNull();

    // 50ms tick × ~30 cells; in 500ms expect at least one of the first 10 rows
    // to have its price mutated. Sample every 50ms.
    let changed = false;
    for (let i = 0; i < 20 && !changed; i++) {
      await page.waitForTimeout(50);
      const after = await sampleRow();
      if (after && (after.price !== before!.price || after.yield !== before!.yield)) {
        changed = true;
      }
    }
    expect(changed).toBe(true);
  });

  test('hub modes render banner with data-status="wired"', async ({ page }) => {
    for (const mode of ['provider', 'config', 'full'] as const) {
      await page.goto(`${APP_URL}/?mode=${mode}`);
      const banner = page.getByTestId('browser-blotter-mode-banner');
      await expect(banner).toHaveAttribute('data-mode', mode);
      await expect(banner).toHaveAttribute('data-status', 'wired');
      await expect(page.locator('.ag-body-viewport .ag-row').first()).toBeVisible({ timeout: 15_000 });
    }
  });
});
