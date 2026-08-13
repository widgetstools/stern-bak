import { test, expect, type Page } from '@playwright/test';
import { clickSettingsFromToolbar, navigateToModule } from './helpers/settingsSheet';
import { openEditingToolbar } from './helpers/editingToolbar';
import { loadLabProfile } from './helpers/labEditing';

/**
 * Shortcuts e2e — markets-grid-lab Shortcuts tab (:5300).
 */

const LAB_URL = 'http://localhost:5300/';
const GRID_ID = 'lab-shortcuts';
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

async function waitForShortcutsReady(
  page: Page,
  opts: { enabled?: boolean; minShortcuts?: number } = {},
): Promise<void> {
  const { enabled = true, minShortcuts = 1 } = opts;
  await page.waitForFunction(
    ({ wantEnabled, min }) => {
      const handle = (window as unknown as {
        __labGrid?: {
          platform: {
            store: {
              getModuleState: (id: string) => {
                shortcuts?: unknown[];
                settings?: { enabled?: boolean };
              };
            };
          };
        };
      }).__labGrid;
      if (!handle) return false;
      try {
        const st = handle.platform.store.getModuleState('shortcuts');
        if (st?.settings?.enabled !== wantEnabled) return false;
        return (st?.shortcuts?.length ?? 0) >= min;
      } catch {
        return false;
      }
    },
    { wantEnabled: enabled, min: minShortcuts },
    { timeout: 20_000 },
  );
}

async function bootShortcutsTab(page: Page, profileId?: string): Promise<void> {
  await page.goto(LAB_URL);
  await page.waitForLoadState('domcontentloaded');
  await clearLabStorage(page);
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('[data-testid^="lab-tab-"]', { timeout: 15_000 });
  await page.locator('[data-testid="lab-tab-shortcuts"]').click();
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
  await waitForShortcutsReady(page);

  if (profileId) {
    await loadLabProfile(page, profileId, GRID_ID);
    const enabled = profileId !== 'sc-02-suspended';
    await waitForShortcutsReady(page, { enabled, minShortcuts: enabled ? 1 : 0 });
  }
}

async function focusCell(page: Page, rowIndex: number, colId: string): Promise<number> {
  return page.evaluate(
    ({ rowIndex, colId }) => {
      const handle = (window as unknown as { __labGrid?: { gridApi: import('ag-grid-community').GridApi } }).__labGrid;
      const api = handle?.gridApi;
      if (!api) throw new Error('grid api missing');
      api.stopEditing(true);
      api.setFocusedCell(rowIndex, colId);
      const row = api.getDisplayedRowAtIndex(rowIndex);
      const value = row?.data?.[colId as keyof typeof row.data];
      const n = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(n)) throw new Error(`non-numeric cell ${String(rowIndex)}:${colId}`);
      return n;
    },
    { rowIndex, colId },
  );
}

function parseDisplayNumber(text: string): number {
  const cleaned = text.replace(/,/g, '').trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

test.describe('Shortcuts lab tab', () => {
  test('H key multiplies quantityFace by 100 and undo restores', async ({ page }) => {
    await bootShortcutsTab(page);

    const grid = page.locator(`[data-grid-id="${GRID_ID}"]`);
    const cell = grid.locator('.ag-row[row-index="0"] .ag-cell[col-id="quantityFace"]');
    const before = await focusCell(page, 0, 'quantityFace');

    await page.keyboard.press('H');
    await expect
      .poll(async () => parseDisplayNumber(await cell.innerText()), { timeout: 5000 })
      .toBe(before * 100);

    await expect(page.getByTestId('edit-history-undo')).toBeEnabled({ timeout: 5000 });
    await page.getByTestId('edit-history-undo').click();
    await expect
      .poll(async () => parseDisplayNumber(await cell.innerText()), { timeout: 5000 })
      .toBe(before);
  });

  test('disabled module ignores letter keys', async ({ page }) => {
    await bootShortcutsTab(page, 'sc-02-suspended');

    const before = await focusCell(page, 0, 'quantityFace');

    await page.keyboard.press('H');
    await page.keyboard.press('Escape');

    const after = await page.evaluate(() => {
      const handle = (window as unknown as { __labGrid?: { gridApi: import('ag-grid-community').GridApi } }).__labGrid;
      const row = handle?.gridApi?.getDisplayedRowAtIndex(0);
      const value = row?.data?.quantityFace;
      return typeof value === 'number' ? value : Number(value);
    });
    expect(after).toBe(before);
  });

  test('settings sheet opens Shortcuts panel', async ({ page }) => {
    await bootShortcutsTab(page);
    await clickSettingsFromToolbar(page);
    await page.locator('.ds-sheet').waitFor({ state: 'visible' });
    await navigateToModule(page, 'shortcuts');
    await expect(page.getByTestId('shortcuts-panel').first()).toBeVisible();
    await expect(page.getByTestId('sc-enabled-toggle')).toBeVisible();
  });

  test('profile sc-00: M key adds 1000 to quantityFace', async ({ page }) => {
    await bootShortcutsTab(page, 'sc-00-curriculum');

    const grid = page.locator(`[data-grid-id="${GRID_ID}"]`);
    const cell = grid.locator('.ag-row[row-index="0"] .ag-cell[col-id="quantityFace"]');
    const before = await focusCell(page, 0, 'quantityFace');

    await page.keyboard.press('m');
    await expect
      .poll(async () => parseDisplayNumber(await cell.innerText()), { timeout: 5000 })
      .toBe(before + 1000);
  });

  test('profile sc-00: L key subtracts 500 from quantityFace', async ({ page }) => {
    await bootShortcutsTab(page, 'sc-00-curriculum');

    const grid = page.locator(`[data-grid-id="${GRID_ID}"]`);
    const cell = grid.locator('.ag-row[row-index="0"] .ag-cell[col-id="quantityFace"]');
    const before = await focusCell(page, 0, 'quantityFace');

    await page.keyboard.press('l');
    await expect
      .poll(async () => parseDisplayNumber(await cell.innerText()), { timeout: 5000 })
      .toBe(before - 500);
  });
});
