import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfigRow, ConfigManager } from '@wellsfargo-starui/core/host/config';
import { COMPONENT_TYPES } from '@wellsfargo-starui/types';

const createConfigManager = vi.fn();
const getConfigServiceRestUrlFromManifest = vi.fn();
const resolvePlatformBootstrapFromManifest = vi.fn();
const resolvePlatformBootstrapFromJson = vi.fn();
const resolveDeploymentIdentity = vi.fn();
const resolveDefaultPlatformScope = vi.fn();

vi.mock('@wellsfargo-starui/core/host/config', () => ({
  createConfigManager: (...a: unknown[]) => createConfigManager(...a),
}));

vi.mock('./manifestConfig.js', () => ({
  getConfigServiceRestUrlFromManifest: (...a: unknown[]) => getConfigServiceRestUrlFromManifest(...a),
}));

vi.mock('@wellsfargo-starui/data', () => ({
  resolvePlatformBootstrapFromJson: (...a: unknown[]) => resolvePlatformBootstrapFromJson(...a),
}));

vi.mock('./platformBootstrap.js', () => ({
  resolvePlatformBootstrapFromManifest: (...a: unknown[]) => resolvePlatformBootstrapFromManifest(...a),
  resolveDeploymentIdentity: (...a: unknown[]) => resolveDeploymentIdentity(...a),
}));

vi.mock('./platformScope.js', () => ({
  resolveDefaultPlatformScope: (...a: unknown[]) => resolveDefaultPlatformScope(...a),
}));

class InMemoryConfigManager {
  configs = new Map<string, AppConfigRow>();

  async init() {}
  async getConfig(id: string) {
    return this.configs.get(id.toLowerCase());
  }
  async saveConfig(row: AppConfigRow) {
    this.configs.set(row.configId.toLowerCase(), { ...row, payload: structuredClone(row.payload) });
  }
  async deleteConfig(id: string) {
    if (!this.configs.delete(id.toLowerCase())) throw new Error(`missing ${id}`);
  }
  async getAllConfigsUnfiltered() {
    return [...this.configs.values()];
  }
}

const {
  __resetDbForTests,
  clearDockConfig,
  clearRegistryConfig,
  getConfigManager,
  getPlatformDefaultScope,
  loadDockConfig,
  loadRegistryConfig,
  migrateLegacyPlatformScope,
  migrateRegistryAppIdDrift,
  migrateRegistryToGlobalScope,
  peekConfigManager,
  realignAllConfigsToPlatformScope,
  saveDockConfig,
  saveRegistryConfig,
  setConfigManager,
  setPlatformDefaultScope,
} = await import('./db.js');

const dockPayload = { version: 1, updatedAt: '', buttons: [] };
const registryPayload = { version: 1, updatedAt: '', entries: [] };

function row(over: Partial<AppConfigRow>): AppConfigRow {
  return {
    configId: 'x',
    appId: 'system',
    userId: 'system',
    displayText: 'x',
    componentType: COMPONENT_TYPES.DOCK_CONFIG,
    componentSubType: '',
    isTemplate: false,
    payload: dockPayload,
    createdBy: 'system',
    updatedBy: 'system',
    creationTime: '2020-01-01T00:00:00Z',
    updatedTime: '2020-01-01T00:00:00Z',
    ...over,
  } as AppConfigRow;
}

