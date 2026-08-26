import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ConfigManager } from '@wellsfargo-starui/core/host/config';
import { listProfiles, createProfile, updateProfile, deleteProfile, switchProfile } from './profileTools';

const GRID_ENTRY = {
  id: 'grid-test', configId: 'grid-test', componentType: 'grid', componentSubType: 'test',
  displayName: 'TestGrid', hostUrl: '/#/blotters/marketsgrid', iconId: '', createdAt: '',
  type: 'internal' as const, usesHostConfig: true, appId: 'Star-Demo', configServiceUrl: '',
  singleton: false, asWindow: true,
};

const mockLoadRegistryConfig = vi.fn();
vi.mock('@wellsfargo-starui/openfin/config', () => ({
  loadRegistryConfig: (...args: unknown[]) => mockLoadRegistryConfig(...args),
}));

function fakeManager(profiles: Array<Record<string, unknown>> = [], instances: string[] = []) {
  const list = vi.fn(async ({ instanceId }: { instanceId: string }) =>
    profiles.map((p) => ({ gridId: instanceId, state: {}, createdAt: 1, updatedAt: 1, ...p })),
  );
  const save = vi.fn().mockResolvedValue(undefined);
  const del = vi.fn().mockResolvedValue(undefined);
  const loadGridLevelData = vi.fn().mockResolvedValue({});
  const saveGridLevelData = vi.fn().mockResolvedValue(undefined);
  const findByComponentType = vi.fn().mockResolvedValue(
    instances.map((configId) => ({ configId, componentType: 'grid', componentSubType: 'test', isTemplate: false })),
  );
  const configManager = {
    profiles: { list, save, delete: del, loadGridLevelData, saveGridLevelData },
    findByComponentType,
  } as unknown as ConfigManager;
  return { configManager, list, save, del, saveGridLevelData };
}

beforeEach(() => {
  mockLoadRegistryConfig.mockReset().mockResolvedValue({ version: 2, entries: [GRID_ENTRY] });
});

describe('createProfile', () => {
  /** "Save this as Trading view" means capture what's on screen now. */
  it('captures the current configuration by default', async () => {
    const current = { id: '__default__', name: 'Default', state: { 'conditional-styling': { v: 1, data: { rules: [{ id: 'r1' }] } } } };
    const { configManager, save } = fakeManager([current]);

    const result = await createProfile(configManager, { targetGridId: 'grid-test', name: 'Trading view' });

    expect(result.ok).toBe(true);
    const [, snapshot] = save.mock.calls[0] as [unknown, { name: string; state: Record<string, unknown> }];
    expect(snapshot.name).toBe('Trading view');
    expect(snapshot.state['conditional-styling']).toBeDefined();
  });

  it('creates an empty profile when asked', async () => {
    const current = { id: '__default__', name: 'Default', state: { 'general-settings': { v: 1, data: {} } } };
    const { configManager, save } = fakeManager([current]);

    await createProfile(configManager, { targetGridId: 'grid-test', name: 'Blank', fromCurrent: false });

    const [, snapshot] = save.mock.calls[0] as [unknown, { state: Record<string, unknown> }];
    expect(snapshot.state).toEqual({});
  });

  /** A profile on the template only would be missing from an open window. */
  it('writes the profile to the template and every open instance', async () => {
    const { configManager, save } = fakeManager([{ id: '__default__', name: 'Default' }], ['inst-1', 'inst-2']);

    const result = await createProfile(configManager, { targetGridId: 'grid-test', name: 'Trading view' });

    expect(result.ok).toBe(true);
    const written = save.mock.calls.map(([scope]) => (scope as { instanceId: string }).instanceId);
    expect(written).toEqual(['grid-test', 'inst-1', 'inst-2']);
  });

  it('refuses a duplicate name rather than creating a confusing twin', async () => {
    const { configManager, save } = fakeManager([{ id: 'p1', name: 'Trading view' }]);

    const result = await createProfile(configManager, { targetGridId: 'grid-test', name: 'trading view' });

    expect(result.ok).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });
});

