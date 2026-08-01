import { describe, expect, it, vi } from 'vitest';
import { EditJournal } from '@wellsfargo-starui/core';
import { journalRedo, journalUndo, journalUndoEntry } from './journalUndoRedo';

describe('journalUndoRedo', () => {
  const platform = { gridId: 'test-grid' };

  function makeApi() {
    const applyTransactionAsync = vi.fn().mockResolvedValue(undefined);
    return {
      applyTransactionAsync,
      getRowNode: () => ({ data: { id: 'r1', qty: 2 } }),
    } as never;
  }

  it('journalUndo reverses the last patch', async () => {
    const journal = new EditJournal();
    const api = makeApi();
    journal.record({
      source: 'bulk-update',
      label: 'Set qty',
      patches: [{ rowId: 'r1', colId: 'qty', field: 'qty', prev: 1, next: 2 }],
    });

    const ok = await journalUndo(platform, journal, api);
    expect(ok).toBe(true);
    expect(journal.canUndo).toBe(false);
    expect(journal.canRedo).toBe(true);
  });

  it('journalRedo reapplies after undo', async () => {
    const journal = new EditJournal();
    const api = makeApi();
    journal.record({
      source: 'bulk-update',
      label: 'Set qty',
      patches: [{ rowId: 'r1', colId: 'qty', field: 'qty', prev: 1, next: 2 }],
    });
    await journalUndo(platform, journal, api);

    const ok = await journalRedo(platform, journal, api);
    expect(ok).toBe(true);
    expect(journal.canRedo).toBe(false);
  });

  it('journalUndoEntry targets a specific entry', async () => {
    const journal = new EditJournal();
    const api = makeApi();
    journal.record({
      source: 'bulk-update',
      label: 'First',
      patches: [{ rowId: 'r1', colId: 'qty', field: 'qty', prev: 1, next: 2 }],
    });
    journal.record({
      source: 'bulk-update',
      label: 'Second',
      patches: [{ rowId: 'r1', colId: 'qty', field: 'qty', prev: 2, next: 3 }],
    });
    const secondId = journal.entries[1]!.id;

    const ok = await journalUndoEntry(platform, journal, api, secondId);
    expect(ok).toBe(true);
    expect(journal.canUndoEntry(secondId)).toBe(false);
  });
});
