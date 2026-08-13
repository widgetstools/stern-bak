import { test, expect, type Page } from '@playwright/test';
import { clickSettingsFromToolbar, navigateToModule } from './helpers/settingsSheet';
import { openEditingToolbar } from './helpers/editingToolbar';
import { clearLabStorage, loadLabProfile } from './helpers/labEditing';

/**
 * Smart Edit e2e — markets-grid-lab Smart Edit tab (:5300).
 */

const LAB_URL = 'http://localhost:5300/';
const GRID_ID = 'lab-editing';
const SEED_FLAG_KEY = `lab-demo-profiles-v2:${GRID_ID}`;

async function bootSmartEditTab(page: Page, profileId?: string): Promise<void> {
  await page.goto(LAB_URL);
  await page.waitForLoadState('domcontentloaded');
  await clearLabStorage(page, GRID_ID);
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('[data-testid^="lab-tab-"]', { timeout: 15_000 });
  await page.locator('[data-testid="lab-tab-editing"]').click();
  await page.waitForSelector(`[data-grid-id="${GRID_ID}"]`, { timeout: 15_000 });
  await page.waitForFunction(
    (key) => localStorage.getItem(key) === '1',
    SEED_FLAG_KEY,
    { timeout: 20_000 },
  );
  if (profileId) {
    await page.waitForFunction(() => Boolean((window as unknown as { __labGrid?: unknown }).__labGrid));
    await loadLabProfile(page, profileId, GRID_ID);
  }
  await openEditingToolbar(page);
  await page.waitForSelector(`[data-grid-id="${GRID_ID}"] .ag-grid-viewport .ag-row`, {
    timeout: 15_000,
  });
}

async function openSmartEditPanel(page: Page): Promise<void> {
  await clickSettingsFromToolbar(page);
  await page.locator('.ds-sheet').waitFor({ state: 'visible' });
  await navigateToModule(page, 'smart-edit');
  await page.locator('[data-testid="smart-edit-panel"]').waitFor({ state: 'visible' });
}

