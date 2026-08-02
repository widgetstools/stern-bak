/**
 * Smoke: a single star-demo MarketsGrid blotter mounts inside a real
 * OpenFin runtime, reaches an interactive grid with STOMP-fed rows, and
 * the rows tick. This is the baseline the multi-window guards build on.
 */
import { test, expect } from '../fixtures/launchOpenFin';

const ROW_SELECTOR = '.ag-center-cols-container .ag-row';
const CELL_SELECTOR = '.ag-center-cols-container .ag-row .ag-cell';

test.describe('star-demo — blotter smoke', () => {
  test('blotter mounts in OpenFin and loads STOMP rows', async ({ platform }) => {
    const page = await platform.openBlotter('smoke-1');

    // Grid shell paints (headers from the provider column definitions).
    await expect(page.locator('.ag-header-cell').first()).toBeVisible({ timeout: 30_000 });

    // The identity gate must not strand the window on its placeholder.
    await expect(page.getByText('Connecting to ConfigService')).toHaveCount(0);

    // Rows arrive over the STOMP snapshot.
    await expect(page.locator(ROW_SELECTOR).first()).toBeVisible({ timeout: 45_000 });
    const rowCount = await page.locator(ROW_SELECTOR).count();
    expect(rowCount).toBeGreaterThan(0);
  });

  test('rows tick while running inside OpenFin', async ({ platform }) => {
    const page = await platform.openBlotter('smoke-tick-1');
    const firstCell = page.locator(CELL_SELECTOR).first();
    await expect(firstCell).toBeVisible({ timeout: 45_000 });

    // Sample a numeric cell repeatedly; the live STOMP feed mutates rows.
    const sample = async () => {
      const texts = await page.locator(CELL_SELECTOR).allInnerTexts();
      return texts.slice(0, 40).join('|');
    };

    const before = await sample();
    let changed = false;
    for (let i = 0; i < 30 && !changed; i++) {
      await page.waitForTimeout(250);
      if ((await sample()) !== before) changed = true;
    }
    expect(changed).toBe(true);
  });
});
