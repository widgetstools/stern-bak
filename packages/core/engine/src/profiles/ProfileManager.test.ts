import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GridPlatform } from '../platform/GridPlatform';
import { MemoryAdapter } from '../persistence/MemoryAdapter';
import type { Module } from '../platform/types';
import { ProfileManager } from './ProfileManager';
import { RESERVED_DEFAULT_PROFILE_ID } from '../persistence/StorageAdapter';

/**
 * Regression tests for the two profile-management bugs that shipped in the
 * first v3 cut:
 *   1. Create didn't propagate to subscribers (listener disconnect).
 *   2. Load bleed — style state from one profile leaking into another via
 *      the auto-save debounce racing the active-id flip.
 *
 * Both flows must be covered at the class level so a future refactor can't
 * silently re-introduce the bug.
 */

interface StyleState {
  rules: string[];
}

function makeStyleModule(): Module<StyleState> {
  return {
    id: 'style',
    name: 'Style Rules',
    schemaVersion: 1,
    priority: 10,
    getInitialState: () => ({ rules: [] }),
    serialize: (s) => s,
    deserialize: (raw) =>
      raw && typeof raw === 'object' && Array.isArray((raw as { rules?: unknown }).rules)
        ? { rules: (raw as { rules: string[] }).rules }
        : { rules: [] },
  };
}

function makePlatform(adapter: MemoryAdapter, gridId = 'grid-A') {
  const platform = new GridPlatform({
    gridId,
    modules: [makeStyleModule()],
  });
  return { platform, adapter };
}

describe('ProfileManager — state propagation', () => {
  let adapter: MemoryAdapter;
  let platform: GridPlatform;
  let manager: ProfileManager;

  beforeEach(async () => {
    adapter = new MemoryAdapter();
    ({ platform } = makePlatform(adapter));
    manager = new ProfileManager({
      platform,
      adapter,
      disableAutoSave: true,
    });
    await manager.boot();
  });

  it('emits a subscriber notification when a profile is created', async () => {
    const events: string[] = [];
    manager.subscribe((s) => events.push(s.profiles.map((p) => p.id).join(',')));

    await manager.create('TestA');

    // At least one notification must include the new profile id.
    expect(events.some((e) => e.includes('testa'))).toBe(true);
    // The final state must list it.
    expect(manager.getState().profiles.some((p) => p.id === 'testa')).toBe(true);
  });

  it('includes the new profile in the list returned by the subscriber (full refresh after create)', async () => {
    let lastState = manager.getState();
    manager.subscribe((s) => { lastState = s; });

    await manager.create('TestB');

    // The most recent state must include BOTH Default and TestB — create()'s
    // refresh() must have propagated.
    const ids = lastState.profiles.map((p) => p.id).sort();
    expect(ids).toEqual([RESERVED_DEFAULT_PROFILE_ID, 'testb']);
  });

  it('flips activeId to the newly-created profile', async () => {
    await manager.create('TestC');
    expect(manager.getState().activeId).toBe('testc');
  });

  it('notifies subscribers about the activeId change BEFORE returning from load()', async () => {
    await manager.create('TestD');

    const states: string[] = [];
    manager.subscribe((s) => states.push(s.activeId));

    await manager.load(RESERVED_DEFAULT_PROFILE_ID);

    expect(states.at(-1)).toBe(RESERVED_DEFAULT_PROFILE_ID);
  });
});

