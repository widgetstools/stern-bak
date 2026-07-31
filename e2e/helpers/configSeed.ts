import { expect, type Page } from '@playwright/test';

export const DEXIE_DB = 'marketsui-config';

export interface AppConfigRowProbe {
  configId: string;
  appId: string;
  userId: string;
  componentType?: string;
  payload?: {
    profiles?: Array<{ id: string; name: string; state: Record<string, unknown>; gridId: string }>;
    gridLevelData?: unknown;
    version?: number;
  };
}

/** Read every `appConfig` row from Dexie (export-all shape). */
export async function readAppConfigRows(page: Page): Promise<AppConfigRowProbe[]> {
  return page.evaluate(async (dbName) => {
    return new Promise<AppConfigRowProbe[]>((resolve) => {
      const req = indexedDB.open(dbName);
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('appConfig')) {
          resolve([]);
          return;
        }
        const tx = db.transaction('appConfig', 'readonly');
        const rq = tx.objectStore('appConfig').getAll();
        rq.onsuccess = () => resolve((rq.result ?? []) as AppConfigRowProbe[]);
        rq.onerror = () => resolve([]);
      };
      req.onerror = () => resolve([]);
    });
  }, DEXIE_DB);
}

export async function readProfileSetRow(
  page: Page,
  configId: string,
  appId: string,
  userId: string,
): Promise<AppConfigRowProbe | undefined> {
  const rows = await readAppConfigRows(page);
  return rows.find(
    (r) => r.configId === configId && r.appId === appId && r.userId === userId,
  );
}

export async function readGridLevelData(
  page: Page,
  configId: string,
  appId: string,
  userId: string,
): Promise<unknown> {
  const row = await readProfileSetRow(page, configId, appId, userId);
  return row?.payload?.gridLevelData;
}

export async function profileStateHasModule(
  page: Page,
  configId: string,
  appId: string,
  userId: string,
  profileId: string,
  moduleId: string,
): Promise<boolean> {
  const row = await readProfileSetRow(page, configId, appId, userId);
  const profile = row?.payload?.profiles?.find((p) => p.id === profileId);
  if (!profile) return false;
  const envelope = profile.state?.[moduleId] as { data?: unknown } | undefined;
  return envelope?.data !== undefined && Object.keys(envelope.data as object).length > 0;
}

export async function wipeDexie(page: Page): Promise<void> {
  await page.evaluate(async (dbName) => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase(dbName);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
    try {
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith('gc-') || k.startsWith('demo-cs-')) localStorage.removeItem(k);
      }
    } catch { /* ignore */ }
  }, DEXIE_DB);
}

/** Mimics Config Browser export-all: `{ appConfig: [...] }` from Dexie. */
export async function exportBundleFromDexie(page: Page): Promise<{ appConfig: AppConfigRowProbe[] }> {
  const appConfig = await readAppConfigRows(page);
  return { appConfig };
}

/**
 * Bulk-put an export bundle back into Dexie (simulates seed / import).
 * Call only after the page has released any prior DB connection — e.g.
 * `wipeDexie` followed by a navigation that re-runs `ConfigManager.init()`
 * so the `appConfig` object store exists.
 */
export async function injectAppConfigBundle(
  page: Page,
  rows: AppConfigRowProbe[],
): Promise<void> {
  await page.evaluate(async ({ dbName, bundle }) => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(dbName);
      req.onblocked = () => { /* wait for other tabs/connections to close */ };
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('appConfig')) {
          reject(new Error('appConfig store missing — navigate to the app first so ConfigManager creates the schema'));
          return;
        }
        const tx = db.transaction('appConfig', 'readwrite');
        const store = tx.objectStore('appConfig');
        for (const row of bundle) store.put(row);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
    });
  }, { dbName: DEXIE_DB, bundle: rows });
}

/** Wipe Dexie then reload the app so ConfigManager recreates an empty schema. */
export async function wipeAndReloadApp(page: Page, url = '/'): Promise<void> {
  await wipeDexie(page);
  await page.goto(url);
  await page.waitForSelector('[data-grid-id="demo-blotter-v2"]', { timeout: 15_000 });
  await page.waitForSelector('.ag-body-viewport .ag-row', { timeout: 15_000 });
  await page.waitForTimeout(400);
}

/** Re-stamp every row's appId (simulates normalizeSeedData). */
export function restampBundleAppId(
  bundle: AppConfigRowProbe[],
  canonicalAppId: string,
): AppConfigRowProbe[] {
  return bundle.map((row) => {
    if (row.componentType === 'component-registry') {
      return {
        ...row,
        appId: canonicalAppId,
        userId: 'system',
        configId: `component-registry::${canonicalAppId}::system`,
      };
    }
    if (row.appId === canonicalAppId || row.appId === '') return row;
    const configId = row.configId.includes('::')
      ? row.configId.replace(/::[^:]+::/, `::${canonicalAppId}::`)
      : row.configId;
    return { ...row, appId: canonicalAppId, configId };
  });
}

export async function expectGridLevelProviderId(
  page: Page,
  configId: string,
  appId: string,
  userId: string,
  providerId: string,
): Promise<void> {
  const gld = await readGridLevelData(page, configId, appId, userId) as {
    provider?: { liveProviderId?: string };
    liveProviderId?: string;
  } | null;
  expect(gld).toBeTruthy();
  const liveId = gld?.provider?.liveProviderId ?? gld?.liveProviderId;
  expect(liveId).toBe(providerId);
}
