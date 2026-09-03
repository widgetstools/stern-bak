/**
 * Blotters are TEMPLATE-BACKED components.
 *
 * A registered singleton skips the launcher's template→instance clone, so the
 * open window's config row IS the template. Three user-visible properties fall
 * out of that, and this file pins all three:
 *
 *  1. an edit persists to the component's template rather than to a per-window
 *     copy that dies with the window;
 *  2. the assistant writes the row the window is reading, so the change applies
 *     live;
 *  3. re-opening focuses the window already on screen instead of spawning a
 *     second copy that would immediately drift from the first.
 *
 * `launchComponent` is mocked because the real one needs an OpenFin runtime.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfigManager } from '@wellsfargo-starui/core/host/config';

const mockLoadRegistryConfig = vi.fn();
vi.mock('@wellsfargo-starui/openfin/config', () => ({
  loadRegistryConfig: (...args: unknown[]) => mockLoadRegistryConfig(...args),
  deriveTemplateConfigId: (type: string, sub: string) => `${type}-${sub}`.toLowerCase(),
}));

const mockAddRegistryEntry = vi.fn();
const mockAddDockButton = vi.fn();
const mockRegistryEntryExists = vi.fn();
vi.mock('./registryOps', () => ({
  addRegistryEntry: (...args: unknown[]) => mockAddRegistryEntry(...args),
  addDockButton: (...args: unknown[]) => mockAddDockButton(...args),
  registryEntryExists: (...args: unknown[]) => mockRegistryEntryExists(...args),
  buildRegistryEntry: (spec: unknown) => spec,
  removeRegistryEntry: vi.fn(),
  updateRegistryEntry: vi.fn(),
  removeDockButtons: vi.fn(),
  renameDockButtons: vi.fn(),
  BLOTTER_DOCK_GROUP: 'Assets',
}));

const mockLaunchBlotter = vi.fn();
const mockReloadOpenComponents = vi.fn();
vi.mock('./launchComponent', () => ({
  launchBlotter: (...args: unknown[]) => mockLaunchBlotter(...args),
  reloadOpenComponents: (...args: unknown[]) => mockReloadOpenComponents(...args),
  describeLaunch: () => '',
  describeReload: (n: number) => (n > 0 ? ` Reloaded the ${n} open window(s) in place.` : ' Nothing is open to reload.'),
}));

import { createBlotter, openBlotter, setGridProvider, reloadBlottersUsingProvider, listGrids, renameBlotter, deleteBlotter } from './blotterTools';
import { updateRegistryEntry, removeRegistryEntry, removeDockButtons } from './registryOps';

const SINGLETON = {
  id: 'grid-credit', configId: 'grid-credit', componentType: 'grid', componentSubType: 'credit',
  displayName: 'Credit', hostUrl: '/#/blotters/marketsgrid', iconId: '', createdAt: '',
  type: 'internal' as const, usesHostConfig: true, appId: 'Star-Demo', configServiceUrl: '',
  singleton: true, asWindow: true,
};

function fakeConfigManager(gridLevelData: unknown = null) {
  const loadGridLevelData = vi.fn().mockResolvedValue(gridLevelData);
  const saveGridLevelData = vi.fn().mockResolvedValue(undefined);
  return {
    configManager: {
      profiles: { loadGridLevelData, saveGridLevelData, list: vi.fn().mockResolvedValue([]), save: vi.fn().mockResolvedValue(undefined) },
      findByComponentType: vi.fn().mockResolvedValue([]),
    } as unknown as ConfigManager,
    loadGridLevelData,
    saveGridLevelData,
  };
}

beforeEach(() => {
  mockLoadRegistryConfig.mockReset().mockResolvedValue({ version: 2, entries: [SINGLETON] });
  mockAddRegistryEntry.mockReset().mockResolvedValue(undefined);
  mockAddDockButton.mockReset().mockResolvedValue(true);
  mockRegistryEntryExists.mockReset().mockResolvedValue(false);
  mockLaunchBlotter.mockReset().mockResolvedValue({ ok: true });
  mockReloadOpenComponents.mockReset().mockResolvedValue(0);
});

describe('create_blotter — template-backed', () => {
  it('registers the component as a singleton whose row is its template', async () => {
    const { configManager, saveGridLevelData } = fakeConfigManager();

    const result = await createBlotter(configManager, 'Star-Demo', { displayName: 'Credit', openNow: false });

    expect(result.ok).toBe(true);
    expect(mockAddRegistryEntry).toHaveBeenCalledWith(expect.objectContaining({ singleton: true }));
    // The seeded row is the template, and says so — the launcher reads this to
    // decide whether to clone, and the assistant to decide where to write.
    expect(saveGridLevelData).toHaveBeenCalledWith(
      { instanceId: 'grid-credit' },
      expect.anything(),
      { identity: expect.objectContaining({ isTemplate: true, singleton: true }) },
    );
  });
});

describe('open_blotter', () => {
  /** Saying "opened" would mislead someone expecting a second window. */
  it('describes focusing, not opening, for a template-backed blotter', async () => {
    const result = await openBlotter({ targetGridId: 'grid-credit' });

    expect(result.ok).toBe(true);
    expect(result.summary).toContain('front');
    expect(result.summary).toContain('one window per blotter');
  });

  it('still says "opened" for an older multi-instance blotter', async () => {
    mockLoadRegistryConfig.mockResolvedValue({ version: 2, entries: [{ ...SINGLETON, singleton: false }] });

    const result = await openBlotter({ targetGridId: 'grid-credit' });

    expect(result.summary).toContain('Opened');
  });
});

