import { expect, type Page } from '@playwright/test';
import {
  closeSettingsSheet,
  clickSettingsFromToolbar,
  navigateToModule,
  openPanel,
  openSettingsSheet,
} from './settingsSheet';

export async function openProviderCustomSettings(page: Page): Promise<void> {
  await openSettingsSheet(page);
  const section = page.locator('[data-testid="provider-grid-host-section"]');
  if (await section.isVisible().catch(() => false)) {
    return;
  }
  await navigateToModule(page, 'toolbar-date-settings');
  await expect(section).toBeVisible({ timeout: 10_000 });
}

/** @deprecated Use {@link openProviderCustomSettings} — provider toolbar removed. */
export async function revealProviderToolbar(page: Page): Promise<void> {
  await openProviderCustomSettings(page);
}

export const REFERENCE_BLOTTER_URL = 'http://localhost:5174/blotters/marketsgrid';
export const REFERENCE_GRID_ID = 'markets-ui-reference-blotter';
export const REFERENCE_DEXIE_DB = 'marketsui-config';

/** Stable id for the mock positions provider seeded by e2e helpers. */
export const E2E_MOCK_PROVIDER_ID = 'e2e-mock-positions';
export const E2E_MOCK_PROVIDER_NAME = 'E2E Mock Positions';

export async function clearReferenceStorage(page: Page): Promise<void> {
  await page.evaluate(async (dbName) => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase(dbName);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
    Object.keys(localStorage)
      .filter((k) => k.startsWith('gc-active-profile:') || k === 'theme' || k === 'hosted-mg.legacy-cleanup')
      .forEach((k) => localStorage.removeItem(k));
  }, REFERENCE_DEXIE_DB);
}

export async function waitForReferenceBlotter(page: Page): Promise<void> {
  await page.waitForSelector(`[data-grid-id="${REFERENCE_GRID_ID}"]`, { timeout: 20_000 });
  await page.waitForSelector(`[data-grid-id="${REFERENCE_GRID_ID}"] .ag-root-wrapper`, { timeout: 15_000 });
  await page.waitForSelector('[data-testid="profile-selector-trigger"]', { timeout: 15_000 });
}

export async function bootCleanReferenceBlotter(page: Page): Promise<void> {
  await page.goto(REFERENCE_BLOTTER_URL);
  await waitForReferenceBlotter(page);
  await clearReferenceStorage(page);
  await page.goto(REFERENCE_BLOTTER_URL);
  await waitForReferenceBlotter(page);
}

interface SeedMockProviderOptions {
  providerId?: string;
  name?: string;
  updateIntervalMs?: number;
}

/**
 * Inserts a mock positions provider into Dexie. Call after
 * `bootCleanReferenceBlotter`, then reload so ConfigManager + the
 * provider list pick it up.
 */
export async function seedMockPositionsProvider(
  page: Page,
  opts: SeedMockProviderOptions = {},
): Promise<string> {
  const providerId = opts.providerId ?? E2E_MOCK_PROVIDER_ID;
  const name = opts.name ?? E2E_MOCK_PROVIDER_NAME;
  const updateIntervalMs = opts.updateIntervalMs ?? 250;

  await page.evaluate(
    async ({ providerId, name, updateIntervalMs, dbName }) => {
      const now = new Date().toISOString();
      const row = {
        configId: providerId,
        appId: 'TestApp',
        userId: 'dev1',
        componentType: 'data-provider',
        componentSubType: 'mock',
        isTemplate: false,
        displayText: name,
        payload: {
          providerType: 'mock',
          dataType: 'positions',
          keyColumn: 'id',
          updateIntervalMs,
          rowCount: 20,
          enableUpdates: true,
          columnDefinitions: [
            { field: 'cusip', headerName: 'CUSIP', width: 110, filter: true, sortable: true, resizable: true },
            { field: 'midPrice', headerName: 'Mid', width: 90, filter: true, sortable: true, resizable: true },
            { field: 'bidPrice', headerName: 'Bid', width: 90, filter: true, sortable: true, resizable: true },
          ],
          __providerMeta: { tags: [], isDefault: false, public: false },
        },
        createdBy: 'dev1',
        updatedBy: 'dev1',
        creationTime: now,
        updatedTime: now,
      };

      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.open(dbName);
        req.onerror = () => reject(req.error ?? new Error('indexedDB.open failed'));
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('appConfig', 'readwrite');
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error ?? new Error('indexedDB tx failed'));
          tx.objectStore('appConfig').put(row);
        };
      });
    },
    { providerId, name, updateIntervalMs, dbName: REFERENCE_DEXIE_DB },
  );

  return providerId;
}

