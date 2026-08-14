import { test, expect, type Page } from '@playwright/test';
import { clickSettingsFromToolbar, navigateToModule, openModuleMenu } from './helpers/settingsSheet';
import { openEditingToolbar } from './helpers/editingToolbar';
import { focusCellValue } from './helpers/labEditing';

/**
 * Unified Editing tab e2e — all editing-family toolbars (:5300).
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
          k.startsWith('lab-demo-profiles-'),
      )
      .forEach((k) => localStorage.removeItem(k));
    localStorage.removeItem(flagKey);
  }, SEED_FLAG_KEY);
}

async function bootEditingTab(page: Page): Promise<void> {
  await page.goto(LAB_URL);
  await page.waitForLoadState('domcontentloaded');
  await clearLabStorage(page);
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('[data-testid^="lab-tab-"]', { timeout: 15_000 });
  await page.locator('[data-testid="lab-tab-editing"]').click();
  await page.waitForSelector(`[data-grid-id="${GRID_ID}"]`, { timeout: 15_000 });
  await page.waitForSelector(`[data-grid-id="${GRID_ID}"] .ag-grid-viewport .ag-row`, {
    timeout: 15_000,
  });
  await page.waitForFunction(
    (key) => localStorage.getItem(key) === '1',
    SEED_FLAG_KEY,
    { timeout: 20_000 },
  );
}

test.describe('Editing lab tab (unified)', () => {
  test('shows unified editing toolbar with all segments', async ({ page }) => {
    await bootEditingTab(page);
    await expect(page.getByTestId('toolbar-view-menu-trigger')).toBeVisible();
    await openEditingToolbar(page);
    await expect(page.getByTestId('editing-toolbar-pinned')).toBeVisible();
    await expect(page.getByTestId('smart-edit-toolbar')).toBeVisible();
    await expect(page.getByTestId('bulk-update-toolbar')).toBeVisible();
    await expect(page.getByTestId('edit-history-toolbar')).toBeVisible();
  });

  test('settings sheet lists all editing modules', async ({ page }) => {
    await bootEditingTab(page);
    await clickSettingsFromToolbar(page);
    await page.locator('.ds-sheet').waitFor({ state: 'visible' });
    // Modules live behind grouped menubar menus — open each module's
    // owning menu (resolved via the trigger's data-modules list) and
    // assert the item renders, then dismiss before the next one.
    // Post-merge the Editing menu lists the merged `editing` module and
    // `data-change-history`; the four former modules are section tabs
    // inside the editing panel.
    for (const moduleId of ['editing', 'data-change-history']) {
      await expect(await openModuleMenu(page, moduleId)).toBeVisible();
      await page.keyboard.press('Escape');
    }
    await navigateToModule(page, 'editing');
    for (const sectionId of ['smart-edit', 'bulk-update', 'plus-minus', 'shortcuts']) {
      await expect(page.getByTestId(`editing-section-tab-${sectionId}`)).toBeVisible();
    }
  });

  test('smart edit multiply then shortcut undo via history toolbar', async ({ page }) => {
    await bootEditingTab(page);
    await openEditingToolbar(page);

    const grid = page.locator(`[data-grid-id="${GRID_ID}"]`);
    const qtyCell = grid.locator('.ag-row[row-index="0"] .ag-cell[col-id="quantityFace"]');
    const qtyBefore = Number((await qtyCell.innerText()).replace(/,/g, ''));

    await qtyCell.click();
    await page.getByTestId('smart-edit-operand').fill('2');
    await page.getByTestId('smart-edit-op-multiply').click();
    await expect
      .poll(async () => Number((await qtyCell.innerText()).replace(/,/g, '')), { timeout: 5_000 })
      .toBeCloseTo(qtyBefore * 2, 0);

    await focusCellValue(page, 0, 'quantityFace');
    await page.keyboard.press('m');
    await expect
      .poll(async () => Number((await qtyCell.innerText()).replace(/,/g, '')), { timeout: 5_000 })
      .toBeCloseTo(qtyBefore * 2 + 1000, 0);
    await expect(page.getByTestId('edit-history-undo')).toBeEnabled({ timeout: 5_000 });

    await page.getByTestId('edit-history-undo').click();
    await expect
      .poll(async () => Number((await qtyCell.innerText()).replace(/,/g, '')), { timeout: 5_000 })
      .toBeCloseTo(qtyBefore * 2, 0);
    await expect(page.getByTestId('edit-history-undo')).toBeEnabled({ timeout: 5_000 });

    await page.getByTestId('edit-history-undo').click();
    await expect
      .poll(async () => Number((await qtyCell.innerText()).replace(/,/g, '')), { timeout: 5_000 })
      .toBeCloseTo(qtyBefore, 0);
  });

  test('divide op reduces selected cell value', async ({ page }) => {
    await bootEditingTab(page);
    await openEditingToolbar(page);

    const cell = page.locator(`[data-grid-id="${GRID_ID}"] .ag-row[row-index="0"] .ag-cell[col-id="quantityFace"]`);
    const before = Number((await cell.innerText()).replace(/,/g, ''));

    await cell.click();
    await page.getByTestId('smart-edit-operand').fill('2');
    await page.getByTestId('smart-edit-op-divide').click();

    await expect
      .poll(async () => Number((await cell.innerText()).replace(/,/g, '')), { timeout: 5_000 })
      .toBeCloseTo(before / 2, 0);
  });
});
