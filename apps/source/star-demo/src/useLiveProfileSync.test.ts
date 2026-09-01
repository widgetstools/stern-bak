import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ConfigManager } from '@wellsfargo-starui/core/host/config';
import { useLiveProfileSync, type LiveProfileSyncTarget } from './useLiveProfileSync';

/** ConfigManager double whose `profiles.subscribe` we can fire by hand. */
function fakeConfigManager(
  updatedAt = 100,
  requestedSwitch?: { requestedActiveProfileId: string; requestedActiveProfileAt: number },
) {
  let listener: ((changedModuleIds?: string[]) => void) | undefined;
  const unsubscribe = vi.fn();
  const list = vi.fn(async () => [{ id: '__default__', updatedAt }]);
  const loadGridLevelData = vi.fn(async () => requestedSwitch ?? null);
  const configManager = {
    profiles: {
      list,
      loadGridLevelData,
      subscribe: vi.fn((_scope: unknown, fn: (changedModuleIds?: string[]) => void) => {
        listener = fn;
        return unsubscribe;
      }),
    },
  } as unknown as ConfigManager;
  return {
    configManager,
    unsubscribe,
    list,
    fire: (changedModuleIds?: string[]) => listener?.(changedModuleIds),
    setUpdatedAt: (next: number) => list.mockResolvedValue([{ id: '__default__', updatedAt: next }]),
  };
}

function target(over: Partial<LiveProfileSyncTarget> = {}): LiveProfileSyncTarget {
  return {
    activeProfileId: '__default__',
    isDirty: false,
    loadProfile: vi.fn(),
    syncModules: vi.fn(),
    ...over,
  };
}

