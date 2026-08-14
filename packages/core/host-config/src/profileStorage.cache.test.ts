/**
 * Per-scope row cache in `createConfigServiceStorage`.
 *
 * `ConfigManager.getConfig` has no memory cache, so a single profile save
 * used to re-read + deserialise the whole bundle three times in this
 * adapter (ProfileManager's existence check, `saveProfile`'s load, and the
 * version-check inside `saveProfileSet`). The adapter now holds the raw
 * row and feeds it to the shared helpers, collapsing those into one read —
 * while still invalidating on every write and on change notifications so a
 * stale row is never served past a write (cross-tab safety).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createConfigServiceStorage } from './profileBundle';
import type { AppConfigRow } from './types';
import type { ConfigManager } from './ConfigManager';
import type { ProfileSnapshot } from '@wellsfargo-starui/core';

interface FakeManager {
  rows: Map<string, AppConfigRow>;
  getCount: () => number;
  saveConfig: ConfigManager['saveConfig'];
  getConfig: ConfigManager['getConfig'];
  onRowChanged: (configId: string, fn: () => void) => () => void;
}

/**
 * Fake ConfigManager that counts `getConfig` calls and fires subscribers
 * on every `saveConfig` — mirroring the real `changeNotifier.notify` that
 * runs at the end of a write.
 */
function makeFakeConfigManager(): FakeManager {
  const rows = new Map<string, AppConfigRow>();
  const listeners = new Set<() => void>();
  let getCount = 0;
  return {
    rows,
    getCount: () => getCount,
    saveConfig: async (row: AppConfigRow) => {
      rows.set(row.configId, row);
      for (const fn of listeners) fn();
    },
    getConfig: async (id: string) => {
      getCount++;
      return rows.get(id);
    },
    onRowChanged: (_configId: string, fn: () => void) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  } as unknown as FakeManager;
}

function snapshot(name: string, gridId: string): ProfileSnapshot {
  return {
    id: name === 'Default' ? '__default__' : `id-${name}`,
    gridId,
    name,
    state: {},
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
  };
}

describe('createConfigServiceStorage — per-scope row cache', () => {
  let cm: FakeManager;
  beforeEach(() => {
    cm = makeFakeConfigManager();
  });

  it('serves the existence-check read from cache and version-checks the save authoritatively', async () => {
    const factory = createConfigServiceStorage({ configManager: cm as unknown as ConfigManager });
    const adapter = factory({ instanceId: 'i1', appId: 'A', userId: 'u' });

    // Seed the row so the measured cycle is a steady-state save.
    await adapter.saveProfile(snapshot('Default', 'i1'));

    // Mimic ProfileManager.persistActive: an existence-check load, then
    // the actual save. The existence-check `loadProfile` is served from the
    // per-scope cache (0 reads after the first fill), but the save no longer
    // trusts that cache for its OCC version check — it reads the authoritative
    // row so a concurrent write by ANOTHER adapter instance over the same row
    // (gridLevelData vs profiles) can't be silently clobbered. That's 1
    // getConfig for the cache fill + 1 for the save's authoritative version
    // read = 2. In production ConfigManager.getConfig memoizes, so the
    // authoritative read is a memo hit, not a second DB round-trip.
    const before = cm.getCount();
    await adapter.loadProfile('i1', '__default__');
    await adapter.saveProfile(snapshot('Default', 'i1'));
    expect(cm.getCount() - before).toBe(2);
  });

  it('serves repeated reads from cache without re-reading', async () => {
    const factory = createConfigServiceStorage({ configManager: cm as unknown as ConfigManager });
    const adapter = factory({ instanceId: 'i1', appId: 'A', userId: 'u' });
    await adapter.saveProfile(snapshot('Default', 'i1'));

    const before = cm.getCount();
    await adapter.listProfiles('i1');
    await adapter.loadGridLevelData?.('i1');
    await adapter.loadProfile('i1', '__default__');
    // First read fills the cache; the rest hit it.
    expect(cm.getCount() - before).toBe(1);
  });

  it('drops the cache on a change notification so a later read is fresh (cross-tab)', async () => {
    const factoryA = createConfigServiceStorage({ configManager: cm as unknown as ConfigManager });
    const a = factoryA({ instanceId: 'i1', appId: 'A', userId: 'u' });
    // ProfileManager subscribes — this is what wires cache invalidation
    // to external writes.
    const unsub = a.subscribeToChanges!('i1', () => {});

    await a.saveProfile(snapshot('Default', 'i1'));
    expect((await a.listProfiles('i1')).map((p) => p.name)).toEqual(['Default']);

    // Another writer (another tab / the profiles.* namespace) appends a
    // profile and notifies. `a` must not keep serving its stale cache.
    const factoryB = createConfigServiceStorage({ configManager: cm as unknown as ConfigManager });
    const b = factoryB({ instanceId: 'i1', appId: 'A', userId: 'u' });
    await b.saveProfile(snapshot('Second', 'i1'));

    const names = (await a.listProfiles('i1')).map((p) => p.name).sort();
    expect(names).toEqual(['Default', 'Second']);
    unsub();
  });

  it('a fresh save after invalidation still version-checks against the real row', async () => {
    const factory = createConfigServiceStorage({ configManager: cm as unknown as ConfigManager });
    const adapter = factory({ instanceId: 'i1', appId: 'A', userId: 'u' });

    await adapter.saveProfile(snapshot('Default', 'i1'));
    await adapter.saveProfile(snapshot('Second', 'i1'));
    await adapter.saveProfile(snapshot('Third', 'i1'));

    // Each save read-modify-writes the same bundle; version climbs by one
    // per write and no VersionConflict is thrown (cache stays consistent
    // with disk across the invalidate-on-write boundary).
    const row = cm.rows.get('i1')!;
    expect((row.payload as { version: number }).version).toBe(3);
    expect((row.payload as { profiles: ProfileSnapshot[] }).profiles).toHaveLength(3);
  });
});
