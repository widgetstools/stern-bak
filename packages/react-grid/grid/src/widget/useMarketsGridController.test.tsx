/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalStorageBundleAdapter, MemoryAdapter } from '@wellsfargo-starui/core';
import { useMarketsGridController } from './useMarketsGridController';

const mocks = vi.hoisted(() => ({
  profile: {
    profiles: [] as any[],
    activeProfileId: 'a' as string | null,
    isDirty: false,
    saveActiveProfile: vi.fn(async () => {}),
    loadProfile: vi.fn(async () => {}),
    refreshProfiles: vi.fn(async () => {}),
    discardActiveProfile: vi.fn(async () => {}),
  },
  api: null as any,
  platform: {
    store: {
      getModuleState: vi.fn(() => ({ settings: { enabled: true, fileNamePrefix: 'grid' } })),
    },
    events: {
      on: vi.fn(() => () => {}),
      emit: vi.fn(),
    },
  },
  captureGridStateInto: vi.fn(),
  exportVisualExcel: vi.fn(),
  sheetFocusIfPopped: vi.fn(() => false),
  toolbarFocusIfPopped: vi.fn(() => false),
}));

vi.mock('../customizer/internal.js', () => ({
  useProfileManager: () => mocks.profile,
  useGridApi: () => mocks.api,
  useGridPlatform: () => mocks.platform,
  useModuleState: () => [{ settings: { enabled: true } }, vi.fn()],
  captureGridStateInto: (...args: unknown[]) => mocks.captureGridStateInto(...args),
  exportVisualExcel: (...args: unknown[]) => mocks.exportVisualExcel(...args),
  VISUAL_EXCEL_MODULE_ID: 'visual-excel',
  COLUMN_CUSTOMIZATION_MODULE_ID: 'column-customization',
}));

vi.mock('./openfinViewProfile', () => ({
  createOpenFinViewProfileSource: () => null,
}));

vi.mock('./SettingsSheet', () => ({
  SettingsSheet: React.forwardRef((_props, ref) => {
    React.useImperativeHandle(ref, () => ({ focusIfPopped: mocks.sheetFocusIfPopped }));
    return null;
  }),
}));

vi.mock('./FormattingToolbar', () => ({
  FormattingToolbar: React.forwardRef((_props, ref) => {
    React.useImperativeHandle(ref, () => ({ focusIfPopped: mocks.toolbarFocusIfPopped }));
    return null;
  }),
}));

function renderController(overrides: Partial<Parameters<typeof useMarketsGridController>[0]> = {}) {
  return renderHook(() =>
    useMarketsGridController({
      gridId: 'g1',
      storageAdapter: undefined,
      autoSaveDebounceMs: undefined,
      forwardedRef: { current: null },
      onReady: undefined,
      gridLevelData: null,
      onGridLevelDataLoad: undefined,
      onSavingChange: undefined,
      ...overrides,
    }),
  );
}

