/**
 * `ConfigManager.seedIfEmpty` — full-restore seeding.
 *
 * A Config Browser "Export ALL" bundle (`{ appConfig, appRegistry,
 * userProfiles, roles, permissions }`) dropped in as the client
 * `seedConfigUrl` `seed.json` must restore the app's FULL state — not just
 * the auth/registry shell. These tests pin that the loader reads
 * `appConfig` verbatim, runs only against an empty DB, and stays
 * backward-compatible with minimal seeds that omit `appConfig`.
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

/** A representative "Export ALL" bundle: auth shell + component configs. */
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
      makeConfigRow({
        configId: 'component-registry::StarDemo::system',
        componentType: 'component-registry',
        userId: 'system',
        payload: { version: 2, entries: [{ id: 'MarketsGrid' }] },
      }),
      makeConfigRow({
        configId: 'grid-instance-1',
        componentType: 'markets-grid-profile-set',
        userId: 'dev1',
        payload: { version: 3, profiles: [{ id: '__default__', gridId: 'grid-instance-1', name: 'Default', state: {} }], gridLevelData: { v: 1, provider: { liveProviderId: 'dp-stomp', historicalProviderId: null, mode: 'live' } } },
      }),
    ],
  };
}

function mockFetchOnce(body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200, json: async () => body }) as unknown as Response),
  );
}

