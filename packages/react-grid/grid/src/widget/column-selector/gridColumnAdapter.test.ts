import { describe, expect, it, vi } from 'vitest';
import type { Column, GridApi } from 'ag-grid-community';
import { applyColumnSelection, readGridColumns } from './gridColumnAdapter.js';

function makeColumn(
  colId: string,
  opts: { headerName?: string; hidden?: boolean; locked?: boolean } = {},
): Column {
  return {
    getColId: () => colId,
    getColDef: () => ({
      headerName: opts.headerName,
      lockVisible: opts.locked === true,
    }),
    isVisible: () => opts.hidden !== true,
  } as Column;
}

describe('gridColumnAdapter', () => {
  it('readGridColumns skips internal ag-Grid columns', () => {
    const api = {
      getColumns: () => [
        makeColumn('ag-Grid-AutoColumn'),
        makeColumn('price', { headerName: 'Price' }),
      ],
    } as unknown as GridApi;

    expect(readGridColumns(api)).toEqual([
      { colId: 'price', headerName: 'Price', hidden: false, locked: false },
    ]);
  });

  it('falls back to colId when headerName is missing', () => {
    const api = {
      getColumns: () => [makeColumn('qty')],
    } as unknown as GridApi;
    expect(readGridColumns(api)[0]?.headerName).toBe('qty');
  });

  it('applyColumnSelection delegates to api.applyColumnState', () => {
    const applyColumnState = vi.fn();
    const api = { applyColumnState } as unknown as GridApi;
    applyColumnSelection(api, {
      visible: [{ colId: 'a', headerName: 'A', hidden: false, locked: false }],
      available: [{ colId: 'b', headerName: 'B', hidden: true, locked: false }],
    });
    expect(applyColumnState).toHaveBeenCalledWith(
      expect.objectContaining({ applyOrder: true }),
    );
  });
});
