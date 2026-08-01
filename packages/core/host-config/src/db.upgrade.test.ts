/**
 * Schema-upgrade tests for `ConfigDatabase`.
 *
 * Each test:
 *   1. Constructs a one-shot Dexie DB at the OLD schema version
 *      (the version that predates the field under test).
 *   2. Writes one or more rows in the old shape — i.e. WITHOUT the
 *      new field.
 *   3. Closes that DB.
 *   4. Opens a fresh `ConfigDatabase` with the SAME database name. Dexie
 *      walks through every registered version and runs each `.upgrade()`
 *      hook in order, so the new field gets backfilled.
 *   5. Asserts the new field is populated.
 *
 * Database names are scoped per test (UUID-ish suffix) so parallel runs
 * — and the inevitable "I forgot to await close" bug — never see each
 * other's state. `fake-indexeddb/auto` (loaded in `test/setup.ts`)
 * resets each open with an in-process shim, so cleanup is implicit.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Dexie from 'dexie';
import { ConfigDatabase, DEFAULT_DB_NAME } from './db';

// Make each db name unique per test invocation.
let dbCounter = 0;
const uniqueDbName = (label: string) =>
  `marketsui-config-test-${label}-${Date.now()}-${++dbCounter}`;

/** The v1 schema, verbatim — the shape that predates the field rename. */
function openV1(dbName: string): Dexie {
  const db = new Dexie(dbName);
  db.version(1).stores({
    appConfig: 'configId, appId, [componentType+componentSubType], isTemplate',
    appRegistry: 'appId',
    userProfile: 'userId, appId',
    roles: 'roleId',
    permissions: 'permissionId, category',
    pendingSync: '++id, tableName, recordId',
  });
  return db;
}

describe('ConfigDatabase v2 upgrade — renames fields and backfills `userId`', () => {
  let dbName: string;

  beforeEach(() => {
    dbName = uniqueDbName('v2rename');
  });

  it('renames config→payload, createdAt→creationTime, updatedAt→updatedTime', async () => {
    const oldDb = openV1(dbName);
    await oldDb.open();
    await oldDb.table('appConfig').put({
      configId: 'v1-row',
      appId: 'TestApp',
      displayText: 'Row written at v1',
      componentType: 'GRID',
      componentSubType: 'CREDIT',
      isTemplate: false,
      config: { foo: 'bar' },
      createdBy: 'alice',
      updatedBy: 'alice',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-02T00:00:00Z',
    });
    oldDb.close();

    const upgraded = new ConfigDatabase(dbName);
    await upgraded.open();
    const row = (await upgraded.appConfig.get('v1-row')) as unknown as Record<string, unknown>;
    upgraded.close();

    expect(row.payload).toEqual({ foo: 'bar' });
    expect(row.creationTime).toBe('2026-01-01T00:00:00Z');
    expect(row.updatedTime).toBe('2026-01-02T00:00:00Z');
    // The old names are gone — readers must not find both spellings.
    expect('config' in row).toBe(false);
    expect('createdAt' in row).toBe(false);
    expect('updatedAt' in row).toBe(false);
  });

  it('backfills `userId` from `createdBy` so v1 rows stay queryable by owner', async () => {
    // `userId` became an index at v2; a row without it would be invisible
    // to every `where('userId')` query the manager runs.
    const oldDb = openV1(dbName);
    await oldDb.open();
    await oldDb.table('appConfig').put({
      configId: 'owned-row',
      appId: 'TestApp',
      displayText: 'x',
      componentType: 'GRID',
      isTemplate: false,
      config: {},
      createdBy: 'alice',
    });
    oldDb.close();

    const upgraded = new ConfigDatabase(dbName);
    await upgraded.open();
    const byOwner = await upgraded.appConfig.where('userId').equals('alice').toArray();
    upgraded.close();

    expect(byOwner.map((r) => r.configId)).toEqual(['owned-row']);
  });

  it('falls back to "system" when the v1 row has no createdBy either', async () => {
    const oldDb = openV1(dbName);
    await oldDb.open();
    await oldDb.table('appConfig').put({
      configId: 'ownerless-row',
      appId: 'TestApp',
      displayText: 'x',
      componentType: 'GRID',
      isTemplate: false,
      config: {},
    });
    oldDb.close();

    const upgraded = new ConfigDatabase(dbName);
    await upgraded.open();
    const row = await upgraded.appConfig.get('ownerless-row');
    upgraded.close();

    expect(row?.userId).toBe('system');
  });

  it('leaves an already-renamed row alone rather than clobbering it', async () => {
    // Half-migrated rows exist in the wild (an import written at v2 into
    // a v1 database). The rename only fires when the NEW name is absent.
    const oldDb = openV1(dbName);
    await oldDb.open();
    await oldDb.table('appConfig').put({
      configId: 'half-migrated',
      appId: 'TestApp',
      displayText: 'x',
      componentType: 'GRID',
      isTemplate: false,
      config: { old: true },
      payload: { new: true },
      createdAt: 'old-time',
      creationTime: 'new-time',
      updatedAt: 'old-time',
      updatedTime: 'new-time',
      userId: 'bob',
      createdBy: 'alice',
    });
    oldDb.close();

    const upgraded = new ConfigDatabase(dbName);
    await upgraded.open();
    const row = (await upgraded.appConfig.get('half-migrated')) as unknown as Record<string, unknown>;
    upgraded.close();

    expect(row.payload).toEqual({ new: true });
    expect(row.creationTime).toBe('new-time');
    expect(row.updatedTime).toBe('new-time');
    expect(row.userId).toBe('bob');
    // The stale duplicates are left in place — the migration only adds.
    expect(row.config).toEqual({ old: true });
  });

  it('carries a v1 row through every later migration in one open', async () => {
    // v1 → v4 in a single reopen: the rename, the isPublic backfill and
    // the isRegisteredComponent drop must all land together.
    const oldDb = openV1(dbName);
    await oldDb.open();
    await oldDb.table('appConfig').put({
      configId: 'ancient-row',
      appId: 'TestApp',
      displayText: 'x',
      componentType: 'GRID',
      isTemplate: false,
      config: { foo: 1 },
      createdBy: 'alice',
      createdAt: 't0',
      updatedAt: 't1',
      isRegisteredComponent: true,
    });
    oldDb.close();

    const upgraded = new ConfigDatabase(dbName);
    await upgraded.open();
    const row = (await upgraded.appConfig.get('ancient-row')) as unknown as Record<string, unknown>;
    upgraded.close();

    expect(row.payload).toEqual({ foo: 1 });
    expect(row.userId).toBe('alice');
    expect(row.isPublic).toBe(true);
    expect('isRegisteredComponent' in row).toBe(false);
  });
});

