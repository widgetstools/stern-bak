/**
 * Cross-instance write coherence for `createConfigServiceStorage`.
 *
 * A MarketsGrid hosted by MarketsGridContainer ends up with TWO adapter
 * instances over the SAME bundled row: the container's adapter writes
 * `gridLevelData` (provider selection), while MarketsGrid's controller
 * adapter writes profiles. They keep independent per-scope row caches +
 * OCC version counters, and the container adapter does NOT subscribe to
 * change notifications.
 *
 * Repro of the provider-selection-not-saved bug: the controller writes a
 * profile (bumping the row version) while the container adapter still holds
 * a stale cached version. The container's next `saveGridLevelData` then hit
 * a `ProfileSetVersionConflictError` and the write was silently dropped —
 * so `gridLevelData.provider.liveProviderId` never landed and the grid
 * booted empty on relaunch (no provider with the saved id).
 *
 * An OCC read-modify-write must re-read on conflict and retry, not throw
 * away the write.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createConfigServiceStorage } from './profileBundle';
import type { AppConfigRow } from './types';
import type { ConfigManager } from './ConfigManager';
import type { ProfileSnapshot } from '@wellsfargo-starui/core';

interface FakeManager {
  rows: Map<string, AppConfigRow>;
  saveConfig: ConfigManager['saveConfig'];
  getConfig: ConfigManager['getConfig'];
  onRowChanged: (configId: string, fn: () => void) => () => void;
}

function makeFakeConfigManager(): FakeManager {
  const rows = new Map<string, AppConfigRow>();
  const listeners = new Set<() => void>();
  return {
    rows,
    saveConfig: async (row: AppConfigRow) => {
      rows.set(row.configId, row);
      for (const fn of listeners) fn();
    },
    getConfig: async (id: string) => rows.get(id),
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

describe('createConfigServiceStorage — cross-instance write coherence', () => {
  let cm: FakeManager;
  beforeEach(() => {
    cm = makeFakeConfigManager();
  });

  it('persists gridLevelData even when another adapter instance bumped the version after this one cached it', async () => {
    // container adapter (gridLevelData) — does NOT subscribe, mirroring
    // useGridLevelPersistence.
    const container = createConfigServiceStorage({ configManager: cm as unknown as ConfigManager })(
      { instanceId: 'i1', appId: 'A', userId: 'u' },
    );
    // controller adapter (profiles) — same row, separate instance/cache.
    const controller = createConfigServiceStorage({ configManager: cm as unknown as ConfigManager })(
      { instanceId: 'i1', appId: 'A', userId: 'u' },
    );

    // Container reads first (mount-time loadGridLevelData) → caches version 0.
    expect(await container.loadGridLevelData!('i1')).toBeNull();

    // Controller saves a profile (handle.saveAll before provider switch) →
    // row version 0 → 1. Container's cache is now stale.
    await controller.saveProfile(snapshot('Default', 'i1'));

    // Container persists the provider selection. Pre-fix this threw a
    // ProfileSetVersionConflictError and the selection was dropped.
    await container.saveGridLevelData!('i1', { provider: { liveProviderId: 'dp-1', mode: 'live' } });

    const row = cm.rows.get('i1')!;
    const payload = row.payload as {
      profiles: ProfileSnapshot[];
      gridLevelData?: { provider?: { liveProviderId?: string } };
    };
    // gridLevelData landed…
    expect(payload.gridLevelData?.provider?.liveProviderId).toBe('dp-1');
    // …and the profile written in between was preserved (not clobbered).
    expect(payload.profiles).toHaveLength(1);
    expect(payload.profiles[0]!.name).toBe('Default');
  });

  it('preserves gridLevelData when a stale-cache profile save races a selection save', async () => {
    const container = createConfigServiceStorage({ configManager: cm as unknown as ConfigManager })(
      { instanceId: 'i1', appId: 'A', userId: 'u' },
    );
    const controller = createConfigServiceStorage({ configManager: cm as unknown as ConfigManager })(
      { instanceId: 'i1', appId: 'A', userId: 'u' },
    );

    // Both prime their caches at version 0.
    await container.loadGridLevelData!('i1');
    await controller.listProfiles('i1');

    // Container writes the selection first → version 1.
    await container.saveGridLevelData!('i1', { provider: { liveProviderId: 'dp-1' } });
    // Controller, still cached at version 0, writes a profile. Must re-read
    // and preserve the freshly-written gridLevelData.
    await controller.saveProfile(snapshot('Default', 'i1'));

    const payload = cm.rows.get('i1')!.payload as {
      profiles: ProfileSnapshot[];
      gridLevelData?: { provider?: { liveProviderId?: string } };
    };
    expect(payload.gridLevelData?.provider?.liveProviderId).toBe('dp-1');
    expect(payload.profiles).toHaveLength(1);
  });
});
