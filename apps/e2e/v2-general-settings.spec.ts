import { test, expect, type Page } from '@playwright/test';
import {
  bootCleanDemo,
  openPanel,
  closeSettingsSheet,
} from './helpers/settingsSheet';

/**
 * Full behavioural coverage for the general-settings (Grid Options)
 * panel (GridOptionsPanel, documented in IMPLEMENTED_FEATURES.md §1.11).
 *
 * The panel is a singleton — one draft for the whole grid rather than
 * per-item. It hosts ~60 controls across 8 bands, driven from the
 * declarative `GRID_OPTIONS_SCHEMA`. Full coverage of every control
 * would be excessive; this spec picks representative controls from
 * each kind (bool, num, select, text) and verifies the AG-Grid
 * integration end-to-end where the DOM reflects the change.
 */

// ─── Helpers ────────────────────────────────────────────────────────────

/** Clicks the Radix Switch root (role=switch). */
async function toggleSwitch(page: Page, testid: string): Promise<void> {
  await page.locator(`[data-testid="${testid}"]`).click();
}

/** Commits an IconInput value via Enter + waits a tick. */
async function commitIconInput(
  page: Page,
  testid: string,
  value: string,
): Promise<void> {
  const input = page.locator(`[data-testid="${testid}"]`);
  await input.fill(value);
  await input.press('Enter');
}

/** Clicks SAVE + waits for dirty clear. */
async function savePanel(page: Page): Promise<void> {
  const btn = page.locator('[data-testid="go-save-btn"]');
  await expect(btn).toBeEnabled();
  await btn.click();
  await expect(btn).toBeDisabled({ timeout: 2000 });
}

// ─── Tests ──────────────────────────────────────────────────────────────

