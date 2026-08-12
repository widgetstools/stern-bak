import { test, expect, type Page, type Locator } from '@playwright/test';
import {
  bootCleanDemo,
  openSettingsSheet,
  closeSettingsSheet,
  navigateToModule,
} from './helpers/settingsSheet';

/**
 * Row-exclusion expressions — authored in the grid customizer's "Custom
 * Settings" tab (the `toolbar-date-settings` module), applied at runtime via
 * AG-Grid's external filter (`isExternalFilterPresent` /
 * `doesExternalFilterPass`). An EXCLUDE-when-true predicate hides matching
 * rows without removing them from the row data.
 *
 * This spec proves the end-to-end wiring (panel → Save → external filter →
 * grid hides rows → clearing restores them) with a column predicate that
 * resolves against live row data. The exact column-value semantics (which
 * rows match which predicate) are covered exhaustively by the
 * rowExclusionFilter unit tests; asserting a *specific* value is hidden in the
 * DOM is unreliable under AG-Grid row virtualization, so here we use a
 * predicate true for every row (`[venue] != "__none__"` — every demo row has a
 * venue) and assert the grid empties, then restores when cleared.
 */

const GRID = '[data-grid-id="demo-blotter-v2"]';
const ROW_FILTER_EDITOR = 'tds-row-filter-editor';

function gridRows(page: Page): Locator {
  return page.locator(`${GRID} .ag-grid-scrolling-rows .ag-row`);
}

/**
 * Type into the row-filter ExpressionEditor. Prefers Monaco's hidden textarea
 * (`textarea.inputarea`); falls back to the testid'd plain textarea if the
 * Monaco chunk never mounts. The editor stages every keystroke into the draft
 * (`onChange`), so no Enter/commit is needed — and we never press Escape,
 * which would close the settings sheet.
 */
async function typeRowFilter(page: Page, text: string) {
  const monaco = page.locator('textarea.inputarea');
  await monaco.waitFor({ state: 'attached', timeout: 10_000 }).catch(() => {});
  if (await monaco.count()) {
    await monaco.first().click({ force: true });
    await page.evaluate(() =>
      document.querySelector<HTMLTextAreaElement>('textarea.inputarea')?.focus(),
    );
  } else {
    await page.getByTestId(ROW_FILTER_EDITOR).click();
  }
  await page.keyboard.type(text, { delay: 20 });
}

/** Open Custom Settings → Row Filter section and return the Save button. */
async function openRowFilter(page: Page): Promise<Locator> {
  await openSettingsSheet(page);
  await navigateToModule(page, 'toolbar-date-settings');
  const panel = page.getByTestId('toolbar-date-settings-panel');
  await expect(panel).toBeVisible();
  await page.getByTestId('tds-nav-04').click();
  await expect(page.getByTestId('tds-row-filter-section')).toBeVisible();
  return panel.getByRole('button', { name: 'Save' });
}

test('excludes rows matching the expression and restores them when cleared', async ({ page }) => {
  await bootCleanDemo(page);
  await expect(gridRows(page).first()).toBeVisible();

  // ── Author an exclude-everything column predicate and Save ──────────
  const save = await openRowFilter(page);
  await typeRowFilter(page, '[venue] != "__none__"');
  await expect(save).toBeEnabled();
  await save.click();
  await closeSettingsSheet(page);

  // External filter now hides every row (the predicate is true for all).
  await expect(gridRows(page)).toHaveCount(0, { timeout: 10_000 });

  // ── Clear via the one-click Clear affordance → rows come back ───────
  const save2 = await openRowFilter(page);
  await page.getByTestId('tds-row-filter-clear').click();
  await expect(save2).toBeEnabled();
  await save2.click();
  await closeSettingsSheet(page);

  await expect(gridRows(page).first()).toBeVisible({ timeout: 10_000 });
});