describe('useLiveProfileSync', () => {
  it('re-applies the active profile when the row changes elsewhere', async () => {
    const cm = fakeConfigManager(500);
    const grid = target();
    renderHook(() =>
      useLiveProfileSync({ configManager: cm.configManager, instanceId: 'grid-test', getTarget: () => grid }),
    );

    cm.fire();

    await waitFor(() => expect(grid.loadProfile).toHaveBeenCalledWith('__default__'));
  });

  /**
   * An external change is one the user just asked for. Skipping it because the
   * grid has unsaved state means they're told "done" and see nothing happen —
   * the exact symptom this hook exists to prevent. The cost (overwriting
   * unsaved local edits) is logged rather than silently chosen.
   */
  it('applies an external change even when the grid has unsaved edits, and warns', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const cm = fakeConfigManager(500);
    const grid = target({ isDirty: true });
    renderHook(() =>
      useLiveProfileSync({ configManager: cm.configManager, instanceId: 'grid-test', getTarget: () => grid }),
    );

    cm.fire();

    await waitFor(() => expect(grid.loadProfile).toHaveBeenCalledWith('__default__'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('unsaved local changes'));
    warn.mockRestore();
  });

  it('ignores a notification that is not newer than what it already applied', async () => {
    const cm = fakeConfigManager(500);
    const grid = target();
    const onSkipped = vi.fn();
    renderHook(() =>
      useLiveProfileSync({ configManager: cm.configManager, instanceId: 'grid-test', getTarget: () => grid, onSkipped }),
    );

    cm.fire();
    await waitFor(() => expect(grid.loadProfile).toHaveBeenCalledTimes(1));

    // Same row version again — e.g. an echo of this window's own save.
    cm.fire();
    await waitFor(() => expect(onSkipped).toHaveBeenCalledWith('not-newer'));
    expect(grid.loadProfile).toHaveBeenCalledTimes(1);

    // A genuinely newer write does come through.
    cm.setUpdatedAt(900);
    cm.fire();
    await waitFor(() => expect(grid.loadProfile).toHaveBeenCalledTimes(2));
  });

  it('waits for the grid handle instead of throwing before onReady', async () => {
    const cm = fakeConfigManager(500);
    const onSkipped = vi.fn();
    renderHook(() =>
      useLiveProfileSync({ configManager: cm.configManager, instanceId: 'grid-test', getTarget: () => undefined, onSkipped }),
    );

    cm.fire();

    await waitFor(() => expect(onSkipped).toHaveBeenCalledWith('no-grid'));
  });

  /** Hosts and test doubles don't always expose the profiles namespace; the
   *  grid must still render rather than take an exception from a nicety. */
  it('no-ops when the config manager has no profiles namespace', () => {
    const grid = target();
    expect(() =>
      renderHook(() =>
        useLiveProfileSync({
          configManager: {} as unknown as ConfigManager,
          instanceId: 'grid-test',
          getTarget: () => grid,
        }),
      ),
    ).not.toThrow();
  });

  it('subscribes only when it has both a config manager and an instance id, and unsubscribes on unmount', () => {
    const cm = fakeConfigManager();
    const grid = target();

    const withoutId = renderHook(() =>
      useLiveProfileSync({ configManager: cm.configManager, instanceId: undefined, getTarget: () => grid }),
    );
    expect(cm.configManager.profiles.subscribe).not.toHaveBeenCalled();
    withoutId.unmount();

    const mounted = renderHook(() =>
      useLiveProfileSync({ configManager: cm.configManager, instanceId: 'grid-test', getTarget: () => grid }),
    );
    expect(cm.configManager.profiles.subscribe).toHaveBeenCalledTimes(1);
    mounted.unmount();
    expect(cm.unsubscribe).toHaveBeenCalledTimes(1);
  });

  /** The whole point of this hook's scoped path — an edit known to be
   *  confined to one module (e.g. the AI assistant editing summary-panel)
   *  must not force a full profile reload. */
  it('routes a scoped change to syncModules instead of loadProfile', async () => {
    const cm = fakeConfigManager(500);
    const grid = target();
    renderHook(() =>
      useLiveProfileSync({ configManager: cm.configManager, instanceId: 'grid-test', getTarget: () => grid }),
    );

    cm.fire(['summary-panel']);

    await waitFor(() => expect(grid.syncModules).toHaveBeenCalledWith(['summary-panel']));
    expect(grid.loadProfile).not.toHaveBeenCalled();
  });

  it('falls back to a full loadProfile when no module hint is given, even though syncModules exists', async () => {
    const cm = fakeConfigManager(500);
    const grid = target();
    renderHook(() =>
      useLiveProfileSync({ configManager: cm.configManager, instanceId: 'grid-test', getTarget: () => grid }),
    );

    cm.fire();

    await waitFor(() => expect(grid.loadProfile).toHaveBeenCalledWith('__default__'));
    expect(grid.syncModules).not.toHaveBeenCalled();
  });

  it('falls back to loadProfile when the target does not implement syncModules', async () => {
    const cm = fakeConfigManager(500);
    const grid = target({ syncModules: undefined });
    renderHook(() =>
      useLiveProfileSync({ configManager: cm.configManager, instanceId: 'grid-test', getTarget: () => grid }),
    );

    cm.fire(['summary-panel']);

    await waitFor(() => expect(grid.loadProfile).toHaveBeenCalledWith('__default__'));
  });

  it('forces a full loadProfile for a genuine profile switch even when a module hint is present', async () => {
    // Simulate switch_profile: gridLevelData names a DIFFERENT profile as
    // requested, newer than anything applied so far.
    const cm = fakeConfigManager(500, { requestedActiveProfileId: 'other-profile', requestedActiveProfileAt: 999 });
    const grid = target();
    renderHook(() =>
      useLiveProfileSync({ configManager: cm.configManager, instanceId: 'grid-test', getTarget: () => grid }),
    );

    cm.fire(['summary-panel']);

    await waitFor(() => expect(grid.loadProfile).toHaveBeenCalledWith('other-profile'));
    expect(grid.syncModules).not.toHaveBeenCalled();
  });

  /** Two edits to two different modules can fire two overlapping async
   *  handleChange calls. Whichever one loses the staleness race must not
   *  silently drop its module id — both must end up applied. */
  it('accumulates module hints across overlapping notifications so neither is lost to the staleness race', async () => {
    const cm = fakeConfigManager(500);
    const grid = target();
    renderHook(() =>
      useLiveProfileSync({ configManager: cm.configManager, instanceId: 'grid-test', getTarget: () => grid }),
    );

    // Both notifications arrive before either async handleChange resolves —
    // the second's higher updatedAt makes the first's own staleness check
    // fail once it catches up, but its module id must survive via the
    // shared accumulator.
    cm.fire(['module-a']);
    cm.setUpdatedAt(900);
    cm.fire(['module-b']);

    await waitFor(() => expect(grid.syncModules).toHaveBeenCalled());
    const applied = (grid.syncModules as ReturnType<typeof vi.fn>).mock.calls.flat() as string[][];
    const allIds = applied.flat();
    expect(allIds).toEqual(expect.arrayContaining(['module-a', 'module-b']));
    expect(grid.loadProfile).not.toHaveBeenCalled();
  });
});
