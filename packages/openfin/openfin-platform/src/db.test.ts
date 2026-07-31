import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfigRow, ConfigManager } from '@wellsfargo-starui/host-config';
import { COMPONENT_TYPES } from '@wellsfargo-starui/types';

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
});
