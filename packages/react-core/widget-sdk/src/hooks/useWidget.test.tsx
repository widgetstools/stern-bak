import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { AppConfigRow } from '@wellsfargo-starui/types/shared';
import type { ParentIdentity, PlatformAdapter } from '@wellsfargo-starui/core/widget';

/**
 * useWidget wires a widget to config, layouts, lifecycle and the platform
 * adapter. ConfigManager is mocked at the module edge (Dexie boundary); the
 * layout helpers from `@wellsfargo-starui/core/widget` run for real against the
 * fake store, so the round-trip through them is exercised too.
 *
 * Each test uses its own configId: WidgetHost shares a module-level
 * QueryClient with a 30s staleTime, so a reused key would serve the previous
 * test's cached config.
 */

const rows = new Map<string, AppConfigRow>();

function row(overrides: Partial<AppConfigRow> = {}): AppConfigRow {
  return {
    configId: 'cfg-1',
    appId: 'star-demo',
    userId: 'k123',
    componentType: 'GRID',
    componentSubType: 'CREDIT',
    isTemplate: false,
    displayText: 'Blotter',
    payload: {},
    createdBy: 'k123',
    updatedBy: 'k123',
    creationTime: '2026-01-01T00:00:00.000Z',
    updatedTime: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const updateConfig = vi.fn();
const configManager = {
  init: vi.fn().mockResolvedValue(undefined),
  dispose: vi.fn(),
  getConfig: vi.fn(async (id: string) => rows.get(id)),
  updateConfig: (...args: unknown[]) => updateConfig(...args),
  findByComponentType: vi.fn(async (componentType: string) =>
    [...rows.values()].filter((r) => r.componentType === componentType),
  ),
  createConfig: vi.fn(async (input: Partial<AppConfigRow>) => {
    const created = row({ ...input, configId: input.configId ?? 'generated' });
    rows.set(created.configId, created);
    return created;
  }),
  deleteConfig: vi.fn(async (id: string) => { rows.delete(id); }),
};

vi.mock('@wellsfargo-starui/core/host/config', () => ({
  createConfigManager: () => configManager,
}));

const { WidgetHost } = await import('../providers/WidgetHost.js');
const { useWidget } = await import('./useWidget.js');

let saveHandlers: Array<() => Promise<void>>;
let destroyHandlers: Array<() => void>;
const openWidget = vi.fn().mockResolvedValue('new-id');
const broadcast = vi.fn();
const subscribeUnsub = vi.fn();
const subscribe = vi.fn(() => subscribeUnsub);
const openSettingsScreen = vi.fn().mockResolvedValue(undefined);

function makePlatform(launchData: Record<string, unknown> | null = null): PlatformAdapter {
  return {
    name: 'fake',
    isOpenFin: true,
    openWidget,
    closeWidget: vi.fn(),
    broadcast,
    subscribe,
    onPlatformSave: (handler: () => Promise<void>) => {
      saveHandlers.push(handler);
      return () => { saveHandlers = saveHandlers.filter((h) => h !== handler); };
    },
    onPlatformDestroy: (handler: () => void) => {
      destroyHandlers.push(handler);
      return () => { destroyHandlers = destroyHandlers.filter((h) => h !== handler); };
    },
    openSettingsScreen: (screenId: string, parent: ParentIdentity, data?: Record<string, unknown>) =>
      openSettingsScreen(screenId, parent, data),
    onSettingsResult: vi.fn(() => () => undefined),
    getInstanceId: () => 'inst-9',
    getLaunchData: () => launchData,
  } as unknown as PlatformAdapter;
}

function makeWrapper(platform: PlatformAdapter) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <WidgetHost apiUrl="" userId="k123" platform={platform}>
        {children}
      </WidgetHost>
    );
  };
}