describe('ConfigDatabase construction', () => {
  it('defaults to the shared database name', async () => {
    const db = new ConfigDatabase();
    expect(db.name).toBe(DEFAULT_DB_NAME);
    db.close();
  });

  it('exposes all six tables after open', async () => {
    const db = new ConfigDatabase(uniqueDbName('tables'));
    await db.open();
    expect(db.tables.map((t) => t.name).sort()).toEqual([
      'appConfig',
      'appRegistry',
      'pendingSync',
      'permissions',
      'roles',
      'userProfile',
    ]);
    db.close();
  });
});

describe('ConfigDatabase v3 upgrade — backfills `isPublic`', () => {
  let dbName: string;

  beforeEach(() => {
    dbName = uniqueDbName('isPublic');
  });

  it('backfills `isPublic = true` on rows that predate the field', async () => {
    // ─── Step 1+2: write at the old schema (v2 shape) ─────────────
    //
    // We hand-roll a one-shot Dexie DB at v2 instead of pulling
    // ConfigDatabase out at an old version, because ConfigDatabase
    // ALWAYS registers all versions up to the latest. To produce a
    // genuine "no upgrade has run yet" starting state we need a Dexie
    // instance that only knows about v2.
    const oldDb = new Dexie(dbName);
    oldDb.version(1).stores({
      appConfig: 'configId, appId, [componentType+componentSubType], isTemplate',
      appRegistry: 'appId',
      userProfile: 'userId, appId',
      roles: 'roleId',
      permissions: 'permissionId, category',
      pendingSync: '++id, tableName, recordId',
    });
    oldDb.version(2).stores({
      appConfig: 'configId, appId, userId, [componentType+componentSubType], isTemplate',
      appRegistry: 'appId',
      userProfile: 'userId, appId',
      roles: 'roleId',
      permissions: 'permissionId, category',
      pendingSync: '++id, tableName, recordId',
    });
    await oldDb.open();
    await oldDb.table('appConfig').put({
      configId: 'legacy-row-1',
      appId: 'TestApp',
      userId: 'alice',
      displayText: 'Legacy row from before isPublic landed',
      componentType: 'GRID',
      componentSubType: 'CREDIT',
      isTemplate: false,
      payload: { foo: 'bar' },
      createdBy: 'alice',
      updatedBy: 'alice',
      creationTime: '2026-01-01T00:00:00Z',
      updatedTime: '2026-01-01T00:00:00Z',
      // ← no isPublic field on disk
    });
    oldDb.close();

    // ─── Step 4: reopen with the latest schema ─────────────────────
    const upgraded = new ConfigDatabase(dbName);
    await upgraded.open();
    const row = await upgraded.appConfig.get('legacy-row-1');
    upgraded.close();

    // ─── Step 5: assert the field was backfilled ───────────────────
    expect(row).toBeDefined();
    expect(row?.isPublic).toBe(true);
    // Sanity: the rest of the row survived the upgrade unmangled.
    expect(row?.userId).toBe('alice');
    expect(row?.componentType).toBe('GRID');
    expect(row?.componentSubType).toBe('CREDIT');
    expect(row?.payload).toEqual({ foo: 'bar' });
  });

  it('preserves explicit `isPublic = false` across upgrade', async () => {
    // Edge case: a row that was already authored at v3 and roundtripped
    // through an export/import shouldn't get its `false` clobbered to
    // `true`. The upgrade only fills `undefined`.
    const oldDb = new Dexie(dbName);
    oldDb.version(1).stores({
      appConfig: 'configId, appId, [componentType+componentSubType], isTemplate',
      appRegistry: 'appId',
      userProfile: 'userId, appId',
      roles: 'roleId',
      permissions: 'permissionId, category',
      pendingSync: '++id, tableName, recordId',
    });
    oldDb.version(2).stores({
      appConfig: 'configId, appId, userId, [componentType+componentSubType], isTemplate',
      appRegistry: 'appId',
      userProfile: 'userId, appId',
      roles: 'roleId',
      permissions: 'permissionId, category',
      pendingSync: '++id, tableName, recordId',
    });
    await oldDb.open();
    await oldDb.table('appConfig').put({
      configId: 'private-row',
      appId: 'TestApp',
      userId: 'alice',
      displayText: 'private row authored at v2 but with isPublic=false',
      componentType: 'GRID',
      componentSubType: 'CREDIT',
      isTemplate: false,
      isPublic: false,
      payload: {},
      createdBy: 'alice',
      updatedBy: 'alice',
      creationTime: '2026-01-01T00:00:00Z',
      updatedTime: '2026-01-01T00:00:00Z',
    });
    oldDb.close();

    const upgraded = new ConfigDatabase(dbName);
    await upgraded.open();
    const row = await upgraded.appConfig.get('private-row');
    upgraded.close();

    expect(row?.isPublic).toBe(false);
  });

  it('writes new rows with `isPublic` populated', async () => {
    // Smoke: end-to-end at the latest version, the field is just an
    // ordinary persisted column and round-trips like everything else.
    const db = new ConfigDatabase(dbName);
    await db.open();
    await db.appConfig.put({
      configId: 'fresh-row',
      appId: 'TestApp',
      userId: 'alice',
      isPublic: true,
      displayText: 'A fresh public row',
      componentType: 'GRID',
      componentSubType: 'CREDIT',
      isTemplate: false,
      payload: {},
      createdBy: 'alice',
      updatedBy: 'alice',
      creationTime: '2026-01-01T00:00:00Z',
      updatedTime: '2026-01-01T00:00:00Z',
    });
    const row = await db.appConfig.get('fresh-row');
    db.close();

    expect(row?.isPublic).toBe(true);
  });
});

