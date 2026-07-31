import { test, expect, type Page } from '@playwright/test';
import { saveAll } from './helpers/profileHelpers';
import { bootCleanDemo } from './helpers/settingsSheet';
import {
  exportBundleFromDexie,
  injectAppConfigBundle,
  readProfileSetRow,
  restampBundleAppId,
  wipeAndReloadApp,
} from './helpers/configSeed';

/**
 * Rigorous persistence + seed/export round-trip coverage for ConfigService
 * storage (demo-react, port 5190). Reproduces the star-demo failure modes:
 *   - explicit profile Save DOES write to Dexie (when instanceId is stable)
 *   - export bundle carries that state verbatim
 *   - re-injecting the bundle restores the grid after wipe
 *   - stale appId on rows blocks restore (scope mismatch) until re-stamped
 *   - saves land on configId=instanceId, not sibling orphan rows
 */

const APP_ID = 'demo-react';
const USER_ID = 'demo-user';
const INSTANCE_ID = 'demo-blotter-v2';
const PROFILE_ID = '__default__';

async function setFilterModel(page: Page, model: Record<string, unknown>): Promise<void> {
  await page.evaluate((m) => {
    const root = document.querySelector('.ag-root-wrapper');
    if (!root) return;
    const fiberKey = Object.keys(root).find((k) => k.startsWith('__reactFiber'));
    if (!fiberKey) return;
    let fiber = (root as any)[fiberKey];
    for (let i = 0; i < 80 && fiber; i++) {
      const candidates: any[] = [];
      if (fiber.stateNode?.api) candidates.push(fiber.stateNode.api);
      if (fiber.memoizedState) {
        let s = fiber.memoizedState;
        while (s) {
          if (s.memoizedState?.api) candidates.push(s.memoizedState.api);
          if (s.memoizedState?.current?.api) candidates.push(s.memoizedState.current.api);
          s = s.next;
        }
      }
      for (const api of candidates) {
        if (api && typeof api.setFilterModel === 'function') {
          api.setFilterModel(m);
          return;
        }
      }
      fiber = fiber.return;
    }
  }, model);
  await page.waitForTimeout(250);
}

async function captureFilterPill(page: Page): Promise<void> {
  await page.locator('.ds-filters-add-btn').click();
  await expect(page.locator('.ds-filter-pill')).toHaveCount(1);
}

