import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LocalStorageBundleAdapter, marketsGridLocalStorageBundleKey } from './LocalStorageBundleAdapter';
import { RESERVED_DEFAULT_PROFILE_ID, activeProfileKey } from './StorageAdapter';

describe('LocalStorageBundleAdapter', () => {
  const gridId = 'test-grid-a';

  beforeEach(() => {
    localStorage.clear();
  });

  it('persists default profile row after first saveProfile', async () => {
    const adapter = new LocalStorageBundleAdapter(gridId);
    const now = Date.now();
    await adapter.saveProfile({
      id: RESERVED_DEFAULT_PROFILE_ID,
      gridId,
      name: 'Default',
      state: { m1: { v: 1, data: {} } },
      createdAt: now,
      updatedAt: now,
    });
    const raw = localStorage.getItem(marketsGridLocalStorageBundleKey(gridId));
    expect(raw).toBeTruthy();
    const loaded = await adapter.loadProfile(gridId, RESERVED_DEFAULT_PROFILE_ID);
    expect(loaded?.state).toEqual({ m1: { v: 1, data: {} } });
  });

  it('readConfig merges gc-active-profile pointer when valid', async () => {
    const adapter = new LocalStorageBundleAdapter(gridId);
    const t = Date.now();
    await adapter.applySerializedConfig({
      gridId,
      activeProfileId: 'p2',
      profiles: [
        {
          id: RESERVED_DEFAULT_PROFILE_ID,
          gridId,
          name: 'Default',
          state: {},
          createdAt: t,
          updatedAt: t,
        },
        {
          id: 'p2',
          gridId,
          name: 'Two',
          state: { x: { v: 1, data: {} } },
          createdAt: t,
          updatedAt: t,
        },
      ],
      gridLevelData: { mode: 'live' },
    });
    localStorage.setItem(activeProfileKey(gridId), RESERVED_DEFAULT_PROFILE_ID);
    const cfg = adapter.readConfig();
    expect(cfg.activeProfileId).toBe(RESERVED_DEFAULT_PROFILE_ID);
    expect(cfg.gridLevelData).toEqual({ mode: 'live' });
  });

  it('applySerializedConfig rejects gridId mismatch', async () => {
    const adapter = new LocalStorageBundleAdapter(gridId);
    const t = Date.now();
    await expect(
      adapter.applySerializedConfig({
        gridId: 'other',
        activeProfileId: RESERVED_DEFAULT_PROFILE_ID,
        profiles: [
          {
            id: RESERVED_DEFAULT_PROFILE_ID,
            gridId: 'other',
            name: 'Default',
            state: {},
            createdAt: t,
            updatedAt: t,
          },
        ],
      }),
    ).rejects.toThrow(/gridId mismatch/);
  });

  it('injects Default profile when missing from applySerializedConfig', async () => {
    const adapter = new LocalStorageBundleAdapter(gridId);
    const t = Date.now();
    await adapter.applySerializedConfig({
      gridId,
      activeProfileId: 'only',
      profiles: [
        {
          id: 'only',
          gridId,
          name: 'Solo',
          state: {},
          createdAt: t,
          updatedAt: t,
        },
      ],
    });
    const list = await adapter.listProfiles(gridId);
    expect(list.some((p) => p.id === RESERVED_DEFAULT_PROFILE_ID)).toBe(true);
    expect(list.some((p) => p.id === 'only')).toBe(true);
  });

  it('round-trips grid-level data', async () => {
    const adapter = new LocalStorageBundleAdapter(gridId);
    await adapter.saveGridLevelData(gridId, { a: 1 });
    expect(await adapter.loadGridLevelData(gridId)).toEqual({ a: 1 });
  });

  it('does not re-parse the bundle on repeated reads (cache hit)', async () => {
    const adapter = new LocalStorageBundleAdapter(gridId);
    const now = Date.now();
    await adapter.saveProfile({
      id: RESERVED_DEFAULT_PROFILE_ID,
      gridId,
      name: 'Default',
      state: { m: { v: 1, data: {} } },
      createdAt: now,
      updatedAt: now,
    });
    // saveProfile primed the cache; subsequent reads must hit it without
    // a fresh JSON.parse of the whole bundle (the save-path hot cost).
    const parseSpy = vi.spyOn(JSON, 'parse');
    await adapter.loadProfile(gridId, RESERVED_DEFAULT_PROFILE_ID);
    await adapter.listProfiles(gridId);
    await adapter.loadProfile(gridId, RESERVED_DEFAULT_PROFILE_ID);
    expect(parseSpy).not.toHaveBeenCalled();
    parseSpy.mockRestore();
  });

  it('reflects an external (cross-tab) bundle write — cache keys on the raw string', async () => {
    const adapter = new LocalStorageBundleAdapter(gridId);
    const now = Date.now();
    await adapter.saveProfile({
      id: RESERVED_DEFAULT_PROFILE_ID,
      gridId,
      name: 'Default',
      state: { m: { v: 1, data: { a: 1 } } },
      createdAt: now,
      updatedAt: now,
    });
    expect(
      (await adapter.loadProfile(gridId, RESERVED_DEFAULT_PROFILE_ID))?.state,
    ).toEqual({ m: { v: 1, data: { a: 1 } } });

    // Another tab overwrites the bundle directly. The raw string changes,
    // so the next read misses the cache and reparses fresh.
    const external = {
      kind: 'markets-grid-bundle',
      version: 1,
      gridId,
      activeProfileId: RESERVED_DEFAULT_PROFILE_ID,
      profiles: [
        {
          id: RESERVED_DEFAULT_PROFILE_ID,
          gridId,
          name: 'Default',
          state: { m: { v: 2, data: { a: 999 } } },
          createdAt: now,
          updatedAt: now,
        },
      ],
      gridLevelData: null,
    };
    localStorage.setItem(
      marketsGridLocalStorageBundleKey(gridId),
      JSON.stringify(external),
    );

    expect(
      (await adapter.loadProfile(gridId, RESERVED_DEFAULT_PROFILE_ID))?.state,
    ).toEqual({ m: { v: 2, data: { a: 999 } } });
  });
});