describe('ConfigDatabase v4 upgrade — drops `isRegisteredComponent`', () => {
  let dbName: string;

  beforeEach(() => {
    dbName = uniqueDbName('isRegisteredComponent');
  });

  it('silently drops `isRegisteredComponent` from rows that pre-date the cleanup', async () => {
    // Hand-roll an old DB at v3 — the version where `isRegisteredComponent`
    // could still be authored onto a row. Then write a row carrying the
    // legacy field and reopen at the latest version. The v4 upgrade
    // should erase the field entirely.
    const oldDb = new Dexie(dbName);
    oldDb.version(1).stores({
      appConfig: 'configId, appId, [componentType+componentSubType], isTemplate',
      appRegistry: 'appId',
      userProfile: 'userId, appId',
      roles: 'roleId',
      permissions: 'permissionId, category',
      pendingSync: '++id, tableName, recordId',
    });
    oldDb.version(2).stores({
      appConfig: 'configId, appId, userId, [componentType+componentSubType], isTemplate',
      appRegistry: 'appId',
      userProfile: 'userId, appId',
      roles: 'roleId',
      permissions: 'permissionId, category',
      pendingSync: '++id, tableName, recordId',
    });
    oldDb.version(3).stores({
      appConfig: 'configId, appId, userId, [componentType+componentSubType], isTemplate',
      appRegistry: 'appId',
      userProfile: 'userId, appId',
      roles: 'roleId',
      permissions: 'permissionId, category',
      pendingSync: '++id, tableName, recordId',
    });
    await oldDb.open();
    await oldDb.table('appConfig').put({
      configId: 'legacy-registered',
      appId: 'TestApp',
      userId: 'alice',
      isPublic: true,
      displayText: 'Pre-Session-16 row with the deprecated alias still set',
      componentType: 'GRID',
      componentSubType: 'CREDIT',
      isTemplate: true,
      // ← deprecated alias on disk; should not survive the upgrade
      isRegisteredComponent: true,
      payload: { foo: 'bar' },
      createdBy: 'alice',
      updatedBy: 'alice',
      creationTime: '2026-01-01T00:00:00Z',
      updatedTime: '2026-01-01T00:00:00Z',
    });
    oldDb.close();

    const upgraded = new ConfigDatabase(dbName);
    await upgraded.open();
    const row = await upgraded.appConfig.get('legacy-registered');
    upgraded.close();

    expect(row).toBeDefined();
    // Field is silently gone — readers can stop probing for it.
    expect((row as unknown as Record<string, unknown>).isRegisteredComponent).toBeUndefined();
    // Sanity: every other field survives the upgrade unmangled.
    expect(row?.isTemplate).toBe(true);
    expect(row?.isPublic).toBe(true);
    expect(row?.componentType).toBe('GRID');
    expect(row?.componentSubType).toBe('CREDIT');
    expect(row?.payload).toEqual({ foo: 'bar' });
  });

  it('is a no-op for rows that never carried the field', async () => {
    // A row authored at v3 without the deprecated alias should pass
    // through the v4 upgrade unchanged.
    const oldDb = new Dexie(dbName);
    oldDb.version(1).stores({
      appConfig: 'configId, appId, [componentType+componentSubType], isTemplate',
      appRegistry: 'appId',
      userProfile: 'userId, appId',
      roles: 'roleId',
      permissions: 'permissionId, category',
      pendingSync: '++id, tableName, recordId',
    });
    oldDb.version(2).stores({
      appConfig: 'configId, appId, userId, [componentType+componentSubType], isTemplate',
      appRegistry: 'appId',
      userProfile: 'userId, appId',
      roles: 'roleId',
      permissions: 'permissionId, category',
      pendingSync: '++id, tableName, recordId',
    });
    oldDb.version(3).stores({
      appConfig: 'configId, appId, userId, [componentType+componentSubType], isTemplate',
      appRegistry: 'appId',
      userProfile: 'userId, appId',
      roles: 'roleId',
      permissions: 'permissionId, category',
      pendingSync: '++id, tableName, recordId',
    });
    await oldDb.open();
    await oldDb.table('appConfig').put({
      configId: 'modern-row',
      appId: 'TestApp',
      userId: 'alice',
      isPublic: true,
      displayText: 'Row that already ditched the deprecated alias',
      componentType: 'GRID',
      componentSubType: 'CREDIT',
      isTemplate: false,
      payload: {},
      createdBy: 'alice',
      updatedBy: 'alice',
      creationTime: '2026-01-01T00:00:00Z',
      updatedTime: '2026-01-01T00:00:00Z',
    });
    oldDb.close();

    const upgraded = new ConfigDatabase(dbName);
    await upgraded.open();
    const row = await upgraded.appConfig.get('modern-row');
    upgraded.close();

    expect(row).toBeDefined();
    expect((row as unknown as Record<string, unknown>).isRegisteredComponent).toBeUndefined();
    expect(row?.isTemplate).toBe(false);
  });
});
