import { test, expect, type Page } from '@playwright/test';
import { openViewMenu } from './helpers/viewMenu';

/**
 * Cross-grid isolation e2e — proves the multi-grid claim.
 *
 * The demo's `/?view=dashboard` page mounts two `<MarketsGrid>`
 * instances side by side:
 *   - dashboard-rates-v2     (Rates Blotter — 500 FI orders)
 *   - dashboard-equities-v2  (Equities Blotter — 300 equity orders)
 *
 * Each grid owns its own `GridPlatform` → its own DirtyBus, ApiHub,
 * module stores, toolbars, profile adapters. The refactor's step 7 made
 * every toolbar context-driven; this spec verifies that formatting grid
 * A leaves grid B visually AND semantically untouched.
 *
 * Structure per test:
 *   1. Open the dashboard (fresh IndexedDB).
 *   2. Open the formatting toolbar on grid A, click a cell, apply a
 *      style (Bold).
 *   3. Assert grid A renders the style AND grid B does NOT.
 *   4. Verify each grid's DOM is scoped to its own `[data-grid-id=…]`
 *      so there's no leakage at the selector level either.
 */

async function clearV2(page: Page) {
  await page.evaluate(async () => {
    Object.keys(localStorage)
      .filter((k) => k.startsWith('gc-active-profile:') || k.startsWith('gc-state:') || k.startsWith('ds-grid:'))
      .forEach((k) => localStorage.removeItem(k));
    return new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('marketsui-config');
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
  });
  await page.evaluate(() => localStorage.removeItem('profile-migration-v1'));
}

async function waitForBothGrids(page: Page) {
  await page.waitForSelector('[data-grid-id="dashboard-rates-v2"]', { timeout: 10_000 });
  await page.waitForSelector('[data-grid-id="dashboard-equities-v2"]', { timeout: 10_000 });
  // Wait for both to have at least one rendered row.
  await page.waitForFunction(
    () => {
      const rates = document.querySelector(
        '[data-grid-id="dashboard-rates-v2"] .ag-grid-viewport .ag-row',
      );
      const equities = document.querySelector(
        '[data-grid-id="dashboard-equities-v2"] .ag-grid-viewport .ag-row',
      );
      return !!rates && !!equities;
    },
    { timeout: 15_000 },
  );
  // Plus a small settling delay — profile auto-seed + initial
  // columnEverythingChanged events.
  await page.waitForTimeout(500);
}

/**
 * Click the Brush pill INSIDE a specific grid's FiltersToolbar. The
 * toggle is scoped by the grid's root `[data-grid-id]` attribute so
 * each grid's toolbar opens independently.
 *
 * The toolbar is now a pinned row beneath the grid's FiltersToolbar
 * (not a floating overlay), so there's no cross-grid pointer
 * interception — opening one grid's toolbar can't block the other's
 * toggle.
 */
async function openFormattingToolbar(page: Page, gridId: string) {
  const grid = page.locator(`[data-grid-id="${gridId}"]`);
  const pinned = grid.locator('[data-testid="formatting-toolbar-pinned"]');
  if (!(await pinned.isVisible().catch(() => false))) {
    await openViewMenu(grid);
    await page.locator('[data-testid="style-toolbar-toggle"]').click();
  }
  await expect(pinned).toBeVisible();
}

async function selectCellInGrid(page: Page, gridId: string, colId: string, rowIndex = 0) {
  const cell = page.locator(
    `[data-grid-id="${gridId}"] .ag-row[row-index="${rowIndex}"] .ag-cell[col-id="${colId}"]`,
  );
  await cell.click();
  await page.waitForTimeout(250);
}

/**
 * Click a toolbar button scoped to ONE grid. Pinned toolbars mean
 * both grids' toolbars can be visible simultaneously, so
 * `getByRole('button', { name })` returns two matches — we scope
 * by the grid's `[data-grid-id]` root so the query is unambiguous.
 */
async function clickToolbarBtn(page: Page, gridId: string, tooltipText: string) {
  const btn = page
    .locator(`[data-grid-id="${gridId}"]`)
    .getByRole('button', { name: tooltipText });
  await btn.dispatchEvent('mousedown');
  await page.waitForTimeout(150);
}

async function getCellFontWeight(page: Page, gridId: string, colId: string, rowIndex = 0) {
  return page.evaluate(
    ({ g, id, row }) => {
      const cell = document.querySelector(
        `[data-grid-id="${g}"] .ag-row[row-index="${row}"] .ag-cell[col-id="${id}"]`,
      );
      return cell ? getComputedStyle(cell).getPropertyValue('font-weight') : '';
    },
    { g: gridId, id: colId, row: rowIndex },
  );
}