test.describe('v2 — general-settings (Grid Options) panel', () => {
  test.beforeEach(async ({ page }) => {
    await bootCleanDemo(page);
  });

  test('panel mounts with initial values + meta strip', async ({ page }) => {
    await openPanel(page, 'general-settings');
    await expect(page.locator('[data-testid="go-panel"]')).toBeVisible();

    // Representative initial values — INITIAL_GENERAL_SETTINGS.
    await expect(page.locator('[data-testid="go-row-height"]')).toHaveValue('36');
    await expect(page.locator('[data-testid="go-animate-rows"]')).not.toBeChecked();
    await expect(page.locator('[data-testid="go-pagination"]')).not.toBeChecked();

    // Meta strip: OVERRIDES starts at 0, DIRTY stays '—' until edit.
    await expect(page.locator('[data-testid="go-panel"]')).toContainText('OVERRIDES');
  });

  test('SAVE pill starts disabled and enables only after an edit', async ({ page }) => {
    await openPanel(page, 'general-settings');
    const save = page.locator('[data-testid="go-save-btn"]');
    const discard = page.locator('[data-testid="go-discard-btn"]');
    await expect(save).toBeDisabled();
    await expect(discard).toBeDisabled();

    await commitIconInput(page, 'go-row-height', '42');
    await expect(save).toBeEnabled();
    await expect(discard).toBeEnabled();
  });

  test('row-height change reflects in AG-Grid row heights after save', async ({ page }) => {
    await openPanel(page, 'general-settings');
    await commitIconInput(page, 'go-row-height', '48');
    await savePanel(page);
    await closeSettingsSheet(page);

    // AG-Grid sets `height` as an inline style on each `.ag-row`. The
    // number of body rows may vary with viewport; we check the first.
    const rowHeight = await page.evaluate(() => {
      const row = document.querySelector('.ag-center-cols-container .ag-row') as HTMLElement | null;
      return row?.style.height ?? '';
    });
    expect(rowHeight).toBe('48px');
  });

  test('animate-rows toggle persists + updates OVERRIDES counter', async ({ page }) => {
    await openPanel(page, 'general-settings');
    // Panel shows OVERRIDES=0 initially.
    const metaCells = page.locator('[data-testid="go-panel"] .ds-meta-cell');
    await expect(metaCells.nth(1)).toContainText('0');

    await toggleSwitch(page, 'go-animate-rows');
    await savePanel(page);

    // OVERRIDES now 1 — animateRows turned on from its initial false default.
    await expect(metaCells.nth(1)).toContainText('1');
    await expect(page.locator('[data-testid="go-animate-rows"]')).toBeChecked();
  });

  test('row-selection select persists after save + re-open', async ({ page }) => {
    await openPanel(page, 'general-settings');
    const select = page.locator('[data-testid="go-row-selection"]');
    await expect(select).toBeVisible();
    // Initial value is the sentinel used by the Select primitive for
    // "undefined" (AG-Grid has no default — blank = off).
    const initial = await select.inputValue();
    expect(['__none__', '']).toContain(initial);

    await select.selectOption('multiRow');
    await savePanel(page);

    // Re-open the panel to re-hydrate from committed state.
    await closeSettingsSheet(page);
    await openPanel(page, 'general-settings');
    await expect(page.locator('[data-testid="go-row-selection"]')).toHaveValue('multiRow');
  });

  test('quick-filter text filters the grid to zero rows for a no-match string', async ({ page }) => {
    await openPanel(page, 'general-settings');
    await commitIconInput(page, 'go-quick-filter', 'ZZZZ_NO_MATCH_ZZZZ');
    await savePanel(page);
    await closeSettingsSheet(page);

    // With a filter that matches no row, the grid should render zero
    // body rows. AG-Grid may still render the row container shell but
    // no `.ag-row` children.
    await expect(
      page.locator('.ag-center-cols-container .ag-row'),
    ).toHaveCount(0, { timeout: 3000 });
  });

  test('pagination toggle reveals AG-Grid pagination controls', async ({ page }) => {
    await openPanel(page, 'general-settings');
    await toggleSwitch(page, 'go-pagination');
    await savePanel(page);
    await closeSettingsSheet(page);

    // AG-Grid renders its pagination panel with the class
    // `.ag-paging-panel`. Should be visible now.
    await expect(page.locator('.ag-paging-panel').first()).toBeVisible({ timeout: 3000 });
  });

  test('discard reverts an uncommitted draft', async ({ page }) => {
    await openPanel(page, 'general-settings');
    await commitIconInput(page, 'go-row-height', '60');
    await expect(page.locator('[data-testid="go-save-btn"]')).toBeEnabled();

    await page.locator('[data-testid="go-discard-btn"]').click();
    await expect(page.locator('[data-testid="go-save-btn"]')).toBeDisabled();
    await expect(page.locator('[data-testid="go-row-height"]')).toHaveValue('36');
  });

  test('changes persist across reload', async ({ page }) => {
    await openPanel(page, 'general-settings');
    await commitIconInput(page, 'go-row-height', '40');
    await toggleSwitch(page, 'go-pagination');
    await savePanel(page);
    await closeSettingsSheet(page);

    // Explicit-save.
    await page.locator('[data-testid="save-all-btn"]').click();
    await page.waitForTimeout(200);
    await page.reload();
    await page.waitForSelector('[data-grid-id="demo-blotter-v2"]', { timeout: 10_000 });
    await page.waitForSelector('.ag-body-viewport .ag-row', { timeout: 15_000 });

    // Pagination panel still visible + row heights reflect 40.
    await expect(page.locator('.ag-paging-panel').first()).toBeVisible({ timeout: 3000 });
    const rowHeight = await page.evaluate(() => {
      const row = document.querySelector('.ag-center-cols-container .ag-row') as HTMLElement | null;
      return row?.style.height ?? '';
    });
    expect(rowHeight).toBe('40px');

    // Panel reads committed values correctly too.
    await openPanel(page, 'general-settings');
    await expect(page.locator('[data-testid="go-row-height"]')).toHaveValue('40');
    await expect(page.locator('[data-testid="go-pagination"]')).toBeChecked();
  });
});
