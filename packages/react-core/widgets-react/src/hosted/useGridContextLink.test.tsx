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

  it('broadcasts selection on change in rowId mode', () => {
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
    });
    expect(fdc3.broadcast).toHaveBeenCalled();
    expect(onPublish).toHaveBeenCalled();
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
});
