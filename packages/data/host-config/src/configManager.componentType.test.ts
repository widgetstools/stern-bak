/**
 * `getConfigsByComponentTypesUnfiltered` — exercises the real
 * `[componentType+componentSubType]` compound-index range query (not a mock),
 * so the `between([type, minKey], [type, maxKey])` bounds are verified to
 * capture every subType (including '') and nothing of other componentTypes.
 *
 * This is the read that lets the data-provider / AppData stores fetch only
 * their rows instead of materialising the whole appConfig table.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createConfigManager, type ConfigManager } from './ConfigManager';
import type { AppConfigRow } from './types';

const DB_NAME = 'marketsui-config';

async function wipeDatabase(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

function makeRow(over: Partial<AppConfigRow>): AppConfigRow {
  return {
    configId: over.configId ?? 'cfg',
    appId: over.appId ?? 'A',
    userId: over.userId ?? 'alice',
    isPublic: over.isPublic ?? true,
    displayText: over.displayText ?? 'row',
    componentType: over.componentType ?? 'GRID',
    componentSubType: over.componentSubType ?? 'CREDIT',
    isTemplate: over.isTemplate ?? false,
    payload: over.payload ?? {},
    createdBy: over.createdBy ?? 'alice',
    updatedBy: over.updatedBy ?? 'alice',
    creationTime: over.creationTime ?? '2026-05-01T00:00:00.000Z',
    updatedTime: over.updatedTime ?? '2026-05-01T00:00:00.000Z',
    ...over,
  };
}

describe('ConfigManager.getConfigsByComponentTypesUnfiltered', () => {
  let cm: ConfigManager;

  beforeEach(async () => {
    await wipeDatabase();
    cm = createConfigManager({ appId: 'A', identity: { userId: 'alice', displayName: 'Alice' } });
    // A realistic mix: many grid profiles (the bulk) + a few providers/appdata.
    await cm.saveConfig(makeRow({ configId: 'grid-1', componentType: 'MarketsGrid', componentSubType: 'blotter' }));
    await cm.saveConfig(makeRow({ configId: 'grid-2', componentType: 'MarketsGrid', componentSubType: '' }));
    await cm.saveConfig(makeRow({ configId: 'dp-stomp', componentType: 'data-provider', componentSubType: 'stomp' }));
    await cm.saveConfig(makeRow({ configId: 'dp-rest', componentType: 'data-provider', componentSubType: 'rest' }));
    await cm.saveConfig(makeRow({ configId: 'dp-appdata', componentType: 'data-provider', componentSubType: 'appdata' }));
    await cm.saveConfig(makeRow({ configId: 'ad-legacy', componentType: 'appdata', componentSubType: 'appdata' }));
  });

  afterEach(async () => {
    cm.dispose();
    await wipeDatabase();
  });

  it('returns every row of a single componentType, across all subTypes (including empty)', async () => {
    const rows = await cm.getConfigsByComponentTypesUnfiltered(['MarketsGrid']);
    expect(rows.map((r) => r.configId).sort()).toEqual(['grid-1', 'grid-2']);
  });

  it('returns rows for several componentTypes, excluding everything else', async () => {
    const rows = await cm.getConfigsByComponentTypesUnfiltered(['data-provider', 'appdata']);
    expect(rows.map((r) => r.configId).sort()).toEqual([
      'ad-legacy',
      'dp-appdata',
      'dp-rest',
      'dp-stomp',
    ]);
    // The bulk (grid profiles) is NOT materialised.
    expect(rows.some((r) => r.componentType === 'MarketsGrid')).toBe(false);
  });

  it('returns [] for an empty type list and for an unknown type', async () => {
    expect(await cm.getConfigsByComponentTypesUnfiltered([])).toEqual([]);
    expect(await cm.getConfigsByComponentTypesUnfiltered(['nope'])).toEqual([]);
  });

  it('matches the equivalent filter over getAllConfigsUnfiltered', async () => {
    const types = ['data-provider', 'appdata'];
    const viaIndex = (await cm.getConfigsByComponentTypesUnfiltered(types))
      .map((r) => r.configId)
      .sort();
    const viaScan = (await cm.getAllConfigsUnfiltered())
      .filter((r) => types.includes(r.componentType))
      .map((r) => r.configId)
      .sort();
    expect(viaIndex).toEqual(viaScan);
  });
});