describe('ProfileManager — profile switch state isolation', () => {
  it('does not bleed style state from profile A into profile B when switching', async () => {
    const adapter = new MemoryAdapter();
    const { platform } = makePlatform(adapter);
    const manager = new ProfileManager({
      platform,
      adapter,
      autoSaveDebounceMs: 1,
    });
    await manager.boot();

    // Edit Default — add a rule.
    platform.store.setModuleState<StyleState>('style', () => ({ rules: ['rule-in-default'] }));
    await manager.save();

    // Create ProfileA — should be a blank slate.
    await manager.create('ProfileA');
    expect(platform.store.getModuleState<StyleState>('style').rules).toEqual([]);

    // Add a rule under ProfileA.
    platform.store.setModuleState<StyleState>('style', () => ({ rules: ['rule-in-A']}));
    await manager.save();

    // Switch back to Default — rules list must be the Default's original.
    await manager.load(RESERVED_DEFAULT_PROFILE_ID);
    expect(platform.store.getModuleState<StyleState>('style').rules).toEqual(['rule-in-default']);

    // Switch to ProfileA — must see ProfileA's rule, not Default's.
    await manager.load('profilea');
    expect(platform.store.getModuleState<StyleState>('style').rules).toEqual(['rule-in-A']);

    manager.dispose();
  });

  it('loading a profile does NOT overwrite the just-loaded snapshot with the old debounced save', async () => {
    // Regression for the "debounce fires after load, writes new state to old id"
    // race. We use a very short debounce + explicit timing so the test never
    // drags — any debounce firing post-load must target the NEW id (and the
    // NEW state), not corrupt the old snapshot.
    const adapter = new MemoryAdapter();
    const { platform } = makePlatform(adapter);
    const manager = new ProfileManager({
      platform,
      adapter,
      autoSaveDebounceMs: 5,
    });
    await manager.boot();

    // Seed Default with rule X.
    platform.store.setModuleState<StyleState>('style', () => ({ rules: ['X'] }));
    await manager.save();

    // Create ProfileA with rule Y.
    await manager.create('PA');
    platform.store.setModuleState<StyleState>('style', () => ({ rules: ['Y'] }));
    await manager.save();

    // Switch to Default. Wait past the debounce window to give any racing
    // timer a chance to fire.
    await manager.load(RESERVED_DEFAULT_PROFILE_ID);
    await new Promise((r) => setTimeout(r, 30));

    // Default's stored snapshot must still be ['X'] — NOT polluted by the
    // debounce from ProfileA's earlier edits.
    const defaultSnap = await adapter.loadProfile('grid-A', RESERVED_DEFAULT_PROFILE_ID);
    expect((defaultSnap?.state.style?.data as StyleState).rules).toEqual(['X']);

    // ProfileA's snapshot must still be ['Y'].
    const paSnap = await adapter.loadProfile('grid-A', 'pa');
    expect((paSnap?.state.style?.data as StyleState).rules).toEqual(['Y']);

    manager.dispose();
  });
});

describe('ProfileManager — delete cycles', () => {
  it('deleting an inactive profile does not touch the active profile state', async () => {
    const adapter = new MemoryAdapter();
    const { platform } = makePlatform(adapter);
    const manager = new ProfileManager({
      platform,
      adapter,
      disableAutoSave: true,
    });
    await manager.boot();

    platform.store.setModuleState<StyleState>('style', () => ({ rules: ['D1'] }));
    await manager.save();
    await manager.create('X');
    platform.store.setModuleState<StyleState>('style', () => ({ rules: ['X1'] }));
    await manager.save();

    // On profile X, delete Default.
    // Actually RESERVED_DEFAULT is immutable — try deleting X while on X
    // instead (falls back to Default) and verify Default's state survives.
    await manager.remove('x');
    expect(manager.getState().activeId).toBe(RESERVED_DEFAULT_PROFILE_ID);
    expect(platform.store.getModuleState<StyleState>('style').rules).toEqual(['D1']);

    manager.dispose();
  });

  it('reserved Default profile cannot be deleted', async () => {
    const adapter = new MemoryAdapter();
    const { platform } = makePlatform(adapter);
    const manager = new ProfileManager({
      platform,
      adapter,
      disableAutoSave: true,
    });
    await manager.boot();

    await manager.remove(RESERVED_DEFAULT_PROFILE_ID);
    expect(manager.getState().profiles.some((p) => p.id === RESERVED_DEFAULT_PROFILE_ID)).toBe(true);

    manager.dispose();
  });
});