describe('db', () => {
  let cm: InMemoryConfigManager;

  beforeEach(() => {
    __resetDbForTests();
    cm = new InMemoryConfigManager();
    setConfigManager(cm as unknown as ConfigManager);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    __resetDbForTests();
    vi.restoreAllMocks();
  });

  it('peekConfigManager / setPlatformDefaultScope round-trip', () => {
    expect(peekConfigManager()).toBe(cm);
    expect(getPlatformDefaultScope()).toEqual({ appId: 'system', userId: 'system' });
    setPlatformDefaultScope({ appId: 'TestApp', userId: 'dev1' });
    expect(getPlatformDefaultScope()).toEqual({ appId: 'TestApp', userId: 'dev1' });
  });

  it('saves and loads dock config under the platform scope', async () => {
    setPlatformDefaultScope({ appId: 'TestApp', userId: 'dev1' });
    await saveDockConfig(dockPayload as never);
    await expect(loadDockConfig()).resolves.toEqual(dockPayload);
    await clearDockConfig();
    await expect(loadDockConfig()).resolves.toBeNull();
  });

  it('loads a legacy DOCK componentType row under the system scope', async () => {
    cm.configs.set(
      'dock-config',
      row({
        configId: 'dock-config',
        componentType: 'DOCK' as never,
        payload: dockPayload,
      }),
    );
    await expect(loadDockConfig()).resolves.toEqual(dockPayload);
  });

  it('saves registry under global userId=system and reads back', async () => {
    setPlatformDefaultScope({ appId: 'TestApp', userId: 'dev1' });
    await saveRegistryConfig(registryPayload as never);
    const saved = [...cm.configs.values()].find(
      (r) => r.componentType === COMPONENT_TYPES.COMPONENT_REGISTRY,
    );
    expect(saved?.userId).toBe('system');
    expect(saved?.appId).toBe('TestApp');
    await expect(loadRegistryConfig()).resolves.toEqual(registryPayload);
    await clearRegistryConfig();
    await expect(loadRegistryConfig()).resolves.toBeNull();
  });

  it('loadRegistryConfig falls back to per-user then legacy rows', async () => {
    setPlatformDefaultScope({ appId: 'TestApp', userId: 'dev1' });
    // Per-user row (pre-Phase-4)
    cm.configs.set(
      'component-registry',
      row({
        configId: 'component-registry',
        appId: 'TestApp',
        userId: 'dev1',
        componentType: COMPONENT_TYPES.COMPONENT_REGISTRY,
        payload: { version: 1, updatedAt: '', entries: [{ id: 'per-user' }] },
      }),
    );
    await expect(loadRegistryConfig()).resolves.toMatchObject({
      entries: [{ id: 'per-user' }],
    });

    __resetDbForTests();
    setConfigManager(cm as unknown as ConfigManager);
    cm.configs.clear();
    cm.configs.set(
      'component-registry',
      row({
        configId: 'component-registry',
        componentType: 'REGISTRY' as never,
        payload: { version: 1, updatedAt: '', entries: [{ id: 'legacy' }] },
      }),
    );
    await expect(loadRegistryConfig()).resolves.toMatchObject({
      entries: [{ id: 'legacy' }],
    });
  });

  it('migrateLegacyPlatformScope re-stamps system/system rows', async () => {
    setPlatformDefaultScope({ appId: 'TestApp', userId: 'dev1' });
    cm.configs.set('dock-config', row({ configId: 'dock-config' }));
    cm.configs.set(
      'component-registry',
      row({
        configId: 'component-registry',
        componentType: COMPONENT_TYPES.COMPONENT_REGISTRY,
        payload: registryPayload,
      }),
    );
    await expect(migrateLegacyPlatformScope()).resolves.toEqual({ migrated: 2 });
    expect(cm.configs.get('dock-config')?.appId).toBe('TestApp');
    await expect(migrateLegacyPlatformScope()).resolves.toEqual({ migrated: 0 });
  });

  it('realignAllConfigsToPlatformScope rewrites every mismatched row', async () => {
    setPlatformDefaultScope({ appId: 'TestApp', userId: 'dev1' });
    cm.configs.set('a', row({ configId: 'a', appId: 'Old', userId: 'u1' }));
    cm.configs.set('b', row({ configId: 'b', appId: 'TestApp', userId: 'dev1' }));
    await expect(realignAllConfigsToPlatformScope()).resolves.toEqual({
      realigned: 1,
      total: 2,
    });
    expect(cm.configs.get('a')?.userId).toBe('dev1');
  });

  it('migrateRegistryToGlobalScope relocates a per-user registry row', async () => {
    setPlatformDefaultScope({ appId: 'TestApp', userId: 'dev1' });
    cm.configs.set(
      'component-registry',
      row({
        configId: 'component-registry',
        appId: 'TestApp',
        userId: 'dev1',
        componentType: COMPONENT_TYPES.COMPONENT_REGISTRY,
        payload: registryPayload,
        updatedTime: '2024-01-02T00:00:00Z',
      }),
    );
    await expect(migrateRegistryToGlobalScope()).resolves.toEqual({ migrated: 1 });
    expect(cm.configs.has('component-registry')).toBe(false);
    const global = [...cm.configs.values()].find((r) => r.userId === 'system');
    expect(global?.payload).toEqual(registryPayload);
  });

  it('migrateRegistryToGlobalScope relocates the very-legacy bare row', async () => {
    setPlatformDefaultScope({ appId: 'TestApp', userId: 'dev1' });
    cm.configs.set(
      'component-registry',
      row({
        configId: 'component-registry',
        componentType: 'REGISTRY' as never,
        payload: registryPayload,
      }),
    );
    await expect(migrateRegistryToGlobalScope()).resolves.toEqual({ migrated: 1 });
  });

  it('migrateRegistryToGlobalScope warns when delete fails', async () => {
    setPlatformDefaultScope({ appId: 'TestApp', userId: 'dev1' });
    cm.configs.set(
      'component-registry',
      row({
        configId: 'component-registry',
        appId: 'TestApp',
        userId: 'dev1',
        componentType: COMPONENT_TYPES.COMPONENT_REGISTRY,
        payload: registryPayload,
      }),
    );
    const orig = cm.deleteConfig.bind(cm);
    cm.deleteConfig = async () => {
      throw new Error('locked');
    };
    await expect(migrateRegistryToGlobalScope()).resolves.toEqual({ migrated: 1 });
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('failed to delete legacy row'),
      expect.anything(),
    );
    cm.deleteConfig = orig;
  });

  it('migrateRegistryAppIdDrift moves stale appId rows to the platform app', async () => {
    setPlatformDefaultScope({ appId: 'TestApp', userId: 'dev1' });
    cm.configs.set(
      'old-reg',
      row({
        configId: 'old-reg',
        appId: 'StaleApp',
        userId: 'system',
        componentType: COMPONENT_TYPES.COMPONENT_REGISTRY,
        payload: registryPayload,
        updatedTime: '2024-06-01T00:00:00Z',
      }),
    );
    const result = await migrateRegistryAppIdDrift();
    expect(result.migrated).toBeGreaterThan(0);
    const target = [...cm.configs.values()].find((r) => r.appId === 'TestApp');
    expect(target).toBeDefined();
  });

  it('loadRegistryConfig prefers the global system row over per-user copies', async () => {
    setPlatformDefaultScope({ appId: 'TestApp', userId: 'dev1' });
    cm.configs.set(
      'component-registry::testapp::system',
      row({
        configId: 'component-registry::TestApp::system',
        appId: 'TestApp',
        userId: 'system',
        componentType: COMPONENT_TYPES.COMPONENT_REGISTRY,
        payload: { version: 1, updatedAt: '', entries: [{ id: 'global' }] },
      }),
    );
    cm.configs.set(
      'component-registry',
      row({
        configId: 'component-registry',
        appId: 'TestApp',
        userId: 'dev1',
        componentType: COMPONENT_TYPES.COMPONENT_REGISTRY,
        payload: { version: 1, updatedAt: '', entries: [{ id: 'per-user' }] },
      }),
    );
    await expect(loadRegistryConfig()).resolves.toMatchObject({
      entries: [{ id: 'global' }],
    });
  });

  it('loadDockConfig returns null when only a legacy bare row has the wrong componentType', async () => {
    setPlatformDefaultScope({ appId: 'TestApp', userId: 'dev1' });
    cm.configs.set(
      'dock-config',
      row({
        configId: 'dock-config',
        componentType: 'something-else' as never,
      }),
    );
    await expect(loadDockConfig({ appId: 'system', userId: 'system' })).resolves.toBeNull();
  });

  it('uses scoped configIds when saving outside the platform default scope', async () => {
    setPlatformDefaultScope({ appId: 'TestApp', userId: 'dev1' });
    await saveDockConfig(dockPayload as never, { appId: 'OtherApp', userId: 'u2' });
    expect(cm.configs.has('dock-config::otherapp::u2')).toBe(true);
    await expect(loadDockConfig({ appId: 'OtherApp', userId: 'u2' })).resolves.toEqual(dockPayload);
  });

  it('setPlatformDefaultScope preserves userId when only appId is passed', () => {
    setPlatformDefaultScope({ appId: 'TestApp', userId: 'dev1' });
    setPlatformDefaultScope({ appId: 'NewApp' });
    expect(getPlatformDefaultScope()).toEqual({ appId: 'NewApp', userId: 'dev1' });
  });

  it('migrateRegistryToGlobalScope is a no-op when global row already exists', async () => {
    setPlatformDefaultScope({ appId: 'TestApp', userId: 'dev1' });
    cm.configs.set(
      'component-registry::testapp::system',
      row({
        configId: 'component-registry::TestApp::system',
        appId: 'TestApp',
        userId: 'system',
        componentType: COMPONENT_TYPES.COMPONENT_REGISTRY,
        payload: registryPayload,
      }),
    );
    cm.configs.set(
      'component-registry',
      row({
        configId: 'component-registry',
        appId: 'TestApp',
        userId: 'dev1',
        componentType: COMPONENT_TYPES.COMPONENT_REGISTRY,
        payload: registryPayload,
      }),
    );
    await expect(migrateRegistryToGlobalScope()).resolves.toEqual({ migrated: 0 });
  });

  it('migrateRegistryAppIdDrift deletes stale rows when target already exists', async () => {
    setPlatformDefaultScope({ appId: 'TestApp', userId: 'dev1' });
    cm.configs.set(
      'component-registry::testapp::system',
      row({
        configId: 'component-registry::TestApp::system',
        appId: 'TestApp',
        userId: 'system',
        componentType: COMPONENT_TYPES.COMPONENT_REGISTRY,
        payload: registryPayload,
      }),
    );
    cm.configs.set(
      'stale-reg',
      row({
        configId: 'stale-reg',
        appId: 'StaleApp',
        userId: 'system',
        componentType: COMPONENT_TYPES.COMPONENT_REGISTRY,
        payload: registryPayload,
      }),
    );
    await expect(migrateRegistryAppIdDrift()).resolves.toEqual({ migrated: 1 });
    expect(cm.configs.has('stale-reg')).toBe(false);
  });

  it('migrateRegistryAppIdDrift warns when delete fails', async () => {
    setPlatformDefaultScope({ appId: 'TestApp', userId: 'dev1' });
    cm.configs.set(
      'stale-reg',
      row({
        configId: 'stale-reg',
        appId: 'StaleApp',
        userId: 'system',
        componentType: COMPONENT_TYPES.COMPONENT_REGISTRY,
        payload: registryPayload,
      }),
    );
    const orig = cm.deleteConfig.bind(cm);
    cm.deleteConfig = async (id: string) => {
      if (id === 'stale-reg') throw new Error('locked');
      return orig(id);
    };
    await migrateRegistryAppIdDrift();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('failed to delete'),
      expect.anything(),
    );
    cm.deleteConfig = orig;
  });
});

