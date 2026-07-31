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
} from '@wellsfargo-starui/host-config';

class InMemoryConfigManager {
  configs = new Map<string, AppConfigRow>();
  apps = new Map<string, AppRegistryRow>();
  roles = new Map<string, RoleRow>();
  permissions = new Map<string, PermissionRow>();

  async getConfig(id: string)            { return this.configs.get(id); }
  async saveConfig(row: AppConfigRow)    { this.configs.set(row.configId, { ...row }); }
  async getAllConfigs()                  { return Array.from(this.configs.values()); }
  async getAllConfigsUnfiltered()        { return Array.from(this.configs.values()); }
  async getAllApps()                     { return Array.from(this.apps.values()); }
  async getConfigsByApp(appId: string)   { return Array.from(this.configs.values()).filter((r) => r.appId === appId); }
  async getConfigsByAppUnfiltered(appId: string) { return Array.from(this.configs.values()).filter((r) => r.appId === appId); }
  async saveAppRegistry(row: AppRegistryRow) { this.apps.set(row.appId, { ...row }); }
  async getAllRoles()                    { return Array.from(this.roles.values()); }
  async saveRole(row: RoleRow)           { this.roles.set(row.roleId, { ...row }); }
  async getAllPermissions()              { return Array.from(this.permissions.values()); }
  async savePermission(row: PermissionRow) { this.permissions.set(row.permissionId, { ...row }); }
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
});
