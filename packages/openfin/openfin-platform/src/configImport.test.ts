/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Bulk import: appConfig (with reown), appRegistry, roles, permissions.
 * Verifies the path that previously dropped everything except dock-config.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
  AppConfigRow,
  AppRegistryRow,
  ConfigManager,
  PermissionRow,
  RoleRow,
} from '@wellsfargo-starui/core/host/config';

class InMemoryConfigManager {
  configs = new Map<string, AppConfigRow>();
  apps = new Map<string, AppRegistryRow>();
  roles = new Map<string, RoleRow>();
  permissions = new Map<string, PermissionRow>();
  /** When set, save* calls for matching table throw once (for error-path tests). */
  failNextSave: 'appConfig' | 'appRegistry' | 'role' | 'permission' | null = null;

  async getConfig(id: string)            { return this.configs.get(id); }
  async saveConfig(row: AppConfigRow)    {
    if (this.failNextSave === 'appConfig') {
      this.failNextSave = null;
      throw new Error('saveConfig failed');
    }
    this.configs.set(row.configId, { ...row });
  }
  async getAllConfigs()                  { return Array.from(this.configs.values()); }
  async getAllConfigsUnfiltered()        { return Array.from(this.configs.values()); }
  async getAllApps()                     { return Array.from(this.apps.values()); }
  async getConfigsByApp(appId: string)   { return Array.from(this.configs.values()).filter((r) => r.appId === appId); }
  async getConfigsByAppUnfiltered(appId: string) { return Array.from(this.configs.values()).filter((r) => r.appId === appId); }
  async saveAppRegistry(row: AppRegistryRow) {
    if (this.failNextSave === 'appRegistry') {
      this.failNextSave = null;
      throw new Error('saveAppRegistry failed');
    }
    this.apps.set(row.appId, { ...row });
  }
  async getAllRoles()                    { return Array.from(this.roles.values()); }
  async saveRole(row: RoleRow)           {
    if (this.failNextSave === 'role') {
      this.failNextSave = null;
      throw new Error('saveRole failed');
    }
    this.roles.set(row.roleId, { ...row });
  }
  async getAllPermissions()              { return Array.from(this.permissions.values()); }
  async savePermission(row: PermissionRow) {
    if (this.failNextSave === 'permission') {
      this.failNextSave = null;
      throw new Error('savePermission failed');
    }
    this.permissions.set(row.permissionId, { ...row });
  }
  getAppId() { return 'LocalApp'; }
  getIdentity() { return { userId: 'localuser', displayName: 'localuser' }; }
}

const cm = new InMemoryConfigManager();

vi.mock('./db', () => ({
  getConfigManager: async () => cm as unknown as ConfigManager,
}));

const { importConfigBundle } = await import('./configImport');

beforeEach(() => {
  cm.configs.clear();
  cm.apps.clear();
  cm.roles.clear();
  cm.permissions.clear();
});

function appConfigRow(over: Partial<AppConfigRow> = {}): AppConfigRow {
  return {
    configId: 'cfg-1',
    appId: 'WindowsApp',
    userId: 'winuser',
    componentType: 'markets-grid-profile-set',
    componentSubType: '',
    isTemplate: false,
    payload: { profiles: [], gridLevelData: { liveProviderId: 'live-1' } },
    creationTime: '2025-01-01T00:00:00Z',
    updatedTime: '2025-01-01T00:00:00Z',
    ...over,
  } as AppConfigRow;
}