describe('updateProfile', () => {
  it('renames without touching the stored state', async () => {
    const { configManager, save } = fakeManager([{ id: 'p1', name: 'Old', state: { x: 1 } }]);

    const result = await updateProfile(configManager, { targetGridId: 'grid-test', profileId: 'p1', name: 'New' });

    expect(result.ok).toBe(true);
    const [, snapshot] = save.mock.calls[0] as [unknown, { name: string; state: unknown }];
    expect(snapshot.name).toBe('New');
    expect(snapshot.state).toEqual({ x: 1 });
  });

  it('rejects a call that would change nothing', async () => {
    const { configManager, save } = fakeManager([{ id: 'p1', name: 'Old' }]);
    const result = await updateProfile(configManager, { targetGridId: 'grid-test', profileId: 'p1' });
    expect(result.ok).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });

  it('refuses to rename the platform default', async () => {
    const { configManager, save } = fakeManager([{ id: '__default__', name: 'Default' }]);
    const result = await updateProfile(configManager, { targetGridId: 'grid-test', profileId: '__default__', name: 'Mine' });
    expect(result.ok).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });

  it('reports an unknown profile id instead of writing', async () => {
    const { configManager, save } = fakeManager([{ id: 'p1', name: 'Old' }]);
    const result = await updateProfile(configManager, { targetGridId: 'grid-test', profileId: 'nope', name: 'x' });
    expect(result.ok).toBe(false);
    expect(result.summary).toContain('list_profiles');
    expect(save).not.toHaveBeenCalled();
  });
});

describe('deleteProfile', () => {
  /** Deleting the default leaves the grid with nothing to load. */
  it('never deletes the platform default', async () => {
    const { configManager, del } = fakeManager([{ id: '__default__', name: 'Default' }]);
    const result = await deleteProfile(configManager, { targetGridId: 'grid-test', profileId: '__default__', confirm: true });
    expect(result.ok).toBe(false);
    expect(del).not.toHaveBeenCalled();
  });

  it('requires confirmation, then deletes from every target', async () => {
    const { configManager, del } = fakeManager([{ id: 'p1', name: 'Trading view' }], ['inst-1']);

    const unconfirmed = await deleteProfile(configManager, { targetGridId: 'grid-test', profileId: 'p1' });
    expect(unconfirmed.ok).toBe(false);
    expect(unconfirmed.summary).toContain('confirm: true');
    expect(del).not.toHaveBeenCalled();

    const confirmed = await deleteProfile(configManager, { targetGridId: 'grid-test', profileId: 'p1', confirm: true });
    expect(confirmed.ok).toBe(true);
    expect(del.mock.calls.map(([scope]) => (scope as { instanceId: string }).instanceId)).toEqual(['grid-test', 'inst-1']);
  });
});

describe('switchProfile', () => {
  /** `activeProfileId` lives on the view, so this records a request the open
   *  window acts on rather than pretending a config write switches anything. */
  it('records the request in grid-level data and says what it can reach', async () => {
    const { configManager, saveGridLevelData } = fakeManager([{ id: 'p1', name: 'Trading view' }]);

    const result = await switchProfile(configManager, { targetGridId: 'grid-test', profileId: 'p1' });

    expect(result.ok).toBe(true);
    const [, data] = saveGridLevelData.mock.calls[0] as [unknown, { requestedActiveProfileId: string }];
    expect(data.requestedActiveProfileId).toBe('p1');
    expect(result.summary).toContain('Open windows switch now');
  });

  it('refuses an unknown profile', async () => {
    const { configManager, saveGridLevelData } = fakeManager([{ id: 'p1', name: 'Trading view' }]);
    const result = await switchProfile(configManager, { targetGridId: 'grid-test', profileId: 'nope' });
    expect(result.ok).toBe(false);
    expect(saveGridLevelData).not.toHaveBeenCalled();
  });
});

describe('listProfiles', () => {
  it('marks which one is the platform default', async () => {
    const { configManager } = fakeManager([{ id: '__default__', name: 'Default' }, { id: 'p1', name: 'Trading view' }]);
    const result = await listProfiles(configManager, { targetGridId: 'grid-test' });
    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject([{ id: '__default__', isDefault: true }, { id: 'p1', isDefault: false }]);
  });
});
