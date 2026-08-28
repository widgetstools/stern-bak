import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ConfigManager } from '@wellsfargo-starui/core/host/config';
import {
  resolveGridForInstance,
  resolveWriteTargets,
  withGridScope,
  currentFocusInstance,
  readActiveProfile,
  readActiveProfileId,
  patchGridModule,
  describeFanOut,
  resolveGridTarget,
  gridScopeId,
  currentPinnedInstance,
} from './gridProfiles';

const AXE = {
  id: 'grid-axe-blotter', configId: 'grid-axe-blotter', componentType: 'grid', componentSubType: 'axe-blotter',
  displayName: 'Axe Blotter', hostUrl: '/#/blotters/marketsgrid', iconId: '', createdAt: '',
  type: 'internal' as const, usesHostConfig: true, appId: 'Star-Demo', configServiceUrl: '',
  singleton: false, asWindow: true,
};
const SINGLETON = { ...AXE, id: 'grid-test', configId: 'grid-test', componentSubType: 'test', displayName: 'TestGrid', singleton: true };

const mockLoadRegistryConfig = vi.fn();
vi.mock('@wellsfargo-starui/openfin/config', () => ({
  loadRegistryConfig: (...args: unknown[]) => mockLoadRegistryConfig(...args),
}));

function fakeManager(
  rows: Record<string, { componentType?: string; componentSubType?: string }> = {},
  instances: string[] = [],
) {
  const getConfig = vi.fn(async (configId: string) => rows[configId]);
  const findByComponentType = vi.fn().mockResolvedValue(
    instances.map((configId) => ({ configId, componentType: 'grid', componentSubType: 'axe-blotter', isTemplate: false })),
  );
  return { configManager: { getConfig, findByComponentType } as unknown as ConfigManager, getConfig, findByComponentType };
}

beforeEach(() => {
  mockLoadRegistryConfig.mockReset().mockResolvedValue({ version: 2, entries: [AXE, SINGLETON] });
});

/**
 * A blotter window knows its own instance id and little else. Deriving a
 * registry id in the window instead produced "star-demo-blotter" — the
 * browser-mode fallback, which isn't registered — and the assistant then had to
 * ask the user which blotter they meant.
 */
describe('resolveGridForInstance', () => {
  it('matches a singleton, whose instance id IS the template id', async () => {
    const { configManager, getConfig } = fakeManager();
    const entry = await resolveGridForInstance(configManager, 'grid-test');
    expect(entry?.id).toBe('grid-test');
    expect(getConfig).not.toHaveBeenCalled(); // resolved from the registry alone
  });

  it('resolves a minted per-window id through its config row', async () => {
    const { configManager } = fakeManager({
      'k151344grid-axe-blotter-1756000000000': { componentType: 'grid', componentSubType: 'axe-blotter' },
    });

    const entry = await resolveGridForInstance(configManager, 'k151344grid-axe-blotter-1756000000000');

    expect(entry?.id).toBe('grid-axe-blotter');
    expect(entry?.displayName).toBe('Axe Blotter');
  });

  it('is case-insensitive about the derived template id', async () => {
    const { configManager } = fakeManager({ 'inst-1': { componentType: 'GRID', componentSubType: 'Axe-Blotter' } });
    const entry = await resolveGridForInstance(configManager, 'inst-1');
    expect(entry?.id).toBe('grid-axe-blotter');
  });

  /** The exact failure that shipped: an id with no registry entry behind it. */
  it('returns undefined for an unregistered instance rather than guessing', async () => {
    const { configManager } = fakeManager({});
    expect(await resolveGridForInstance(configManager, 'star-demo-blotter')).toBeUndefined();
  });

  it('returns undefined when the config row carries no component identity', async () => {
    const { configManager } = fakeManager({ 'inst-2': {} });
    expect(await resolveGridForInstance(configManager, 'inst-2')).toBeUndefined();
  });

  it('survives a config store that throws', async () => {
    const configManager = { getConfig: vi.fn().mockRejectedValue(new Error('db closed')) } as unknown as ConfigManager;
    expect(await resolveGridForInstance(configManager, 'inst-3')).toBeUndefined();
  });

  it('ignores non-grid registry entries', async () => {
    mockLoadRegistryConfig.mockResolvedValue({
      version: 2,
      entries: [{ ...AXE, id: 'tool-thing', configId: 'tool-thing', componentType: 'tool' }],
    });
    const { configManager } = fakeManager({});
    expect(await resolveGridForInstance(configManager, 'tool-thing')).toBeUndefined();
  });
});

