import { test, expect } from '@playwright/test';
import { openViewMenu } from './helpers/viewMenu';
import { openEditingToolbar } from './helpers/editingToolbar';
import {
  bootLabTab,
  cellAt,
  focusCellValue,
  openEditingModulePanel,
  parseDisplayNumber,
  saveModuleSettings,
  selectColumnRange,
  setBulkUpdateValue,
} from './helpers/labEditing';

/**
 * Cross-module editing-family e2e — unified Editing tab (default curriculum profile).
 */

const GRID_ID = 'lab-editing';

test.describe('Editing family — unified tab integration', () => {
  test('keyboard menu lists plus/minus nudges and letter shortcuts', async ({ page }) => {
    await bootLabTab(page, { tabTestId: 'editing', gridId: GRID_ID });

    await page.getByTestId('editing-toolbar-keyboard-menu').click();
    const menu = page.getByRole('menu');
    await expect(menu.getByText('H ×100 qty')).toBeVisible();
    await expect(menu.getByText('Qty ±100')).toBeVisible();
    await expect(menu.getByText('M +1000 qty')).toBeVisible();
  });

  test('editing toolbar toggle opens and closes the pinned row', async ({ page }) => {
    await bootLabTab(page, { tabTestId: 'editing', gridId: GRID_ID, openToolbar: false });

    await expect(page.getByTestId('toolbar-view-menu-trigger')).toBeVisible();
    await expect(page.getByTestId('editing-toolbar-pinned')).not.toBeVisible();

    await openEditingToolbar(page);
    await expect(page.getByTestId('editing-toolbar-pinned')).toBeVisible();

    // Toggle off again via the View menu.
    await openViewMenu(page);
    await page.getByTestId('editing-toolbar-toggle').click();
    await expect(page.getByTestId('editing-toolbar-pinned')).not.toBeVisible();
  });

  test('bulk update sets currency on unified tab', async ({ page }) => {
    await bootLabTab(page, { tabTestId: 'editing', gridId: GRID_ID });

    const cell0 = cellAt(page, GRID_ID, 0, 'currency');
    const before = (await cell0.innerText()).trim();
    const target = before === 'EUR' ? 'USD' : 'EUR';
    await selectColumnRange(page, GRID_ID, 'currency', 0, 1);
    await expect(page.getByTestId('bulk-update-count')).toContainText('2 selected');

    const applied = await setBulkUpdateValue(page, target);
    await page.getByTestId('bulk-update-apply').click();

    await expect(cell0).toHaveText(applied, { timeout: 5_000 });
    await expect(cellAt(page, GRID_ID, 1, 'currency')).toHaveText(applied, { timeout: 5_000 });
  });

  test('letter shortcut m adds 1000 to quantityFace with undo', async ({ page }) => {
    await bootLabTab(page, { tabTestId: 'editing', gridId: GRID_ID });

    const cell = cellAt(page, GRID_ID, 0, 'quantityFace');
    const before = await focusCellValue(page, 0, 'quantityFace');

    await page.keyboard.press('m');
    await expect
      .poll(async () => parseDisplayNumber(await cell.innerText()), { timeout: 5_000 })
      .toBe(before + 1000);

    await page.getByTestId('edit-history-undo').click();
    await expect
      .poll(async () => parseDisplayNumber(await cell.innerText()), { timeout: 5_000 })
      .toBe(before);
  });

  test('plus/minus nudges qty by 100 on default curriculum', async ({ page }) => {
    await bootLabTab(page, { tabTestId: 'editing', gridId: GRID_ID });

    const cell = cellAt(page, GRID_ID, 0, 'quantityFace');
    const before = await focusCellValue(page, 0, 'quantityFace');

    await page.keyboard.press('=');
    await expect
      .poll(async () => parseDisplayNumber(await cell.innerText()), { timeout: 5_000 })
      .toBe(before + 100);
  });

  test('monitor panel lists smart-edit entry after apply', async ({ page }) => {
    await bootLabTab(page, { tabTestId: 'editing', gridId: GRID_ID });

    const cell = cellAt(page, GRID_ID, 0, 'quantityFace');
    await cell.click();
    await page.getByTestId('smart-edit-operand').fill('2');
    await page.getByTestId('smart-edit-op-multiply').click();
    await expect(page.getByTestId('edit-history-undo')).toBeEnabled({ timeout: 5_000 });

    await openEditingModulePanel(page, 'data-change-history');
    await expect(page.getByTestId('dch-monitor-section')).toBeVisible();
    await expect(page.locator('[data-testid^="dch-entry-"]').first()).toBeVisible({ timeout: 5_000 });
  });

  test('enabling preview via settings shows preview dialog on multiply', async ({ page }) => {
    await bootLabTab(page, { tabTestId: 'editing', gridId: GRID_ID, openToolbar: false });
    await openEditingToolbar(page);

    await openEditingModulePanel(page, 'smart-edit');
    await page.getByTestId('se-preview-toggle').click();
    await saveModuleSettings(page);
    await page.keyboard.press('Escape');

    const cell = cellAt(page, GRID_ID, 0, 'quantityFace');
    await cell.click();
    await page.getByTestId('smart-edit-operand').fill('2');
    await page.getByTestId('smart-edit-op-multiply').click();

    await expect(page.getByTestId('smart-edit-preview-table')).toBeVisible({ timeout: 5_000 });
  });
});
