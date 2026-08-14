/**
 * Tests for useFilterModel — the hook that owns FiltersToolbar's
 * saved-filter state and the AG-Grid `filterChanged` watcher.
 *
 * Strategy mirrors FormattingToolbar.test.tsx: spin up a real
 * `GridPlatform` (with `savedFiltersModule` so module-state writes have
 * a real slot to land in), wrap a `renderHook` in a `<GridProvider>`,
 * and supply a fake `GridApi` that records `addEventListener`/
 * `removeEventListener` calls and lets the test fire events.
 *
 * The tests cover:
 *   - subscribe/unsubscribe on mount/unmount (no leaked listeners)
 *   - safe when the api isn't ready
 *   - imperative handlers (toggle, remove, rename, deactivateAll,
 *     editFilterModel) update saved-filters module state
 *   - addFromLive dispatches into AG-Grid via setFilterModel
 *   - `filterChanged` event updates `hasNewFilter` when the live model
 *     contains something not already saved
 */
import * as React from 'react';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GridApi } from 'ag-grid-community';
import { GridPlatform } from '@wellsfargo-starui/core';
import {
  GridProvider,
  savedFiltersModule,
  type SavedFiltersState,
} from '../customizer/internal.js';
import { useFilterModel } from './useFilterModel';
import type { SavedFilter } from './types';

// ─── Fake GridApi harness ──────────────────────────────────────────────

interface FakeApiHarness {
  api: GridApi;
  /** Emit `filterChanged` (or any other event) into every listener. */
  fireEvent: (evt: string) => void;
  /** Set what `getFilterModel()` will return. */
  setLiveModel: (model: Record<string, unknown> | null) => void;
  /** Calls captured against `setFilterModel`. */
  setFilterModelCalls: Array<Record<string, unknown> | null>;
  /** Active listener count for an event — proves cleanup. */
  listenerCount: (evt: string) => number;
}

function makeFakeApi(): FakeApiHarness {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  let liveModel: Record<string, unknown> | null = null;
  const setFilterModelCalls: Array<Record<string, unknown> | null> = [];

  const api: Partial<GridApi> = {
    addEventListener: ((evt: string, fn: (...a: unknown[]) => void) => {
      if (!listeners.has(evt)) listeners.set(evt, new Set());
      listeners.get(evt)!.add(fn);
    }) as unknown as GridApi['addEventListener'],
    removeEventListener: ((evt: string, fn: (...a: unknown[]) => void) => {
      listeners.get(evt)?.delete(fn);
    }) as unknown as GridApi['removeEventListener'],
    getFilterModel: (() => liveModel) as GridApi['getFilterModel'],
    setFilterModel: ((m: Record<string, unknown> | null) => {
      setFilterModelCalls.push(m);
      liveModel = m;
    }) as GridApi['setFilterModel'],
    forEachNode: ((_fn: () => void) => {
      // No rows in these tests — count badges just resolve to 0.
    }) as GridApi['forEachNode'],
  };

  return {
    api: api as GridApi,
    fireEvent: (evt: string, event?: unknown) => {
      for (const fn of Array.from(listeners.get(evt) ?? [])) fn(event);
    },
    setLiveModel: (m) => { liveModel = m; },
    setFilterModelCalls,
    listenerCount: (evt: string) => listeners.get(evt)?.size ?? 0,
  };
}

function makePlatform(): GridPlatform {
  return new GridPlatform({
    gridId: 'test-grid',
    modules: [savedFiltersModule],
  });
}

function wrapper(platform: GridPlatform) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(GridProvider, { platform }, children);
  };
}

function seedFilters(platform: GridPlatform, filters: SavedFilter[]): void {
  platform.store.setModuleState<SavedFiltersState>('saved-filters', () => ({ filters }));
}

function readFilters(platform: GridPlatform): SavedFilter[] {
  const state = platform.store.getModuleState<SavedFiltersState>('saved-filters');
  return (state?.filters ?? []) as SavedFilter[];
}

// ─── Tests ─────────────────────────────────────────────────────────────