/**
 * The window the request came from must always be written to. Instance
 * discovery goes through `findByComponentType`, which is visibility-filtered
 * and can omit the very window the user is watching — the assistant then
 * reports success over rows nobody is looking at.
 */
describe('resolveWriteTargets', () => {
  /**
   * The dock-launched assistant configures the COMPONENT, so it writes the
   * template and never a running instance — `other-instance` is deliberately
   * absent even though discovery would return it. The focused window is the one
   * exception, and only for a panel opened FROM a window.
   */
  it('writes the template and the focused window, never a discovered instance', async () => {
    const { configManager } = fakeManager({}, ['other-instance']);

    const targets = await resolveWriteTargets(configManager, AXE, 'dev1grid-axe-blotter-1780965483367');

    expect(targets.map((t) => t.instanceId)).toEqual([
      'grid-axe-blotter',
      'dev1grid-axe-blotter-1780965483367',
    ]);
    expect(targets[1].label).toContain('this window');
  });

  /** A dock-launched panel has no focus at all: template only. */
  it('writes the template alone when no window is in play', async () => {
    const { configManager } = fakeManager({}, ['inst-1', 'inst-2']);

    const targets = await resolveWriteTargets(configManager, AXE, undefined);

    expect(targets).toEqual([
      { instanceId: 'grid-axe-blotter', isTemplate: true, label: 'Axe Blotter (template)' },
    ]);
  });

  it('does not write the focused window twice when discovery also finds it', async () => {
    const { configManager } = fakeManager({}, ['inst-1']);
    const targets = await resolveWriteTargets(configManager, AXE, 'inst-1');
    expect(targets.map((t) => t.instanceId)).toEqual(['grid-axe-blotter', 'inst-1']);
  });

  it('never duplicates the template when it is also the focus', async () => {
    const { configManager } = fakeManager({}, []);
    const targets = await resolveWriteTargets(configManager, AXE, 'grid-axe-blotter');
    expect(targets.map((t) => t.instanceId)).toEqual(['grid-axe-blotter']);
  });

  it('still writes the template and focus when discovery throws', async () => {
    const configManager = {
      getConfig: vi.fn(),
      findByComponentType: vi.fn().mockRejectedValue(new Error('db closed')),
    } as unknown as ConfigManager;

    const targets = await resolveWriteTargets(configManager, AXE, 'inst-9');

    expect(targets.map((t) => t.instanceId)).toEqual(['grid-axe-blotter', 'inst-9']);
  });

  it('picks up the ambient focus set for the duration of a tool call', async () => {
    const { configManager } = fakeManager({}, []);

    const targets = await withGridScope({ focusInstanceId: 'ambient-inst' }, async () => {
      expect(currentFocusInstance()).toBe('ambient-inst');
      return resolveWriteTargets(configManager, AXE);
    });

    expect(targets.map((t) => t.instanceId)).toContain('ambient-inst');
    // Restored afterwards so one call can't leak into the next.
    expect(currentFocusInstance()).toBeUndefined();
  });

  /**
   * A singleton's window reuses the template id, so pinning it addresses the
   * TEMPLATE row. Marking that write `isTemplate: false` would rewrite the
   * template's own identity and strip its singleton flag — the row would stop
   * describing itself as this component's template.
   */
  it('treats a pinned singleton as the template it actually is', async () => {
    const { configManager } = fakeManager({}, []);

    const targets = await withGridScope({ pinnedInstanceId: 'grid-test' }, async () =>
      resolveWriteTargets(configManager, SINGLETON),
    );

    expect(targets).toEqual([
      { instanceId: 'grid-test', isTemplate: true, label: 'TestGrid (template)' },
    ]);
  });

  it('still treats a pinned window of a multi-instance blotter as an instance', async () => {
    const { configManager } = fakeManager({}, []);

    const targets = await withGridScope({ pinnedInstanceId: 'inst-7' }, async () =>
      resolveWriteTargets(configManager, AXE),
    );

    expect(targets).toEqual([
      { instanceId: 'inst-7', isTemplate: false, label: 'inst-7 (this window only)' },
    ]);
  });
});