test.describe('Two-grid dashboard — cross-grid isolation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?view=dashboard');
    await clearV2(page);
    await page.goto('/?view=dashboard');
    await waitForBothGrids(page);
  });

  test('dashboard renders both grids with distinct gridIds', async ({ page }) => {
    await expect(page.locator('[data-testid="two-grid-dashboard"]')).toBeVisible();
    await expect(page.locator('[data-testid="dashboard-panel-dashboard-rates-v2"]')).toBeVisible();
    await expect(page.locator('[data-testid="dashboard-panel-dashboard-equities-v2"]')).toBeVisible();

    // Each panel emits a distinct `[data-grid-id]` root — proves the
    // platform wiring is per-instance.
    const ids = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-grid-id]')).map((el) => el.getAttribute('data-grid-id')),
    );
    expect(ids).toContain('dashboard-rates-v2');
    expect(ids).toContain('dashboard-equities-v2');
  });

  test('bold applied to rates grid does NOT bleed into equities grid', async ({ page }) => {
    // Open grid A's toolbar, select a cell, apply bold.
    await openFormattingToolbar(page, 'dashboard-rates-v2');
    await selectCellInGrid(page, 'dashboard-rates-v2', 'price');
    await clickToolbarBtn(page, 'dashboard-rates-v2', 'Bold');

    // Grid A's price cell is bold.
    const ratesWeight = await getCellFontWeight(page, 'dashboard-rates-v2', 'price');
    expect(['700', 'bold']).toContain(ratesWeight);

    // Grid B's price cell is NOT bold.
    const equityWeight = await getCellFontWeight(page, 'dashboard-equities-v2', 'price');
    expect(['400', 'normal', '']).toContain(equityWeight);
  });

  test('each grid keeps its own formatting independently across reloads', async ({ page }) => {
    // Bold on grid A (rates, price column).
    await openFormattingToolbar(page, 'dashboard-rates-v2');
    await selectCellInGrid(page, 'dashboard-rates-v2', 'price');
    await clickToolbarBtn(page, 'dashboard-rates-v2', 'Bold');

    // Italic on grid B (equities, quantity column).
    await openFormattingToolbar(page, 'dashboard-equities-v2');
    await selectCellInGrid(page, 'dashboard-equities-v2', 'quantity');
    await clickToolbarBtn(page, 'dashboard-equities-v2', 'Italic');

    // Profiles are explicit-save-only. Click each grid's own Save
    // button so both snapshots land in IndexedDB before the reload.
    // Each grid renders its own Save button scoped under its
    // `[data-grid-id]` root.
    await page
      .locator('[data-grid-id="dashboard-rates-v2"] [data-testid="save-all-btn"]')
      .click();
    await page
      .locator('[data-grid-id="dashboard-equities-v2"] [data-testid="save-all-btn"]')
      .click();
    await page.waitForTimeout(300);

    await page.reload();
    await waitForBothGrids(page);

    // Grid A's price is bold; grid A's quantity is NOT italic.
    const ratesPriceWeight = await getCellFontWeight(page, 'dashboard-rates-v2', 'price');
    expect(['700', 'bold']).toContain(ratesPriceWeight);
    const ratesQtyStyle = await page.evaluate(() => {
      const cell = document.querySelector(
        '[data-grid-id="dashboard-rates-v2"] .ag-row[row-index="0"] .ag-cell[col-id="quantity"]',
      );
      return cell ? getComputedStyle(cell).getPropertyValue('font-style') : '';
    });
    expect(ratesQtyStyle).toBe('normal');

    // Grid B's quantity is italic; grid B's price is NOT bold.
    const equityQtyStyle = await page.evaluate(() => {
      const cell = document.querySelector(
        '[data-grid-id="dashboard-equities-v2"] .ag-row[row-index="0"] .ag-cell[col-id="quantity"]',
      );
      return cell ? getComputedStyle(cell).getPropertyValue('font-style') : '';
    });
    expect(equityQtyStyle).toBe('italic');
    const equityPriceWeight = await getCellFontWeight(page, 'dashboard-equities-v2', 'price');
    expect(['400', 'normal', '']).toContain(equityPriceWeight);
  });

  test('view switcher toggles between single and dashboard', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-grid-id="demo-blotter-v2"]', { timeout: 10_000 });
    await expect(page.locator('[data-testid="view-tab-single"]')).toHaveAttribute('data-active', 'true');

    await page.locator('[data-testid="view-tab-dashboard"]').click();
    await waitForBothGrids(page);
    await expect(page.locator('[data-testid="view-tab-dashboard"]')).toHaveAttribute('data-active', 'true');
    await expect(page).toHaveURL(/\?view=dashboard$/);

    await page.locator('[data-testid="view-tab-single"]').click();
    await page.waitForSelector('[data-grid-id="demo-blotter-v2"]', { timeout: 10_000 });
    await expect(page).not.toHaveURL(/view=dashboard/);
  });
});