describe('useFilterModel — subscription lifecycle', () => {
  let platform: GridPlatform;
  beforeEach(() => { platform = makePlatform(); });

  it('subscribes to filterChanged on mount and unsubscribes on unmount', () => {
    const fake = makeFakeApi();
    platform.onGridReady(fake.api);

    // The PLATFORM itself holds filterChanged listeners past hook
    // unmount (RowChangeBus structural classification) — the contract
    // under test is that the HOOK's own listener is added and removed,
    // so compare against the platform baseline, not absolute zero.
    const baseline = fake.listenerCount('filterChanged');

    const { unmount } = renderHook(() => useFilterModel(), { wrapper: wrapper(platform) });

    // ApiHub.on('filterChanged', …) forwards to api.addEventListener.
    expect(fake.listenerCount('filterChanged')).toBe(baseline + 1);

    unmount();

    // ApiHub.detach disposes via removeEventListener — but it's only
    // called when the platform tears down. The hook's own effect cleanup
    // should also remove its listener.
    expect(fake.listenerCount('filterChanged')).toBe(baseline);
  });

  it('does not throw when the platform has no grid api yet', () => {
    // Don't call platform.onGridReady — the hook must be tolerant of
    // a null api (cold-mount before AG-Grid is ready).
    const { result } = renderHook(() => useFilterModel(), { wrapper: wrapper(platform) });

    expect(result.current.filters).toEqual([]);
    expect(result.current.hasNewFilter).toBe(false);
    expect(result.current.filterCounts).toEqual({});
  });
});

describe('useFilterModel — saved-filter handlers', () => {
  let platform: GridPlatform;
  beforeEach(() => { platform = makePlatform(); });

  it('seeds filters from the saved-filters module on first render', () => {
    seedFilters(platform, [
      { id: 'a', label: 'A', active: true, filterModel: { side: { filterType: 'text', type: 'equals', filter: 'BUY' } } },
      { id: 'b', label: 'B', active: false, filterModel: { ccy: { filterType: 'set', values: ['USD'] } } },
    ]);
    const { result } = renderHook(() => useFilterModel(), { wrapper: wrapper(platform) });

    expect(result.current.filters.map((f) => f.id)).toEqual(['a', 'b']);
    expect(result.current.filters[0].active).toBe(true);
    expect(result.current.filters[1].active).toBe(false);
  });

  it('toggle flips a pill\'s active flag', () => {
    seedFilters(platform, [
      { id: 'a', label: 'A', active: true, filterModel: { side: { filterType: 'text', type: 'equals', filter: 'BUY' } } },
    ]);
    const { result } = renderHook(() => useFilterModel(), { wrapper: wrapper(platform) });

    act(() => result.current.toggle('a'));
    expect(readFilters(platform)[0].active).toBe(false);

    act(() => result.current.toggle('a'));
    expect(readFilters(platform)[0].active).toBe(true);
  });

  it('remove deletes the pill by id', () => {
    seedFilters(platform, [
      { id: 'a', label: 'A', active: true, filterModel: {} },
      { id: 'b', label: 'B', active: false, filterModel: {} },
    ]);
    const { result } = renderHook(() => useFilterModel(), { wrapper: wrapper(platform) });

    act(() => result.current.remove('a'));
    expect(readFilters(platform).map((f) => f.id)).toEqual(['b']);
  });

  it('rename trims input and skips no-op writes when blank', () => {
    seedFilters(platform, [
      { id: 'a', label: 'A', active: true, filterModel: {} },
    ]);
    const { result } = renderHook(() => useFilterModel(), { wrapper: wrapper(platform) });

    act(() => result.current.rename('a', '  Renamed  '));
    expect(readFilters(platform)[0].label).toBe('Renamed');

    act(() => result.current.rename('a', '   '));
    // Blank rename: state unchanged.
    expect(readFilters(platform)[0].label).toBe('Renamed');
  });

  it('deactivateAll clears every pill\'s active flag in one write', () => {
    seedFilters(platform, [
      { id: 'a', label: 'A', active: true, filterModel: {} },
      { id: 'b', label: 'B', active: true, filterModel: {} },
    ]);
    const { result } = renderHook(() => useFilterModel(), { wrapper: wrapper(platform) });

    act(() => result.current.deactivateAll());
    expect(readFilters(platform).map((f) => f.active)).toEqual([false, false]);
  });

  it('editFilterModel replaces only the targeted pill\'s model', () => {
    seedFilters(platform, [
      { id: 'a', label: 'A', active: true, filterModel: { side: { filterType: 'text', type: 'equals', filter: 'BUY' } } },
      { id: 'b', label: 'B', active: true, filterModel: { ccy: { filterType: 'set', values: ['USD'] } } },
    ]);
    const { result } = renderHook(() => useFilterModel(), { wrapper: wrapper(platform) });

    const nextModel = { side: { filterType: 'text', type: 'equals', filter: 'SELL' } };
    act(() => result.current.editFilterModel('a', nextModel));

    const after = readFilters(platform);
    expect(after[0].filterModel).toEqual(nextModel);
    // Other pill untouched.
    expect(after[1].filterModel).toEqual({ ccy: { filterType: 'set', values: ['USD'] } });
  });
});

