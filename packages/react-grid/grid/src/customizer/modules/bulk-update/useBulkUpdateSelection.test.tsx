/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GridApi } from 'ag-grid-community';
import { GridPlatform } from '@wellsfargo-starui/core';
import { GridProvider } from '../../hooks/GridProvider';
import { useBulkUpdateSelection } from './useBulkUpdateSelection';
import { bulkUpdateModule } from './index';

function makeMockApi(withSelection = true) {
  const listeners = new Map<string, Set<() => void>>();
  const api: Partial<GridApi> = {
    getCellRanges: () => (withSelection ? [{
      columns: [{ getColId: () => 'qty' }],
      startRow: { rowIndex: 0 },
      endRow: { rowIndex: 0 },
    }] : []),
    getDisplayedRowAtIndex: () => ({
      id: 'r1',
      data: { id: 'r1', qty: 10 },
    }),
    getColumn: () => ({
      getColId: () => 'qty',
      getColDef: () => ({ field: 'qty', editable: true, cellDataType: 'number' }),
    }),
    getCellValue: () => 10,
    getFocusedCell: () => null,
    getRowNode: () => ({ data: { id: 'r1', qty: 10 } }),
    addEventListener: (evt: string, fn: () => void) => {
      if (!listeners.has(evt)) listeners.set(evt, new Set());
      listeners.get(evt)!.add(fn);
    },
    removeEventListener: (evt: string, fn: () => void) => {
      listeners.get(evt)?.delete(fn);
    },
  };
  return { api: api as GridApi, listeners };
}

function wrap(platform: GridPlatform) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <GridProvider platform={platform}>{children}</GridProvider>;
  };
}

describe('useBulkUpdateSelection', () => {
  let platform: GridPlatform;

  beforeEach(() => {
    platform = new GridPlatform({ gridId: 'test-grid', modules: [bulkUpdateModule] });
  });

  it('returns empty selection before grid api attaches', () => {
    const { result } = renderHook(() => useBulkUpdateSelection(), { wrapper: wrap(platform) });
    expect(result.current.count).toBe(0);
    expect(result.current.cells).toEqual([]);
  });

  it('reflects selected cells after grid ready', () => {
    const { api } = makeMockApi(true);
    platform.onGridReady(api);
    const { result } = renderHook(() => useBulkUpdateSelection(), { wrapper: wrap(platform) });
    expect(result.current.count).toBe(1);
    expect(result.current.cells[0]?.colId).toBe('qty');
  });

  it('recomputes when cellSelectionChanged fires', () => {
    const { api, listeners } = makeMockApi(true);
    platform.onGridReady(api);
    const { result } = renderHook(() => useBulkUpdateSelection(), { wrapper: wrap(platform) });
    expect(result.current.count).toBe(1);

    (api.getCellRanges as ReturnType<typeof vi.fn>) = vi.fn(() => []);
    act(() => {
      for (const fn of listeners.get('cellSelectionChanged') ?? []) fn();
    });
    expect(result.current.count).toBe(0);
  });
});
