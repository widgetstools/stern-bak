import { describe, expect, it, vi } from 'vitest';
import { EditJournal } from '@wellsfargo-starui/engine';
import { applyBulkUpdateEdits } from './applyBulkUpdateEdits.js';

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
});
