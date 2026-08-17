import { describe, expect, it } from 'vitest';
import { EditJournal } from '@wellsfargo-starui/core';
import { makeFakeEditPlatform } from '../../../editing/applyAndRecord.test.js';
import { applyEdits, buildSmartEditPatches, resolveTargetCells } from './applyEdits.js';

describe('applyEdits', () => {
  it('writes the computed values through the port', async () => {
    const fx = makeFakeEditPlatform({ r1: { id: 'r1', qty: 100, ticker: 'ABC' } });
    const result = await applyEdits(
      fx.platform,
      [{ rowId: 'r1', colId: 'qty', field: 'qty', value: 100 }],
      'multiply',
      2,
    );
    expect(result.applied).toHaveLength(1);
    expect(fx.mutations).toEqual([[{ rowId: 'r1', fields: { qty: 200 } }]]);
    expect(fx.rows.r1).toEqual({ id: 'r1', qty: 200, ticker: 'ABC' });
  });

  it('merges multiple cell edits on the same row into one row patch', async () => {
    const fx = makeFakeEditPlatform({ r1: { id: 'r1', qty: 100, midPrice: 50, ticker: 'ABC' } });
    await applyEdits(
      fx.platform,
      [
        { rowId: 'r1', colId: 'qty', field: 'qty', value: 100 },
        { rowId: 'r1', colId: 'midPrice', field: 'midPrice', value: 50 },
      ],
      'set',
      0,
    );
    expect(fx.mutations).toEqual([[{ rowId: 'r1', fields: { qty: 0, midPrice: 0 } }]]);
  });

  it('applies nothing when no valid updates', async () => {
    const fx = makeFakeEditPlatform({ r1: { id: 'r1', qty: 100 } });
    const result = await applyEdits(
      fx.platform,
      [{ rowId: 'r1', colId: 'qty', field: 'qty', value: 'bad' }],
      'multiply',
      2,
    );
    expect(result.applied).toEqual([]);
    expect(fx.mutations).toEqual([]);
  });

  it('records journal entry when journal provided', async () => {
    const fx = makeFakeEditPlatform({ r1: { id: 'r1', qty: 100 } });
    const journal = new EditJournal();
    await applyEdits(
      fx.platform,
      [{ rowId: 'r1', colId: 'qty', field: 'qty', value: 100 }],
      'multiply',
      2,
      { journal },
    );
    expect(journal.canUndo).toBe(true);
    expect(journal.entries[0]?.source).toBe('smart-edit');
  });

  it('records nothing when the port refuses the row', async () => {
    const fx = makeFakeEditPlatform({ r1: { id: 'r1', qty: 100 } });
    fx.refuseWhen(() => 'That row is not loaded.');
    const journal = new EditJournal();
    const result = await applyEdits(
      fx.platform,
      [{ rowId: 'r1', colId: 'qty', field: 'qty', value: 100 }],
      'multiply',
      2,
      { journal },
    );
    expect(result.ok).toBe(false);
    expect(journal.entries).toEqual([]);
    expect(journal.canUndo).toBe(false);
  });

  it('buildSmartEditPatches returns cell patches', () => {
    const patches = buildSmartEditPatches(
      [{ rowId: 'r1', colId: 'qty', field: 'qty', value: 10 }],
      'add',
      5,
    );
    expect(patches[0]?.newValue).toBe(15);
  });
});

describe('resolveTargetCells', () => {
  it('prefers range over focus', () => {
    const api = {
      getCellRanges: () => [{
        columns: [{ getColId: () => 'qty' }],
        startRow: { rowIndex: 0 },
        endRow: { rowIndex: 0 },
      }],
      getDisplayedRowAtIndex: () => ({ id: 'r1', data: { id: 'r1', qty: 10 } }),
      getColumn: () => ({
        getColDef: () => ({ editable: true, field: 'qty', cellDataType: 'number' }),
      }),
      getCellValue: () => 10,
      getFocusedCell: () => null,
    };
    expect(resolveTargetCells(api as never)).toHaveLength(1);
  });
});