export function liveProviderCombobox(page: Page) {
  return page.locator('[data-testid="provider-live-select"]');
}

export async function selectLiveProvider(page: Page, providerName: string): Promise<void> {
  await openProviderCustomSettings(page);
  const picker = liveProviderCombobox(page);
  await picker.click();
  const option = page.getByRole('option', { name: new RegExp(providerName) });
  await expect(option).toBeVisible({ timeout: 10_000 });
  await option.click();
}

export async function waitForProviderRows(page: Page): Promise<void> {
  await expect(
    page.locator(`[data-grid-id="${REFERENCE_GRID_ID}"] .ag-center-cols-container .ag-row`),
  ).not.toHaveCount(0, { timeout: 20_000 });
}

/** Stop the active live provider via Custom Settings → Edit → Diagnostics → Stop. */
export async function stopLiveProviderFromDiagnostics(page: Page): Promise<void> {
  await openProviderCustomSettings(page);
  await page.getByTestId('provider-edit-selected').click();
  await expect(page.getByTestId('provider-editor-dialog')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('tab', { name: 'Diagnostics' }).click();
  await page.getByRole('button', { name: 'Stop' }).click();
  await page.keyboard.press('Escape');
}

/** Grid admin action wired by MarketsGridContainer — restarts the provider. */
export async function refreshProviderFromGridAdmin(page: Page): Promise<void> {
  await page.locator('[data-testid="admin-action-reload-from-source"]').click();
}

export async function waitForStaleDataBanner(page: Page): Promise<void> {
  await expect(page.getByTestId('stale-data-banner')).toBeVisible({ timeout: 15_000 });
}

export async function waitForStaleDataBannerHidden(page: Page): Promise<void> {
  await expect(page.getByTestId('stale-data-banner')).toHaveCount(0, { timeout: 20_000 });
}

export async function readMidPriceSnapshot(page: Page): Promise<string> {
  const texts = await page
    .locator(`[data-grid-id="${REFERENCE_GRID_ID}"] [col-id="midPrice"]`)
    .allInnerTexts();
  return texts.join('|');
}

export async function waitForMockPriceTick(page: Page, timeoutMs = 12_000): Promise<void> {
  const baseline = await readMidPriceSnapshot(page);
  await expect
    .poll(async () => readMidPriceSnapshot(page), { timeout: timeoutMs })
    .not.toBe(baseline);
}

async function toggleSwitch(page: Page, testid: string): Promise<void> {
  const control = page.locator(`[data-testid="${testid}"]`);
  await control.scrollIntoViewIfNeeded();
  await control.click();
}

async function saveGridOptionsPanel(page: Page): Promise<void> {
  const btn = page.locator('[data-testid="go-save-btn"]');
  await expect(btn).toBeEnabled();
  await btn.click();
  await expect(btn).toBeDisabled({ timeout: 2000 });
}

/**
 * Opens Grid Options, enables flash-on-change, and commits the panel.
 */
export async function enableCellChangeFlashInGridOptions(page: Page): Promise<void> {
  await openSettingsSheet(page);
  await openPanel(page, 'general-settings');

  const flashSwitch = page.locator('[data-testid="go-enable-cell-change-flash"]');
  await flashSwitch.scrollIntoViewIfNeeded();
  await expect(flashSwitch).not.toBeChecked();
  await toggleSwitch(page, 'go-enable-cell-change-flash');
  await expect(flashSwitch).toBeChecked();

  await saveGridOptionsPanel(page);
  await closeSettingsSheet(page);
}

/**
 * Polls until AG-Grid applies the `ag-cell-data-changed` flash class
 * on at least one body cell — emitted when a live mock tick updates a
 * value and `enableCellChangeFlash` is active on column defs.
 */
export async function waitForFlashingCells(page: Page, timeoutMs = 20_000): Promise<void> {
  await expect
    .poll(
      () =>
        page.locator(
          `[data-grid-id="${REFERENCE_GRID_ID}"] .ag-center-cols-container .ag-cell-data-changed`,
        ).count(),
      { timeout: timeoutMs, intervals: [20, 50, 100, 200] },
    )
    .toBeGreaterThan(0);
}
