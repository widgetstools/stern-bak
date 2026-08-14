import { expect, type Page } from '@playwright/test';
import { clickSettingsFromToolbar, navigateToModule } from './settingsSheet';
import { openEditingToolbar } from './editingToolbar';

export const LAB_URL = 'http://localhost:5300/';

/** Display names from lab profile catalogs — used for UI profile switching in e2e. */
export const LAB_PROFILE_DISPLAY_NAMES: Record<string, string> = {
  'ed-01-smart-edit-only': '01 · Smart Edit only',
  'ed-02-bulk-update-text': '02 · Bulk text',
  'ed-04-plus-minus-nudges': '04 · Plus/Minus nudges',
  'ed-05-shortcuts': '05 · Letter shortcuts',
  'ed-06-history-suspend': '06 · History suspended',
  'ed-07-preview-validation': '07 · Preview before apply',
  'ed-09-confirm-thresholds': '09 · Low confirm threshold',
  'ed-10-shortcuts-off-magnitude-on': '10 · K/M/B only',
  'ed-11-all-disabled': '11 · All modules off',
  'bu-01-text-column': '01 · Text column',
  'bu-02-date-column': '02 · Date column',
  'bu-03-confirm-low': '03 · Confirm threshold',
  'pm-01-column-rules': '01 · Column rules',
  'pm-02-expression-gate': '02 · Expression gate',
  'sc-00-curriculum': '00 · Curriculum',
  'sc-02-suspended': '02 · Module off',
};

export function seedFlagKey(gridId: string): string {
  return `lab-demo-profiles-v2:${gridId}`;
}

export async function clearLabStorage(page: Page, gridId: string): Promise<void> {
  const flagKey = seedFlagKey(gridId);
  await page.evaluate((key) => {
    Object.keys(localStorage)
      .filter(
        (k) =>
          k.startsWith('markets-grid-bundle:lab-') ||
          k.startsWith('gc-active-profile:lab-') ||
          k.startsWith('lab-seeded:') ||
          k.startsWith('lab-demo-profiles-'),
      )
      .forEach((k) => localStorage.removeItem(k));
    localStorage.removeItem(key);
  }, flagKey);
}

export interface BootLabTabOptions {
  tabTestId: string;
  gridId: string;
  profileId?: string;
  openToolbar?: boolean;
}

/** Boot a markets-grid-lab feature tab from a clean storage state. */
export async function bootLabTab(page: Page, options: BootLabTabOptions): Promise<void> {
  const { tabTestId, gridId, profileId, openToolbar = true } = options;
  const flagKey = seedFlagKey(gridId);

  await page.goto(LAB_URL);
  await page.waitForLoadState('domcontentloaded');
  await clearLabStorage(page, gridId);
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('[data-testid^="lab-tab-"]', { timeout: 15_000 });
  await page.locator(`[data-testid="lab-tab-${tabTestId}"]`).click();
  await page.waitForSelector(`[data-grid-id="${gridId}"]`, { timeout: 15_000 });
  await page.waitForFunction(
    (key) => localStorage.getItem(key) === '1',
    flagKey,
    { timeout: 20_000 },
  );
  await page.waitForSelector(`[data-grid-id="${gridId}"] .ag-grid-viewport .ag-row`, {
    timeout: 15_000,
  });

  if (profileId) {
    await waitForLabProfilesInstalled(page);
    await loadLabProfile(page, profileId, gridId);
  }

  if (openToolbar) {
    await openEditingToolbar(page);
  }
}

export async function loadLabProfile(
  page: Page,
  profileId: string,
  gridId: string,
): Promise<void> {
  await page.waitForFunction(() => Boolean((window as unknown as { __labGrid?: unknown }).__labGrid));
  await page.evaluate(async (id) => {
    const handle = (window as unknown as {
      __labGrid?: { profiles?: { loadProfile: (profileId: string) => Promise<void> } };
    }).__labGrid;
    if (!handle?.profiles?.loadProfile) throw new Error('profiles.loadProfile unavailable');
    await handle.profiles.loadProfile(id);
  }, profileId);
  await page.waitForFunction(
    ({ id, gridId: gid }) => localStorage.getItem(`gc-active-profile:${gid}`) === id,
    { id: profileId, gridId },
    { timeout: 15_000 },
  );
  // Allow deserialize + transform pipeline to settle after profile switch.
  await page.waitForTimeout(400);
}

export async function waitForLabProfilesInstalled(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const handle = (window as unknown as {
      __labGrid?: { profiles?: { profiles?: { id: string }[] } };
    }).__labGrid;
    const rows = handle?.profiles?.profiles ?? [];
    return rows.some((p) => !p.id.startsWith('__'));
  }, undefined, { timeout: 25_000 });
}