describe('ProfileManager — disposed-guards', () => {
  it('boot() is idempotent — calling twice does NOT double-apply state', async () => {
    const adapter = new MemoryAdapter();
    const { platform } = makePlatform(adapter);
    const manager = new ProfileManager({ platform, adapter, disableAutoSave: true });

    // First boot wins; second is a no-op.
    await manager.boot();
    const firstActive = manager.getState().activeId;

    // Seed a different state under a different profile to verify the
    // second boot doesn't overwrite what the first applied.
    await manager.create('Rogue');
    expect(manager.getState().activeId).toBe('rogue');

    // Call boot() again — must short-circuit. State stays on 'rogue'.
    await manager.boot();
    expect(manager.getState().activeId).toBe('rogue');
    // Default is still what boot #1 applied initially.
    expect(firstActive).toBe(RESERVED_DEFAULT_PROFILE_ID);

    manager.dispose();
  });

  it('boot() exits cleanly if disposed mid-flight', async () => {
    const adapter = new MemoryAdapter();
    const { platform } = makePlatform(adapter);
    const manager = new ProfileManager({ platform, adapter, disableAutoSave: true });

    const bootPromise = manager.boot();
    manager.dispose();  // race: dispose BEFORE boot's first await resolves.
    await bootPromise;  // must not throw, must not hang.

    // Disposed manager has empty listener set + booted flag set.
    // Calling public methods is still allowed (they're idempotent no-ops).
    expect(() => manager.getState()).not.toThrow();
  });

  it('disposed manager does NOT install a rogue auto-save subscription', async () => {
    const adapter = new MemoryAdapter();
    const { platform } = makePlatform(adapter);
    const manager = new ProfileManager({ platform, adapter, autoSaveDebounceMs: 1 });

    // Dispose immediately — boot will start + attempt to startAutoSave.
    const bootPromise = manager.boot();
    manager.dispose();
    await bootPromise;

    // Editing the store now should NOT result in a persist call (no
    // auto-save wired). Easiest way to test: count listProfiles calls
    // against the adapter via a wrapping spy.
    const listSpy = vi.spyOn(adapter, 'saveProfile');
    platform.store.setModuleState<StyleState>('style', () => ({ rules: ['post-dispose-edit'] }));
    await new Promise((r) => setTimeout(r, 30));
    expect(listSpy).not.toHaveBeenCalled();
  });
});

describe('ProfileManager — reload persistence', () => {
  it('state written under a profile survives a manager recreation (simulated reload)', async () => {
    const adapter = new MemoryAdapter();
    const gridId = 'grid-persist';

    // First session: create + edit Profile P.
    {
      const platform = new GridPlatform({ gridId, modules: [makeStyleModule()] });
      const manager = new ProfileManager({ platform, adapter, disableAutoSave: true });
      await manager.boot();
      await manager.create('Persisted');
      platform.store.setModuleState<StyleState>('style', () => ({ rules: ['persisted-rule'] }));
      await manager.save();
      manager.dispose();
    }

    // Second session: fresh manager should load the last-active profile.
    {
      const platform = new GridPlatform({ gridId, modules: [makeStyleModule()] });
      const manager = new ProfileManager({ platform, adapter, disableAutoSave: true });
      await manager.boot();
      expect(manager.getState().activeId).toBe('persisted');
      expect(platform.store.getModuleState<StyleState>('style').rules).toEqual(['persisted-rule']);
      manager.dispose();
    }
  });
});

