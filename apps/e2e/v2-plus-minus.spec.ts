import { test, expect, type Page } from '@playwright/test';
import { clickSettingsFromToolbar, navigateToModule } from './helpers/settingsSheet';
import { openEditingToolbar } from './helpers/editingToolbar';
import { loadLabProfile } from './helpers/labEditing';

/**
 * Plus / Minus e2e — markets-grid-lab Plus / Minus tab (:5300).
 */

const LAB_URL = 'http://localhost:5300/';
const GRID_ID = 'lab-plus-minus';
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

async function waitForPlusMinusReady(
  page: Page,
  opts: { minNudges?: number; incrementStep?: number } = {},
): Promise<void> {
  const { minNudges = 1, incrementStep } = opts;
  await page.waitForFunction(
    ({ min, step }) => {
      const handle = (window as unknown as {
        __labGrid?: {
          platform: {
            store: {
              getModuleState: (id: string) => {
                nudges?: Array<{ incrementStep?: number }>;
                settings?: { enabled?: boolean };
              };
            };
          };
        };
      }).__labGrid;
      if (!handle) return false;
      try {
        const st = handle.platform.store.getModuleState('editing')?.plusMinus;
        if (st?.settings?.enabled !== true) return false;
        if ((st?.nudges?.length ?? 0) < min) return false;
        if (step != null && !st.nudges?.some((n) => n.incrementStep === step)) return false;
        return true;
      } catch {
        return false;
      }
    },
    { min: minNudges, step: incrementStep },
    { timeout: 20_000 },
  );
}

async function switchLabProfile(page: Page, profileId: string): Promise<void> {
  await loadLabProfile(page, profileId, GRID_ID);
}

async function bootPlusMinusTab(page: Page, profileId?: string): Promise<void> {
  await page.goto(LAB_URL);
  await page.waitForLoadState('domcontentloaded');
  await clearLabStorage(page);
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('[data-testid^="lab-tab-"]', { timeout: 15_000 });
  await page.locator('[data-testid="lab-tab-plus-minus"]').click();
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
  await waitForPlusMinusReady(page);

  if (profileId) {
    await switchLabProfile(page, profileId);
    await waitForPlusMinusReady(page, {
      incrementStep: profileId === 'pm-02-expression-gate' ? 500 : profileId === 'pm-01-column-rules' ? 0.01 : 1000,
    });
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

test.describe('Plus / Minus lab tab', () => {
  test('plus key nudges quantityFace by 1000 and undo restores', async ({ page }) => {
    await bootPlusMinusTab(page);

    const grid = page.locator(`[data-grid-id="${GRID_ID}"]`);
    const cell = grid.locator('.ag-row[row-index="0"] .ag-cell[col-id="quantityFace"]');
    const before = await focusCell(page, 0, 'quantityFace');

    await page.keyboard.press('=');
    await expect
      .poll(async () => parseDisplayNumber(await cell.innerText()), { timeout: 5000 })
      .toBe(before + 1000);

    await expect(page.getByTestId('edit-history-undo')).toBeEnabled({ timeout: 5000 });
    await page.getByTestId('edit-history-undo').click();
    await expect
      .poll(async () => parseDisplayNumber(await cell.innerText()), { timeout: 5000 })
      .toBe(before);
  });

  test('expression-gated nudge applies only for Long side rows', async ({ page }) => {
    await bootPlusMinusTab(page, 'pm-02-expression-gate');

    await page.evaluate(() => {
      const handle = (window as unknown as { __labGrid?: { gridApi: import('ag-grid-community').GridApi } }).__labGrid;
      const api = handle?.gridApi;
      const row = api?.getDisplayedRowAtIndex(1);
      if (!api || !row?.data) throw new Error('no row');
      api.applyTransactionAsync({ update: [{ ...row.data, side: 'Short' }] });
    });
    await page.waitForTimeout(200);

    const grid = page.locator(`[data-grid-id="${GRID_ID}"]`);
    const longCell = grid.locator('.ag-row[row-index="0"] .ag-cell[col-id="quantityFace"]');
    const shortCell = grid.locator('.ag-row[row-index="1"] .ag-cell[col-id="quantityFace"]');

    const longBefore = await focusCell(page, 0, 'quantityFace');
    await page.keyboard.press('=');
    await expect
      .poll(async () => parseDisplayNumber(await longCell.innerText()), { timeout: 5000 })
      .toBe(longBefore + 500);

    const shortBefore = await focusCell(page, 1, 'quantityFace');
    await page.keyboard.press('=');
    await page.waitForTimeout(400);
    expect(parseDisplayNumber(await shortCell.innerText())).toBe(shortBefore);
  });

  test('settings sheet opens Plus / Minus panel', async ({ page }) => {
    await bootPlusMinusTab(page);
    await clickSettingsFromToolbar(page);
    await page.locator('.ds-sheet').waitFor({ state: 'visible' });
    await navigateToModule(page, 'plus-minus');
    await expect(page.getByTestId('plus-minus-panel').first()).toBeVisible();
    await expect(page.getByTestId('pm-enabled-toggle')).toBeVisible();
  });

  test('minus key nudges quantityFace down by 1000', async ({ page }) => {
    await bootPlusMinusTab(page);

    const grid = page.locator(`[data-grid-id="${GRID_ID}"]`);
    const cell = grid.locator('.ag-row[row-index="0"] .ag-cell[col-id="quantityFace"]');
    const before = await focusCell(page, 0, 'quantityFace');

    await page.keyboard.press('-');
    await expect
      .poll(async () => parseDisplayNumber(await cell.innerText()), { timeout: 5000 })
      .toBe(before - 1000);
  });

  test('midPrice column nudges by 0.01 on plus key', async ({ page }) => {
    await bootPlusMinusTab(page, 'pm-01-column-rules');

    const grid = page.locator(`[data-grid-id="${GRID_ID}"]`);
    const cell = grid.locator('.ag-row[row-index="0"] .ag-cell[col-id="midPrice"]');
    await focusCell(page, 0, 'midPrice');
    const before = parseDisplayNumber(await cell.innerText());

    await page.keyboard.press('=');
    await expect
      .poll(async () => parseDisplayNumber(await cell.innerText()), { timeout: 5000 })
      .toBeCloseTo(before + 0.01, 4);
  });
});
