import { test, expect, type Page } from '@playwright/test';
import { clickSettingsFromToolbar, navigateToModule } from './helpers/settingsSheet';
import { openEditingToolbar } from './helpers/editingToolbar';

/**
 * Edit History e2e — markets-grid-lab Smart Edit tab with history toolbar (:5300).
 */

const LAB_URL = 'http://localhost:5300/';
const GRID_ID = 'lab-editing';
const SEED_FLAG_KEY = `lab-demo-profiles-v2:${GRID_ID}`;

async function clearLabStorage(page: Page): Promise<void> {
  await page.evaluate((flagKey) => {
    Object.keys(localStorage)
      .filter(
        (k) =>
          k.startsWith('markets-grid-bundle:lab-') ||
          k.startsWith('gc-active-profile:lab-') ||
          k.startsWith('lab-seeded:') ||
          k.startsWith('lab-demo-profiles-'),
      )
      .forEach((k) => localStorage.removeItem(k));
    localStorage.removeItem(flagKey);
  }, SEED_FLAG_KEY);
}

async function bootHistoryTab(page: Page): Promise<void> {
  await page.goto(LAB_URL);
  await page.waitForLoadState('domcontentloaded');
  await clearLabStorage(page);
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('[data-testid^="lab-tab-"]', { timeout: 15_000 });
  await page.locator('[data-testid="lab-tab-editing"]').click();
  await page.waitForSelector(`[data-grid-id="${GRID_ID}"]`, { timeout: 15_000 });
  await openEditingToolbar(page);
  await page.waitForSelector(`[data-grid-id="${GRID_ID}"] .ag-grid-viewport .ag-row`, {
    timeout: 15_000,
  });
  await page.waitForFunction(
    (key) => localStorage.getItem(key) === '1',
    SEED_FLAG_KEY,
    { timeout: 20_000 },
  );
}

async function editCellInline(page: Page, cell: ReturnType<Page['locator']>, value: string): Promise<void> {
  await cell.dblclick();
  const editor = page.locator('.ag-cell-inline-editing input, .ag-cell-inline-editing textarea').first();
  await editor.waitFor({ state: 'visible', timeout: 5_000 });
  await editor.fill(value);
  await page.keyboard.press('Enter');
}

test.describe('Edit History lab tab', () => {
  test('history toolbar renders undo/redo controls', async ({ page }) => {
    await bootHistoryTab(page);
    await expect(page.getByTestId('edit-history-toolbar')).toBeVisible();
    await expect(page.getByTestId('edit-history-undo')).toBeDisabled();
    await expect(page.getByTestId('edit-history-redo')).toBeDisabled();
  });

  test('smart edit then undo restores prior value', async ({ page }) => {
    await bootHistoryTab(page);

    const grid = page.locator(`[data-grid-id="${GRID_ID}"]`);
    const cell = grid.locator('.ag-row[row-index="0"] .ag-cell[col-id="quantityFace"]');
    await cell.waitFor({ state: 'visible' });

    const before = (await cell.innerText()).trim();
    await cell.click();

    await page.getByTestId('smart-edit-operand').fill('2');
    await page.getByTestId('smart-edit-op-multiply').click();

    await expect(cell).not.toHaveText(before, { timeout: 5_000 });
    await expect(page.getByTestId('edit-history-undo')).toBeEnabled({ timeout: 5_000 });

    await page.getByTestId('edit-history-undo').click();
    await expect(cell).toHaveText(before, { timeout: 5_000 });
    await expect(page.getByTestId('edit-history-redo')).toBeEnabled({ timeout: 5_000 });

    await page.getByTestId('edit-history-redo').click();
    await expect(cell).not.toHaveText(before, { timeout: 5_000 });
  });

  test('in-cell edit then undo restores prior value', async ({ page }) => {
    await bootHistoryTab(page);

    const grid = page.locator(`[data-grid-id="${GRID_ID}"]`);
    const cell = grid.locator('.ag-row[row-index="0"] .ag-cell[col-id="quantityFace"]');
    await cell.waitFor({ state: 'visible' });

    const before = (await cell.innerText()).trim();
    await editCellInline(page, cell, '12345');

    await expect(cell).not.toHaveText(before, { timeout: 5_000 });
    await expect(page.getByTestId('edit-history-undo')).toBeEnabled({ timeout: 5_000 });

    await page.getByTestId('edit-history-undo').click();
    await expect(cell).toHaveText(before, { timeout: 5_000 });
  });

  test('settings sheet opens Edit History panel with monitor', async ({ page }) => {
    await bootHistoryTab(page);
    await clickSettingsFromToolbar(page);
    await page.locator('.ds-sheet').waitFor({ state: 'visible' });
    await navigateToModule(page, 'data-change-history');
    await expect(page.getByTestId('edit-history-panel')).toBeVisible();
    await expect(page.getByTestId('dch-enabled-toggle')).toBeVisible();
  });

  test('history count increments after smart edit apply', async ({ page }) => {
    await bootHistoryTab(page);

    const grid = page.locator(`[data-grid-id="${GRID_ID}"]`);
    const cell = grid.locator('.ag-row[row-index="0"] .ag-cell[col-id="quantityFace"]');
    await cell.click();
    await page.getByTestId('smart-edit-operand').fill('2');
    await page.getByTestId('smart-edit-op-multiply').click();

    await expect(page.getByTestId('edit-history-count')).toContainText('1', { timeout: 5_000 });
  });

  test('monitor panel per-entry undo restores prior value', async ({ page }) => {
    await bootHistoryTab(page);

    const grid = page.locator(`[data-grid-id="${GRID_ID}"]`);
    const cell = grid.locator('.ag-row[row-index="0"] .ag-cell[col-id="quantityFace"]');
    const before = (await cell.innerText()).trim();

    await cell.click();
    await page.getByTestId('smart-edit-operand').fill('2');
    await page.getByTestId('smart-edit-op-multiply').click();
    await expect(cell).not.toHaveText(before, { timeout: 5_000 });

    await clickSettingsFromToolbar(page);
    await page.locator('.ds-sheet').waitFor({ state: 'visible' });
    await navigateToModule(page, 'data-change-history');

    const entry = page.locator('[data-testid^="dch-entry-"]').first();
    await expect(entry).toBeVisible({ timeout: 5_000 });
    await entry.locator('[data-testid^="dch-undo-entry-"]').click();

    await expect(cell).toHaveText(before, { timeout: 5_000 });
  });

  test('suspend toggle in settings stops journaling new edits', async ({ page }) => {
    await bootHistoryTab(page);

    await clickSettingsFromToolbar(page);
    await page.locator('.ds-sheet').waitFor({ state: 'visible' });
    await navigateToModule(page, 'data-change-history');
    await page.getByTestId('dch-suspended-toggle').click();
    await page.getByRole('button', { name: 'Save' }).click();
    await page.keyboard.press('Escape');

    const grid = page.locator(`[data-grid-id="${GRID_ID}"]`);
    const cell = grid.locator('.ag-row[row-index="0"] .ag-cell[col-id="quantityFace"]');
    await cell.click();
    await page.getByTestId('smart-edit-operand').fill('2');
    await page.getByTestId('smart-edit-op-multiply').click();

    await expect(page.getByTestId('edit-history-undo')).toBeDisabled({ timeout: 5_000 });
  });
});