describe('ConfigManager.seedIfEmpty — full-restore seeding', () => {
  let cm: ConfigManager | undefined;

  beforeEach(async () => {
    await wipeDatabase();
  });

  afterEach(() => {
    cm?.dispose();
    cm = undefined;
    vi.unstubAllGlobals();
  });

  it('seeds appConfig rows verbatim alongside the auth tables', async () => {
    mockFetchOnce(exportBundle());
    cm = createConfigManager({ appId: 'StarDemo', seedConfigUrl: SEED_URL });
    await cm.init();

    const configs = await cm.getAllConfigsUnfiltered();
    expect(configs.map((c) => c.configId).sort()).toEqual([
      'component-registry::StarDemo::system',
      'dp-stomp',
      'grid-instance-1',
    ]);

    // Verbatim: owner identity preserved (system provider stays 'system',
    // the user's profile-set stays under 'dev1') — no re-own at seed time.
    const stomp = configs.find((c) => c.configId === 'dp-stomp');
    expect(stomp?.userId).toBe('system');
    expect(stomp?.payload).toEqual({ url: 'wss://feed.example/stomp' });
    const gridSet = configs.find((c) => c.configId === 'grid-instance-1');
    expect(gridSet?.userId).toBe('dev1');
    expect(gridSet?.payload.gridLevelData.provider.liveProviderId).toBe('dp-stomp');

    // Auth shell still seeded.
    expect((await cm.getAllApps()).map((a) => a.appId)).toEqual(['StarDemo']);
  });

  it('does NOT re-seed on the next boot once appConfig exists (guard covers appConfig)', async () => {
    // First boot seeds everything.
    mockFetchOnce(exportBundle());
    const cm1 = createConfigManager({ appId: 'StarDemo', seedConfigUrl: SEED_URL });
    await cm1.init();
    // Simulate a user editing a seeded provider after first boot.
    await cm1.saveConfig(
      makeConfigRow({ configId: 'dp-stomp', componentType: 'data-provider', componentSubType: 'stomp', userId: 'system', payload: { url: 'wss://EDITED' } }),
    );
    cm1.dispose();

    // Second boot with the same seed must skip — the user edit survives.
    const fetchSpy = vi.fn(async () => ({ ok: true, status: 200, json: async () => exportBundle() }) as unknown as Response);
    vi.stubGlobal('fetch', fetchSpy);
    cm = createConfigManager({ appId: 'StarDemo', seedConfigUrl: SEED_URL });
    await cm.init();

    // Seed was skipped: fetch never ran, and the edited payload is intact.
    expect(fetchSpy).not.toHaveBeenCalled();
    const stomp = (await cm.getAllConfigsUnfiltered()).find((c) => c.configId === 'dp-stomp');
    expect(stomp?.payload).toEqual({ url: 'wss://EDITED' });
  });

  it('normalizes stale appId values in appConfig to match appRegistry on seed', async () => {
    const bundle = exportBundle();
    for (const row of bundle.appConfig!) {
      row.appId = 'TestApp';
      if (row.configId === 'component-registry') {
        row.configId = 'component-registry::TestApp::system';
      }
    }
    mockFetchOnce(bundle);
    cm = createConfigManager({ appId: 'StarDemo', seedConfigUrl: SEED_URL });
    await cm.init();

    const configs = await cm.getAllConfigsUnfiltered();
    expect(configs.every((c) => c.appId === 'StarDemo' || c.appId === '')).toBe(true);
    const registry = configs.find((c) => c.componentType === 'component-registry');
    expect(registry?.userId).toBe('system');
    expect(registry?.configId).toBe('component-registry::StarDemo::system');
  });

  it('re-seeds when seedConfigReload is when-changed and the deploy bundle digest changes', async () => {
    const bundleV1 = exportBundle();
    mockFetchOnce(bundleV1);
    const cm1 = createConfigManager({
      appId: 'StarDemo',
      seedConfigUrl: SEED_URL,
      seedConfigReload: 'when-changed',
    });
    await cm1.init();
    await cm1.saveConfig(
      makeConfigRow({
        configId: 'dp-stomp',
        componentType: 'data-provider',
        componentSubType: 'stomp',
        userId: 'system',
        payload: { url: 'wss://EDITED' },
      }),
    );
    cm1.dispose();

    const bundleV2 = exportBundle();
    bundleV2.appConfig!.push(
      makeConfigRow({
        configId: 'dp-extra',
        componentType: 'data-provider',
        componentSubType: 'mock',
        userId: 'system',
        payload: { rows: 10 },
      }),
    );
    mockFetchOnce(bundleV2);
    cm = createConfigManager({
      appId: 'StarDemo',
      seedConfigUrl: SEED_URL,
      seedConfigReload: 'when-changed',
    });
    await cm.init();

    const configIds = (await cm.getAllConfigsUnfiltered()).map((c) => c.configId).sort();
    expect(configIds).toContain('dp-extra');
    const stomp = (await cm.getAllConfigsUnfiltered()).find((c) => c.configId === 'dp-stomp');
    expect(stomp?.payload).toEqual({ url: 'wss://feed.example/stomp' });
  });

  it('skips re-seed on when-changed when the deploy bundle digest is unchanged', async () => {
    mockFetchOnce(exportBundle());
    const cm1 = createConfigManager({
      appId: 'StarDemo',
      seedConfigUrl: SEED_URL,
      seedConfigReload: 'when-changed',
    });
    await cm1.init();
    await cm1.saveConfig(
      makeConfigRow({
        configId: 'dp-stomp',
        componentType: 'data-provider',
        componentSubType: 'stomp',
        userId: 'system',
        payload: { url: 'wss://EDITED' },
      }),
    );
    cm1.dispose();

    mockFetchOnce(exportBundle());
    cm = createConfigManager({
      appId: 'StarDemo',
      seedConfigUrl: SEED_URL,
      seedConfigReload: 'when-changed',
    });
    await cm.init();

    const stomp = (await cm.getAllConfigsUnfiltered()).find((c) => c.configId === 'dp-stomp');
    expect(stomp?.payload).toEqual({ url: 'wss://EDITED' });
  });

  it('stays backward-compatible: a minimal seed with no appConfig still boots', async () => {
    const minimal = exportBundle();
    delete minimal.appConfig;
    mockFetchOnce(minimal);
    cm = createConfigManager({ appId: 'StarDemo', seedConfigUrl: SEED_URL });
    await cm.init();

    expect(await cm.getAllConfigsUnfiltered()).toEqual([]);
    expect((await cm.getAllApps()).map((a) => a.appId)).toEqual(['StarDemo']);
  });
});

describe('ConfigManager.init — attach mode', () => {
  let cm: ConfigManager | undefined;

  afterEach(() => {
    cm?.dispose();
    cm = undefined;
    vi.unstubAllGlobals();
  });

  it('skips seedIfEmpty even when the database is empty and seedConfigUrl is set', async () => {
    await wipeDatabase();
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    cm = createConfigManager({ appId: 'StarDemo', seedConfigUrl: SEED_URL });
    await cm.init({ mode: 'attach' });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await cm.getAllConfigsUnfiltered()).toEqual([]);
  });
});