beforeEach(() => {
  rows.clear();
  saveHandlers = [];
  destroyHandlers = [];
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('useWidget', () => {
  it('exposes the platform instance id, launch data and OpenFin flag', () => {
    const platform = makePlatform({ symbol: 'IBM' });
    const { result } = renderHook(() => useWidget('cfg-identity'), { wrapper: makeWrapper(platform) });

    expect(result.current.id).toBe('inst-9');
    expect(result.current.configId).toBe('cfg-identity');
    expect(result.current.isOpenFin).toBe(true);
    expect(result.current.launchData).toEqual({ symbol: 'IBM' });
  });

  it('loads the widget config', async () => {
    rows.set('cfg-load', row({ configId: 'cfg-load', displayText: 'Orders' }));
    const { result } = renderHook(() => useWidget('cfg-load'), { wrapper: makeWrapper(makePlatform()) });

    await waitFor(() => expect(result.current.config?.displayText).toBe('Orders'));
    expect(result.current.isLoading).toBe(false);
  });

  it('reports a missing config as null rather than undefined', async () => {
    const { result } = renderHook(() => useWidget('cfg-missing'), { wrapper: makeWrapper(makePlatform()) });

    // Consumers branch on `config === null`; leaking undefined would make
    // "not loaded yet" and "does not exist" indistinguishable.
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.config).toBeNull();
  });

  it('does not query at all without a configId', () => {
    const { result } = renderHook(() => useWidget(''), { wrapper: makeWrapper(makePlatform()) });

    expect(configManager.getConfig).not.toHaveBeenCalled();
    expect(result.current.config).toBeNull();
  });

  it('writes partial updates through updateConfig', async () => {
    rows.set('cfg-update', row({ configId: 'cfg-update' }));
    const { result } = renderHook(() => useWidget('cfg-update'), { wrapper: makeWrapper(makePlatform()) });

    await act(async () => { await result.current.updateConfig({ displayText: 'Renamed' }); });
    expect(updateConfig).toHaveBeenCalledWith('cfg-update', { displayText: 'Renamed' });
  });

  it('saveConfig persists the explicit config when given one', async () => {
    rows.set('cfg-save-explicit', row({ configId: 'cfg-save-explicit' }));
    const { result } = renderHook(() => useWidget('cfg-save-explicit'), { wrapper: makeWrapper(makePlatform()) });
    await waitFor(() => expect(result.current.config).not.toBeNull());

    const full = row({ configId: 'cfg-save-explicit', displayText: 'From caller' });
    await act(async () => { await result.current.saveConfig(full); });
    expect(updateConfig).toHaveBeenCalledWith('cfg-save-explicit', full);
  });

  it('saveConfig falls back to the loaded config when called with no argument', async () => {
    rows.set('cfg-save-implicit', row({ configId: 'cfg-save-implicit', displayText: 'Loaded' }));
    const { result } = renderHook(() => useWidget('cfg-save-implicit'), { wrapper: makeWrapper(makePlatform()) });
    await waitFor(() => expect(result.current.config?.displayText).toBe('Loaded'));

    await act(async () => { await result.current.saveConfig(); });
    expect(updateConfig).toHaveBeenCalledWith(
      'cfg-save-implicit',
      expect.objectContaining({ displayText: 'Loaded' }),
    );
  });

  it('saveConfig is a no-op write when nothing is loaded yet', async () => {
    const { result } = renderHook(() => useWidget('cfg-save-empty'), { wrapper: makeWrapper(makePlatform()) });

    await act(async () => { await result.current.saveConfig(); });
    // Writing `undefined` over a row would blank it; the hook must skip instead.
    expect(updateConfig).not.toHaveBeenCalled();
  });

  it('refetchConfig re-reads the row', async () => {
    rows.set('cfg-refetch', row({ configId: 'cfg-refetch', displayText: 'First' }));
    const { result } = renderHook(() => useWidget('cfg-refetch'), { wrapper: makeWrapper(makePlatform()) });
    await waitFor(() => expect(result.current.config?.displayText).toBe('First'));

    rows.set('cfg-refetch', row({ configId: 'cfg-refetch', displayText: 'Second' }));
    await act(async () => { await result.current.refetchConfig(); });

    await waitFor(() => expect(result.current.config?.displayText).toBe('Second'));
  });

  describe('layouts', () => {
    it('lists only the layouts belonging to this widget', async () => {
      rows.set('cfg-layouts', row({ configId: 'cfg-layouts' }));
      rows.set('l1', row({
        configId: 'l1',
        componentType: 'simple-blotter-layout',
        displayText: 'Mine',
        payload: { parentConfigId: 'cfg-layouts', state: { cols: 3 } },
      }));
      rows.set('l2', row({
        configId: 'l2',
        componentType: 'simple-blotter-layout',
        displayText: 'Someone else’s',
        payload: { parentConfigId: 'other-widget', state: {} },
      }));

      const { result } = renderHook(() => useWidget('cfg-layouts'), { wrapper: makeWrapper(makePlatform()) });

      await waitFor(() => expect(result.current.layouts).toHaveLength(1));
      expect(result.current.layouts[0].name).toBe('Mine');
    });

    it('saves a layout under the widget and the host user', async () => {
      rows.set('cfg-savelayout', row({ configId: 'cfg-savelayout', appId: 'star-demo' }));
      const { result } = renderHook(() => useWidget('cfg-savelayout'), { wrapper: makeWrapper(makePlatform()) });
      await waitFor(() => expect(result.current.config).not.toBeNull());

      let saved!: Awaited<ReturnType<typeof result.current.saveLayout>>;
      await act(async () => { saved = await result.current.saveLayout('Trader view', { cols: 5 }); });

      expect(saved.name).toBe('Trader view');
      expect(saved.configId).toBe('cfg-savelayout');
      expect(configManager.createConfig).toHaveBeenCalledWith(
        expect.objectContaining({ appId: 'star-demo', userId: 'k123', displayText: 'Trader view' }),
      );
    });

    it('falls back to default-app when the config has not loaded', async () => {
      const { result } = renderHook(() => useWidget('cfg-noapp'), { wrapper: makeWrapper(makePlatform()) });

      await act(async () => { await result.current.saveLayout('Early save', {}); });
      expect(configManager.createConfig).toHaveBeenCalledWith(
        expect.objectContaining({ appId: 'default-app' }),
      );
    });

    it('loadLayout returns the stored state and makes the layout active', async () => {
      rows.set('cfg-loadlayout', row({ configId: 'cfg-loadlayout' }));
      rows.set('l9', row({
        configId: 'l9',
        componentType: 'simple-blotter-layout',
        displayText: 'Wide',
        payload: { parentConfigId: 'cfg-loadlayout', state: { cols: 9 } },
      }));

      const { result } = renderHook(() => useWidget('cfg-loadlayout'), { wrapper: makeWrapper(makePlatform()) });
      await waitFor(() => expect(result.current.layouts).toHaveLength(1));

      let state: unknown;
      await act(async () => { state = await result.current.loadLayout('l9'); });

      expect(state).toEqual({ cols: 9 });
      await waitFor(() => expect(result.current.activeLayout?.id).toBe('l9'));
    });

    it('deleting the active layout clears the active selection', async () => {
      rows.set('cfg-dellayout', row({ configId: 'cfg-dellayout' }));
      rows.set('l7', row({
        configId: 'l7',
        componentType: 'simple-blotter-layout',
        displayText: 'Doomed',
        payload: { parentConfigId: 'cfg-dellayout', state: {} },
      }));

      const { result } = renderHook(() => useWidget('cfg-dellayout'), { wrapper: makeWrapper(makePlatform()) });
      await waitFor(() => expect(result.current.layouts).toHaveLength(1));

      await act(async () => { await result.current.loadLayout('l7'); });
      await waitFor(() => expect(result.current.activeLayout?.id).toBe('l7'));

      await act(async () => { await result.current.deleteLayout('l7'); });
      // A dangling activeLayout would keep the toolbar showing a layout
      // whose row no longer exists.
      await waitFor(() => expect(result.current.activeLayout).toBeNull());
      expect(configManager.deleteConfig).toHaveBeenCalledWith('l7');
    });

    it('deleting a non-active layout leaves the active selection alone', async () => {
      rows.set('cfg-delother', row({ configId: 'cfg-delother' }));
      for (const id of ['keep', 'drop']) {
        rows.set(id, row({
          configId: id,
          componentType: 'simple-blotter-layout',
          displayText: id,
          payload: { parentConfigId: 'cfg-delother', state: {} },
        }));
      }

      const { result } = renderHook(() => useWidget('cfg-delother'), { wrapper: makeWrapper(makePlatform()) });
      await waitFor(() => expect(result.current.layouts).toHaveLength(2));

      act(() => { result.current.setActiveLayout('keep'); });
      await waitFor(() => expect(result.current.activeLayout?.id).toBe('keep'));

      await act(async () => { await result.current.deleteLayout('drop'); });
      expect(result.current.activeLayout?.id).toBe('keep');
    });

    it('setActiveLayout for an unknown id yields no active layout', async () => {
      rows.set('cfg-unknownlayout', row({ configId: 'cfg-unknownlayout' }));
      const { result } = renderHook(() => useWidget('cfg-unknownlayout'), { wrapper: makeWrapper(makePlatform()) });

      act(() => { result.current.setActiveLayout('does-not-exist'); });
      expect(result.current.activeLayout).toBeNull();
    });
  });

  describe('lifecycle handlers', () => {
    it('runs registered save handlers when the platform saves', async () => {
      const { result } = renderHook(() => useWidget('cfg-onsave'), { wrapper: makeWrapper(makePlatform()) });
      const onSave = vi.fn();
      act(() => { result.current.onSave(onSave); });

      await act(async () => { await Promise.all(saveHandlers.map((h) => h())); });
      expect(onSave).toHaveBeenCalledTimes(1);
    });

    it('unsubscribing a save handler stops it firing', async () => {
      const { result } = renderHook(() => useWidget('cfg-offsave'), { wrapper: makeWrapper(makePlatform()) });
      const onSave = vi.fn();
      let off!: () => void;
      act(() => { off = result.current.onSave(onSave); });
      act(() => { off(); });

      await act(async () => { await Promise.all(saveHandlers.map((h) => h())); });
      // Without the unsubscribe, an effect that re-runs on every prop change
      // would append a fresh closure and leak for the widget's lifetime.
      expect(onSave).not.toHaveBeenCalled();
    });

    it('runs destroy handlers, and stops after unsubscribe', () => {
      const { result } = renderHook(() => useWidget('cfg-ondestroy'), { wrapper: makeWrapper(makePlatform()) });
      const onDestroy = vi.fn();
      let off!: () => void;
      act(() => { off = result.current.onDestroy(onDestroy); });

      act(() => { destroyHandlers.forEach((h) => h()); });
      expect(onDestroy).toHaveBeenCalledTimes(1);

      act(() => { off(); });
      act(() => { destroyHandlers.forEach((h) => h()); });
      expect(onDestroy).toHaveBeenCalledTimes(1);
    });

    it('detaches from the platform on unmount', () => {
      const { unmount } = renderHook(() => useWidget('cfg-unmount'), { wrapper: makeWrapper(makePlatform()) });
      expect(saveHandlers).toHaveLength(1);
      expect(destroyHandlers).toHaveLength(1);

      unmount();
      expect(saveHandlers).toHaveLength(0);
      expect(destroyHandlers).toHaveLength(0);
    });
  });

  describe('platform communication', () => {
    it('delegates open, broadcast and subscribe to the adapter', async () => {
      const { result } = renderHook(() => useWidget('cfg-comm'), { wrapper: makeWrapper(makePlatform()) });

      await act(async () => { await result.current.open('blotter', { symbol: 'IBM' }); });
      expect(openWidget).toHaveBeenCalledWith('blotter', { symbol: 'IBM' });

      act(() => { result.current.broadcast('rows-selected', [1, 2]); });
      expect(broadcast).toHaveBeenCalledWith('rows-selected', [1, 2]);

      const handler = vi.fn();
      const off = result.current.subscribe('rows-selected', handler);
      expect(subscribe).toHaveBeenCalledWith('rows-selected', handler);
      expect(off).toBe(subscribeUnsub);
    });

    it('openSettings identifies the parent by config, instance and view', async () => {
      const { result } = renderHook(() => useWidget('cfg-settings'), { wrapper: makeWrapper(makePlatform()) });

      await act(async () => { await result.current.openSettings('columns', { tab: 'general' }); });
      expect(openSettingsScreen).toHaveBeenCalledWith(
        'columns',
        { configId: 'cfg-settings', instanceId: 'inst-9', viewId: 'inst-9' },
        { tab: 'general' },
      );
    });
  });
});