export async function waitForModuleEnabled(
  page: Page,
  moduleId: string,
  enabled: boolean,
): Promise<void> {
  await page.waitForFunction(
    ({ mod, want }) => {
      const handle = (window as { __labGrid?: { platform?: { store?: { getModuleState: (m: string) => Record<string, { settings?: { enabled?: boolean } }> & { settings?: { enabled?: boolean } } } } } }).__labGrid;
      if (!handle?.platform?.store) return false;
      // The four pre-merge editing ids are slices of the merged module.
      const sliceByLegacyId: Record<string, string> = {
        'smart-edit': 'smartEdit',
        'bulk-update': 'bulkUpdate',
        'plus-minus': 'plusMinus',
        shortcuts: 'shortcuts',
      };
      try {
        const slice = sliceByLegacyId[mod];
        const state = slice
          ? handle.platform.store.getModuleState('editing')?.[slice]
          : handle.platform.store.getModuleState(mod);
        return state?.settings?.enabled === want;
      } catch {
        return false;
      }
    },
    { mod: moduleId, want: enabled },
    { timeout: 15_000 },
  );
}

export async function waitForSmartEditSetting(
  page: Page,
  key: 'previewBeforeApply' | 'magnitudeShortcutsEnabled',
  value: boolean,
): Promise<void> {
  await page.waitForFunction(
    ({ settingKey, want }) => {
      const handle = (window as { __labGrid?: { platform?: { store?: { getModuleState: (m: string) => { settings?: Record<string, boolean> } } } } }).__labGrid;
      const settings = handle?.platform?.store?.getModuleState('editing')?.smartEdit?.settings;
      return settings?.[settingKey] === want;
    },
    { settingKey: key, want: value },
    { timeout: 15_000 },
  );
}

export function gridAt(page: Page, gridId: string) {
  return page.locator(`[data-grid-id="${gridId}"]`);
}

export function cellAt(page: Page, gridId: string, rowIndex: number, colId: string) {
  return gridAt(page, gridId).locator(`.ag-row[row-index="${rowIndex}"] .ag-cell[col-id="${colId}"]`);
}

export async function selectColumnRange(
  page: Page,
  gridId: string,
  colId: string,
  startRow: number,
  endRow: number,
): Promise<void> {
  const start = cellAt(page, gridId, startRow, colId);
  const end = cellAt(page, gridId, endRow, colId);
  await start.click();
  await page.keyboard.down('Shift');
  await end.click();
  await page.keyboard.up('Shift');
}

export async function openEditingModulePanel(page: Page, moduleId: string): Promise<void> {
  await clickSettingsFromToolbar(page);
  await page.locator('.ds-sheet').waitFor({ state: 'visible' });
  await navigateToModule(page, moduleId);
}

export async function saveModuleSettings(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Save' }).click();
}

export async function editCellInline(
  page: Page,
  cell: ReturnType<Page['locator']>,
  value: string,
): Promise<void> {
  await cell.dblclick();
  const editor = page
    .locator('.ag-cell-inline-editing input, .ag-cell-inline-editing textarea')
    .first();
  await editor.waitFor({ state: 'visible', timeout: 5_000 });
  await editor.fill(value);
  await page.keyboard.press('Enter');
}

export async function focusCellValue(
  page: Page,
  rowIndex: number,
  colId: string,
): Promise<number> {
  return page.evaluate(
    ({ rowIndex, colId }) => {
      const handle = (window as unknown as {
        __labGrid?: { gridApi: import('ag-grid-community').GridApi };
      }).__labGrid;
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

export function parseDisplayNumber(text: string): number {
  const cleaned = text.replace(/,/g, '').trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

export async function setBulkUpdateValue(
  page: Page,
  value: string,
  options?: { exclude?: string },
): Promise<string> {
  const input = page.getByTestId('bulk-update-value-input');
  if (await input.isVisible()) {
    await input.click();
    await input.fill(value);
    await expect(input).toHaveValue(value);
    return value;
  }
  const select = page.getByTestId('bulk-update-value-select');
  await select.click();
  const preferred = page.locator('[role="option"]').filter({ hasText: value }).first();
  if (await preferred.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await preferred.click();
    return value;
  }
  const optionLocator = page.locator('[role="option"]');
  await expect(optionLocator.first()).toBeVisible({ timeout: 5_000 });
  const count = await optionLocator.count();
  const exclude = options?.exclude?.trim();
  for (let i = 0; i < count; i++) {
    const option = optionLocator.nth(i);
    const applied = (await option.innerText()).trim();
    if (exclude && applied === exclude) {
      continue;
    }
    await option.click();
    return applied;
  }
  const fallback = optionLocator.first();
  const applied = (await fallback.innerText()).trim();
  await fallback.click();
  return applied;
}
