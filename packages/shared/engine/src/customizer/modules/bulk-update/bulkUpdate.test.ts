import { describe, expect, it } from 'vitest';
import {
  buildBulkUpdatePatches,
  buildBulkUpdatePatchesFromRaw,
  parseBulkUpdateValue,
} from './applyBulkUpdate.js';
import { collectBulkUpdateTargets } from './collectBulkUpdateTargets.js';
import { isBulkUpdateCellType } from './isBulkUpdateCellType.js';
import { resolveColumnDistinctValues } from './resolveColumnDistinctValues.js';
import { deserializeBulkUpdateState, INITIAL_BULK_UPDATE } from './state.js';

describe('bulk-update state', () => {
  it('deserializes defaults', () => {
    expect(deserializeBulkUpdateState(null)).toEqual(INITIAL_BULK_UPDATE);
  });
});

describe('isBulkUpdateCellType', () => {
  it('allows text number and date types', () => {
    expect(isBulkUpdateCellType('text')).toBe(true);
    expect(isBulkUpdateCellType('number')).toBe(true);
    expect(isBulkUpdateCellType('date')).toBe(true);
    expect(isBulkUpdateCellType('boolean')).toBe(false);
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
});
