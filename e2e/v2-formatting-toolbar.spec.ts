import { test, expect, type Page } from '@playwright/test';
import { openViewMenu } from './helpers/viewMenu';

/**
 * E2E coverage for the FormattingToolbar.
 *
 * Flow per test:
 *   1. Fresh load of the demo (`/`) with IndexedDB cleared.
 *   2. Open the floating toolbar via the FiltersToolbar's Brush toggle
 *      (the toolbar isn't rendered on initial load — by design, it lives
 *      in a `<DraggableFloat>` panel the user toggles on).
 *   3. Click a cell so the toolbar sees an "active column".
 *   4. Click a toolbar button via its accessible name (aria-label =
 *      tooltip string — added in the refactor's step 4). No more
 *      DOM-walking helper.
 *   5. Assert the cell's computed style AND/OR the module state
 *      persisted across reload.
 *
 * Toolbar button coverage:
 *   - Typography (bold / italic / underline)
 *   - Alignment (left / center / right)
 *   - Clear all styles
 *   - Save as template (enabled-state smoke)
 *
 * Popover-gated features (color picker, borders, font size, formatter
 * presets) are covered by markets-grid's component integration tests.
 */

async function waitForGrid(page: Page) {
  await page.waitForSelector('[data-grid-id="demo-blotter-v2"]', { timeout: 10_000 });
  await page.waitForSelector('.ag-body-viewport .ag-row', { timeout: 15_000 });
  await page.waitForTimeout(500);
}

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
  // Reset the one-shot legacy-migration flag so a fresh wipe followed
  // by a reload re-evaluates the migration — keeps test setup boundaries
  // crisp even though demo-react has no legacy data to migrate.
  await page.evaluate(() => localStorage.removeItem('profile-migration-v1'));
}

/** Open the pinned FormattingToolbar. It sits beneath the FiltersToolbar,
 *  gated behind the same Brush toggle — click to show, click again to
 *  hide. Idempotent: no-op when already open. */
async function openFormattingToolbar(page: Page) {
  const pinned = page.locator('[data-testid="formatting-toolbar-pinned"]');
  if (!(await pinned.isVisible().catch(() => false))) {
    await openViewMenu(page);
    await page.locator('[data-testid="style-toolbar-toggle"]').click();
  }
  await expect(page.locator('[data-testid="formatting-toolbar"]')).toBeVisible();
}

async function getFirstDataColId(page: Page): Promise<string> {
  const colId = await page.evaluate(() => {
    const cell = document.querySelector('.ag-center-cols-container .ag-cell');
    return cell?.getAttribute('col-id') ?? '';
  });
  expect(colId).toBeTruthy();
  return colId;
}

async function selectCell(page: Page, colId: string, rowIndex = 0) {
  const cell = page.locator(`.ag-row[row-index="${rowIndex}"] .ag-cell[col-id="${colId}"]`);
  await cell.click();
  // The toolbar's `useActiveColumns` hook subscribes to cellSelectionChanged
  // / cellClicked / cellFocused through the ApiHub. Give React a moment to
  // batch the state update.
  await page.waitForTimeout(250);
}

async function getCellStyle(
  page: Page,
  colId: string,
  prop: string,
  rowIndex = 0,
): Promise<string> {
  return page.evaluate(
    ({ id, row, p }) => {
      const cell = document.querySelector(
        `.ag-row[row-index="${row}"] .ag-cell[col-id="${id}"]`,
      );
      return cell ? getComputedStyle(cell).getPropertyValue(p) : '';
    },
    { id: colId, row: rowIndex, p: prop },
  );
}

/**
 * Click a toolbar button by its accessible name (= tooltip text).
 *
 * Every TBtn in the toolbar forwards `tooltip` → `aria-label` so screen
 * readers + `getByRole` queries can find it. Buttons listen on
 * `onMouseDown` (not `onClick`) to avoid focus thrash; we dispatch a
 * real mousedown event from the browser side.
 */
async function clickToolbarBtn(page: Page, tooltipText: string) {
  const btn = page.getByRole('button', { name: tooltipText });
  await btn.dispatchEvent('mousedown');
  await page.waitForTimeout(150);
}

test.describe('v2 FormattingToolbar', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearV2(page);
    await page.goto('/');
    await waitForGrid(page);
    await openFormattingToolbar(page);
  });

  test('toolbar moves into enabled state once a cell is selected', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);
    await expect(page.getByRole('button', { name: 'Bold' })).toBeEnabled();
  });

  test('Bold writes typography.bold and emits font-weight 700', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);
    await clickToolbarBtn(page, 'Bold');
    const fontWeight = await getCellStyle(page, colId, 'font-weight');
    expect(['700', 'bold']).toContain(fontWeight);
  });

  test('Italic writes typography.italic and emits font-style italic', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);
    await clickToolbarBtn(page, 'Italic');
    expect(await getCellStyle(page, colId, 'font-style')).toBe('italic');
  });

  test('Underline writes typography.underline and emits text-decoration', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);
    await clickToolbarBtn(page, 'Underline');
    expect(await getCellStyle(page, colId, 'text-decoration-line')).toContain('underline');
  });

  test('Right writes alignment.horizontal=right and emits text-align', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);
    await clickToolbarBtn(page, 'Right');
    expect(await getCellStyle(page, colId, 'text-align')).toBe('right');
  });

  test('Center writes alignment.horizontal=center and emits text-align', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);
    await clickToolbarBtn(page, 'Center');
    expect(await getCellStyle(page, colId, 'text-align')).toBe('center');
  });

  test('Left writes alignment.horizontal=left and emits text-align', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);
    await clickToolbarBtn(page, 'Left');
    expect(await getCellStyle(page, colId, 'text-align')).toBe('left');
  });

  test('Clear all styles resets the column to bare {colId}', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);
    await clickToolbarBtn(page, 'Bold');
    await clickToolbarBtn(page, 'Italic');
    expect(['700', 'bold']).toContain(await getCellStyle(page, colId, 'font-weight'));
    expect(await getCellStyle(page, colId, 'font-style')).toBe('italic');

    // Clear fires immediately — no confirm dialog.
    await page.locator('[data-testid="formatting-clear-selected"]').click();
    await page.waitForTimeout(400);

    expect(['400', 'normal']).toContain(await getCellStyle(page, colId, 'font-weight'));
    expect(await getCellStyle(page, colId, 'font-style')).toBe('normal');
  });

  test('Bold persists across reload after clicking Save (explicit-save contract)', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);
    await clickToolbarBtn(page, 'Bold');
    // Profiles are explicit-save-only now. Without clicking Save, the
    // Bold mutation would live only in memory and get thrown away by
    // the reload.
    await page.locator('[data-testid="save-all-btn"]').click();
    await page.waitForTimeout(200);

    await page.reload();
    await waitForGrid(page);
    await openFormattingToolbar(page);
    const fontWeight = await getCellStyle(page, colId, 'font-weight');
    expect(['700', 'bold']).toContain(fontWeight);
  });

  test('Templates menu stays enabled when a styled cell is selected', async ({ page }) => {
    const colId = await getFirstDataColId(page);
    await selectCell(page, colId);
    await clickToolbarBtn(page, 'Bold');
    await expect(page.locator('[data-testid="templates-menu-trigger"]')).toBeEnabled();
  });
});
