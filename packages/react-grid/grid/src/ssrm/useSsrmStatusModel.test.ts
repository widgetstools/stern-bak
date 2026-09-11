import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GridApi } from 'ag-grid-community';
import type { ISsrmDataProvider } from '@wellsfargo-starui/data';
import { SSRM_COUNT_REFRESH_MS } from '../widget/useSsrmFilterCounts';
import { useSsrmStatusModel } from './useSsrmStatusModel.js';

const hooks: Array<{ unmount: () => void }> = [];

afterEach(() => {
  for (const h of hooks.splice(0)) h.unmount();
  vi.restoreAllMocks();
});

function provider(total = 1000, filtered = 25): ISsrmDataProvider {
  return {
    getRowCount: vi.fn(async (req: { filterModel?: unknown }) => ({
      rowCount: req.filterModel ? filtered : total,
    })),
    getAggregates: vi.fn(async () => ({
      values: { marketValue_sum: 99, marketValue_count: 25, marketValue_avg: 4, marketValue_min: 1, marketValue_max: 9 },
    })),
  } as unknown as ISsrmDataProvider;
}

function api(opts: {
  filter?: object;
  selected?: number;
  column?: string;
  quickFilter?: string;
  selectionState?: unknown;
} = {}): GridApi {
  const listeners = new Map<string, Set<() => void>>();
  return {
    getFilterModel: () => opts.filter ?? null,
    getSelectedNodes: () => Array.from({ length: opts.selected ?? 0 }),
    getServerSideSelectionState: () => opts.selectionState,
    getCellRanges: () => (opts.column
      ? [{ columns: [{ getColId: () => opts.column }] }]
      : []),
    getValueColumns: () => [],
    getGridOption: (name: string) => (name === 'quickFilterText' ? opts.quickFilter : undefined),
    addEventListener: (evt: string, fn: () => void) => {
      if (!listeners.has(evt)) listeners.set(evt, new Set());
      listeners.get(evt)!.add(fn);
    },
    removeEventListener: (evt: string, fn: () => void) => {
      listeners.get(evt)?.delete(fn);
    },
  } as unknown as GridApi;
}

function mount(p: ISsrmDataProvider, grid: GridApi) {
  const hook = renderHook(() => useSsrmStatusModel(p, grid));
  hooks.push(hook);
  return hook;
}

describe('useSsrmStatusModel', () => {
  it('reads total and filtered counts from the provider, not the loaded blocks', async () => {
    const p = provider(5000, 42);
    const { result } = mount(p, api({
      filter: { desk: { filterType: 'set', values: ['Govies'] } },
    }));
    await waitFor(() => expect(result.current.total).toBe(5000));
    expect(result.current.filtered).toBe(42);
    expect(p.getRowCount).toHaveBeenCalledWith({});
    expect(p.getRowCount).toHaveBeenCalledWith({
      filterModel: { desk: { filterType: 'set', values: ['Govies'] } },
    });
  });

  it('asks the engine for aggregations of the selected column', async () => {
    const p = provider();
    const { result } = mount(p, api({ column: 'marketValue' }));
    await waitFor(() => expect(result.current.aggregates.marketValue_sum).toBe(99));
    expect(result.current.aggregateColumn).toBe('marketValue');
    expect(p.getAggregates).toHaveBeenCalled();
  });

  it('forwards the live quick-filter text with the filtered count', async () => {
    const p = provider();
    mount(p, api({
      filter: { desk: { filterType: 'set', values: ['Govies'] } },
      quickFilter: 'ABC',
    }));
    await waitFor(() => expect(p.getRowCount).toHaveBeenCalledWith({
      filterModel: { desk: { filterType: 'set', values: ['Govies'] } },
      quickFilterText: 'ABC',
    }));
  });

  it('reports the grid\'s selected-row count (selection is local)', async () => {
    const { result } = mount(provider(), api({ selected: 3 }));
    await waitFor(() => expect(result.current.selected).toBe(3));
  });

  it('counts a header select-all as the filtered total minus the un-ticked rows', async () => {
    const { result } = mount(provider(5000, 42), api({
      filter: { desk: { filterType: 'set', values: ['Govies'] } },
      selected: 0,
      selectionState: { selectAll: true, toggledNodes: ['a', 'b'] },
    }));
    await waitFor(() => expect(result.current.filtered).toBe(42));
    expect(result.current.selected).toBe(40);
  });

  it('counts the toggled ids when select-all is off, and ignores group-shaped state', async () => {
    const flat = mount(provider(), api({
      selected: 0,
      selectionState: { selectAll: false, toggledNodes: ['a', 'b', 'c'] },
    }));
    await waitFor(() => expect(flat.result.current.selected).toBe(3));

    const grouped = mount(provider(), api({
      selected: 2,
      selectionState: { selectAll: false, toggledNodes: [{ nodeId: 'g', selectAllChildren: true }] },
    }));
    await waitFor(() => expect(grouped.result.current.total).toBeGreaterThan(0));
    expect(grouped.result.current.selected).toBe(2);
  });

  it('re-reads on the live-feed interval', async () => {
    const ticks: Array<() => void> = [];
    const nativeSetInterval = globalThis.setInterval;
    const intervalSpy = vi.spyOn(globalThis, 'setInterval').mockImplementation(((
      fn: TimerHandler,
      ms?: number,
      ...args: unknown[]
    ) => {
      if (ms === SSRM_COUNT_REFRESH_MS) {
        ticks.push(fn as () => void);
        return 1 as unknown as ReturnType<typeof setInterval>;
      }
      return nativeSetInterval(fn, ms, ...args);
    }) as typeof setInterval);
    let n = 1;
    const p = {
      getRowCount: vi.fn(async () => ({ rowCount: n++ })),
      getAggregates: vi.fn(async () => ({ values: {} })),
    } as unknown as ISsrmDataProvider;
    const { result } = mount(p, api());
    await waitFor(() => expect(result.current.total).toBeGreaterThan(0));
    const first = result.current.total;
    ticks[0]();
    await waitFor(() => expect(result.current.total).toBeGreaterThan(first));
    intervalSpy.mockRestore();
  });

  it('shares one poll across every panel on the same grid', async () => {
    const p = provider();
    const shared = api();
    mount(p, shared);
    mount(p, shared);
    await waitFor(() => expect(p.getRowCount).toHaveBeenCalledTimes(2));
  });
});
