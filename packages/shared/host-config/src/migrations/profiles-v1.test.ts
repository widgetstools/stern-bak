/**
 * Tests for the legacy `gc-customizer-v2` → ConfigService profile
 * migration (Session 3.2). Exercises the helper directly so we can
 * pre-seed the legacy DB with known shapes and assert the result
 * lands in the bundled row.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createConfigManager, type ConfigManager } from '../ConfigManager';
import {
  LEGACY_PROFILES_DB_NAME,
  LEGACY_PROFILES_TABLE,
  migrateLegacyProfilesIfNeeded,
} from './profiles-v1';

interface FakeStorage {
  getItem: (k: string) => string | null;
  setItem: (k: string, v: string) => void;
  store: Map<string, string>;
}

function makeFakeStorage(): FakeStorage {
  const store = new Map<string, string>();
  return {
    store,
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
  };
}

interface LegacyRow {
  pk: string;
  id: string;
  gridId: string;
  name: string;
  state: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

/** Open a v1 of the legacy `gc-customizer-v2` DB and seed `rows` into
 *  the `profiles` table. Returns when the writes commit. Test isolation
 *  is per-DB-name: we use a unique name per test so fake-indexeddb's
 *  process-wide store doesn't bleed between tests. */
async function seedLegacyDb(dbName: string, rows: readonly LegacyRow[]): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const req = indexedDB.open(dbName, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(LEGACY_PROFILES_TABLE)) {
        db.createObjectStore(LEGACY_PROFILES_TABLE, { keyPath: 'pk' });
      }
    };
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(LEGACY_PROFILES_TABLE, 'readwrite');
      const store = tx.objectStore(LEGACY_PROFILES_TABLE);
      for (const row of rows) store.put(row);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    };
  });
}

/** Delete a legacy DB by name. Used to keep tests independent — fake-
 *  indexeddb persists across tests within a file so we explicitly
 *  reset. */
