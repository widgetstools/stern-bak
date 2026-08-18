/**
 * The bundle helpers the storage adapter is built out of: reading a row,
 * normalising a payload, the branding seam, and the one-shot migration.
 *
 * The adapter itself is covered by the four `profileStorage.*` suites; this
 * file covers the exported functions around it.
 */
import { describe, expect, it, vi } from 'vitest';
import type { ProfileSnapshot, StorageAdapter } from '@wellsfargo-starui/core';
import type { AppConfigRow } from './types';
import type { ConfigManager } from './ConfigManager';
import { MARKETS_GRID_PROFILE_SET_COMPONENT_TYPE } from './profileBundle.types';
import {
  CONFIG_SERVICE_ADAPTER_BRAND,
  createConfigServiceStorage,
  getConfigServiceAdapterBrand,
  isProfileSetRow,
  loadProfileSet,
  migrateProfilesToConfigService,
  normalizePayload,
  readVersion,
} from './profileBundle';

const SCOPE = { instanceId: 'grid-1', appId: 'App', userId: 'u1' };

function snapshot(id: string, gridId = 'grid-1'): ProfileSnapshot {
  return { id, gridId, name: id, state: {}, createdAt: 1, updatedAt: 2 };
}

function row(over: Partial<AppConfigRow> = {}): AppConfigRow {
  return {
    configId: 'grid-1',
    appId: 'App',
    userId: 'u1',
    payload: { version: 3, profiles: [snapshot('p1')] },
    componentType: MARKETS_GRID_PROFILE_SET_COMPONENT_TYPE,
    ...over,
  } as AppConfigRow;
}

