import { describe, expect, it } from 'vitest';
import {
  buildBulkUpdatePatches,
  buildBulkUpdatePatchesFromRaw,
  parseBulkUpdateValue,
} from './applyBulkUpdate.js';
import { collectBulkUpdateTargets } from './collectBulkUpdateTargets.js';
import { bulkUpdateValueKind, isBulkUpdateCellType } from './isBulkUpdateCellType.js';
import { resolveColumnDistinctValues } from './resolveColumnDistinctValues.js';
import { deserializeBulkUpdateState, INITIAL_BULK_UPDATE } from './state.js';

describe('bulk-update state', () => {
  it('deserializes defaults', () => {
    expect(deserializeBulkUpdateState(null)).toEqual(INITIAL_BULK_UPDATE);
  });

  it('merges partial settings and rejects invalid numbers', () => {
    const state = deserializeBulkUpdateState({
      settings: {
        enabled: false,
        confirmThreshold: -5,
        maxDropdownValues: 0,
        showDistinctValues: false,
      },
    });
    expect(state.settings.enabled).toBe(false);
    expect(state.settings.confirmThreshold).toBe(INITIAL_BULK_UPDATE.settings.confirmThreshold);
    expect(state.settings.maxDropdownValues).toBe(INITIAL_BULK_UPDATE.settings.maxDropdownValues);
    expect(state.settings.showDistinctValues).toBe(false);
  });
});

describe('isBulkUpdateCellType', () => {
  it('allows text number and date types', () => {
    expect(isBulkUpdateCellType(undefined)).toBe(true);
    expect(isBulkUpdateCellType('text')).toBe(true);
    expect(isBulkUpdateCellType('number')).toBe(true);
    expect(isBulkUpdateCellType('date')).toBe(true);
    expect(isBulkUpdateCellType('dateString')).toBe(true);
    expect(isBulkUpdateCellType('dateTime')).toBe(true);
    expect(isBulkUpdateCellType('boolean')).toBe(false);
  });
});

describe('bulkUpdateValueKind', () => {
  it('maps cell data types to editor value kinds', () => {
    expect(bulkUpdateValueKind('number')).toBe('number');
    expect(bulkUpdateValueKind('date')).toBe('date');
    expect(bulkUpdateValueKind('dateTimeString')).toBe('date');
    expect(bulkUpdateValueKind('text')).toBe('text');
    expect(bulkUpdateValueKind(undefined)).toBe('text');
  });
});

