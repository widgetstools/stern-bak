/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * An in-memory stand-in for `ConfigManager` + its Dexie `db`, good enough for
 * everything `useConfigBrowser` touches.
 *
 * A real `ConfigManager` is not usable here: it opens the shared
 * `marketsui-config` IndexedDB by a fixed name (so parallel test files would
 * collide), and this package has no `fake-indexeddb` dependency. The hook only
 * ever reaches for `db.<table>.{count,toArray,get,put,delete}` and
 * `.where(field).equals(value).{count,toArray}`, plus the per-table save/delete
 * methods — all of which are reproduced faithfully below, including Dexie's
 * habit of handing back fresh objects rather than live references.
 */

export interface FakeCollection {
  count(): Promise<number>;
  toArray(): Promise<any[]>;
}

export class FakeTable {
  rows: any[];

  constructor(private readonly pk: string, rows: any[] = []) {
    this.rows = rows.map((r) => ({ ...r }));
  }

  async count(): Promise<number> {
    return this.rows.length;
  }

  async toArray(): Promise<any[]> {
    // Dexie returns deserialized copies; returning live references would let a
    // test mutate "the database" through the rows the hook is rendering.
    return this.rows.map((r) => ({ ...r }));
  }

  async get(key: string | number): Promise<any | undefined> {
    const found = this.rows.find((r) => r[this.pk] === key);
    return found ? { ...found } : undefined;
  }

  async put(row: any): Promise<void> {
    const idx = this.rows.findIndex((r) => r[this.pk] === row[this.pk]);
    if (idx >= 0) this.rows[idx] = { ...row };
    else this.rows.push({ ...row });
  }

  async delete(key: string | number): Promise<void> {
    // Dexie matches the stored key type exactly — String(id) will not find a
    // numeric key, which is why `pendingSync` deletes pass the raw id.
    this.rows = this.rows.filter((r) => r[this.pk] !== key);
  }

  where(field: string) {
    return {
      equals: (value: unknown): FakeCollection => {
        const matching = () => this.rows.filter((r) => r[field] === value);
        return {
          count: async () => matching().length,
          toArray: async () => matching().map((r) => ({ ...r })),
        };
      },
    };
  }
}

export interface FakeDb {
  appConfig: FakeTable;
  appRegistry: FakeTable;
  userProfile: FakeTable;
  roles: FakeTable;
  permissions: FakeTable;
  pendingSync: FakeTable;
}

export interface FakeManagerOptions {
  appId?: string;
  userId?: string;
  restUrl?: string;
  seedConfigUrl?: string | null;
  appConfig?: any[];
  appRegistry?: any[];
  userProfile?: any[];
  roles?: any[];
  permissions?: any[];
  pendingSync?: any[];
}

export interface FakeConfigManager {
  db: FakeDb;
  getRestUrl(): string | undefined;
  getSeedConfigUrl(): string | null;
  getAppId(): string;
  getIdentity(): { userId: string };
  getAllConfigsUnfiltered(): Promise<any[]>;
  saveConfig(row: any): Promise<void>;
  saveAppRegistry(row: any): Promise<void>;
  saveUserProfile(row: any): Promise<void>;
  saveRole(row: any): Promise<void>;
  savePermission(row: any): Promise<void>;
  deleteConfig(id: string): Promise<void>;
  deleteAppRegistry(id: string): Promise<void>;
  deleteUserProfile(id: string): Promise<void>;
  deleteRole(id: string): Promise<void>;
  deletePermission(id: string): Promise<void>;
  resetToSeed(): Promise<any>;
}

/**
 * Build a fake manager whose writes really land in the fake tables, so the
 * hook's read-back-after-save path (`upsertRowLocal`) exercises the same
 * round trip it does against Dexie.
 */
export function createFakeConfigManager(opts: FakeManagerOptions = {}): FakeConfigManager {
  const db: FakeDb = {
    appConfig: new FakeTable('configId', opts.appConfig ?? []),
    appRegistry: new FakeTable('appId', opts.appRegistry ?? []),
    userProfile: new FakeTable('userId', opts.userProfile ?? []),
    roles: new FakeTable('roleId', opts.roles ?? []),
    permissions: new FakeTable('permissionId', opts.permissions ?? []),
    pendingSync: new FakeTable('id', opts.pendingSync ?? []),
  };

  return {
    db,
    getRestUrl: () => opts.restUrl,
    getSeedConfigUrl: () => opts.seedConfigUrl ?? null,
    getAppId: () => opts.appId ?? '',
    getIdentity: () => ({ userId: opts.userId ?? '' }),
    getAllConfigsUnfiltered: () => db.appConfig.toArray(),
    saveConfig: (row) => db.appConfig.put(row),
    saveAppRegistry: (row) => db.appRegistry.put(row),
    saveUserProfile: (row) => db.userProfile.put(row),
    saveRole: (row) => db.roles.put(row),
    savePermission: (row) => db.permissions.put(row),
    deleteConfig: (id) => db.appConfig.delete(id),
    deleteAppRegistry: (id) => db.appRegistry.delete(id),
    deleteUserProfile: (id) => db.userProfile.delete(id),
    deleteRole: (id) => db.roles.delete(id),
    deletePermission: (id) => db.permissions.delete(id),
    resetToSeed: async () => ({
      seedUrl: opts.seedConfigUrl ?? '/seed.json',
      counts: { appConfig: 0, appRegistry: 0, userProfiles: 0, roles: 0, permissions: 0 },
    }),
  };
}