async function deleteLegacyDb(dbName: string): Promise<void> {
  return new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(dbName);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

let nextDbId = 0;
function freshLegacyDbName(): string {
  nextDbId += 1;
  return `legacy-db-${Date.now()}-${nextDbId}`;
}

let nextGrid = 0;
function uniqueGrid(): string {
  nextGrid += 1;
  return `mgrid-${Date.now()}-${nextGrid}`;
}

describe('migrateLegacyProfilesIfNeeded', () => {
  let cm: ConfigManager;
  let storage: FakeStorage;
  let legacyDbName: string;

  beforeEach(() => {
    cm = createConfigManager({
      appId: 'TestApp',
      identity: { userId: 'alice', displayName: 'Alice' },
    });
    storage = makeFakeStorage();
    legacyDbName = freshLegacyDbName();
  });

  afterEach(async () => {
    cm.dispose();
    await deleteLegacyDb(legacyDbName);
  });

  it('no legacy DB → flag flips, copied=0, ranThisBoot=true', async () => {
    const result = await migrateLegacyProfilesIfNeeded(cm, {
      flagKey: 'profile-migration-v1-test-1',
      legacyDbName,
      storage,
    });

    expect(result.ok).toBe(true);
    expect(result.ranThisBoot).toBe(true);
    expect(result.legacyDbHadRows).toBe(false);
    expect(result.copied).toBe(0);
    expect(storage.getItem('profile-migration-v1-test-1')).toBe('done');
  });

  it('flag already set → ranThisBoot=false, no work', async () => {
    storage.setItem('profile-migration-v1-test-2', 'done');
    // Even if there ARE legacy rows, the flag short-circuits the work.
    await seedLegacyDb(legacyDbName, [
      mkLegacy('p1', 'gridA'),
    ]);

    const result = await migrateLegacyProfilesIfNeeded(cm, {
      flagKey: 'profile-migration-v1-test-2',
      legacyDbName,
      storage,
    });

    expect(result.ranThisBoot).toBe(false);
    expect(result.copied).toBe(0);
  });

  it('copies legacy rows into the bundled ConfigService row', async () => {
    const grid = uniqueGrid();
    await seedLegacyDb(legacyDbName, [
      mkLegacy('p1', grid, 'Alpha'),
      mkLegacy('p2', grid, 'Beta'),
    ]);

    const result = await migrateLegacyProfilesIfNeeded(cm, {
      flagKey: 'profile-migration-v1-test-3',
      legacyDbName,
      storage,
    });

    expect(result.ok).toBe(true);
    expect(result.legacyDbHadRows).toBe(true);
    expect(result.copied).toBe(2);
    expect(result.perGrid[grid]).toEqual({ migrated: true, count: 2 });

    // Verify the rows actually landed in the bundled row.
    const profiles = await cm.profiles.list({ instanceId: grid });
    expect(profiles.map((p) => p.id).sort()).toEqual(['p1', 'p2']);
    expect(profiles.find((p) => p.id === 'p1')?.name).toBe('Alpha');
    expect(profiles.find((p) => p.id === 'p2')?.name).toBe('Beta');
  });

  it('groups legacy rows by gridId — one bundled row per grid', async () => {
    const gridA2 = uniqueGrid();
    const gridB2 = uniqueGrid();
    await seedLegacyDb(legacyDbName, [
      mkLegacy('p1', gridA2),
      mkLegacy('p2', gridA2),
      mkLegacy('p3', gridB2),
    ]);

    const result = await migrateLegacyProfilesIfNeeded(cm, {
      flagKey: 'profile-migration-v1-test-4',
      legacyDbName,
      storage,
    });

    expect(result.copied).toBe(3);
    expect(result.perGrid[gridA2]).toEqual({ migrated: true, count: 2 });
    expect(result.perGrid[gridB2]).toEqual({ migrated: true, count: 1 });

    const a = await cm.profiles.list({ instanceId: gridA2 });
    const b = await cm.profiles.list({ instanceId: gridB2 });
    expect(a.map((p) => p.id).sort()).toEqual(['p1', 'p2']);
    expect(b.map((p) => p.id).sort()).toEqual(['p3']);
  });

  it('skips when target already has profiles (skip-if-exists)', async () => {
    const grid = uniqueGrid();
    // Pre-populate the target with one profile already in place — the
    // migration must NOT overwrite it with whatever sits in legacy.
    await cm.profiles.save(
      { instanceId: grid },
      {
        id: 'existing',
        gridId: grid,
        name: 'Existing',
        state: {},
        createdAt: 1,
        updatedAt: 1,
      },
    );

    await seedLegacyDb(legacyDbName, [
      mkLegacy('p1', grid, 'Legacy'),
    ]);

    const result = await migrateLegacyProfilesIfNeeded(cm, {
      flagKey: 'profile-migration-v1-test-5',
      legacyDbName,
      storage,
    });

    expect(result.copied).toBe(0);
    expect(result.perGrid[grid]).toEqual({
      migrated: false,
      reason: 'target-has-profiles',
    });

    // Pre-existing row is intact — no clobber.
    const profiles = await cm.profiles.list({ instanceId: grid });
    expect(profiles.map((p) => p.id)).toEqual(['existing']);
  });

  it('idempotent — re-running after first success is a no-op', async () => {
    const flagKey = 'profile-migration-v1-test-6';
    const grid = uniqueGrid();
    await seedLegacyDb(legacyDbName, [
      mkLegacy('p1', grid),
    ]);

    const first = await migrateLegacyProfilesIfNeeded(cm, {
      flagKey,
      legacyDbName,
      storage,
    });
    expect(first.copied).toBe(1);

    const second = await migrateLegacyProfilesIfNeeded(cm, {
      flagKey,
      legacyDbName,
      storage,
    });
    // Flag is already set — no work, no recount.
    expect(second.ranThisBoot).toBe(false);
    expect(second.copied).toBe(0);

    // The bundled row still has just the one profile from the first run.
    const profiles = await cm.profiles.list({ instanceId: grid });
    expect(profiles.map((p) => p.id)).toEqual(['p1']);
  });

  it('flag flips even on top-level failure (no infinite retry on cold boot)', async () => {
    const flagKey = 'profile-migration-v1-test-7';
    const grid = uniqueGrid();
    // Forcibly throw by passing a poisoned manager whose `profiles.list`
    // explodes. We use a typed cast rather than monkey-patching to keep
    // the helper's contract honest.
    const poisoned = {
      ...cm,
      getAppId: () => 'TestApp',
      getIdentity: () => ({ userId: 'alice' }),
      profiles: {
        ...cm.profiles,
        list: async () => {
          throw new Error('boom');
        },
      },
    } as unknown as ConfigManager;

    await seedLegacyDb(legacyDbName, [
      mkLegacy('p1', grid),
    ]);

    const result = await migrateLegacyProfilesIfNeeded(poisoned, {
      flagKey,
      legacyDbName,
      storage,
    });

    // Per-gridId failure was caught — overall result is still ok=true.
    expect(result.ok).toBe(true);
    expect(result.perGrid[grid]).toEqual({ migrated: false, reason: 'error' });
    // Flag is set so we don't retry on every cold boot.
    expect(storage.getItem(flagKey)).toBe('done');
  });

  it('uses the default flag + legacy-db-name when none are passed', async () => {
    // Default flag key + DB name. We don't seed the default DB — by
    // default it doesn't exist on this fake-indexeddb, so the
    // helper short-circuits via the no-rows path.
    const result = await migrateLegacyProfilesIfNeeded(cm, { storage });
    expect(result.ok).toBe(true);
    expect(result.ranThisBoot).toBe(true);
    expect(result.legacyDbHadRows).toBe(false);
    // Default flag landed in our fake storage.
    expect(storage.getItem('profile-migration-v1')).toBe('done');
    // And the default legacy DB name is what we expect.
    expect(LEGACY_PROFILES_DB_NAME).toBe('gc-customizer-v2');
  });
});

function mkLegacy(id: string, gridId: string, name = id): LegacyRow {
  return {
    pk: `${gridId}::${id}`,
    id,
    gridId,
    name,
    state: { settings: { v: 1 } },
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
  };
}