/**
 * The bug: the assistant edited `__default__` while the grid had "L1" selected,
 * so its changes were written somewhere the user could never see them and it
 * still reported success.
 */
describe('active profile', () => {
  function managerWithProfiles(
    gridLevelData: Record<string, unknown>,
    profiles: Array<Record<string, unknown>>,
    instances: string[] = [],
  ) {
    const list = vi.fn(async ({ instanceId }: { instanceId: string }) =>
      profiles.map((p) => ({ gridId: instanceId, state: {}, createdAt: 1, updatedAt: 1, ...p })),
    );
    const save = vi.fn().mockResolvedValue(undefined);
    const loadGridLevelData = vi.fn().mockResolvedValue(gridLevelData);
    const findByComponentType = vi.fn().mockResolvedValue(
      instances.map((configId) => ({ configId, componentType: 'grid', componentSubType: 'axe-blotter', isTemplate: false })),
    );
    const configManager = {
      profiles: { list, save, loadGridLevelData, saveGridLevelData: vi.fn(), delete: vi.fn() },
      findByComponentType,
      getConfig: vi.fn(),
    } as unknown as ConfigManager;
    return { configManager, list, save };
  }

  it('reads the profile the window has selected, not the default', async () => {
    const { configManager } = managerWithProfiles({ activeProfileId: 'L1' }, [
      { id: '__default__', name: 'Default' },
      { id: 'L1', name: 'L1' },
    ]);

    expect(await readActiveProfileId(configManager, 'inst-1')).toBe('L1');
    expect((await readActiveProfile(configManager, 'inst-1')).id).toBe('L1');
  });

  it('falls back to the default when no window has published a selection', async () => {
    const { configManager } = managerWithProfiles({}, [{ id: '__default__', name: 'Default' }]);
    expect(await readActiveProfileId(configManager, 'inst-1')).toBe('__default__');
  });

  it('falls back to the default when the published profile no longer exists', async () => {
    const { configManager } = managerWithProfiles({ activeProfileId: 'deleted-one' }, [
      { id: '__default__', name: 'Default' },
    ]);
    expect((await readActiveProfile(configManager, 'inst-1')).id).toBe('__default__');
  });

  it('writes each row in the profile that row is showing', async () => {
    const perRow: Record<string, string> = { 'grid-axe-blotter': '__default__', 'inst-1': 'L1' };
    const list = vi.fn(async ({ instanceId }: { instanceId: string }) => [
      { id: '__default__', name: 'Default', gridId: instanceId, state: {}, createdAt: 1, updatedAt: 1 },
      { id: 'L1', name: 'L1', gridId: instanceId, state: {}, createdAt: 1, updatedAt: 1 },
    ]);
    const save = vi.fn().mockResolvedValue(undefined);
    const configManager = {
      profiles: {
        list,
        save,
        loadGridLevelData: vi.fn(async ({ instanceId }: { instanceId: string }) => ({ activeProfileId: perRow[instanceId] })),
        saveGridLevelData: vi.fn(),
      },
      findByComponentType: vi.fn().mockResolvedValue([]),
      getConfig: vi.fn(),
    } as unknown as ConfigManager;

    const fan = await patchGridModule(configManager, AXE, 'grid-state', () => ({ saved: 'x' }), 'inst-1');

    const written = save.mock.calls.map(([scope, snap]) => [
      (scope as { instanceId: string }).instanceId,
      (snap as { id: string }).id,
    ]);
    expect(written).toEqual([
      ['grid-axe-blotter', '__default__'],
      ['inst-1', 'L1'],
    ]);
    expect(fan.profileId).toBe('L1');
  });

  it('names a non-default profile in the summary so the model can report it', () => {
    expect(describeFanOut({ instances: 2, profileId: 'L1' })).toContain('active profile "L1"');
    expect(describeFanOut({ instances: 1 })).not.toContain('profile');
  });
});

describe('legacy non-grid guard', () => {
  it('ignores non-grid registry entries', async () => {
    mockLoadRegistryConfig.mockResolvedValue({
      version: 2,
      entries: [{ ...AXE, id: 'tool-thing', configId: 'tool-thing', componentType: 'tool' }],
    });
    const { configManager } = fakeManager({});
    expect(await resolveGridForInstance(configManager, 'tool-thing')).toBeUndefined();
  });
});