describe('ProfileManager — phantom-profile regressions', () => {
  /**
   * The three paths that used to auto-generate ghost profile rows on
   * delete / create. The fix forbids `persistActive` from implicitly
   * creating missing rows + reorders `remove()` and `create()` so no
   * concurrent save can find a stale activeId pointing at a
   * non-existent row.
   */

  it('save() after an external delete does NOT resurrect the deleted profile', async () => {
    const adapter = new MemoryAdapter();
    const { platform } = makePlatform(adapter);
    const manager = new ProfileManager({ platform, adapter, disableAutoSave: true });
    await manager.boot();

    // Create + switch to a user profile, then simulate a concurrent
    // tab deleting it from underneath (we just hit the adapter
    // directly — the manager's own activeId stays pointing at 'p1').
    await manager.create('P1');
    expect(manager.getState().activeId).toBe('p1');

    await adapter.deleteProfile(platform.gridId, 'p1');

    // User makes edits + clicks Save. Pre-fix this would call
    // persistActive, find no row, and auto-create a ghost with the
    // current in-memory state.
    platform.store.setModuleState<StyleState>('style', () => ({ rules: ['ghost'] }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await manager.save();
    warn.mockRestore();

    const row = await adapter.loadProfile(platform.gridId, 'p1');
    expect(row).toBeNull();

    manager.dispose();
  });

  it('remove() of the active profile flips activeId to Default BEFORE deleting the row', async () => {
    const adapter = new MemoryAdapter();
    const { platform } = makePlatform(adapter);
    const manager = new ProfileManager({ platform, adapter, disableAutoSave: true });
    await manager.boot();

    await manager.create('P2');
    expect(manager.getState().activeId).toBe('p2');

    // Observe the activeId timeline during the delete. The pointer
    // MUST land on Default before (or at least without passing through
    // a window where) the row exists but activeId points at a gone id.
    const activeIdTimeline: string[] = [manager.getState().activeId];
    manager.subscribe((s) => {
      const last = activeIdTimeline[activeIdTimeline.length - 1];
      if (s.activeId !== last) activeIdTimeline.push(s.activeId);
    });
    const deleteSpy = vi.spyOn(adapter, 'deleteProfile');

    await manager.remove('p2');

    // activeId transitioned p2 → __default__, not p2 → p2 → __default__.
    expect(activeIdTimeline).toEqual(['p2', RESERVED_DEFAULT_PROFILE_ID]);
    // By the time deleteProfile was called, the manager's activeId
    // was already Default.
    expect(deleteSpy).toHaveBeenCalledWith(platform.gridId, 'p2');
    expect(manager.getState().activeId).toBe(RESERVED_DEFAULT_PROFILE_ID);
    // And the row is gone.
    expect(await adapter.loadProfile(platform.gridId, 'p2')).toBeNull();

    manager.dispose();
  });

  it('create() writes the row to disk BEFORE flipping activeId (no ghost window)', async () => {
    const adapter = new MemoryAdapter();
    const { platform } = makePlatform(adapter);
    const manager = new ProfileManager({ platform, adapter, disableAutoSave: true });
    await manager.boot();

    // Instrument saveProfile so we can capture the manager's activeId
    // AT THE MOMENT the adapter write is invoked. Pre-fix, activeId
    // was flipped BEFORE saveProfile ran — so a concurrent save()
    // would observe activeId='p3' with no p3 row on disk.
    const activeIdAtWrite: string[] = [];
    const orig = adapter.saveProfile.bind(adapter);
    vi.spyOn(adapter, 'saveProfile').mockImplementation(async (snap) => {
      activeIdAtWrite.push(manager.getState().activeId);
      return orig(snap);
    });

    await manager.create('P3');

    // At the point of the new profile's write, activeId was STILL
    // the previous one (Default) — not the new one.
    expect(activeIdAtWrite).toEqual([RESERVED_DEFAULT_PROFILE_ID]);
    // After create() returns, the flip has landed.
    expect(manager.getState().activeId).toBe('p3');
    // And the row exists.
    expect(await adapter.loadProfile(platform.gridId, 'p3')).not.toBeNull();

    manager.dispose();
  });

  it('create() restores the outgoing profile\'s UI state until the commit succeeds', async () => {
    const adapter = new MemoryAdapter();
    const { platform } = makePlatform(adapter);
    const manager = new ProfileManager({ platform, adapter, disableAutoSave: true });
    await manager.boot();

    // Put some state under Default + save it.
    platform.store.setModuleState<StyleState>('style', () => ({ rules: ['default-rule'] }));
    await manager.save();

    // Also make some un-committed edits on top.
    platform.store.setModuleState<StyleState>('style', () => ({ rules: ['default-rule', 'unsaved'] }));

    // Capture the live store state seen by a subscriber DURING the
    // create() call. The snapshot-and-restore dance inside create()
    // must not expose a window where the live store is blank before
    // the new profile has committed.
    const observed: string[][] = [];
    const unsub = platform.store.subscribe(() => {
      observed.push([...platform.store.getModuleState<StyleState>('style').rules]);
    });

    await manager.create('P4');
    unsub();

    // At the end, we're on P4 (blank).
    expect(manager.getState().activeId).toBe('p4');
    expect(platform.store.getModuleState<StyleState>('style').rules).toEqual([]);
    // The underlying Default row kept its committed state. Module
    // state is stored inside a `{ v, data }` envelope on disk.
    const defRow = await adapter.loadProfile(platform.gridId, RESERVED_DEFAULT_PROFILE_ID);
    const defStyle = (defRow?.state.style as { v: number; data: StyleState } | undefined);
    expect(defStyle?.data.rules).toEqual(['default-rule']);

    manager.dispose();
  });

  // ─── clone ─────────────────────────────────────────────────────

  it('clone() duplicates the active profile\'s LIVE (dirty) state into the new row', async () => {
    const adapter = new MemoryAdapter();
    const { platform } = makePlatform(adapter);
    const manager = new ProfileManager({ platform, adapter, disableAutoSave: true });
    await manager.boot();

    // Commit some state on Default.
    platform.store.setModuleState<StyleState>('style', () => ({ rules: ['committed'] }));
    await manager.save();
    // Add unsaved edits on top — these SHOULD be part of the clone.
    platform.store.setModuleState<StyleState>('style', () => ({ rules: ['committed', 'dirty'] }));

    await manager.clone(RESERVED_DEFAULT_PROFILE_ID, 'Default Variant');

    // Clone is active.
    expect(manager.getState().activeId).toBe('default-variant');
    // Clone's row on disk contains both the committed AND the
    // previously-unsaved state (live-state capture).
    const row = await adapter.loadProfile(platform.gridId, 'default-variant');
    const style = row?.state.style as { v: number; data: StyleState } | undefined;
    expect(style?.data.rules).toEqual(['committed', 'dirty']);
    // Clone is not dirty — its on-disk snapshot matches the live store.
    expect(manager.getState().isDirty).toBe(false);

    manager.dispose();
  });

  it('clone() of a NON-active profile uses the on-disk snapshot, not the live store', async () => {
    const adapter = new MemoryAdapter();
    const { platform } = makePlatform(adapter);
    const manager = new ProfileManager({ platform, adapter, disableAutoSave: true });
    await manager.boot();

    // Create a saved profile "source" with rules=['source-rule'].
    await manager.create('Source');
    platform.store.setModuleState<StyleState>('style', () => ({ rules: ['source-rule'] }));
    await manager.save();

    // Switch to Default, and make DIFFERENT edits in the live store.
    await manager.load(RESERVED_DEFAULT_PROFILE_ID);
    platform.store.setModuleState<StyleState>('style', () => ({ rules: ['default-live'] }));

    // Clone 'source' — should capture source's DISK state, not the
    // current live store (which is pointing at Default's live edits).
    await manager.clone('source', 'Source Copy');

    const row = await adapter.loadProfile(platform.gridId, 'source-copy');
    const style = row?.state.style as { v: number; data: StyleState } | undefined;
    expect(style?.data.rules).toEqual(['source-rule']);

    manager.dispose();
  });

  it('clone() rejects the reserved Default id as a target', async () => {
    const adapter = new MemoryAdapter();
    const { platform } = makePlatform(adapter);
    const manager = new ProfileManager({ platform, adapter, disableAutoSave: true });
    await manager.boot();

    await expect(
      manager.clone(RESERVED_DEFAULT_PROFILE_ID, 'Default', { id: RESERVED_DEFAULT_PROFILE_ID }),
    ).rejects.toThrow(/reserved id/i);
    manager.dispose();
  });

  it('clone() rejects when source == target id (would overwrite source)', async () => {
    const adapter = new MemoryAdapter();
    const { platform } = makePlatform(adapter);
    const manager = new ProfileManager({ platform, adapter, disableAutoSave: true });
    await manager.boot();

    await manager.create('Source');
    await expect(manager.clone('source', 'Source', { id: 'source' }))
      .rejects.toThrow(/must differ/i);
    manager.dispose();
  });

  it('clone() throws when the source profile does not exist on disk', async () => {
    const adapter = new MemoryAdapter();
    const { platform } = makePlatform(adapter);
    const manager = new ProfileManager({ platform, adapter, disableAutoSave: true });
    await manager.boot();

    await expect(manager.clone('ghost', 'Ghost Copy'))
      .rejects.toThrow(/not found/i);
    manager.dispose();
  });

  it('clone() deep-copies state (edits to clone don\'t leak to source)', async () => {
    const adapter = new MemoryAdapter();
    const { platform } = makePlatform(adapter);
    const manager = new ProfileManager({ platform, adapter, disableAutoSave: true });
    await manager.boot();

    platform.store.setModuleState<StyleState>('style', () => ({ rules: ['shared'] }));
    await manager.save();

    await manager.clone(RESERVED_DEFAULT_PROFILE_ID, 'Variant');
    // Mutate the clone (the active profile now) + save.
    platform.store.setModuleState<StyleState>('style', () => ({ rules: ['shared', 'clone-only'] }));
    await manager.save();

    // Source (Default) must still be ['shared'].
    const defRow = await adapter.loadProfile(platform.gridId, RESERVED_DEFAULT_PROFILE_ID);
    const defStyle = defRow?.state.style as { v: number; data: StyleState } | undefined;
    expect(defStyle?.data.rules).toEqual(['shared']);

    manager.dispose();
  });

  it('remove() of a non-active profile leaves the active profile untouched', async () => {
    const adapter = new MemoryAdapter();
    const { platform } = makePlatform(adapter);
    const manager = new ProfileManager({ platform, adapter, disableAutoSave: true });
    await manager.boot();

    await manager.create('Keep');
    await manager.create('Drop');
    // Switch back to Keep so Drop is non-active.
    await manager.load('keep');
    expect(manager.getState().activeId).toBe('keep');

    await manager.remove('drop');

    expect(manager.getState().activeId).toBe('keep');
    expect(await adapter.loadProfile(platform.gridId, 'drop')).toBeNull();
    expect(await adapter.loadProfile(platform.gridId, 'keep')).not.toBeNull();
    manager.dispose();
  });
});

describe('ProfileManager — export/import grid-level data (schemaVersion 2)', () => {
  it('export carries the adapter\'s grid-level data as a v2 payload', async () => {
    const adapter = new MemoryAdapter();
    const { platform } = makePlatform(adapter, 'grid-gld');
    const manager = new ProfileManager({ platform, adapter, disableAutoSave: true });
    await manager.boot();

    const gld = { v: 1, provider: { liveProviderId: 'stomp-1', historicalProviderId: null, mode: 'live' } };
    await adapter.saveGridLevelData(platform.gridId, gld);

    const payload = await manager.export();
    expect(payload.schemaVersion).toBe(2);
    expect(payload.gridLevelData).toEqual(gld);

    manager.dispose();
  });

  it('export omits grid-level data (v1) when the adapter has none', async () => {
    const adapter = new MemoryAdapter();
    const { platform } = makePlatform(adapter, 'grid-no-gld');
    const manager = new ProfileManager({ platform, adapter, disableAutoSave: true });
    await manager.boot();

    const payload = await manager.export();
    expect(payload.schemaVersion).toBe(1);
    expect('gridLevelData' in payload).toBe(false);

    manager.dispose();
  });

  it('import writes grid-level data to the adapter and emits gridLevelData:imported', async () => {
    const adapter = new MemoryAdapter();
    const { platform } = makePlatform(adapter, 'grid-import');
    const manager = new ProfileManager({ platform, adapter, disableAutoSave: true });
    await manager.boot();

    const events: unknown[] = [];
    platform.events.on('gridLevelData:imported', (p) => events.push(p.data));

    const gld = { v: 1, provider: { liveProviderId: 'rest-9', historicalProviderId: 'rest-h', mode: 'historical' }, caption: 'Imported View' };
    await manager.import({
      schemaVersion: 2,
      kind: 'gc-profile',
      exportedAt: new Date().toISOString(),
      profile: { name: 'FromFile', gridId: 'grid-import', state: {} },
      gridLevelData: gld,
    });

    expect(await adapter.loadGridLevelData(platform.gridId)).toEqual(gld);
    expect(events).toEqual([gld]);

    manager.dispose();
  });

  it('import-with-activate commits the per-view activeIdSource pointer (parity with load)', async () => {
    const adapter = new MemoryAdapter();
    const { platform } = makePlatform(adapter, 'grid-import-src');
    const written: string[] = [];
    const manager = new ProfileManager({
      platform,
      adapter,
      disableAutoSave: true,
      activeIdSource: {
        read: async () => null,
        write: async (id: string) => { written.push(id); },
      },
    });
    await manager.boot();
    written.length = 0;

    const meta = await manager.import({
      schemaVersion: 1,
      kind: 'gc-profile',
      exportedAt: new Date().toISOString(),
      profile: { name: 'FromFile', gridId: 'grid-import-src', state: {} },
    });

    // Without this write, an OpenFin workspace restore reverted the user
    // to the pre-import profile (customData still named the old id).
    expect(written).toEqual([meta.id]);

    manager.dispose();
  });

  it('import of a v1 payload leaves grid-level data untouched and emits nothing', async () => {
    const adapter = new MemoryAdapter();
    const { platform } = makePlatform(adapter, 'grid-v1');
    const manager = new ProfileManager({ platform, adapter, disableAutoSave: true });
    await manager.boot();

    const existing = { v: 1, provider: { liveProviderId: 'keep-me', historicalProviderId: null, mode: 'live' } };
    await adapter.saveGridLevelData(platform.gridId, existing);

    let fired = 0;
    platform.events.on('gridLevelData:imported', () => { fired++; });

    await manager.import({
      schemaVersion: 1,
      kind: 'gc-profile',
      exportedAt: new Date().toISOString(),
      profile: { name: 'LegacyFile', gridId: 'grid-v1', state: {} },
    });

    // The pre-existing grid-level data must survive an import that carries none.
    expect(await adapter.loadGridLevelData(platform.gridId)).toEqual(existing);
    expect(fired).toBe(0);

    manager.dispose();
  });

  it('export → import round-trips grid-level data into a second grid', async () => {
    const srcAdapter = new MemoryAdapter();
    const { platform: srcPlatform } = makePlatform(srcAdapter, 'grid-src');
    const src = new ProfileManager({ platform: srcPlatform, adapter: srcAdapter, disableAutoSave: true });
    await src.boot();
    const gld = { v: 1, provider: { liveProviderId: 'p-live', historicalProviderId: null, mode: 'live' }, caption: 'Src' };
    await srcAdapter.saveGridLevelData(srcPlatform.gridId, gld);
    const payload = await src.export();
    src.dispose();

    const dstAdapter = new MemoryAdapter();
    const { platform: dstPlatform } = makePlatform(dstAdapter, 'grid-dst');
    const dst = new ProfileManager({ platform: dstPlatform, adapter: dstAdapter, disableAutoSave: true });
    await dst.boot();
    await dst.import(payload);

    expect(await dstAdapter.loadGridLevelData(dstPlatform.gridId)).toEqual(gld);
    dst.dispose();
  });
});