describe('importConfigBundle', () => {
  it('imports appConfig rows reowned to local hostEnv', async () => {
    const result = await importConfigBundle({
      appConfig: [
        appConfigRow({ configId: 'cfg-blotter', appId: 'WindowsApp', userId: 'winuser' }),
      ],
    });
    expect(result.appConfig.imported).toBe(1);
    const row = cm.configs.get('cfg-blotter');
    expect(row?.appId).toBe('LocalApp');
    expect(row?.userId).toBe('localuser');
    expect((row?.payload as any).gridLevelData.liveProviderId).toBe('live-1');
  });

  it('preserves system rows unchanged', async () => {
    await importConfigBundle({
      appConfig: [appConfigRow({ configId: 'public', userId: 'system', appId: 'SomeApp' })],
    });
    const row = cm.configs.get('public');
    expect(row?.userId).toBe('system');
    // appId still gets reowned because it's not '', but userId stays 'system'
    expect(row?.appId).toBe('LocalApp');
  });

  it('preserves rows with empty appId (legacy pre-scoping)', async () => {
    await importConfigBundle({
      appConfig: [appConfigRow({ configId: 'legacy', appId: '', userId: 'winuser' })],
    });
    const row = cm.configs.get('legacy');
    expect(row?.appId).toBe(''); // unchanged
    expect(row?.userId).toBe('localuser'); // reowned
  });

  it('imports appRegistry, roles, and permissions', async () => {
    const result = await importConfigBundle({
      appRegistry: [{ appId: 'TestApp', displayName: 'Test', manifestUrl: '', configServiceEnabled: false, environment: 'dev' }],
      roles: [{ roleId: 'admin', displayName: 'Admin', permissionIds: ['p1'] }],
      permissions: [{ permissionId: 'p1', description: 'Read', category: 'config' }],
    });
    expect(result.appRegistry.imported).toBe(1);
    expect(result.roles.imported).toBe(1);
    expect(result.permissions.imported).toBe(1);
    expect(cm.apps.has('TestApp')).toBe(true);
    expect(cm.roles.has('admin')).toBe(true);
    expect(cm.permissions.has('p1')).toBe(true);
  });

  it('skip-existing mode does not overwrite local rows', async () => {
    await cm.saveConfig(appConfigRow({ configId: 'cfg-x', appId: 'LocalApp', userId: 'localuser', payload: { profiles: [], gridLevelData: { keep: true } } }));
    const result = await importConfigBundle(
      { appConfig: [appConfigRow({ configId: 'cfg-x', payload: { profiles: [], gridLevelData: { keep: false } } })] },
      { mode: 'skip-existing' },
    );
    expect(result.appConfig.skipped).toBe(1);
    expect(result.appConfig.imported).toBe(0);
    expect((cm.configs.get('cfg-x')?.payload as any).gridLevelData.keep).toBe(true);
  });

  it('counts invalid rows as failed', async () => {
    const result = await importConfigBundle({
      appConfig: [
        appConfigRow({ configId: '' as any }),
        appConfigRow(),
      ],
    });
    expect(result.appConfig.failed).toBe(1);
    expect(result.appConfig.imported).toBe(1);
  });

  it('does NOT import userProfiles even when present in the bundle', async () => {
    const result = await importConfigBundle({
      userProfiles: [{ userId: 'someone', appId: 'X', roleIds: [], displayName: 'X' }],
    });
    expect(result.totalImported).toBe(0);
  });

  it('returns aggregate totals across all tables', async () => {
    const result = await importConfigBundle({
      appConfig: [appConfigRow()],
      appRegistry: [{ appId: 'A', displayName: 'A', manifestUrl: '', configServiceEnabled: false, environment: 'dev' }],
      roles: [{ roleId: 'r', displayName: 'r', permissionIds: [] }],
      permissions: [{ permissionId: 'p', description: '', category: '' }],
    });
    expect(result.totalImported).toBe(4);
    expect(result.totalFailed).toBe(0);
  });

  it('maps legacy config field to payload before reowning', async () => {
    await importConfigBundle({
      appConfig: [
        {
          ...appConfigRow({ configId: 'legacy-cfg' }),
          payload: undefined,
          config: { profiles: [], gridLevelData: { fromLegacy: true } },
        } as unknown as AppConfigRow,
      ],
    });
    expect((cm.configs.get('legacy-cfg')?.payload as any).gridLevelData.fromLegacy).toBe(true);
  });

  it('counts non-object appConfig rows as failed', async () => {
    const result = await importConfigBundle({
      appConfig: [null as unknown as AppConfigRow, appConfigRow()],
    });
    expect(result.appConfig.failed).toBe(1);
    expect(result.appConfig.errors[0]).toContain('not an object');
  });

  it('skip-existing mode skips appRegistry, roles, and permissions', async () => {
    await cm.saveAppRegistry({
      appId: 'KeepApp',
      displayName: 'Keep',
      manifestUrl: '',
      configServiceEnabled: false,
      environment: 'dev',
    });
    await cm.saveRole({ roleId: 'keep-role', displayName: 'Keep', permissionIds: [] });
    await cm.savePermission({ permissionId: 'keep-p', description: 'Keep', category: 'x' });

    const result = await importConfigBundle(
      {
        appRegistry: [{ appId: 'KeepApp', displayName: 'New', manifestUrl: '', configServiceEnabled: false, environment: 'dev' }],
        roles: [{ roleId: 'keep-role', displayName: 'New', permissionIds: [] }],
        permissions: [{ permissionId: 'keep-p', description: 'New', category: 'y' }],
      },
      { mode: 'skip-existing' },
    );
    expect(result.appRegistry.skipped).toBe(1);
    expect(result.roles.skipped).toBe(1);
    expect(result.permissions.skipped).toBe(1);
    expect(cm.apps.get('KeepApp')?.displayName).toBe('Keep');
  });

  it('records save failures per table with row identifiers', async () => {
    cm.failNextSave = 'appConfig';
    let result = await importConfigBundle({ appConfig: [appConfigRow({ configId: 'bad-cfg' })] });
    expect(result.appConfig.failed).toBe(1);
    expect(result.appConfig.errors[0]).toContain('appConfig[bad-cfg]');

    cm.failNextSave = 'appRegistry';
    result = await importConfigBundle({
      appRegistry: [{ appId: 'BadApp', displayName: 'X', manifestUrl: '', configServiceEnabled: false, environment: 'dev' }],
    });
    expect(result.appRegistry.failed).toBe(1);
    expect(result.appRegistry.errors[0]).toContain('appRegistry[BadApp]');

    cm.failNextSave = 'role';
    result = await importConfigBundle({
      roles: [{ roleId: 'bad-role', displayName: 'X', permissionIds: [] }],
    });
    expect(result.roles.failed).toBe(1);

    cm.failNextSave = 'permission';
    result = await importConfigBundle({
      permissions: [{ permissionId: 'bad-p', description: 'X', category: '' }],
    });
    expect(result.permissions.failed).toBe(1);
  });

  it('counts invalid primary keys for registry tables as failed', async () => {
    const result = await importConfigBundle({
      appRegistry: [{ appId: '', displayName: 'X', manifestUrl: '', configServiceEnabled: false, environment: 'dev' }],
      roles: [{ roleId: null as unknown as string, displayName: 'X', permissionIds: [] }],
      permissions: [{ permissionId: undefined as unknown as string, description: 'X', category: '' }],
    });
    expect(result.appRegistry.failed).toBe(1);
    expect(result.roles.failed).toBe(1);
    expect(result.permissions.failed).toBe(1);
  });
});