/**
 * Addressing one WINDOW rather than the blotter.
 *
 * A dock launch of a non-singleton blotter clones the template into its own
 * row, so several windows of one blotter each hold independent state. Every
 * tool used to take a registry id and fan writes out to all of them, which is
 * right for "restyle this blotter" and wrong for "just this window" — and it
 * left the ids from `list_grid_instances` with nowhere to be used.
 */
describe('resolveGridTarget', () => {
  it('takes a registry id and pins nothing', async () => {
    const { configManager } = fakeManager();
    const target = await resolveGridTarget(configManager, 'grid-axe-blotter');
    expect(target?.entry.id).toBe('grid-axe-blotter');
    expect(target?.pinnedInstanceId).toBeUndefined();
  });

  it('takes a window id, resolving the blotter and pinning the window', async () => {
    const { configManager } = fakeManager({
      'k1grid-axe-blotter-1756000000000': { componentType: 'grid', componentSubType: 'axe-blotter' },
    });
    const target = await resolveGridTarget(configManager, 'k1grid-axe-blotter-1756000000000');
    expect(target?.entry.id).toBe('grid-axe-blotter');
    expect(target?.pinnedInstanceId).toBe('k1grid-axe-blotter-1756000000000');
  });

  /** A singleton's window IS the template row, so there is nothing to narrow. */
  it('does not pin a singleton', async () => {
    const { configManager } = fakeManager();
    const target = await resolveGridTarget(configManager, 'grid-test');
    expect(target?.entry.id).toBe('grid-test');
    expect(target?.pinnedInstanceId).toBeUndefined();
  });

  it('returns undefined for an id that is neither', async () => {
    const { configManager } = fakeManager();
    expect(await resolveGridTarget(configManager, 'nonsense')).toBeUndefined();
  });
});

describe('a pinned window', () => {
  it('is the only write target — the template is deliberately skipped', async () => {
    const { configManager } = fakeManager({}, ['inst-1', 'inst-2']);

    const targets = await withGridScope({ pinnedInstanceId: 'inst-2' }, () =>
      resolveWriteTargets(configManager, AXE),
    );

    expect(targets.map((t) => t.instanceId)).toEqual(['inst-2']);
    expect(targets[0].isTemplate).toBe(false);
  });

  it('is the row reads come from', async () => {
    expect(gridScopeId(AXE)).toBe('grid-axe-blotter');
    await withGridScope({ pinnedInstanceId: 'inst-2' }, async () => {
      expect(gridScopeId(AXE)).toBe('inst-2');
      expect(currentPinnedInstance()).toBe('inst-2');
    });
    expect(currentPinnedInstance()).toBeUndefined();
  });

  /** Pinning beats the panel's focus hint: one is a boundary, one is a hint. */
  it('overrides the ambient focus instance', async () => {
    const { configManager } = fakeManager({}, ['inst-1']);
    const targets = await withGridScope({ focusInstanceId: 'inst-1', pinnedInstanceId: 'inst-2' }, () =>
      resolveWriteTargets(configManager, AXE),
    );
    expect(targets.map((t) => t.instanceId)).toEqual(['inst-2']);
  });

  it('writes only that row', async () => {
    const list = vi.fn().mockResolvedValue([]);
    const save = vi.fn().mockResolvedValue(undefined);
    const configManager = {
      profiles: { list, save, loadGridLevelData: vi.fn().mockResolvedValue(null) },
      findByComponentType: vi.fn().mockResolvedValue([
        { configId: 'inst-1', isTemplate: false }, { configId: 'inst-2', isTemplate: false },
      ]),
    } as unknown as ConfigManager;

    const fan = await withGridScope({ pinnedInstanceId: 'inst-2' }, () =>
      patchGridModule(configManager, AXE, 'general-settings', () => ({ rowHeight: 30 })),
    );

    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0]).toEqual({ instanceId: 'inst-2' });
    expect(fan.pinnedInstanceId).toBe('inst-2');
  });

  /** The user has to be told the change skipped the template, or they'll open a
   *  new window and report it as a bug. */
  it('is described as window-only', () => {
    const summary = describeFanOut({ instances: 1, pinnedInstanceId: 'inst-2' });
    expect(summary).toContain('that window only');
    expect(summary).toContain('new ones');
  });

  it('still names the profile it edited', () => {
    expect(describeFanOut({ instances: 1, pinnedInstanceId: 'inst-2', profileId: 'L1' })).toContain('"L1"');
  });
});
