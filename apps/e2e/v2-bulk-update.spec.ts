import { test, expect, type Page } from '@playwright/test';
import { clickSettingsFromToolbar, navigateToModule } from './helpers/settingsSheet';
import { openEditingToolbar } from './helpers/editingToolbar';
import {
  cellAt,
  clearLabStorage,
  setBulkUpdateValue,
} from './helpers/labEditing';

/**
 * Bulk Update e2e — markets-grid-lab Bulk Update tab (:5300).
 */

const LAB_URL = 'http://localhost:5300/';
const GRID_ID = 'lab-bulk-update';
const SEED_FLAG_KEY = `lab-demo-profiles-v2:${GRID_ID}`;

async function bootBulkUpdateTab(page: Page): Promise<void> {
  await page.goto(LAB_URL);
  await page.waitForLoadState('domcontentloaded');
  await clearLabStorage(page, GRID_ID);
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('[data-testid^="lab-tab-"]', { timeout: 15_000 });
  await page.locator('[data-testid="lab-tab-bulk-update"]').click();
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

async function setBulkValue(page: Page, value: string): Promise<void> {
  await setBulkUpdateValue(page, value);
}

test.describe('Bulk Update lab tab', () => {
  test('toolbar renders value control and apply button', async ({ page }) => {
    await bootBulkUpdateTab(page);
    await expect(page.getByTestId('bulk-update-toolbar')).toBeVisible();
    await expect(page.getByTestId('bulk-update-apply')).toBeVisible();
  });

  test('bulk set currency to EUR after selection', async ({ page }) => {
    await bootBulkUpdateTab(page);

    const grid = page.locator(`[data-grid-id="${GRID_ID}"]`);
    const firstCell = grid.locator('.ag-row[row-index="0"] .ag-cell[col-id="currency"]');
    const secondCell = grid.locator('.ag-row[row-index="1"] .ag-cell[col-id="currency"]');
    await firstCell.waitFor({ state: 'visible' });

    await firstCell.click();
    await page.keyboard.down('Shift');
    await secondCell.click();
    await page.keyboard.up('Shift');

    await expect(page.getByTestId('bulk-update-count')).toContainText('2 selected');
    await setBulkValue(page, 'EUR');
    await expect(page.getByTestId('bulk-update-apply')).toBeEnabled({ timeout: 5_000 });

    await page.getByTestId('bulk-update-apply').click();

    await expect(firstCell).toHaveText('EUR', { timeout: 5_000 });
    await expect(secondCell).toHaveText('EUR', { timeout: 5_000 });
  });

  test('undo restores prior currency via edit history toolbar', async ({ page }) => {
    await bootBulkUpdateTab(page);

    const grid = page.locator(`[data-grid-id="${GRID_ID}"]`);
    const cell = grid.locator('.ag-row[row-index="0"] .ag-cell[col-id="currency"]');
    await cell.waitFor({ state: 'visible' });
    const before = (await cell.innerText()).trim();
    if (before === 'EUR') {
      test.skip(true, 'Row already EUR — pick another seed value');
    }

    await cell.click();
    await expect(page.getByTestId('bulk-update-count')).toContainText('1 selected');

    await setBulkValue(page, 'EUR');
    await expect(page.getByTestId('bulk-update-apply')).toBeEnabled({ timeout: 5_000 });

    await page.getByTestId('bulk-update-apply').click();
    await expect(cell).toHaveText('EUR', { timeout: 5_000 });

    await page.getByTestId('edit-history-undo').click();
    await expect(cell).toHaveText(before, { timeout: 5_000 });
  });

  test('settings sheet opens Bulk Update panel', async ({ page }) => {
    await bootBulkUpdateTab(page);
    await clickSettingsFromToolbar(page);
    await page.locator('.ds-sheet').waitFor({ state: 'visible' });
    await navigateToModule(page, 'bulk-update');
    await expect(page.getByTestId('bulk-update-panel')).toBeVisible();
    await expect(page.getByTestId('bu-enabled-toggle')).toBeVisible();
  });

  test('apply button disabled with no cell selection', async ({ page }) => {
    await bootBulkUpdateTab(page);
    await expect(page.getByTestId('bulk-update-count')).toContainText('0 selected');
    await expect(page.getByTestId('bulk-update-apply')).toBeDisabled();
  });

  test('multi-column selection disables bulk apply', async ({ page }) => {
    await bootBulkUpdateTab(page);

    const grid = page.locator(`[data-grid-id="${GRID_ID}"]`);
    const currencyCell = grid.locator('.ag-row[row-index="0"] .ag-cell[col-id="currency"]');
    const qtyCell = grid.locator('.ag-row[row-index="0"] .ag-cell[col-id="quantityFace"]');
    await currencyCell.click();
    await qtyCell.click({ modifiers: ['ControlOrMeta'] });

    await expect(page.getByTestId('bulk-update-apply')).toBeDisabled();
  });

  test('distinct-value dropdown appears when column selected', async ({ page }) => {
    await bootBulkUpdateTab(page);

    await cellAt(page, GRID_ID, 0, 'currency').click();
    await expect(page.getByTestId('bulk-update-value-input')).toBeVisible();
    const select = page.getByTestId('bulk-update-value-select');
    await expect(select).toBeVisible();
    await select.click();
    expect(await page.getByRole('option').count()).toBeGreaterThan(0);
  });

  test('bulk set maturity date via text input', async ({ page }) => {
    await bootBulkUpdateTab(page);

    const cell = cellAt(page, GRID_ID, 0, 'maturityDate');
    await cell.click();
    await page.getByTestId('bulk-update-value-input').fill('2030-12-31');
    await page.getByTestId('bulk-update-apply').click();

    await expect(cell).toHaveText('2030-12-31', { timeout: 5_000 });
  });
});
