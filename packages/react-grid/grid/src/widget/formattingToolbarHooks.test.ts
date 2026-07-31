import { describe, expect, it } from 'vitest';
import type { Column, GridApi } from 'ag-grid-community';
import { resolveToolbarPickerDataType } from './formattingToolbarHooks';

function makeApi(
  cols: Array<{ id: string; cellDataType?: string }>,
  rowData?: Record<string, unknown>,
): GridApi {
  const toColumn = (c: { id: string; cellDataType?: string }): Column =>
    ({
      getColId: () => c.id,
      getColDef: () => ({ cellDataType: c.cellDataType }),
    }) as Column;

  return {
    getColumn: ((id: string) => {
      const c = cols.find((x) => x.id === id);
      return c ? toColumn(c) : null;
    }) as GridApi['getColumn'],
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
});
