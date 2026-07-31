/**
 * Identity-aware persistence invariants for `createConfigServiceStorage`.
 *
 * These exist because the user-reported bug was a registered-component
 * row landing on disk with the legacy hardcoded discriminator:
 *
 *   {
 *     "configId": "blotter-positions",
 *     "componentType": "markets-grid-profile-set",  ← wrong (should be "blotter")
 *     "componentSubType": "",                        ← wrong (should be "positions")
 *     "isTemplate": false                            ← wrong (should be true on test-launch)
 *   }
 *
 * The four invariants the storage adapter must uphold when a
 * `registeredIdentity` is supplied (i.e. the view was launched from a
 * Registry Editor entry):
 *
 *   1. configId === ${componentType}-${componentSubType} for templates,
 *      ${componentType}-${componentSubType} for the per-grid-instance
 *      profile-set row (since a single registered component = a single
 *      row in this storage).
 *   2. componentType === registeredIdentity.componentType  (ALWAYS)
 *   3. componentSubType === registeredIdentity.componentSubType  (ALWAYS)
 *   4. isTemplate === registeredIdentity.isTemplate  (ALWAYS)
 *
 * When no identity is supplied (legacy callers / unit tests), the
 * adapter falls back to the historical hardcoded values so existing
 * data keeps loading.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createConfigServiceStorage } from './profileBundle';
import type { AppConfigRow } from './types';
import type { ConfigManager } from './ConfigManager';
import type { ProfileSnapshot } from '@wellsfargo-starui/engine';

// ─── In-memory ConfigManager fake ───────────────────────────────────

interface FakeManager {
  rows: Map<string, AppConfigRow>;
  saveConfig: ConfigManager['saveConfig'];
  getConfig: ConfigManager['getConfig'];
}

function makeFakeConfigManager(): FakeManager {
  const rows = new Map<string, AppConfigRow>();
  return {
    rows,
    saveConfig: async (row: AppConfigRow) => { rows.set(row.configId, row); },
    getConfig: async (id: string) => rows.get(id),
  } as unknown as FakeManager;
}

const REGISTERED = {
  componentType: 'blotter',
  componentSubType: 'positions',
};

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

// ─── Invariants 2/3/4 — identity stamps replace hardcoded values ──

describe('createConfigServiceStorage — identity-aware persistence (TEST-LAUNCH)', () => {
  let cm: FakeManager;
  beforeEach(() => { cm = makeFakeConfigManager(); });

  it('saves a row with componentType + componentSubType + isTemplate from registered identity', async () => {
    const factory = createConfigServiceStorage({ configManager: cm as unknown as ConfigManager });
    const adapter = factory({
      instanceId: 'blotter-positions',
      appId: 'TestApp',
      userId: 'dev1',
      registeredIdentity: { ...REGISTERED, isTemplate: true, singleton: false },
    });

    await adapter.saveProfile(snapshot('Default', 'blotter-positions'));

    const row = cm.rows.get('blotter-positions')!;
    expect(row).toBeDefined();
    expect(row.componentType).toBe('blotter');             // (Invariant 3)
    expect(row.componentSubType).toBe('positions');        // (Invariant 3)
    expect(row.isTemplate).toBe(true);                      // (Invariant 4)
    expect(row.configId).toBe('blotter-positions');         // (Invariant 1)
  });

  it('isTemplate === false on the row when launched as a per-instance (dock-launch)', async () => {
    const factory = createConfigServiceStorage({ configManager: cm as unknown as ConfigManager });
    const adapter = factory({
      instanceId: 'inst-uuid-7f3a',
      appId: 'TestApp',
      userId: 'dev1',
      registeredIdentity: { ...REGISTERED, isTemplate: false, singleton: false },
    });

    await adapter.saveProfile(snapshot('Default', 'inst-uuid-7f3a'));

    const row = cm.rows.get('inst-uuid-7f3a')!;
    expect(row.componentType).toBe('blotter');             // type still matches registered
    expect(row.componentSubType).toBe('positions');        // subtype still matches registered
    expect(row.isTemplate).toBe(false);                     // dock-launch ⇒ not template
  });

  it('singleton flag mirrored from identity onto the row', async () => {
    const factory = createConfigServiceStorage({ configManager: cm as unknown as ConfigManager });
    const adapter = factory({
      instanceId: 'blotter-positions',
      appId: 'TestApp',
      userId: 'dev1',
      registeredIdentity: { ...REGISTERED, isTemplate: true, singleton: true },
    });
    await adapter.saveProfile(snapshot('Default', 'blotter-positions'));
    expect(cm.rows.get('blotter-positions')!.singleton).toBe(true);
  });

  it('subsequent saveGridLevelData calls preserve identity (read-modify-write does NOT regress to hardcoded)', async () => {
    const factory = createConfigServiceStorage({ configManager: cm as unknown as ConfigManager });
    const adapter = factory({
      instanceId: 'blotter-positions',
      appId: 'TestApp',
      userId: 'dev1',
      registeredIdentity: { ...REGISTERED, isTemplate: true, singleton: false },
    });

    await adapter.saveProfile(snapshot('Default', 'blotter-positions'));
    await adapter.saveGridLevelData?.('blotter-positions', { liveProviderId: 'dp-xyz' });

    const row = cm.rows.get('blotter-positions')!;
    expect(row.componentType).toBe('blotter');
    expect(row.componentSubType).toBe('positions');
    expect(row.isTemplate).toBe(true);
    // payload's gridLevelData is also persisted alongside the profiles
    expect((row.payload as { gridLevelData?: { liveProviderId?: string } }).gridLevelData?.liveProviderId).toBe('dp-xyz');
  });
});

// ─── Decision 6 — fresh writes carry `isPublic: true` ─────────────

describe('createConfigServiceStorage — visibility (Decision 6)', () => {
  let cm: FakeManager;
  beforeEach(() => { cm = makeFakeConfigManager(); });

  it('writes `isPublic: true` on a brand-new row (no prior row to inherit from)', async () => {
    const factory = createConfigServiceStorage({ configManager: cm as unknown as ConfigManager });
    const adapter = factory({
      instanceId: 'fresh-instance',
      appId: 'TestApp',
      userId: 'dev1',
      registeredIdentity: { ...REGISTERED, isTemplate: false, singleton: false },
    });

    await adapter.saveProfile(snapshot('Default', 'fresh-instance'));

    expect(cm.rows.get('fresh-instance')!.isPublic).toBe(true);
  });

  it('preserves `isPublic: false` on a row that was already private', async () => {
    // Pre-seed a private row, then save through the adapter — the
    // existing visibility should survive the read-modify-write.
    cm.rows.set('private-instance', {
      configId: 'private-instance',
      appId: 'TestApp',
      userId: 'dev1',
      isPublic: false,
      displayText: 'pre-existing private row',
      componentType: 'blotter',
      componentSubType: 'positions',
      isTemplate: false,
      singleton: false,
      payload: { version: 1, profiles: [snapshot('Default', 'private-instance')] },
      createdBy: 'dev1',
      updatedBy: 'dev1',
      creationTime: '2026-01-01T00:00:00Z',
      updatedTime: '2026-01-01T00:00:00Z',
    });

    const factory = createConfigServiceStorage({ configManager: cm as unknown as ConfigManager });
    const adapter = factory({
      instanceId: 'private-instance',
      appId: 'TestApp',
      userId: 'dev1',
      registeredIdentity: { ...REGISTERED, isTemplate: false, singleton: false },
    });
    await adapter.saveProfile(snapshot('Aggressive', 'private-instance'));

    expect(cm.rows.get('private-instance')!.isPublic).toBe(false);
  });
});

// ─── Back-compat: no identity → legacy hardcoded fields ────────────

describe('createConfigServiceStorage — back-compat (NO identity supplied)', () => {
  let cm: FakeManager;
  beforeEach(() => { cm = makeFakeConfigManager(); });

  it('falls back to "markets-grid-profile-set" / "" / false when no registeredIdentity', async () => {
    const factory = createConfigServiceStorage({ configManager: cm as unknown as ConfigManager });
    const adapter = factory({ instanceId: 'legacy-instance', appId: 'TestApp', userId: 'dev1' });

    await adapter.saveProfile(snapshot('Default', 'legacy-instance'));

    const row = cm.rows.get('legacy-instance')!;
    expect(row.componentType).toBe('markets-grid-profile-set');
    expect(row.componentSubType).toBe('');
    expect(row.isTemplate).toBe(false);
  });
});

// ─── Pre-cloned instance reads (launcher does the clone) ────────────
//
// Template-to-instance cloning now happens at LAUNCH time (in
// `createComponentInstance` in @wellsfargo-starui/openfin-platform), BEFORE
// the view opens. The storage adapter's job is just "read by id";
// it no longer has a seed-from-template branch, no race recovery,
// and no special handling for missing rows.

describe('createConfigServiceStorage — read contract for pre-cloned instance rows', () => {
  let cm: FakeManager;
  beforeEach(() => { cm = makeFakeConfigManager(); });

  it('returns null when the instance row does not exist (launcher had nothing to clone)', async () => {
    // Cold launch — no template existed when the view was launched,
    // so the launcher skipped its clone step. The view's first read
    // returns null; the consumer treats that as "first launch, start
    // empty" and bootstraps default state.
    const factory = createConfigServiceStorage({ configManager: cm as unknown as ConfigManager });
    const adapter = factory({
      instanceId: 'inst-no-row',
      appId: 'TestApp',
      userId: 'dev1',
      registeredIdentity: { ...REGISTERED, isTemplate: false, singleton: false },
    });

    expect(await adapter.listProfiles('inst-no-row')).toEqual([]);
    expect(await adapter.loadGridLevelData?.('inst-no-row')).toBeNull();
    expect(cm.rows.size).toBe(0);                             // adapter never auto-creates
  });

  it('reads the launcher-cloned row verbatim — profiles AND gridLevelData', async () => {
    // Simulate what `createComponentInstance` does at launch: copy
    // the template row's payload onto a fresh UUID-keyed row with
    // isTemplate: false. The view then reads its own row directly.
    cm.rows.set('inst-cloned', {
      configId: 'inst-cloned',
      appId: 'TestApp',
      userId: 'dev1',
      displayText: 'blotter: inst-clo',
      componentType: 'blotter',
      componentSubType: 'positions',
      isTemplate: false,
      singleton: false,
      payload: {
        version: 1,
        profiles: [snapshot('Default', 'inst-cloned')],
        gridLevelData: { liveProviderId: 'dp-xyz', mode: 'live' },
      },
      createdBy: 'dev1',
      updatedBy: 'dev1',
      creationTime: '2026-01-01T00:00:00Z',
      updatedTime: '2026-01-01T00:00:00Z',
    });

    const factory = createConfigServiceStorage({ configManager: cm as unknown as ConfigManager });
    const adapter = factory({
      instanceId: 'inst-cloned',
      appId: 'TestApp',
      userId: 'dev1',
      registeredIdentity: { ...REGISTERED, isTemplate: false, singleton: false },
    });

    const profiles = await adapter.listProfiles('inst-cloned');
    expect(profiles).toHaveLength(1);
    expect(profiles[0].name).toBe('Default');

    const gld = await adapter.loadGridLevelData?.('inst-cloned');
    expect(gld).toEqual({ liveProviderId: 'dp-xyz', mode: 'live' });

    // No new row written by the read — adapter is read-only on the
    // initial-load path now.
    expect(cm.rows.size).toBe(1);
  });

  it('two concurrent adapters on the same pre-cloned row both read cleanly (no race)', async () => {
    // The dual-adapter pattern that previously caused VersionConflict
    // (Container + inner <MarketsGrid> each building their own adapter)
    // is now race-free: both adapters do plain reads of the existing
    // row, no seed write involved.
    cm.rows.set('inst-race', {
      configId: 'inst-race',
      appId: 'TestApp',
      userId: 'dev1',
      displayText: 'blotter: inst-rac',
      componentType: 'blotter',
      componentSubType: 'positions',
      isTemplate: false,
      singleton: false,
      payload: {
        version: 1,
        profiles: [snapshot('Default', 'inst-race')],
        gridLevelData: { liveProviderId: 'dp-xyz', mode: 'live' },
      },
      createdBy: 'dev1',
      updatedBy: 'dev1',
      creationTime: '2026-01-01T00:00:00Z',
      updatedTime: '2026-01-01T00:00:00Z',
    });

    const factoryA = createConfigServiceStorage({ configManager: cm as unknown as ConfigManager });
    const adapterA = factoryA({
      instanceId: 'inst-race', appId: 'TestApp', userId: 'dev1',
      registeredIdentity: { ...REGISTERED, isTemplate: false, singleton: false },
    });
    const factoryB = createConfigServiceStorage({ configManager: cm as unknown as ConfigManager });
    const adapterB = factoryB({
      instanceId: 'inst-race', appId: 'TestApp', userId: 'dev1',
      registeredIdentity: { ...REGISTERED, isTemplate: false, singleton: false },
    });

    const [profilesA, gldB] = await Promise.all([
      adapterA.listProfiles('inst-race'),
      adapterB.loadGridLevelData?.('inst-race'),
    ]);
    expect(profilesA).toHaveLength(1);
    expect(gldB).toEqual({ liveProviderId: 'dp-xyz', mode: 'live' });
  });

  it('instance row is independent of template — later template edits do NOT propagate', async () => {
    // Author template at canonical id
    const tFactory = createConfigServiceStorage({ configManager: cm as unknown as ConfigManager });
    const tAdapter = tFactory({
      instanceId: 'blotter-positions',
      appId: 'TestApp',
      userId: 'dev1',
      registeredIdentity: { ...REGISTERED, isTemplate: true, singleton: false },
    });
    await tAdapter.saveProfile(snapshot('Default', 'blotter-positions'));

    // Simulate launcher clone: copy the template row's payload onto
    // a per-instance UUID-keyed row with isTemplate: false.
    const tplRow = cm.rows.get('blotter-positions')!;
    cm.rows.set('inst-1', {
      ...tplRow,
      configId: 'inst-1',
      isTemplate: false,
      singleton: false,
    });

    // Now extend the template — should NOT touch the instance row.
    await tAdapter.saveProfile(snapshot('Aggressive', 'blotter-positions'));
    expect((await tAdapter.listProfiles('blotter-positions')).length).toBe(2);

    const iFactory = createConfigServiceStorage({ configManager: cm as unknown as ConfigManager });
    const iAdapter = iFactory({
      instanceId: 'inst-1', appId: 'TestApp', userId: 'dev1',
      registeredIdentity: { ...REGISTERED, isTemplate: false, singleton: false },
    });
    const instProfiles = await iAdapter.listProfiles('inst-1');
    expect(instProfiles).toHaveLength(1);                       // not 2
    expect(instProfiles[0].name).toBe('Default');
  });
});

// ─── Smoke: replay the user-reported broken state ───────────────────

describe('Smoke: a test-launched blotter saves its profile-set with the correct identity', () => {
  it('produces a row exactly matching the user-asked-for shape', async () => {
    const cm = makeFakeConfigManager();

    // Mimic exactly what HostedComponent will do for a test-launch
    // of a registered "blotter / positions" entry:
    const factory = createConfigServiceStorage({ configManager: cm as unknown as ConfigManager });
    const adapter = factory({
      instanceId: 'blotter-positions',                        // ← `${type}-${subtype}`
      appId: 'TestApp',
      userId: 'dev1',
      registeredIdentity: {
        componentType: 'blotter',
        componentSubType: 'positions',
        isTemplate: true,                                       // ← test-launch
        singleton: false,
      },
    });

    await adapter.saveProfile(snapshot('Default', 'blotter-positions'));

    const row = cm.rows.get('blotter-positions')!;
    // Match the user's spec, field-by-field:
    expect(row.configId).toBe('blotter-positions');             // (1)
    expect(row.componentType).toBe('blotter');                  // (3)
    expect(row.componentSubType).toBe('positions');             // (3)
    expect(row.isTemplate).toBe(true);                          // (4)
  });
});
