/**
 * `ConfigManager.resetToSeed` — hard reset to the seed file.
 *
 * Unlike `seedIfEmpty`, `resetToSeed` runs unconditionally: it wipes every
 * config table and re-applies the seed, overwriting local edits. It must
 * fetch + parse the seed BEFORE wiping, so a fetch/parse failure aborts and
 * leaves the existing database intact (never strands the user empty).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createConfigManager, type ConfigManager } from './ConfigManager';
import type { AppConfigRow, SeedData } from './types';

const DB_NAME = 'marketsui-config';
const SEED_URL = 'http://localhost/seed.json';

async function wipeDatabase(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

function makeConfigRow(over: Partial<AppConfigRow>): AppConfigRow {
  return {
    configId: over.configId ?? 'cfg',
    appId: over.appId ?? 'StarDemo',
    userId: over.userId ?? 'dev1',
    isPublic: over.isPublic ?? true,
    displayText: over.displayText ?? 'row',
    componentType: over.componentType ?? 'GRID',
    componentSubType: over.componentSubType ?? '',
    isTemplate: over.isTemplate ?? false,
    payload: over.payload ?? {},
    createdBy: over.createdBy ?? 'dev1',
    updatedBy: over.updatedBy ?? 'dev1',
    creationTime: over.creationTime ?? '2026-06-01T00:00:00.000Z',
    updatedTime: over.updatedTime ?? '2026-06-01T00:00:00.000Z',
    ...over,
  };
}

function exportBundle(): SeedData {
  return {
    activeAppId: 'StarDemo',
    activeUserId: 'dev1',
    permissions: [{ permissionId: 'config:read', description: 'Read', category: 'config' }],
    roles: [{ roleId: 'admin', displayName: 'Admin', permissionIds: ['config:read'] }],
    appRegistry: [
      {
        appId: 'StarDemo',
        displayName: 'Star Demo',
        manifestUrl: 'http://localhost/manifest.json',
        configServiceEnabled: false,
        environment: 'dev',
      },
    ],
    userProfiles: [{ userId: 'dev1', appId: 'StarDemo', roleIds: ['admin'], displayName: 'Dev' }],
    appConfig: [
      makeConfigRow({
        configId: 'dp-stomp',
        componentType: 'data-provider',
        componentSubType: 'stomp',
        userId: 'system',
        payload: { url: 'wss://feed.example/stomp' },
      }),
      makeConfigRow({ configId: 'grid-1', componentType: 'GRID', userId: 'dev1' }),
    ],
  };
}

function mockFetchOnce(body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200, json: async () => body }) as unknown as Response),
  );
}

describe('ConfigManager.resetToSeed', () => {
  let cm: ConfigManager | undefined;

  beforeEach(async () => {
    await wipeDatabase();
  });

  afterEach(() => {
    cm?.dispose();
    cm = undefined;
    vi.unstubAllGlobals();
  });

  it('wipes local edits and restores every table from the seed', async () => {
    mockFetchOnce(exportBundle());
    cm = createConfigManager({ appId: 'StarDemo', seedConfigUrl: SEED_URL });
    await cm.init();

    // User edits a seeded row and adds a row that is NOT in the seed.
    await cm.saveConfig(
      makeConfigRow({
        configId: 'dp-stomp',
        componentType: 'data-provider',
        componentSubType: 'stomp',
        userId: 'system',
        payload: { url: 'wss://EDITED' },
      }),
    );
    await cm.saveConfig(makeConfigRow({ configId: 'extra-local', componentType: 'GRID' }));
    expect((await cm.getAllConfigsUnfiltered()).map((c) => c.configId).sort()).toEqual([
      'dp-stomp',
      'extra-local',
      'grid-1',
    ]);

    // Reset → exactly the seed's rows; the edit is reverted and the extra is gone.
    mockFetchOnce(exportBundle());
    const result = await cm.resetToSeed();

    expect(result.seedUrl).toBe(SEED_URL);
    expect(result.counts).toEqual({
      appConfig: 2,
      appRegistry: 1,
      userProfiles: 1,
      roles: 1,
      permissions: 1,
    });

    const configs = await cm.getAllConfigsUnfiltered();
    expect(configs.map((c) => c.configId).sort()).toEqual(['dp-stomp', 'grid-1']);
    expect(configs.find((c) => c.configId === 'dp-stomp')?.payload).toEqual({
      url: 'wss://feed.example/stomp',
    });
    expect((await cm.getAllApps()).map((a) => a.appId)).toEqual(['StarDemo']);
  });

  it('throws when no seedConfigUrl is configured and leaves data untouched', async () => {
    cm = createConfigManager({ appId: 'StarDemo' });
    await cm.init();
    await cm.saveConfig(makeConfigRow({ configId: 'local-1' }));

    await expect(cm.resetToSeed()).rejects.toThrow(/no seedConfigUrl/i);
    expect((await cm.getAllConfigsUnfiltered()).map((c) => c.configId)).toEqual(['local-1']);
  });

  it('aborts on a failed seed fetch without clearing existing rows', async () => {
    mockFetchOnce(exportBundle());
    cm = createConfigManager({ appId: 'StarDemo', seedConfigUrl: SEED_URL });
    await cm.init();
    const before = (await cm.getAllConfigsUnfiltered()).map((c) => c.configId).sort();
    expect(before).toEqual(['dp-stomp', 'grid-1']);

    // Seed endpoint now fails — reset must reject BEFORE wiping anything.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }) as unknown as Response),
    );
    await expect(cm.resetToSeed()).rejects.toThrow(/HTTP 503/);

    // Existing rows survive the failed reset.
    expect((await cm.getAllConfigsUnfiltered()).map((c) => c.configId).sort()).toEqual(before);
  });
});
