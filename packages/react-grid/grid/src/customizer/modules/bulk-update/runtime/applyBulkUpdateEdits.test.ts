import { describe, expect, it } from 'vitest';
import { EditJournal } from '@wellsfargo-starui/core';
import { makeFakeEditPlatform } from '../../../editing/applyAndRecord.test.js';
import { applyBulkUpdateEdits, resolveBulkUpdateTargets } from './applyBulkUpdateEdits.js';

const CURRENCY_TARGET = {
  rowId: 'r1',
  colId: 'currency',
  field: 'currency',
  value: 'USD',
  cellDataType: 'text',
};

describe('applyBulkUpdateEdits', () => {
  it('writes the parsed value through the port', async () => {
    const fx = makeFakeEditPlatform({ r1: { id: 'r1', currency: 'USD', ticker: 'ABC' } });

    const result = await applyBulkUpdateEdits(fx.platform, [CURRENCY_TARGET], 'EUR');

    expect(result.applied).toHaveLength(1);
    expect(fx.mutations).toEqual([[{ rowId: 'r1', fields: { currency: 'EUR' } }]]);
    expect(fx.rows.r1).toEqual({ id: 'r1', currency: 'EUR', ticker: 'ABC' });
  });

  it('records journal entry when journal provided', async () => {
    const fx = makeFakeEditPlatform({ r1: { id: 'r1', currency: 'USD' } });
    const journal = new EditJournal();

    await applyBulkUpdateEdits(fx.platform, [CURRENCY_TARGET], 'EUR', { journal });

    expect(journal.canUndo).toBe(true);
    expect(journal.entries[0]?.source).toBe('bulk-update');
  });

  it('records nothing when the port refuses the row', async () => {
    const fx = makeFakeEditPlatform({ r1: { id: 'r1', currency: 'USD' } });
    fx.refuseWhen(() => 'That row is not loaded.');
    const journal = new EditJournal();

    const result = await applyBulkUpdateEdits(fx.platform, [CURRENCY_TARGET], 'EUR', { journal });

    expect(result.ok).toBe(false);
    expect(journal.entries).toEqual([]);
  });

  it('resolveBulkUpdateTargets collects editable selected cells', () => {
    const api = {
      getCellRanges: () => [{
        columns: [{ getColId: () => 'currency' }],
        startRow: { rowIndex: 0 },
        endRow: { rowIndex: 0 },
      }],
      getDisplayedRowAtIndex: () => ({ id: 'r1', data: { id: 'r1', currency: 'USD' } }),
      getColumn: () => ({
        getColDef: () => ({ field: 'currency', editable: true, cellDataType: 'text' }),
      }),
      getCellValue: () => 'USD',
      getFocusedCell: () => null,
      getRowNode: () => ({ data: { id: 'r1', currency: 'USD' } }),
    } as never;

    const { targets, unreachableRows } = resolveBulkUpdateTargets(api);
    expect(targets).toHaveLength(1);
    expect(targets[0]?.colId).toBe('currency');
    expect(unreachableRows).toBe(0);
  });

  it('resolveBulkUpdateTargets reports selected rows the grid has not loaded', () => {
    const api = {
      getCellRanges: () => [{
        columns: [{ getColId: () => 'currency' }],
        startRow: { rowIndex: 0 },
        endRow: { rowIndex: 2 },
      }],
      getDisplayedRowAtIndex: (i: number) =>
        i === 0 ? { id: 'r0', data: { id: 'r0', currency: 'USD' } } : { id: undefined, data: undefined },
      getColumn: () => ({
        getColDef: () => ({ field: 'currency', editable: true, cellDataType: 'text' }),
      }),
      getCellValue: () => 'USD',
      getFocusedCell: () => null,
    } as never;

    expect(resolveBulkUpdateTargets(api).unreachableRows).toBe(2);
  });
});

/**
 * `resolveBulkUpdateTargets` is the thin adapter that gives the shared
 * collector a way to identify a row. Its own decision is that `rowIdField`
 * — not the engine — chooses which field that is.
 */
describe('resolveBulkUpdateTargets', () => {
  /** A grid whose focused cell is the one editable cell it holds. */
  function apiWith(data: Record<string, unknown>, nodeId?: string) {
    const column = {
      getColId: () => 'qty',
      getColDef: () => ({ field: 'qty', editable: true }),
    };
    const rowNode = { data, id: nodeId };
    return {
      getCellRanges: () => null,
      getFocusedCell: () => ({ column, rowIndex: 0 }),
      getDisplayedRowAtIndex: () => rowNode,
      getColumn: () => column,
      getCellValue: () => data.qty,
    } as never;
  }

  it('identifies rows by the named field', () => {
    const { targets } = resolveBulkUpdateTargets(apiWith({ positionId: 'p9', qty: 5 }), 'positionId');

    expect(targets).toEqual([
      { rowId: 'p9', colId: 'qty', field: 'qty', value: 5, cellDataType: undefined },
    ]);
  });

  it('defaults to id when no field is named', () => {
    const { targets } = resolveBulkUpdateTargets(apiWith({ id: 'r1', qty: 5 }));
    expect(targets[0].rowId).toBe('r1');
  });

  it('falls back to id when the named field is missing', () => {
    const { targets } = resolveBulkUpdateTargets(apiWith({ id: 'r1', qty: 5 }), 'positionId');
    expect(targets[0].rowId).toBe('r1');
  });

  it('yields an empty identity when the row carries neither', () => {
    // The grid's own node id wins where it exists, which is why this only
    // shows up on nodes without one.
    const { targets } = resolveBulkUpdateTargets(apiWith({ qty: 5 }), 'positionId');
    expect(targets[0].rowId).toBe('');
  });

  it("prefers the grid's own node id over anything in the data", () => {
    const { targets } = resolveBulkUpdateTargets(apiWith({ id: 'from-data', qty: 5 }, 'node-7'));
    expect(targets[0].rowId).toBe('node-7');
  });

  it('reports rows the grid could not reach', () => {
    const api = {
      getCellRanges: () => null,
      getFocusedCell: () => ({ column: { getColId: () => 'qty' }, rowIndex: 42 }),
      getDisplayedRowAtIndex: () => undefined,
    } as never;

    // Under SSRM a selection can name a row no block holds; the count is how
    // the caller learns the apply was partial.
    expect(resolveBulkUpdateTargets(api)).toEqual({ targets: [], unreachableRows: 1 });
  });
});