describe('collectBulkUpdateTargets', () => {
  it('collects editable text cells from range', () => {
    const api = {
      getCellRanges: () => [{
        columns: [{ getColId: () => 'currency' }],
        startRow: { rowIndex: 0 },
        endRow: { rowIndex: 1 },
      }],
      getDisplayedRowAtIndex: (i: number) => ({
        id: `r${i}`,
        data: { id: `r${i}`, currency: i === 0 ? 'USD' : 'EUR' },
      }),
      getColumn: () => ({
        getColDef: () => ({ editable: true, field: 'currency', cellDataType: 'text' }),
      }),
      getCellValue: ({ rowNode }: { rowNode: { data?: { currency?: string } } }) =>
        rowNode.data?.currency,
      getFocusedCell: () => null,
    };
    const targets = collectBulkUpdateTargets(api, (d) => String(d.id));
    expect(targets).toHaveLength(2);
    expect(targets[0]?.field).toBe('currency');
  });

  it('skips non-editable numeric-only restriction — allows text not boolean', () => {
    const api = {
      getCellRanges: () => [{
        columns: [{ getColId: () => 'flag' }],
        startRow: { rowIndex: 0 },
        endRow: { rowIndex: 0 },
      }],
      getDisplayedRowAtIndex: () => ({ id: 'r1', data: { id: 'r1' } }),
      getColumn: () => ({
        getColDef: () => ({ editable: true, field: 'flag', cellDataType: 'boolean' }),
      }),
      getCellValue: () => true,
      getFocusedCell: () => null,
    };
    expect(collectBulkUpdateTargets(api, (d) => String(d.id))).toHaveLength(0);
  });

  it('falls back to focused cell when range yields nothing', () => {
    const api = {
      getCellRanges: () => [],
      getDisplayedRowAtIndex: (i: number) =>
        i === 2 ? { id: 'r2', data: { id: 'r2', qty: 5 } } : undefined,
      getColumn: () => ({
        getColDef: () => ({ editable: true, field: 'qty', cellDataType: 'number' }),
      }),
      getCellValue: () => 5,
      getFocusedCell: () => ({ rowIndex: 2, column: { getColId: () => 'qty' } }),
    };
    const targets = collectBulkUpdateTargets(api, (d) => String(d.id));
    expect(targets).toEqual([{ rowId: 'r2', colId: 'qty', field: 'qty', value: 5, cellDataType: 'number' }]);
  });

  it('skips selection column, missing columns, and function editable that throws', () => {
    const api = {
      getCellRanges: () => [{
        columns: [
          { getColId: () => 'ag-Grid-SelectionColumn' },
          { getColId: () => 'ghost' },
          { getColId: () => 'qty' },
        ],
        startRow: { rowIndex: 0 },
        endRow: { rowIndex: 0 },
      }],
      getDisplayedRowAtIndex: () => ({ id: 'r1', data: { id: 'r1' } }),
      getColumn: (colId: string) =>
        colId === 'qty'
          ? {
              getColDef: () => ({
                editable: () => { throw new Error('no'); },
                field: 'qty',
                cellDataType: 'number',
              }),
            }
          : null,
      getCellValue: () => 1,
      getFocusedCell: () => null,
    };
    expect(collectBulkUpdateTargets(api, (d) => String(d.id))).toHaveLength(0);
  });

  it('honors editable false and function editable returning false', () => {
    const base = {
      getCellRanges: () => [{
        columns: [{ getColId: () => 'qty' }],
        startRow: { rowIndex: 0 },
        endRow: { rowIndex: 0 },
      }],
      getDisplayedRowAtIndex: () => ({ id: 'r1', data: { id: 'r1' } }),
      getCellValue: () => 1,
      getFocusedCell: () => null,
    };
    expect(collectBulkUpdateTargets({
      ...base,
      getColumn: () => ({ getColDef: () => ({ editable: false, field: 'qty', cellDataType: 'number' }) }),
    }, (d) => String(d.id))).toHaveLength(0);

    expect(collectBulkUpdateTargets({
      ...base,
      getColumn: () => ({
        getColDef: () => ({
          editable: () => false,
          field: 'qty',
          cellDataType: 'number',
        }),
      }),
    }, (d) => String(d.id))).toHaveLength(0);
  });

  it('dedupes the same cell across overlapping ranges', () => {
    const api = {
      getCellRanges: () => [
        {
          columns: [{ getColId: () => 'qty' }],
          startRow: { rowIndex: 0 },
          endRow: { rowIndex: 0 },
        },
        {
          columns: [{ getColId: () => 'qty' }],
          startRow: { rowIndex: 0 },
          endRow: { rowIndex: 0 },
        },
      ],
      getDisplayedRowAtIndex: () => ({ id: 'r1', data: { id: 'r1', qty: 1 } }),
      getColumn: () => ({
        getColDef: () => ({ editable: true, field: 'qty', cellDataType: 'number' }),
      }),
      getCellValue: () => 1,
      getFocusedCell: () => null,
    };
    expect(collectBulkUpdateTargets(api, (d) => String(d.id))).toHaveLength(1);
  });
});

describe('buildBulkUpdatePatches', () => {
  it('builds set patches for all targets', () => {
    const patches = buildBulkUpdatePatches(
      [
        { rowId: 'r1', colId: 'currency', field: 'currency', value: 'USD' },
        { rowId: 'r2', colId: 'currency', field: 'currency', value: 'GBP' },
      ],
      'EUR',
    );
    expect(patches).toHaveLength(2);
    expect(patches[0]?.newValue).toBe('EUR');
    expect(patches[1]?.oldValue).toBe('GBP');
  });

  it('parses numeric raw values', () => {
    expect(parseBulkUpdateValue('42', 'number')).toBe(42);
    expect(buildBulkUpdatePatchesFromRaw(
      [{ rowId: 'r1', colId: 'qty', field: 'qty', value: 10, cellDataType: 'number' }],
      '99',
    )[0]?.newValue).toBe(99);
  });
});

describe('resolveColumnDistinctValues', () => {
  it('returns sorted distinct values up to limit', () => {
    const api = {
      getDisplayedRowCount: () => 3,
      getDisplayedRowAtIndex: (i: number) => ({ id: `r${i}` }),
      getCellValue: ({ rowNode }: { rowNode: { id?: string } }) =>
        rowNode.id === 'r0' ? 'USD' : rowNode.id === 'r1' ? 'EUR' : 'USD',
    };
    const values = resolveColumnDistinctValues(api as never, 'currency', 10);
    expect(values).toEqual(['EUR', 'USD']);
  });

  it('sorts nulls last and stops at limit', () => {
    const api = {
      getDisplayedRowCount: () => 4,
      getDisplayedRowAtIndex: (i: number) => ({ id: `r${i}` }),
      getCellValue: ({ rowNode }: { rowNode: { id?: string } }) => {
        if (rowNode.id === 'r0') return null;
        if (rowNode.id === 'r1') return 2;
        if (rowNode.id === 'r2') return 1;
        return 1;
      },
    };
    expect(resolveColumnDistinctValues(api as never, 'qty', 2)).toEqual([2, null]);
  });

  it('skips missing row nodes', () => {
    const api = {
      getDisplayedRowCount: () => 1,
      getDisplayedRowAtIndex: () => undefined,
      getCellValue: () => 'x',
    };
    expect(resolveColumnDistinctValues(api as never, 'col', 5)).toEqual([]);
  });
});
