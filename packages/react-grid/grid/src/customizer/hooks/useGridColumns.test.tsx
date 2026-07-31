import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Column, GridApi } from 'ag-grid-community';
import { GridPlatform, type Module } from '@wellsfargo-starui/engine';
import { GridProvider } from './GridProvider';
import { useGridColumns } from './useGridColumns';

/**
 * Narrow fake GridApi + Column just enough to drive useGridColumns.
 * Exposes helpers to push column-structure events through the same
 * addEventListener surface ApiHub wires into.
 */
interface FakeCol {
  id: string;
  headerName?: string;
  cellDataType?: string;
}

interface FakeApi {
  cols: FakeCol[];
  listeners: Map<string, Set<() => void>>;
}

function makeFakeApi(cols: FakeCol[]): { api: GridApi; raw: FakeApi } {
  const raw: FakeApi = { cols, listeners: new Map() };
  const api: Partial<GridApi> = {
    getColumns: () =>
      raw.cols.map((c) => ({
        getColId: () => c.id,
        getColDef: () => ({
          headerName: c.headerName,
          cellDataType: c.cellDataType,
        }),
      }) as Column),
    addEventListener: (evt: string, fn: () => void) => {
      if (!raw.listeners.has(evt)) raw.listeners.set(evt, new Set());
      raw.listeners.get(evt)!.add(fn);
    },
    removeEventListener: (evt: string, fn: () => void) => {
      raw.listeners.get(evt)?.delete(fn);
    },
  } as Partial<GridApi>;
  return { api: api as GridApi, raw };
}

function fire(raw: FakeApi, evt: string) {
  const ls = raw.listeners.get(evt);
  if (!ls) return;
  for (const fn of Array.from(ls)) fn();
}

const NOOP_MODULE: Module<unknown> = {
  id: 'noop',
  name: 'Noop',
  schemaVersion: 1,
  priority: 0,
  getInitialState: () => ({}),
  serialize: (s) => s,
  deserialize: () => ({}),
};

function bootPlatform(cols: FakeCol[]) {
  const platform = new GridPlatform({ gridId: 'g', modules: [NOOP_MODULE] });
  const { api, raw } = makeFakeApi(cols);
  platform.onGridReady(api);
  return { platform, api, raw };
}

function wrap(platform: GridPlatform) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <GridProvider platform={platform}>{children}</GridProvider>;
  };
}

describe('useGridColumns', () => {
  let platform: GridPlatform;
  let raw: FakeApi;

  beforeEach(() => {
    const boot = bootPlatform([
      { id: 'id', headerName: 'Order ID', cellDataType: 'text' },
      { id: 'price', headerName: 'Price', cellDataType: 'number' },
      { id: 'qty', headerName: 'Qty' },
    ]);
    platform = boot.platform;
    raw = boot.raw;
  });

  it('returns the current column set on mount', () => {
    const { result } = renderHook(() => useGridColumns(), { wrapper: wrap(platform) });
    expect(result.current.map((c) => c.colId)).toEqual(['id', 'price', 'qty']);
    expect(result.current[1]).toEqual({
      colId: 'price',
      headerName: 'Price',
      cellDataType: 'number',
    });
  });

  it('filters internal ag-Grid-* columns by default', () => {
    const { platform: p, raw: r } = bootPlatform([
      { id: 'ag-Grid-SelectionColumn' },
      { id: 'real-col', headerName: 'Real' },
    ]);
    const { result } = renderHook(() => useGridColumns(), { wrapper: wrap(p) });
    expect(result.current.map((c) => c.colId)).toEqual(['real-col']);
    // includeInternal opt-in
    const { result: inc } = renderHook(() => useGridColumns({ includeInternal: true }), { wrapper: wrap(p) });
    expect(inc.current.map((c) => c.colId)).toContain('ag-Grid-SelectionColumn');
    void r;
  });

  it('returns a STABLE reference across renders when the column set is unchanged', () => {
    const { result, rerender } = renderHook(() => useGridColumns(), { wrapper: wrap(platform) });
    const first = result.current;
    rerender();
    rerender();
    expect(result.current).toBe(first);
  });

  it('re-renders with a NEW reference when a column is added', () => {
    const { result } = renderHook(() => useGridColumns(), { wrapper: wrap(platform) });
    const before = result.current;
    expect(before.length).toBe(3);

    act(() => {
      raw.cols.push({ id: 'spread', headerName: 'Spread', cellDataType: 'number' });
      fire(raw, 'columnEverythingChanged');
    });

    expect(result.current.length).toBe(4);
    expect(result.current).not.toBe(before);
    expect(result.current.at(-1)?.colId).toBe('spread');
  });

  it('does NOT re-render on unrelated events', () => {
    let renders = 0;
    renderHook(() => { renders++; return useGridColumns(); }, { wrapper: wrap(platform) });
    const base = renders;

    // columnResized isn't in our subscribed set → fingerprint stays,
    // React never re-runs the hook body.
    act(() => fire(raw, 'columnResized'));

    expect(renders).toBe(base);
  });

  it('unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useGridColumns(), { wrapper: wrap(platform) });
    const countBefore = raw.listeners.get('columnEverythingChanged')?.size ?? 0;
    expect(countBefore).toBeGreaterThan(0);
    unmount();
    expect(raw.listeners.get('columnEverythingChanged')?.size ?? 0).toBe(0);
  });

  it('safely returns [] when the grid api isn\'t attached yet', () => {
    const p = new GridPlatform({ gridId: 'no-api', modules: [NOOP_MODULE] });
    // No onGridReady → api is null.
    const { result } = renderHook(() => useGridColumns(), { wrapper: wrap(p) });
    expect(result.current).toEqual([]);
  });

  it('getColumns throwing does not crash the hook', () => {
    const p = new GridPlatform({ gridId: 'broken', modules: [NOOP_MODULE] });
    const api = {
      getColumns: () => { throw new Error('AG-Grid teardown race'); },
      addEventListener: () => {},
      removeEventListener: () => {},
    } as unknown as GridApi;
    p.onGridReady(api);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderHook(() => useGridColumns(), { wrapper: wrap(p) });
    expect(result.current).toEqual([]);
    warn.mockRestore();
  });
});