describe('getConfigManager fallback', () => {
  let fallbackCm: InMemoryConfigManager;

  beforeEach(() => {
    __resetDbForTests();
    fallbackCm = new InMemoryConfigManager();
    createConfigManager.mockReset().mockReturnValue(fallbackCm);
    getConfigServiceRestUrlFromManifest.mockReset().mockResolvedValue('http://rest');
    resolveDeploymentIdentity.mockReset().mockResolvedValue({ appId: 'FallbackApp', userId: 'fb-user' });
    resolveDefaultPlatformScope.mockReset().mockResolvedValue({ appId: 'FallbackApp', userId: 'fb-user' });
    resolvePlatformBootstrapFromManifest.mockReset().mockResolvedValue({ seedConfigUrl: 'http://seed' });
    resolvePlatformBootstrapFromJson.mockReset().mockResolvedValue({ seedConfigUrl: 'http://json-seed' });
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    __resetDbForTests();
    vi.unstubAllGlobals();
  });

  it('creates a fallback manager from manifest bootstrap when fin is present', async () => {
    vi.stubGlobal('fin', { me: {} });
    const manager = await getConfigManager();
    expect(manager).toBe(fallbackCm);
    expect(createConfigManager).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: 'FallbackApp',
        seedConfigUrl: 'http://seed',
        configServiceRestUrl: 'http://rest',
      }),
    );
    expect(resolvePlatformBootstrapFromManifest).toHaveBeenCalled();
  });

  it('creates a fallback manager from JSON bootstrap outside OpenFin', async () => {
    vi.stubGlobal('fin', undefined);
    await getConfigManager();
    expect(resolvePlatformBootstrapFromJson).toHaveBeenCalledWith('/app-config.json');
    expect(createConfigManager).toHaveBeenCalledWith(
      expect.objectContaining({ seedConfigUrl: 'http://json-seed' }),
    );
  });

  it('continues when bootstrap resolution throws', async () => {
    vi.stubGlobal('fin', undefined);
    resolvePlatformBootstrapFromJson.mockRejectedValueOnce(new Error('no bootstrap'));
    await getConfigManager();
    expect(createConfigManager).toHaveBeenCalledWith(
      expect.objectContaining({ seedConfigUrl: undefined }),
    );
  });

  it('deduplicates concurrent fallback initialisation', async () => {
    vi.stubGlobal('fin', undefined);
    const [a, b] = await Promise.all([getConfigManager(), getConfigManager()]);
    expect(a).toBe(b);
    expect(createConfigManager).toHaveBeenCalledTimes(1);
  });
});