describe('set_grid_provider — reloads rather than asking for a reopen', () => {
  it('reloads the open window in place and never says "reopen"', async () => {
    const { configManager } = fakeConfigManager();
    mockReloadOpenComponents.mockResolvedValue(1);

    const result = await setGridProvider(configManager, { targetGridId: 'grid-credit', providerId: 'dp-9' });

    expect(result.ok).toBe(true);
    expect(mockReloadOpenComponents).toHaveBeenCalledWith('grid-credit');
    expect(result.summary).toContain('Reloaded the 1 open window(s) in place');
    expect(result.summary).not.toMatch(/reopen/i);
  });

  /** Never claim a refresh that did not happen. */
  it('says nothing was open when the blotter has no window', async () => {
    const { configManager } = fakeConfigManager();

    const result = await setGridProvider(configManager, { targetGridId: 'grid-credit', providerId: 'dp-9' });

    expect(result.summary).toContain('Nothing is open to reload');
  });
});

describe('reloadBlottersUsingProvider', () => {
  it('reloads only the blotters actually bound to that provider', async () => {
    mockLoadRegistryConfig.mockResolvedValue({
      version: 2,
      entries: [SINGLETON, { ...SINGLETON, id: 'grid-rates', configId: 'grid-rates' }],
    });
    const loadGridLevelData = vi.fn(async ({ instanceId }: { instanceId: string }) =>
      instanceId === 'grid-credit' ? { provider: { liveProviderId: 'dp-9' } } : { provider: { liveProviderId: 'dp-other' } },
    );
    const configManager = {
      profiles: { loadGridLevelData },
    } as unknown as ConfigManager;
    mockReloadOpenComponents.mockResolvedValue(1);

    await expect(reloadBlottersUsingProvider(configManager, 'dp-9')).resolves.toBe(1);

    expect(mockReloadOpenComponents).toHaveBeenCalledWith('grid-credit');
    expect(mockReloadOpenComponents).not.toHaveBeenCalledWith('grid-rates');
  });

  it('matches a historical binding too', async () => {
    const configManager = {
      profiles: { loadGridLevelData: vi.fn().mockResolvedValue({ provider: { historicalProviderId: 'dp-9' } }) },
    } as unknown as ConfigManager;
    mockReloadOpenComponents.mockResolvedValue(2);

    await expect(reloadBlottersUsingProvider(configManager, 'dp-9')).resolves.toBe(2);
  });

  /** One unreadable row must not stop the rest from refreshing. */
  it('keeps going when a blotter row cannot be read', async () => {
    mockLoadRegistryConfig.mockResolvedValue({
      version: 2,
      entries: [{ ...SINGLETON, id: 'grid-bad', configId: 'grid-bad' }, SINGLETON],
    });
    const loadGridLevelData = vi.fn(async ({ instanceId }: { instanceId: string }) => {
      if (instanceId === 'grid-bad') throw new Error('row gone');
      return { provider: { liveProviderId: 'dp-9' } };
    });
    const configManager = { profiles: { loadGridLevelData } } as unknown as ConfigManager;
    mockReloadOpenComponents.mockResolvedValue(1);

    await expect(reloadBlottersUsingProvider(configManager, 'dp-9')).resolves.toBe(1);
  });
});

