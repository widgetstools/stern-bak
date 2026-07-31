/**
 * ConfigManager visibility integration tests (Decision 6 / Session 4).
 *
 * Asserts that every list path on the manager applies the
 * `isVisible(row, ctx)` predicate, and that the `*Unfiltered` admin
 * variants bypass it.
 *
 * Until Session 8 lands impersonation, the effective user is always
 * the manager's `identity.userId`, so private-row visibility tracks
 * the manager's identity 1:1.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createConfigManager, type ConfigManager } from './ConfigManager';
import type { AppConfigRow } from './types';

// `createConfigManager` always opens the default database name.
// Tests share state across the file unless we explicitly wipe between
// runs — do so via `indexedDB.deleteDatabase` so each test starts from
// an empty `appConfig` table.
const DB_NAME = 'marketsui-config';

async function wipeDatabase(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    // `onblocked` fires when another connection holds the DB open;
    // fake-indexeddb resolves immediately afterwards in practice.
    req.onblocked = () => resolve();
  });
}

function makeRow(over: Partial<AppConfigRow>): AppConfigRow {
  return {
    configId: over.configId ?? 'cfg',
    appId: over.appId ?? 'A',
    userId: over.userId ?? 'alice',
    isPublic: over.isPublic,
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

// Plant rows directly into Dexie so multi-owner visibility scenarios are
// not collapsed by `saveConfig`'s deployment-scope stamping.
async function plant(cm: ConfigManager, row: AppConfigRow): Promise<void> {
  const internal = cm as unknown as {
    db: { appConfig: { put: (r: AppConfigRow) => Promise<string> } };
  };
  await internal.db.appConfig.put(row);
}

describe('ConfigManager — visibility filter on read paths (Session 4)', () => {
  let cm: ConfigManager;

  beforeEach(async () => {
    await wipeDatabase();
    cm = createConfigManager({
      appId: 'A',
      identity: { userId: 'alice', displayName: 'Alice' },
    });
  });

  afterEach(async () => {
    cm.dispose();
    await wipeDatabase();
  });

  it('getConfigsByApp filters cross-app rows and not-mine private rows', async () => {
    await plant(cm, makeRow({ configId: 'pub-A-alice',  appId: 'A', userId: 'alice', isPublic: true  }));
    await plant(cm, makeRow({ configId: 'pub-A-bob',    appId: 'A', userId: 'bob',   isPublic: true  }));
    await plant(cm, makeRow({ configId: 'priv-A-alice', appId: 'A', userId: 'alice', isPublic: false }));
    await plant(cm, makeRow({ configId: 'priv-A-bob',   appId: 'A', userId: 'bob',   isPublic: false }));
    await plant(cm, makeRow({ configId: 'pub-B-alice',  appId: 'B', userId: 'alice', isPublic: true  }));

    const visible = await cm.getConfigsByApp('A');
    expect(visible.map((r) => r.configId).sort()).toEqual([
      'priv-A-alice',
      'pub-A-alice',
      'pub-A-bob',
    ]);

    // The where clause only returns appId='B' rows; visibility predicate
    // then rejects them all because the manager is scoped to appId='A'.
    expect(await cm.getConfigsByApp('B')).toEqual([]);
  });

  it('getConfigsByUser hides cross-app rows even when ownership matches', async () => {
    await plant(cm, makeRow({ configId: 'a-alice', appId: 'A', userId: 'alice', isPublic: false }));
    await plant(cm, makeRow({ configId: 'b-alice', appId: 'B', userId: 'alice', isPublic: true  }));
    await plant(cm, makeRow({ configId: 'a-bob',   appId: 'A', userId: 'bob',   isPublic: false }));

    const aliceRows = await cm.getConfigsByUser('alice');
    expect(aliceRows.map((r) => r.configId)).toEqual(['a-alice']);

    // Asking for bob's rows returns nothing — bob's only row under A is
    // private, and the alice-scoped manager can't see it.
    expect(await cm.getConfigsByUser('bob')).toEqual([]);
  });

  it('getAllConfigs returns only the rows visible to the current caller', async () => {
    await plant(cm, makeRow({ configId: 'pub-A',  appId: 'A', userId: 'bob',   isPublic: true  }));
    await plant(cm, makeRow({ configId: 'priv-A', appId: 'A', userId: 'bob',   isPublic: false }));
    await plant(cm, makeRow({ configId: 'pub-B',  appId: 'B', userId: 'alice', isPublic: true  }));

    const visible = await cm.getAllConfigs();
    expect(visible.map((r) => r.configId).sort()).toEqual(['pub-A']);
  });

  it('getTemplates filters by visibility before applying type/subtype filters', async () => {
    await plant(cm, makeRow({
      configId: 't-pub-grid',  appId: 'A', userId: 'bob',   isPublic: true,
      isTemplate: true, componentType: 'GRID',  componentSubType: 'CREDIT',
    }));
    await plant(cm, makeRow({
      configId: 't-priv-grid', appId: 'A', userId: 'bob',   isPublic: false,
      isTemplate: true, componentType: 'GRID',  componentSubType: 'CREDIT',
    }));
    await plant(cm, makeRow({
      configId: 't-pub-chart', appId: 'A', userId: 'alice', isPublic: true,
      isTemplate: true, componentType: 'CHART', componentSubType: '',
    }));
    await plant(cm, makeRow({
      configId: 't-cross-app', appId: 'B', userId: 'alice', isPublic: true,
      isTemplate: true, componentType: 'GRID',  componentSubType: 'CREDIT',
    }));

    const all = await cm.getTemplates();
    expect(all.map((r) => r.configId).sort()).toEqual(['t-pub-chart', 't-pub-grid']);

    const grids = await cm.getTemplates('GRID', 'CREDIT');
    expect(grids.map((r) => r.configId)).toEqual(['t-pub-grid']);
  });

  // ─── Unfiltered admin variants ───────────────────────────────────

  it('*Unfiltered variants bypass visibility (admin / migration paths)', async () => {
    await plant(cm, makeRow({ configId: 'pub-A-alice', appId: 'A', userId: 'alice', isPublic: true  }));
    await plant(cm, makeRow({ configId: 'priv-B-bob',  appId: 'B', userId: 'bob',   isPublic: false }));
    await plant(cm, makeRow({ configId: 'pub-B-alice', appId: 'B', userId: 'alice', isPublic: true  }));

    const allUnfiltered = await cm.getAllConfigsUnfiltered();
    expect(allUnfiltered.map((r) => r.configId).sort()).toEqual([
      'priv-B-bob',
      'pub-A-alice',
      'pub-B-alice',
    ]);

    const byUserUnfiltered = await cm.getConfigsByUserUnfiltered('alice');
    expect(byUserUnfiltered.map((r) => r.configId).sort()).toEqual([
      'pub-A-alice',
      'pub-B-alice',
    ]);

    const byAppBUnfiltered = await cm.getConfigsByAppUnfiltered('B');
    expect(byAppBUnfiltered.map((r) => r.configId).sort()).toEqual([
      'priv-B-bob',
      'pub-B-alice',
    ]);
  });

  it('a backfilled isPublic-true row reads identically through the filter', async () => {
    // Acceptance from Session 4 of the plan: rows backfilled by the
    // Session 1 Dexie upgrade (all isPublic: true, scoped to the
    // manager's appId) read identically before and after the filter.
    await plant(cm, makeRow({ configId: 'legacy-pub', appId: 'A', userId: 'alice', isPublic: true }));

    const visible = await cm.getConfigsByApp('A');
    expect(visible.map((r) => r.configId)).toEqual(['legacy-pub']);
  });
});
