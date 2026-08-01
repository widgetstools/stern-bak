import { describe, expect, it, vi } from 'vitest';
import { EditJournal } from '@wellsfargo-starui/engine';
import { applyBulkUpdateEdits, resolveBulkUpdateTargets } from './applyBulkUpdateEdits.js';

describe('applyBulkUpdateEdits', () => {
  it('applies full-row transaction updates', async () => {
    const applyTransactionAsync = vi.fn().mockResolvedValue(undefined);
    const api = {
      applyTransactionAsync,
      getRowNode: () => ({
        data: { id: 'r1', currency: 'USD', ticker: 'ABC' },
      }),
    } as never;

    const count = await applyBulkUpdateEdits(
      api,
      [{ rowId: 'r1', colId: 'currency', field: 'currency', value: 'USD', cellDataType: 'text' }],
      'EUR',
    );

    expect(count).toBe(1);
    expect(applyTransactionAsync).toHaveBeenCalledWith({
      update: [{ id: 'r1', currency: 'EUR', ticker: 'ABC' }],
    });
  });

  it('records journal entry when journal provided', async () => {
    const applyTransactionAsync = vi.fn().mockResolvedValue(undefined);
    const api = {
      applyTransactionAsync,
      getRowNode: () => ({ data: { id: 'r1', currency: 'USD' } }),
    } as never;
    const journal = new EditJournal();

    await applyBulkUpdateEdits(
      api,
      [{ rowId: 'r1', colId: 'currency', field: 'currency', value: 'USD', cellDataType: 'text' }],
      'EUR',
      { journal },
    );

    expect(journal.canUndo).toBe(true);
    expect(journal.entries[0]?.source).toBe('bulk-update');
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

    const targets = resolveBulkUpdateTargets(api);
    expect(targets).toHaveLength(1);
    expect(targets[0]?.colId).toBe('currency');
  });
});