function fakeManager(rows: AppConfigRow[] = []) {
  const store = new Map(rows.map((r) => [r.configId, r]));
  const listeners = new Set<() => void>();
  return {
    store,
    saveConfig: vi.fn(async (r: AppConfigRow) => {
      store.set(r.configId, r);
      for (const fn of listeners) fn();
    }),
    getConfig: vi.fn(async (id: string) => store.get(id)),
    onRowChanged: (_id: string, fn: () => void) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

describe('readVersion', () => {
  it('reads a whole non-negative number', () => {
    expect(readVersion({ version: 7 })).toBe(7);
  });

  it('floors a fractional version', () => {
    expect(readVersion({ version: 7.9 })).toBe(7);
  });

  it('treats anything unusable as version zero', () => {
    for (const payload of [
      null,
      undefined,
      {},
      { version: -1 },
      { version: '3' },
      { version: Number.NaN },
      { version: Number.POSITIVE_INFINITY },
    ]) {
      expect(readVersion(payload)).toBe(0);
    }
  });
});

describe('isProfileSetRow', () => {
  it('accepts a row with a profiles array', () => {
    expect(isProfileSetRow(row({ componentType: 'Other' }), 'App', 'u1')).toBe(true);
  });

  it('accepts a row with the profile-set component type and no profiles yet', () => {
    expect(isProfileSetRow(row({ payload: {} }), 'App', 'u1')).toBe(true);
  });

  it('rejects a row belonging to another app or user', () => {
    // Same configId, different owner — treated as missing rather than
    // misappropriated.
    expect(isProfileSetRow(row(), 'OtherApp', 'u1')).toBe(false);
    expect(isProfileSetRow(row(), 'App', 'u2')).toBe(false);
  });

  it('rejects an absent row', () => {
    expect(isProfileSetRow(null, 'App', 'u1')).toBe(false);
    expect(isProfileSetRow(undefined, 'App', 'u1')).toBe(false);
  });

  it('rejects a row that is neither shaped nor typed as a profile set', () => {
    expect(isProfileSetRow(row({ componentType: 'Other', payload: {} }), 'App', 'u1')).toBe(false);
  });
});

describe('normalizePayload', () => {
  it('keeps well-formed snapshots', () => {
    expect(normalizePayload({ version: 2, profiles: [snapshot('p1')] })).toMatchObject({
      version: 2,
      profiles: [{ id: 'p1', gridId: 'grid-1' }],
    });
  });

  it('answers an empty bundle for anything unusable', () => {
    for (const payload of [null, undefined, {}, { profiles: 'nope' }]) {
      expect(normalizePayload(payload)).toMatchObject({ version: 0, profiles: [] });
    }
  });

  it('drops entries that are not objects or lack an identity', () => {
    const out = normalizePayload({
      profiles: [null, 'x', 42, { gridId: 'grid-1' }, { id: 'p1' }, snapshot('good')],
    });
    expect(out.profiles.map((p) => p.id)).toEqual(['good']);
  });

  it('fills in a missing name and stringifies the identity', () => {
    const out = normalizePayload({ profiles: [{ id: 5, gridId: 7 }] });
    expect(out.profiles[0]).toMatchObject({ id: '5', gridId: '7', name: '', state: {} });
  });

  it('carries gridLevelData through untouched', () => {
    expect(normalizePayload({ profiles: [], gridLevelData: { columnState: [1] } })).toMatchObject({
      gridLevelData: { columnState: [1] },
    });
  });
});

describe('loadProfileSet', () => {
  it('returns the normalised bundle for a matching row', async () => {
    const cm = fakeManager([row()]);
    await expect(loadProfileSet(cm as never, SCOPE)).resolves.toMatchObject({ version: 3 });
  });

  it('returns null when there is no row yet', async () => {
    const cm = fakeManager();
    await expect(loadProfileSet(cm as never, SCOPE)).resolves.toBeNull();
  });

  it('returns null for a row owned by someone else', async () => {
    const cm = fakeManager([row({ userId: 'someone-else' })]);
    await expect(loadProfileSet(cm as never, SCOPE)).resolves.toBeNull();
  });

  it('uses a prefetched row instead of reading', async () => {
    const cm = fakeManager();
    await expect(loadProfileSet(cm as never, SCOPE, { row: row() })).resolves.toMatchObject({
      version: 3,
    });
    expect(cm.getConfig).not.toHaveBeenCalled();
  });

  it('accepts a prefetch that says there is no row', async () => {
    const cm = fakeManager([row()]);
    await expect(loadProfileSet(cm as never, SCOPE, { row: undefined })).resolves.toBeNull();
    expect(cm.getConfig).not.toHaveBeenCalled();
  });
});

describe('getConfigServiceAdapterBrand', () => {
  it('recovers the manager and scope from an adapter this module made', () => {
    const cm = fakeManager();
    const adapter = createConfigServiceStorage({
      configManager: cm as unknown as ConfigManager,
      appId: 'App',
      userId: 'u1',
    })({ instanceId: 'grid-1' });

    expect(getConfigServiceAdapterBrand(adapter)).toMatchObject({
      scope: { instanceId: 'grid-1', appId: 'App', userId: 'u1' },
    });
  });

  it('answers undefined for an adapter from somewhere else', () => {
    expect(getConfigServiceAdapterBrand({} as StorageAdapter)).toBeUndefined();
  });

  it('answers undefined for a brand of the wrong shape', () => {
    for (const brand of [null, 'string', {}, { configManager: {} }, { scope: {} }]) {
      const adapter = { [CONFIG_SERVICE_ADAPTER_BRAND]: brand } as unknown as StorageAdapter;
      expect(getConfigServiceAdapterBrand(adapter)).toBeUndefined();
    }
  });
});

describe('migrateProfilesToConfigService', () => {
  function sourceWith(profiles: ProfileSnapshot[]): StorageAdapter {
    return {
      listProfiles: vi.fn(async () => profiles),
      loadProfile: vi.fn(async () => null),
      saveProfile: vi.fn(async () => undefined),
      deleteProfile: vi.fn(async () => undefined),
    } as unknown as StorageAdapter;
  }

  const targetFactory = (cm: ReturnType<typeof fakeManager>) =>
    createConfigServiceStorage({
      configManager: cm as unknown as ConfigManager,
      appId: 'App',
      userId: 'u1',
    });

  it('copies every source profile into the bundle', async () => {
    const cm = fakeManager();
    const result = await migrateProfilesToConfigService({
      source: sourceWith([snapshot('p1', 'old-grid'), snapshot('p2', 'old-grid')]),
      target: targetFactory(cm),
      gridId: 'grid-1',
    });

    expect(result).toEqual({ migrated: true, count: 2 });
    const payload = cm.store.get('grid-1')?.payload as { profiles: ProfileSnapshot[] };
    // Rewritten to the target instance so snapshots round-trip cleanly.
    expect(payload.profiles.map((p) => p.gridId)).toEqual(['grid-1', 'grid-1']);
  });

  it('skips when the target already holds profiles', async () => {
    const cm = fakeManager([row()]);
    await expect(
      migrateProfilesToConfigService({
        source: sourceWith([snapshot('p2')]),
        target: targetFactory(cm),
        gridId: 'grid-1',
      }),
    ).resolves.toEqual({ migrated: false, reason: 'target-has-profiles' });
  });

  it('overwrites an occupied target when asked', async () => {
    const cm = fakeManager([row()]);
    await expect(
      migrateProfilesToConfigService({
        source: sourceWith([snapshot('p2')]),
        target: targetFactory(cm),
        gridId: 'grid-1',
        strategy: 'overwrite',
      }),
    ).resolves.toEqual({ migrated: true, count: 1 });
  });

  it('reports when the source had nothing to migrate', async () => {
    const cm = fakeManager();
    await expect(
      migrateProfilesToConfigService({
        source: sourceWith([]),
        target: targetFactory(cm),
        gridId: 'grid-1',
      }),
    ).resolves.toEqual({ migrated: false, reason: 'no-source-profiles' });
  });

  it('targets an explicit instance id when the grid id is not the row id', async () => {
    const cm = fakeManager();
    await migrateProfilesToConfigService({
      source: sourceWith([snapshot('p1', 'grid-1')]),
      target: targetFactory(cm),
      gridId: 'grid-1',
      instanceId: 'instance-9',
    });

    expect(cm.store.has('instance-9')).toBe(true);
  });

  it('passes call-time identity through to the factory', async () => {
    const cm = fakeManager();
    const factory = createConfigServiceStorage({ configManager: cm as unknown as ConfigManager });

    await migrateProfilesToConfigService({
      source: sourceWith([snapshot('p1')]),
      target: factory,
      gridId: 'grid-1',
      appId: 'CallTimeApp',
      userId: 'u9',
    });

    expect(cm.store.get('grid-1')).toMatchObject({ appId: 'CallTimeApp', userId: 'u9' });
  });
});