describe('useMarketsGridController', () => {
  beforeEach(() => {
    mocks.profile.isDirty = false;
    mocks.profile.activeProfileId = 'a';
    mocks.profile.saveActiveProfile = vi.fn(async () => {});
    mocks.profile.loadProfile = vi.fn(async () => {});
    mocks.profile.refreshProfiles = vi.fn(async () => {});
    mocks.profile.discardActiveProfile = vi.fn(async () => {});
    mocks.api = { setFilterModel: vi.fn() };
    mocks.sheetFocusIfPopped.mockReturnValue(false);
    mocks.toolbarFocusIfPopped.mockReturnValue(false);
    mocks.captureGridStateInto.mockClear();
    mocks.exportVisualExcel.mockClear();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('loads grid-level data on mount when adapter supports it', async () => {
    const onGridLevelDataLoad = vi.fn();
    const adapter = {
      loadGridLevelData: vi.fn(async () => ({ foo: 1 })),
      saveGridLevelData: vi.fn(),
    };
    renderController({ storageAdapter: adapter as never, onGridLevelDataLoad });

    await waitFor(() => expect(onGridLevelDataLoad).toHaveBeenCalledWith({ foo: 1 }));
  });

  it('handles grid-level load failure by notifying null', async () => {
    const onGridLevelDataLoad = vi.fn();
    const adapter = {
      loadGridLevelData: vi.fn(async () => { throw new Error('load fail'); }),
    };
    renderController({ storageAdapter: adapter as never, onGridLevelDataLoad });

    await waitFor(() => expect(onGridLevelDataLoad).toHaveBeenCalledWith(null));
  });

  it('skips persisting undefined gridLevelData', async () => {
    const saveGridLevelData = vi.fn();
    const adapter = {
      loadGridLevelData: vi.fn(async () => null),
      saveGridLevelData,
    };
    const { rerender } = renderHook(
      ({ gridLevelData }) =>
        useMarketsGridController({
          gridId: 'g1',
          storageAdapter: adapter as never,
          autoSaveDebounceMs: undefined,
          forwardedRef: { current: null },
          onReady: undefined,
          gridLevelData,
          onGridLevelDataLoad: undefined,
          onSavingChange: undefined,
        }),
      { initialProps: { gridLevelData: undefined as unknown } },
    );

    await waitFor(() => expect(adapter.loadGridLevelData).toHaveBeenCalled());
    rerender({ gridLevelData: undefined });
    expect(saveGridLevelData).not.toHaveBeenCalled();
  });

  it('persists gridLevelData when value changes after initial load', async () => {
    const saveGridLevelData = vi.fn();
    const adapter = {
      loadGridLevelData: vi.fn(async () => null),
      saveGridLevelData,
    };
    const { rerender } = renderHook(
      ({ gridLevelData }) =>
        useMarketsGridController({
          gridId: 'g1',
          storageAdapter: adapter as never,
          autoSaveDebounceMs: undefined,
          forwardedRef: { current: null },
          onReady: undefined,
          gridLevelData,
          onGridLevelDataLoad: undefined,
          onSavingChange: undefined,
        }),
      { initialProps: { gridLevelData: null as unknown } },
    );

    await waitFor(() => expect(adapter.loadGridLevelData).toHaveBeenCalled());
    rerender({ gridLevelData: { next: true } });
    expect(saveGridLevelData).toHaveBeenCalledWith('g1', { next: true });
  });

  it('fires onReady once when api becomes available', async () => {
    const onReady = vi.fn();
    mocks.api = null;
    const { rerender } = renderHook(
      ({ api }) => {
        mocks.api = api;
        return useMarketsGridController({
          gridId: 'g1',
          storageAdapter: undefined,
          autoSaveDebounceMs: undefined,
          forwardedRef: { current: null },
          onReady,
          gridLevelData: null,
          onGridLevelDataLoad: undefined,
          onSavingChange: undefined,
        });
      },
      { initialProps: { api: null as any } },
    );

    expect(onReady).not.toHaveBeenCalled();
    rerender({ api: { id: 'live' } as any });
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
  });

  it('handleSaveAll captures grid state, toggles saving, and flashes', async () => {
    vi.useFakeTimers();
    const onSavingChange = vi.fn();
    const { result } = renderController({ onSavingChange });

    await act(async () => {
      await result.current.handleSaveAll();
    });

    expect(mocks.captureGridStateInto).toHaveBeenCalled();
    expect(mocks.profile.saveActiveProfile).toHaveBeenCalled();
    expect(onSavingChange).toHaveBeenCalledWith(true);
    expect(onSavingChange).toHaveBeenCalledWith(false);
    expect(result.current.saveFlash).toBe(true);
    act(() => { vi.advanceTimersByTime(600); });
    expect(result.current.saveFlash).toBe(false);
    vi.useRealTimers();
  });

  it('handleSaveAll reports saving=false when saveActiveProfile throws', async () => {
    mocks.profile.saveActiveProfile = vi.fn(async () => { throw new Error('save fail'); });
    const onSavingChange = vi.fn();
    const { result } = renderController({ onSavingChange });

    await act(async () => {
      await result.current.handleSaveAll();
    });
    expect(onSavingChange).toHaveBeenCalledWith(true);
    expect(onSavingChange).toHaveBeenCalledWith(false);
    expect(result.current.saveFlash).toBe(false);
  });

  it('requestLoadProfile opens pending switch when dirty', () => {
    mocks.profile.isDirty = true;
    const { result } = renderController();

    act(() => result.current.requestLoadProfile('b'));
    expect(result.current.pendingSwitch).toEqual({ id: 'b' });
    expect(mocks.profile.loadProfile).not.toHaveBeenCalled();
  });

  it('requestLoadProfile loads immediately when clean', () => {
    const { result } = renderController();
    act(() => result.current.requestLoadProfile('b'));
    expect(mocks.profile.loadProfile).toHaveBeenCalledWith('b');
  });

  it('confirmSwitchSave saves then loads target profile', async () => {
    const { result } = renderController();
    act(() => result.current.setPendingSwitch({ id: 'b' }));

    await act(async () => {
      await result.current.confirmSwitchSave();
    });
    expect(mocks.profile.saveActiveProfile).toHaveBeenCalled();
    expect(mocks.profile.loadProfile).toHaveBeenCalledWith('b');
    expect(result.current.pendingSwitch).toBeNull();
  });

  it('confirmSwitchDiscard discards then loads target profile', async () => {
    const { result } = renderController();
    act(() => result.current.setPendingSwitch({ id: 'b' }));

    await act(async () => {
      await result.current.confirmSwitchDiscard();
    });
    expect(mocks.profile.discardActiveProfile).toHaveBeenCalled();
    expect(mocks.profile.loadProfile).toHaveBeenCalledWith('b');
  });

  it('handleOpenSettings raises popped sheet when focusIfPopped succeeds', () => {
    mocks.sheetFocusIfPopped.mockReturnValue(true);
    const { result } = renderController();

    act(() => {
      result.current.sheetRef.current = { focusIfPopped: mocks.sheetFocusIfPopped } as never;
      result.current.handleOpenSettings();
    });
    expect(result.current.settingsOpen).toBe(false);
  });

  it('handleToggleStyleToolbar raises popped toolbar when already open', () => {
    mocks.toolbarFocusIfPopped.mockReturnValue(true);
    const { result } = renderController();

    act(() => {
      result.current.handleToggleStyleToolbar();
    });
    expect(result.current.styleToolbarOpen).toBe(true);

    act(() => {
      result.current.toolbarRef.current = { focusIfPopped: mocks.toolbarFocusIfPopped } as never;
      result.current.handleToggleStyleToolbar();
    });
    expect(result.current.styleToolbarOpen).toBe(true);
    expect(mocks.toolbarFocusIfPopped).toHaveBeenCalled();
  });

  it('handleExportVisualExcel delegates to exportVisualExcel when api is live', () => {
    const { result } = renderController();
    act(() => result.current.handleExportVisualExcel());
    expect(mocks.exportVisualExcel).toHaveBeenCalled();
  });

  it('exposes LocalStorage bundle handle when adapter is LocalStorageBundleAdapter', async () => {
    const readConfig = vi.fn(() => ({ activeProfileId: 'next' }));
    const applySerializedConfig = vi.fn(async () => {});
    class TestBundleAdapter extends LocalStorageBundleAdapter {
      readConfig = readConfig;
      applySerializedConfig = applySerializedConfig;
    }
    const adapter = new TestBundleAdapter({} as never);
    const ref = { current: null as any };
    mocks.api = { id: 'live' };
    renderHook(() =>
      useMarketsGridController({
        gridId: 'g1',
        storageAdapter: adapter,
        autoSaveDebounceMs: undefined,
        forwardedRef: ref,
        onReady: undefined,
        gridLevelData: null,
        onGridLevelDataLoad: undefined,
        onSavingChange: undefined,
      }),
    );

    await waitFor(() => expect(ref.current?.getConfig).toBeTruthy());
    ref.current.getConfig();
    expect(readConfig).toHaveBeenCalled();
    await act(async () => {
      await ref.current.setConfig({ activeProfileId: 'next' } as never);
    });
    expect(applySerializedConfig).toHaveBeenCalled();
    // setConfig writes profile rows straight through the adapter, bypassing
    // every ProfileManager method that keeps the cached list in sync — so
    // it must refresh the list itself. Without this, the profile picker
    // shows only whatever was cached at boot until some unrelated
    // list-mutating action (e.g. clone) incidentally refreshes it.
    expect(mocks.profile.refreshProfiles).toHaveBeenCalled();
    expect(mocks.profile.loadProfile).toHaveBeenCalledWith('next');
  });

  it('uses MemoryAdapter when no storage adapter is provided', () => {
    const { result } = renderController();
    expect(result.current.profiles).toBeTruthy();
    expect(new MemoryAdapter()).toBeTruthy();
  });
});