describe('configId is the identifier the assistant hands out and takes back', () => {
  it('list_grids reports each blotter by configId, with the display name as a label only', async () => {
    mockLoadRegistryConfig.mockResolvedValue({
      version: 2,
      entries: [SINGLETON, { ...SINGLETON, id: 'legacy-id', configId: 'grid-rates', displayName: 'Rates', singleton: false }],
    });
    const result = await listGrids();
    expect(result.summary).toBe('Credit (configId=grid-credit); Rates (configId=grid-rates)');
    expect(result.data).toEqual([
      { configId: 'grid-credit', displayName: 'Credit', singleton: true },
      { configId: 'grid-rates', displayName: 'Rates', singleton: false },
    ]);
    // Never the registry `id` when it differs — nothing downstream keys on it.
    expect(JSON.stringify(result.data)).not.toContain('legacy-id');
  });

  it('create_blotter returns the configId and tells the model to keep using it', async () => {
    const { configManager } = fakeConfigManager();
    const result = await createBlotter(configManager, 'Star-Demo', { displayName: 'Rates Book', openNow: false });
    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({ configId: 'grid-rates-book', displayName: 'Rates Book' });
    expect(result.summary).toContain('configId=grid-rates-book');
    expect(result.summary).toContain('use this exact id');
  });

  it('rename_blotter resolves the target and keeps the configId stable', async () => {
    vi.mocked(updateRegistryEntry).mockResolvedValue(true);
    const result = await renameBlotter({ targetGridId: 'grid-credit', displayName: 'Credit Desk' });
    expect(result.ok).toBe(true);
    expect(updateRegistryEntry).toHaveBeenCalledWith('grid-credit', { displayName: 'Credit Desk' });
    expect(result.summary).toContain('configId is still grid-credit');
  });

  it('rename_blotter keys registry ops on the entry\'s registry id even when it differs from the configId', async () => {
    mockLoadRegistryConfig.mockResolvedValue({ version: 2, entries: [{ ...SINGLETON, id: 'legacy-id', configId: 'grid-credit' }] });
    vi.mocked(updateRegistryEntry).mockResolvedValue(true);
    const result = await renameBlotter({ targetGridId: 'grid-credit', displayName: 'Credit Desk' });
    expect(result.ok).toBe(true);
    expect(updateRegistryEntry).toHaveBeenCalledWith('legacy-id', { displayName: 'Credit Desk' });
  });

  it('delete_blotter refuses an unknown configId with a pointer to list_grids', async () => {
    const result = await deleteBlotter({ targetGridId: 'grid-nope', confirm: true });
    expect(result.ok).toBe(false);
    expect(result.summary).toContain('list_grids');
  });

  it('delete_blotter removes by the resolved entry and reports the configId', async () => {
    vi.mocked(removeRegistryEntry).mockResolvedValue(true);
    vi.mocked(removeDockButtons).mockResolvedValue(1);
    const result = await deleteBlotter({ targetGridId: 'grid-credit', confirm: true });
    expect(result.ok).toBe(true);
    expect(removeRegistryEntry).toHaveBeenCalledWith('grid-credit');
    expect(result.summary).toContain('configId grid-credit');
  });
});
