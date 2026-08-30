/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { GridApi } from 'ag-grid-community';
import { useGridContextLink } from './useGridContextLink.js';

function fakeApi(selectedNodes: unknown[] = []): GridApi {
  const listeners = new Map<string, Set<() => void>>();
  return {
    getSelectedNodes: () => selectedNodes,
    getFilterModel: () => ({}),
    setFilterModel: vi.fn(),
    setGridOption: vi.fn(),
    onFilterChanged: vi.fn(),
    getColumn: (id: string) => ({ colId: id }),
    addEventListener: (event: string, fn: () => void) => {
      let set = listeners.get(event);
      if (!set) listeners.set(event, (set = new Set()));
      set.add(fn);
    },
    removeEventListener: (event: string, fn: () => void) => {
      listeners.get(event)?.delete(fn);
    },
    __fireSelection: () => listeners.get('selectionChanged')?.forEach((fn) => fn()),
  } as unknown as GridApi & { __fireSelection: () => void };
}

function fakeFdc3() {
  const handlers = new Map<string, Set<(ctx: unknown) => void>>();
  return {
    current: 'purple' as string | null,
    broadcast: vi.fn().mockResolvedValue(undefined),
    join: vi.fn(),
    leave: vi.fn(),
    addContextListener: (type: string, handler: (ctx: unknown) => void) => {
      let set = handlers.get(type);
      if (!set) handlers.set(type, (set = new Set()));
      set.add(handler);
      return () => set!.delete(handler);
    },
    __emit: (type: string, ctx: unknown) => handlers.get(type)?.forEach((h) => h(ctx)),
  };
}

afterEach(() => {
  cleanup();
  delete (window as any).fin;
});

describe('useGridContextLink', () => {
  it('does nothing when linking is disabled', () => {
    const api = fakeApi([{ data: { id: '1' } }]);
    const fdc3 = fakeFdc3();
    renderHook(() =>
      useGridContextLink({
        gridApi: api,
        fdc3,
        instanceId: 'grid-a',
        config: { enabled: false },
      }),
    );
    act(() => {
      (api as any).__fireSelection();
    });
    expect(fdc3.broadcast).not.toHaveBeenCalled();
  });

  it('broadcasts selection on change in rowId mode (debounced)', () => {
    vi.useFakeTimers();
    const api = fakeApi([{ id: 'row-1', data: { id: 'row-1' } }]);
    const fdc3 = fakeFdc3();
    const onPublish = vi.fn();
    renderHook(() =>
      useGridContextLink({
        gridApi: api,
        fdc3,
        instanceId: 'grid-a',
        config: { enabled: true, mode: 'rowId' },
        onPublish,
      }),
    );
    act(() => {
      (api as any).__fireSelection();
      // A rapid burst (held shift+arrow) collapses to ONE publish at the
      // trailing edge of the debounce window.
      (api as any).__fireSelection();
      (api as any).__fireSelection();
    });
    expect(fdc3.broadcast).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(fdc3.broadcast).toHaveBeenCalledTimes(1);
    expect(onPublish).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('applies peer context and notifies on receive', () => {
    const api = fakeApi();
    const fdc3 = fakeFdc3();
    const onReceive = vi.fn();
    renderHook(() =>
      useGridContextLink({
        gridApi: api,
        fdc3,
        instanceId: 'grid-a',
        config: { enabled: true, mode: 'fields', rowIdField: 'symbol' },
        onReceive,
      }),
    );
    act(() => {
      fdc3.__emit('starui.gridSelection', {
        type: 'starui.gridSelection',
        source: 'peer-grid',
        criteria: { symbol: ['MSFT'] },
      });
    });
    expect(onReceive).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'peer-grid' }),
    );
  });

  it('swallows removeEventListener when grid is destroyed', () => {
    const api = fakeApi([{ data: { symbol: 'A' } }]);
    const fdc3 = fakeFdc3();
    const { unmount } = renderHook(() =>
      useGridContextLink({
        gridApi: api,
        fdc3,
        instanceId: 'grid-a',
        config: { enabled: true },
      }),
    );
    vi.spyOn(api, 'removeEventListener').mockImplementation(() => {
      throw new Error('destroyed');
    });
    expect(() => unmount()).not.toThrow();
  });

  it('ignores its own broadcast echo on receive', () => {
    vi.useFakeTimers();
    const api = fakeApi([{ id: 'row-1', data: { id: 'row-1' } }]);
    const fdc3 = fakeFdc3();
    const onReceive = vi.fn();
    renderHook(() =>
      useGridContextLink({
        gridApi: api,
        fdc3,
        instanceId: 'grid-a',
        config: { enabled: true, mode: 'rowId' },
        onReceive,
      }),
    );
    act(() => {
      (api as any).__fireSelection();
      vi.advanceTimersByTime(150); // flush the publish debounce
    });
    vi.useRealTimers();
    const source = (fdc3.broadcast.mock.calls[0]?.[0] as { source?: string })?.source;
    act(() => {
      fdc3.__emit('starui.gridSelection', {
        type: 'starui.gridSelection',
        source,
        criteria: { rowIds: ['row-1'] },
      });
    });
    expect(onReceive).not.toHaveBeenCalled();
  });

  it('applies rowId filters in rowId receive mode', () => {
    const api = fakeApi();
    const fdc3 = fakeFdc3();
    renderHook(() =>
      useGridContextLink({
        gridApi: api,
        fdc3,
        instanceId: 'grid-a',
        config: { enabled: true, mode: 'rowId', receive: true },
      }),
    );
    act(() => {
      fdc3.__emit('starui.gridSelection', {
        type: 'starui.gridSelection',
        source: 'peer',
        rowIds: ['r1'],
      });
    });
    expect(api.setGridOption).toHaveBeenCalledWith('isExternalFilterPresent', expect.any(Function));
  });

  it('skips publish when receive-only linking is configured', () => {
    const api = fakeApi([{ id: 'row-1', data: { id: 'row-1' } }]);
    const fdc3 = fakeFdc3();
    renderHook(() =>
      useGridContextLink({
        gridApi: api,
        fdc3,
        instanceId: 'grid-a',
        config: { enabled: true, publish: false },
      }),
    );
    act(() => {
      (api as any).__fireSelection();
    });
    expect(fdc3.broadcast).not.toHaveBeenCalled();
  });
});
