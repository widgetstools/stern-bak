import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Column, GridApi } from 'ag-grid-community';
import { GridPlatform } from '@wellsfargo-starui/engine';
import { GridProvider } from '../customizer/hooks/GridProvider.js';
import {
  readAllColumnIds,
  readCellDataType,
  readFirstRowValue,
  readHeaderName,
  resolveToolbarPickerDataType,
  useActiveColumns,
  useFlashConfirm,
} from './formattingToolbarHooks';

function makeApi(
  cols: Array<{ id: string; cellDataType?: string; headerName?: string }>,
  rowData?: Record<string, unknown>,
): GridApi {
  const toColumn = (c: { id: string; cellDataType?: string; headerName?: string }): Column =>
    ({
      getColId: () => c.id,
      getColDef: () => ({ cellDataType: c.cellDataType, headerName: c.headerName }),
    }) as Column;

  return {
    getColumn: ((id: string) => {
      const c = cols.find((x) => x.id === id);
      return c ? toColumn(c) : null;
    }) as GridApi['getColumn'],
    getColumns: () => cols.map(toColumn),
    getDisplayedRowAtIndex: () =>
      rowData ? ({ data: rowData } as ReturnType<GridApi['getDisplayedRowAtIndex']>) : null,
  } as GridApi;
}

describe('resolveToolbarPickerDataType', () => {
  it('maps dateString columns to datetime presets', () => {
    const api = makeApi([{ id: 'asOf', cellDataType: 'dateString' }]);
    expect(resolveToolbarPickerDataType(api, 'asOf')).toBe('datetime');
  });

  it('maps dateTimeString columns to datetime presets', () => {
    const api = makeApi([{ id: 'asOf', cellDataType: 'dateTimeString' }]);
    expect(resolveToolbarPickerDataType(api, 'asOf')).toBe('datetime');
  });

  it('maps date columns with ISO timestamps to datetime presets', () => {
    const api = makeApi(
      [{ id: 'asOf', cellDataType: 'date' }],
      { asOf: '2026-06-01T18:30:00Z' },
    );
    expect(resolveToolbarPickerDataType(api, 'asOf')).toBe('datetime');
  });

  it('keeps plain date columns on date-only presets', () => {
    const api = makeApi(
      [{ id: 'asOf', cellDataType: 'date' }],
      { asOf: '2026-06-01' },
    );
    expect(resolveToolbarPickerDataType(api, 'asOf')).toBe('date');
  });

  it('defaults to number when colId is missing', () => {
    expect(resolveToolbarPickerDataType(makeApi([]), undefined)).toBe('number');
  });

  it('maps boolean and string column types', () => {
    expect(resolveToolbarPickerDataType(makeApi([{ id: 'x', cellDataType: 'boolean' }]), 'x')).toBe('boolean');
    expect(resolveToolbarPickerDataType(makeApi([{ id: 'x', cellDataType: 'text' }]), 'x')).toBe('string');
  });

  it('treats Date values with time as datetime', () => {
    const api = makeApi([{ id: 'ts', cellDataType: 'date' }], {
      ts: new Date('2026-06-01T12:30:00Z'),
    });
    expect(resolveToolbarPickerDataType(api, 'ts')).toBe('datetime');
  });
});

describe('grid api micro-helpers', () => {
  it('returns safe defaults when api is null or throws', () => {
    expect(readCellDataType(null, 'x')).toBeUndefined();
    expect(readHeaderName(null, 'x')).toBeUndefined();
    expect(readAllColumnIds(null)).toEqual([]);
    expect(readFirstRowValue(null, 'x')).toBeUndefined();

    const throwing = {
      getColumn: () => {
        throw new Error('boom');
      },
      getColumns: () => {
        throw new Error('boom');
      },
      getDisplayedRowAtIndex: () => {
        throw new Error('boom');
      },
    } as unknown as GridApi;

    expect(readCellDataType(throwing, 'x')).toBeUndefined();
    expect(readHeaderName(throwing, 'x')).toBeUndefined();
    expect(readAllColumnIds(throwing)).toEqual([]);
    expect(readFirstRowValue(throwing, 'x')).toBeUndefined();
  });

  it('reads column metadata and row values', () => {
    const api = makeApi(
      [{ id: 'qty', cellDataType: 'number', headerName: 'Qty' }],
      { qty: 42 },
    );
    expect(readCellDataType(api, 'qty')).toBe('number');
    expect(readHeaderName(api, 'qty')).toBe('Qty');
    expect(readAllColumnIds(api)).toEqual(['qty']);
    expect(readFirstRowValue(api, 'qty')).toBe(42);
  });
});

describe('useActiveColumns', () => {
  let platform: GridPlatform;

  beforeEach(() => {
    platform = new GridPlatform({ gridId: 'active-cols', modules: [] });
  });

  it('tracks focused column after grid ready', async () => {
    const api = {
      getCellRanges: () => [],
      getFocusedCell: () => ({ column: { getColId: () => 'price' } }),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as GridApi;
    platform.onGridReady(api);

    const { result } = renderHook(() => useActiveColumns(), {
      wrapper: ({ children }) => <GridProvider platform={platform}>{children}</GridProvider>,
    });

    await waitFor(() => {
      expect(result.current).toEqual(['price']);
    });
  });
});

describe('useFlashConfirm', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('flashes confirmed state then clears after timeout', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useFlashConfirm());

    act(() => {
      result.current[1]();
    });
    expect(result.current[0]).toBe(true);

    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(result.current[0]).toBe(false);
  });
});