test.describe('Smart Edit lab tab', () => {
  test('toolbar renders with operand input and op buttons', async ({ page }) => {
    await bootSmartEditTab(page);
    await expect(page.getByTestId('smart-edit-toolbar')).toBeVisible();
    await expect(page.getByTestId('smart-edit-operand')).toBeVisible();
    await expect(page.getByTestId('smart-edit-op-multiply')).toBeVisible();
    await expect(page.getByTestId('smart-edit-op-set')).toBeVisible();
  });

  test('settings sheet opens Smart Edit panel', async ({ page }) => {
    await bootSmartEditTab(page);
    await openSmartEditPanel(page);
    await expect(page.getByTestId('se-enabled-toggle')).toBeVisible();
    await expect(page.getByTestId('se-magnitude-toggle')).toBeVisible();
  });

  test('multiply op updates a cell after range selection', async ({ page }) => {
    await bootSmartEditTab(page);

    const grid = page.locator(`[data-grid-id="${GRID_ID}"]`);
    const firstCell = grid.locator('.ag-row[row-index="0"] .ag-cell[col-id="quantityFace"]');
    const secondCell = grid.locator('.ag-row[row-index="1"] .ag-cell[col-id="quantityFace"]');
    await firstCell.waitFor({ state: 'visible' });

    const before = (await firstCell.innerText()).trim();
    await firstCell.click();
    await page.keyboard.down('Shift');
    await secondCell.click();
    await page.keyboard.up('Shift');

    await page.getByTestId('smart-edit-operand').fill('2');
    await page.getByTestId('smart-edit-op-multiply').click();

    await expect
      .poll(async () => (await firstCell.innerText()).trim(), { timeout: 5000 })
      .not.toBe(before);
  });

  test('preview dialog appears before apply when preview is enabled', async ({ page }) => {
    await bootSmartEditTab(page);
    await openSmartEditPanel(page);
    await page.getByTestId('se-preview-toggle').click();
    await page.getByRole('button', { name: 'Save' }).click();
    await page.keyboard.press('Escape');

    const grid = page.locator(`[data-grid-id="${GRID_ID}"]`);
    const cell = grid.locator('.ag-row[row-index="0"] .ag-cell[col-id="quantityFace"]');
    await cell.waitFor({ state: 'visible' });

    const before = (await cell.innerText()).trim();
    await cell.click();
    await page.getByTestId('smart-edit-operand').fill('2');
    await page.getByTestId('smart-edit-op-multiply').click();

    await expect(page.getByTestId('smart-edit-preview-table')).toBeVisible({ timeout: 5_000 });
    await page.getByTestId('smart-edit-preview-apply').click();

    await expect(cell).not.toHaveText(before, { timeout: 5_000 });
  });

  test('multi-column selection disables smart edit op buttons', async ({ page }) => {
    await bootSmartEditTab(page);

    const grid = page.locator(`[data-grid-id="${GRID_ID}"]`);
    const qtyCell = grid.locator('.ag-row[row-index="0"] .ag-cell[col-id="quantityFace"]');
    const midCell = grid.locator('.ag-row[row-index="0"] .ag-cell[col-id="midPrice"]');
    await qtyCell.waitFor({ state: 'visible' });

    await qtyCell.click();
    await midCell.click({ modifiers: ['ControlOrMeta'] });

    await expect(page.getByTestId('smart-edit-op-multiply')).toBeDisabled();
  });

  test('add op increases selected cell value', async ({ page }) => {
    await bootSmartEditTab(page);

    const grid = page.locator(`[data-grid-id="${GRID_ID}"]`);
    const cell = grid.locator('.ag-row[row-index="0"] .ag-cell[col-id="quantityFace"]');
    await cell.waitFor({ state: 'visible' });

    const before = Number((await cell.innerText()).replace(/,/g, ''));
    await cell.click();
    await page.getByTestId('smart-edit-operand').fill('500');
    await page.getByTestId('smart-edit-op-add').click();

    await expect
      .poll(async () => Number((await cell.innerText()).replace(/,/g, '')), { timeout: 5_000 })
      .toBe(before + 500);
  });

  test('subtract op decreases selected cell value', async ({ page }) => {
    await bootSmartEditTab(page);

    const grid = page.locator(`[data-grid-id="${GRID_ID}"]`);
    const cell = grid.locator('.ag-row[row-index="0"] .ag-cell[col-id="quantityFace"]');
    await cell.waitFor({ state: 'visible' });

    const before = Number((await cell.innerText()).replace(/,/g, ''));
    await cell.click();
    await page.getByTestId('smart-edit-operand').fill('100');
    await page.getByTestId('smart-edit-op-subtract').click();

    await expect
      .poll(async () => Number((await cell.innerText()).replace(/,/g, '')), { timeout: 5_000 })
      .toBe(before - 100);
  });

  test('set dialog replaces cell with absolute value', async ({ page }) => {
    await bootSmartEditTab(page);

    const grid = page.locator(`[data-grid-id="${GRID_ID}"]`);
    const cell = grid.locator('.ag-row[row-index="0"] .ag-cell[col-id="quantityFace"]');
    await cell.click();

    await page.getByTestId('smart-edit-op-set').click();
    await page.getByTestId('smart-edit-set-input').fill('99999');
    await page.getByTestId('smart-edit-set-apply').click();

    await expect
      .poll(async () => Number((await cell.innerText()).replace(/,/g, '')), { timeout: 5_000 })
      .toBe(99999);
  });

  test('preview cancel leaves cell unchanged', async ({ page }) => {
    await bootSmartEditTab(page);
    await openSmartEditPanel(page);
    await page.getByTestId('se-preview-toggle').click();
    await page.getByRole('button', { name: 'Save' }).click();
    await page.keyboard.press('Escape');

    const grid = page.locator(`[data-grid-id="${GRID_ID}"]`);
    const cell = grid.locator('.ag-row[row-index="0"] .ag-cell[col-id="quantityFace"]');
    const before = (await cell.innerText()).trim();

    await cell.click();
    await page.getByTestId('smart-edit-operand').fill('2');
    await page.getByTestId('smart-edit-op-multiply').click();
    await expect(page.getByTestId('smart-edit-preview-table')).toBeVisible({ timeout: 5_000 });

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(cell).toHaveText(before);
  });
});