test.describe('config seed — profile + export round-trip (demo-react / ConfigService storage)', () => {
  test.describe.configure({ timeout: 60_000 });

  test.beforeEach(async ({ page }) => {
    await bootCleanDemo(page);
  });

  test('explicit Save writes non-empty profile state to the stable instance row', async ({ page }) => {
    await setFilterModel(page, { side: { filterType: 'set', values: ['BUY'] } });
    await captureFilterPill(page);
    await saveAll(page);

    const row = await readProfileSetRow(page, INSTANCE_ID, APP_ID, USER_ID);
    expect(row, 'profile-set row must exist at configId=instanceId').toBeTruthy();

    const defaultProfile = row!.payload?.profiles?.find((p) => p.id === PROFILE_ID);
    expect(defaultProfile, 'Default profile must be in the bundle').toBeTruthy();
    expect(Object.keys(defaultProfile!.state ?? {}).length).toBeGreaterThan(0);

    expect(
      Object.keys(defaultProfile!.state ?? {}).length,
      'profile state should be non-empty after explicit Save',
    ).toBeGreaterThan(0);
  });

  test('export bundle from Dexie carries saved profile state', async ({ page }) => {
    await setFilterModel(page, { side: { filterType: 'set', values: ['SELL'] } });
    await captureFilterPill(page);
    await saveAll(page);

    const bundle = await exportBundleFromDexie(page);
    const row = bundle.appConfig.find((r) => r.configId === INSTANCE_ID);
    expect(row?.appId).toBe(APP_ID);

    const prof = row?.payload?.profiles?.find((p) => p.id === PROFILE_ID);
    expect(prof?.state && Object.keys(prof.state).length).toBeGreaterThan(0);
  });

  test('re-injecting export bundle after wipe restores saved formatting on reload', async ({ page }) => {
    await setFilterModel(page, { side: { filterType: 'set', values: ['BUY'] } });
    await captureFilterPill(page);
    await saveAll(page);

    const bundle = await exportBundleFromDexie(page);
    await wipeAndReloadApp(page);
    await injectAppConfigBundle(page, bundle.appConfig);

    await page.reload();
    await page.waitForSelector(`[data-grid-id="${INSTANCE_ID}"]`, { timeout: 15_000 });
    await page.waitForSelector('.ag-body-viewport .ag-row', { timeout: 15_000 });
    await page.waitForTimeout(600);

    await expect(page.locator('.ds-filter-pill')).toHaveCount(1);
  });

  test('export captures saved profile state even when row appId drifts (Config Browser pass-through)', async ({ page }) => {
    await setFilterModel(page, { side: { filterType: 'set', values: ['BUY'] } });
    await captureFilterPill(page);
    await saveAll(page);

    // Star-demo class: registry says StarDemo but exported rows still say TestApp.
    await page.evaluate(async ({ configId, wrongApp, dbName }) => {
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.open(dbName);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('appConfig', 'readwrite');
          const get = tx.objectStore('appConfig').get(configId);
          get.onsuccess = () => {
            const row = get.result as { appId?: string } | undefined;
            if (row) {
              row.appId = wrongApp;
              tx.objectStore('appConfig').put(row);
            }
          };
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
      });
    }, { configId: INSTANCE_ID, wrongApp: 'WrongApp', dbName: 'marketsui-config' });

    // Export is a raw Dexie read — bytes survive even though the loader would reject them.
    const bundle = await exportBundleFromDexie(page);
    const drifted = bundle.appConfig.find((r) => r.configId === INSTANCE_ID);
    expect(drifted?.appId).toBe('WrongApp');
    const prof = drifted?.payload?.profiles?.find((p) => p.id === PROFILE_ID);
    expect(prof?.state && Object.keys(prof.state).length).toBeGreaterThan(0);
  });

  test('stale appId blocks UI restore; re-stamped seed bundle fixes it', async ({ page }) => {
    await setFilterModel(page, { side: { filterType: 'set', values: ['BUY'] } });
    await captureFilterPill(page);
    await saveAll(page);

    const driftedBundle = await exportBundleFromDexie(page);
    for (const row of driftedBundle.appConfig) {
      if (row.configId === INSTANCE_ID) row.appId = 'WrongApp';
    }

    await injectAppConfigBundle(page, driftedBundle.appConfig);
    await page.reload();
    await page.waitForSelector(`[data-grid-id="${INSTANCE_ID}"]`, { timeout: 15_000 });
    await page.waitForTimeout(600);
    await expect(page.locator('.ds-filter-pill')).toHaveCount(0);

    const fixed = restampBundleAppId(driftedBundle.appConfig, APP_ID);
    await wipeAndReloadApp(page);
    await injectAppConfigBundle(page, fixed);

    await page.reload();
    await page.waitForSelector(`[data-grid-id="${INSTANCE_ID}"]`, { timeout: 15_000 });
    await page.waitForTimeout(600);
    await expect(page.locator('.ds-filter-pill')).toHaveCount(1);
  });

  test('Dexie holds the save on configId=instanceId (not a sibling orphan row)', async ({ page }) => {
    await setFilterModel(page, { side: { filterType: 'set', values: ['BUY'] } });
    await captureFilterPill(page);
    await saveAll(page);

    const rows = (await exportBundleFromDexie(page)).appConfig;
    const profileRows = rows.filter((r) => Array.isArray(r.payload?.profiles));
    expect(profileRows.some((r) => r.configId === INSTANCE_ID)).toBe(true);
    expect(profileRows.some((r) => r.configId !== INSTANCE_ID && Object.keys(
      r.payload?.profiles?.find((p) => p.id === PROFILE_ID)?.state ?? {},
    ).length > 0)).toBe(false);
  });
});