describe('useFilterModel — AG-Grid wiring', () => {
  let platform: GridPlatform;
  beforeEach(() => { platform = makePlatform(); });

  it('updates filter counts incrementally on asyncTransactionsFlushed', () => {
    vi.useFakeTimers();
    try {
      seedFilters(platform, [{
        id: 'a',
        label: 'A',
        active: true,
        filterModel: { side: { filterType: 'text', type: 'equals', filter: 'BUY' } },
      }]);

      const nodes = [
        { id: 'r1', data: { side: 'BUY' } },
        { id: 'r2', data: { side: 'SELL' } },
      ];
      const fake = makeFakeApi();
      fake.api.forEachNode = ((fn: (node: typeof nodes[number]) => void) => {
        for (const node of nodes) fn(node);
      }) as GridApi['forEachNode'];
      platform.onGridReady(fake.api);

      const { result } = renderHook(() => useFilterModel(), { wrapper: wrapper(platform) });
      expect(result.current.filterCounts.a).toBe(1);

      nodes[1] = { id: 'r2', data: { side: 'BUY' } };
      act(() => {
        fake.fireEvent('asyncTransactionsFlushed', {
          results: [{ update: [nodes[1]] }],
        });
        vi.runAllTimers();
      });
      expect(result.current.filterCounts.a).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('addFromLive captures the live model into a new pill and pushes it back through setFilterModel', () => {
    const fake = makeFakeApi();
    platform.onGridReady(fake.api);

    const liveModel = { side: { filterType: 'text', type: 'equals', filter: 'BUY' } };

    const { result } = renderHook(() => useFilterModel(), { wrapper: wrapper(platform) });

    // Set the live model AFTER mount — the hook's initial push-active
    // effect calls setFilterModel(null) on mount with empty saved
    // filters, which the fake stores as the live model and would
    // clobber a pre-seeded one.
    fake.setLiveModel(liveModel);

    // hasNewFilter flips true after the next filterChanged tick.
    act(() => fake.fireEvent('filterChanged'));
    expect(result.current.hasNewFilter).toBe(true);

    const callsBefore = fake.setFilterModelCalls.length;
    act(() => result.current.addFromLive());

    const saved = readFilters(platform);
    expect(saved).toHaveLength(1);
    expect(saved[0].filterModel).toEqual(liveModel);
    expect(saved[0].active).toBe(true);

    // pushActiveFilterModel skips redundant setFilterModel when the live
    // grid model already matches the merged active pills.
    expect(fake.setFilterModelCalls.length).toBe(callsBefore);
    expect(fake.api.getFilterModel()).toEqual(liveModel);
  });

  it('addFromLive captures only the delta vs active pills', () => {
    const fake = makeFakeApi();
    platform.onGridReady(fake.api);

    seedFilters(platform, [
      {
        id: 'a',
        label: 'side: BUY',
        active: true,
        filterModel: { side: { filterType: 'set', values: ['BUY'] } },
      },
    ]);

    const { result } = renderHook(() => useFilterModel(), { wrapper: wrapper(platform) });

    const liveModel = {
      side: { filterType: 'set', values: ['BUY'] },
      price: { filterType: 'number', type: 'greaterThan', filter: 100 },
    };
    fake.setLiveModel(liveModel);

    act(() => fake.fireEvent('filterChanged'));
    expect(result.current.hasNewFilter).toBe(true);

    act(() => result.current.addFromLive());

    const saved = readFilters(platform);
    expect(saved).toHaveLength(2);
    expect(saved[1].filterModel).toEqual({
      price: { filterType: 'number', type: 'greaterThan', filter: 100 },
    });
  });

  it('addFromLive is a no-op when the live model is empty', () => {
    const fake = makeFakeApi();
    platform.onGridReady(fake.api);
    fake.setLiveModel({});

    const { result } = renderHook(() => useFilterModel(), { wrapper: wrapper(platform) });

    act(() => result.current.addFromLive());
    expect(readFilters(platform)).toEqual([]);
  });

  it('filterChanged event with a previously-saved filter keeps hasNewFilter false', () => {
    const savedModel = { side: { filterType: 'text', type: 'equals', filter: 'BUY' } };
    seedFilters(platform, [{ id: 'a', label: 'A', active: false, filterModel: savedModel }]);

    const fake = makeFakeApi();
    platform.onGridReady(fake.api);
    fake.setLiveModel(savedModel);

    const { result } = renderHook(() => useFilterModel(), { wrapper: wrapper(platform) });

    act(() => fake.fireEvent('filterChanged'));

    // Live filter equals an EXISTING (inactive) pill — must not enable
    // the + button. This is the regression isNewFilter guards against.
    expect(result.current.hasNewFilter).toBe(false);
  });

  it('sanitizes malformed set-filter values when pushing active model', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    seedFilters(platform, [{
      id: 'bad',
      label: 'Bad',
      active: true,
      filterModel: {
        side: { filterType: 'set', values: { 0: 'BUY', 1: 'SELL' } as unknown as string[] },
      },
    }]);

    const fake = makeFakeApi();
    platform.onGridReady(fake.api);

    const { result } = renderHook(() => useFilterModel(), { wrapper: wrapper(platform) });

    const side = (result.current.filters[0]?.filterModel as Record<string, { values?: unknown[] }>).side;
    expect(Array.isArray(side?.values)).toBe(true);
    expect(side?.values).toEqual(['BUY', 'SELL']);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('drops invalid saved filter records during normalization', () => {
    platform.store.setModuleState<SavedFiltersState>('saved-filters', () => ({
      filters: [
        { id: '', label: 'No id', active: false, filterModel: {} },
        { id: 'ok', label: 'OK', active: true, filterModel: { x: { filterType: 'text', filter: 'a' } } },
      ] as unknown as SavedFilter[],
    }));

    const { result } = renderHook(() => useFilterModel(), { wrapper: wrapper(platform) });
    expect(result.current.filters.map((f) => f.id)).toEqual(['ok']);
  });

  it('skips setFilterModel push when active model matches live model', () => {
    const model = { side: { filterType: 'text', type: 'equals', filter: 'BUY' } };
    seedFilters(platform, [{ id: 'a', label: 'A', active: true, filterModel: model }]);

    const fake = makeFakeApi();
    platform.onGridReady(fake.api);
    fake.setLiveModel(model);

    renderHook(() => useFilterModel(), { wrapper: wrapper(platform) });

    // Initial push may have fired once; subsequent identical push is skipped.
    const callsAfterMount = fake.setFilterModelCalls.length;
    act(() => fake.fireEvent('filterChanged'));
    expect(fake.setFilterModelCalls.length).toBe(callsAfterMount);
  });

  it('survives setFilterModel throw without breaking hook', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    seedFilters(platform, [{ id: 'a', label: 'A', active: true, filterModel: { bad: { filterType: 'set', values: ['x'] } } }]);

    const fake = makeFakeApi();
    const throwingApi = {
      ...fake.api,
      setFilterModel: () => { throw new Error('boom'); },
    } as GridApi;
    platform.onGridReady(throwingApi);

    expect(() => {
      renderHook(() => useFilterModel(), { wrapper: wrapper(platform) });
    }).not.toThrow();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('repairs multi-filter child entries with malformed set values', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    seedFilters(platform, [{
      id: 'multi',
      label: 'Multi',
      active: true,
      filterModel: {
        side: {
          filterType: 'multi',
          filterModels: [
            null,
            { filterType: 'set', values: { 0: 'BUY', 1: 'SELL' } as unknown as string[] },
          ],
        },
      },
    }]);

    const fake = makeFakeApi();
    platform.onGridReady(fake.api);
    const { result } = renderHook(() => useFilterModel(), { wrapper: wrapper(platform) });

    const side = (result.current.filters[0]?.filterModel as Record<string, { filterModels?: Array<{ values?: string[] }> }>).side;
    expect(side?.filterModels?.[1]?.values).toEqual(['BUY', 'SELL']);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('registers profile:loaded listener that re-pushes filters', () => {
    seedFilters(platform, [{ id: 'a', label: 'A', active: true, filterModel: { x: { filterType: 'text', filter: '1' } } }]);
    const fake = makeFakeApi();
    const setFilterModel = vi.fn();
    const api = { ...fake.api, setFilterModel } as GridApi;
    platform.onGridReady(api);

    renderHook(() => useFilterModel(), { wrapper: wrapper(platform) });
    setFilterModel.mockClear();

    act(() => { platform.events.emit('profile:loaded', { gridId: 'test-grid', profileId: 'p1' }); });
    expect(setFilterModel).toHaveBeenCalled();
  });

  it('recomputes filter counts when rows are present', () => {
    seedFilters(platform, [{
      id: 'a',
      label: 'A',
      active: true,
      filterModel: { side: { filterType: 'text', type: 'equals', filter: 'BUY' } },
    }]);

    const fake = makeFakeApi();
    const nodes = [
      { id: 'r1', data: { side: 'BUY' } },
      { id: 'r2', data: { side: 'SELL' } },
    ];
    const api = {
      ...fake.api,
      forEachNode: (fn: (node: { id: string; data: Record<string, unknown> }) => void) => {
        for (const node of nodes) fn(node);
      },
    } as GridApi;
    platform.onGridReady(api);

    const { result } = renderHook(() => useFilterModel(), { wrapper: wrapper(platform) });
    expect(result.current.filterCounts.a).toBe(1);
  });

  it('addFromLive is a no-op when live model duplicates an existing pill', () => {
    const savedModel = { side: { filterType: 'text', type: 'equals', filter: 'BUY' } };
    seedFilters(platform, [{ id: 'a', label: 'A', active: true, filterModel: savedModel }]);

    const fake = makeFakeApi();
    platform.onGridReady(fake.api);
    fake.setLiveModel(savedModel);

    const { result } = renderHook(() => useFilterModel(), { wrapper: wrapper(platform) });
    act(() => fake.fireEvent('filterChanged'));
    act(() => result.current.addFromLive());
    expect(readFilters(platform)).toHaveLength(1);
  });

  it('re-pushes active filters on firstDataRendered', () => {
    seedFilters(platform, [{ id: 'a', label: 'A', active: true, filterModel: { x: { filterType: 'text', filter: '1' } } }]);
    const fake = makeFakeApi();
    const setFilterModel = vi.fn();
    platform.onGridReady({ ...fake.api, setFilterModel } as GridApi);

    renderHook(() => useFilterModel(), { wrapper: wrapper(platform) });
    setFilterModel.mockClear();
    act(() => fake.fireEvent('firstDataRendered'));
    expect(setFilterModel).toHaveBeenCalled();
  });

  it('addFromLive no-ops when live model adds no delta over active pills', () => {
    const activeModel = { side: { filterType: 'set', values: ['BUY'] } };
    seedFilters(platform, [{ id: 'a', label: 'A', active: true, filterModel: activeModel }]);

    const fake = makeFakeApi();
    platform.onGridReady(fake.api);
    fake.setLiveModel(activeModel);

    const { result } = renderHook(() => useFilterModel(), { wrapper: wrapper(platform) });
    act(() => fake.fireEvent('filterChanged'));
    act(() => result.current.addFromLive());
    expect(readFilters(platform)).toHaveLength(1);
  });

  it('drops unsalvageable multi-filter child entries during normalization', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    platform.store.setModuleState<SavedFiltersState>('saved-filters', () => ({
      filters: [{
        id: 'multi',
        label: 'Multi',
        active: true,
        filterModel: {
          side: {
            filterType: 'multi',
            filterModels: [undefined, { filterType: 'set', values: { 0: 'BUY' } as unknown as string[] }],
          },
        },
      }] as unknown as SavedFilter[],
    }));

    const { result } = renderHook(() => useFilterModel(), { wrapper: wrapper(platform) });
    expect(result.current.filters).toHaveLength(1);
    warn.mockRestore();
  });

  it('rejects saved filters with blank labels during normalization', () => {
    platform.store.setModuleState<SavedFiltersState>('saved-filters', () => ({
      filters: [{ id: 'a', label: '', active: false, filterModel: {} }] as unknown as SavedFilter[],
    }));
    const { result } = renderHook(() => useFilterModel(), { wrapper: wrapper(platform) });
    expect(result.current.filters).toEqual([]);
  });

  it('merges multiple active pills when pushing filter model', () => {
    seedFilters(platform, [
      { id: 'a', label: 'A', active: true, filterModel: { side: { filterType: 'text', filter: 'BUY' } } },
      { id: 'b', label: 'B', active: true, filterModel: { ccy: { filterType: 'set', values: ['USD'] } } },
    ]);
    const fake = makeFakeApi();
    platform.onGridReady(fake.api);
    renderHook(() => useFilterModel(), { wrapper: wrapper(platform) });
    expect(fake.setFilterModelCalls.some((m) => m && Object.keys(m).length === 2)).toBe(true);
  });
});
