import { describe, expect, it, vi } from 'vitest';
import { EditJournal } from './EditJournal.js';
import { previewPatches } from './previewPatches.js';
import { assertSingleColumnSelection } from './selectionGuards.js';

describe('assertSingleColumnSelection', () => {
  it('passes for single column', () => {
    expect(
      assertSingleColumnSelection([
        { rowId: 'r1', colId: 'qty', field: 'qty', value: 1 },
        { rowId: 'r2', colId: 'qty', field: 'qty', value: 2 },
      ]),
    ).toEqual({ ok: true, columnId: 'qty' });
  });

  it('fails for multi-column', () => {
    expect(
      assertSingleColumnSelection([
        { rowId: 'r1', colId: 'qty', field: 'qty', value: 1 },
        { rowId: 'r1', colId: 'mid', field: 'mid', value: 2 },
      ]),
    ).toEqual({ ok: false, reason: 'multi-column' });
  });
});

describe('previewPatches', () => {
  it('classifies all valid by default', () => {
    const preview = previewPatches([
      { rowId: 'r1', colId: 'qty', field: 'qty', oldValue: 1, newValue: 2 },
    ]);
    expect(preview.allValid).toBe(true);
    expect(preview.validPatches).toHaveLength(1);
  });

  it('detects partial invalid', () => {
    const preview = previewPatches(
      [
        { rowId: 'r1', colId: 'qty', field: 'qty', oldValue: 1, newValue: 2 },
        { rowId: 'r2', colId: 'qty', field: 'qty', oldValue: 3, newValue: 4 },
      ],
      (p) => (p.rowId === 'r2' ? 'invalid' : 'valid'),
    );
    expect(preview.someInvalid).toBe(true);
    expect(preview.validPatches).toHaveLength(1);
  });
});

describe('EditJournal', () => {
  it('records and undoes an entry', async () => {
    const journal = new EditJournal({ limit: 10 });
    const api = {
      getRowNode: () => ({ data: { id: 'r1', qty: 200 } }),
      applyTransactionAsync: vi.fn().mockResolvedValue(undefined),
    };
    journal.record({
      source: 'smart-edit',
      label: '×2',
      patches: [{ rowId: 'r1', colId: 'qty', field: 'qty', oldValue: 100, newValue: 200 }],
    });
    expect(journal.canUndo).toBe(true);
    expect(journal.undoStackSize).toBe(1);
    expect(journal.entries).toHaveLength(1);
    await journal.undo(api);
    expect(journal.undoStackSize).toBe(0);
    expect(journal.entries).toHaveLength(1);
    expect(journal.canRedo).toBe(true);
  });

  it('does not record when suspended', () => {
    const journal = new EditJournal();
    journal.suspend();
    const entry = journal.record({
      source: 'smart-edit',
      label: '×2',
      patches: [{ rowId: 'r1', colId: 'qty', field: 'qty', oldValue: 1, newValue: 2 }],
    });
    expect(entry).toBeNull();
    expect(journal.canUndo).toBe(false);
  });

  it('undoEntry cascades newer edits and restores redo order', async () => {
    const journal = new EditJournal({ limit: 10 });
    const data: Record<string, Record<string, unknown>> = {
      r1: { id: 'r1', qty: 100 },
    };
    const api = {
      getRowNode: (id: string) => ({ data: data[id] }),
      applyTransactionAsync: vi.fn(async ({ update }: { update: Record<string, unknown>[] }) => {
        for (const row of update) {
          const id = row.id as string;
          data[id] = { ...data[id], ...row };
        }
      }),
    };

    const a = journal.record({
      source: 'smart-edit',
      label: 'A',
      patches: [{ rowId: 'r1', colId: 'qty', field: 'qty', oldValue: 100, newValue: 200 }],
    })!;
    journal.record({
      source: 'smart-edit',
      label: 'B',
      patches: [{ rowId: 'r1', colId: 'qty', field: 'qty', oldValue: 200, newValue: 300 }],
    });
    journal.record({
      source: 'smart-edit',
      label: 'C',
      patches: [{ rowId: 'r1', colId: 'qty', field: 'qty', oldValue: 300, newValue: 400 }],
    });

    expect(data.r1!.qty).toBe(100);
    data.r1!.qty = 400;

    await journal.undoEntry(api, a.id);
    expect(data.r1!.qty).toBe(100);
    expect(journal.canUndo).toBe(false);
    expect(journal.canRedo).toBe(true);
    expect(journal.canUndoEntry(a.id)).toBe(false);

    await journal.redo(api);
    expect(data.r1!.qty).toBe(200);

    await journal.redo(api);
    expect(data.r1!.qty).toBe(300);

    await journal.redo(api);
    expect(data.r1!.qty).toBe(400);
  });

  it('canUndoEntry reflects undo stack membership', async () => {
    const journal = new EditJournal();
    const api = {
      getRowNode: () => ({ data: { id: 'r1', qty: 1 } }),
      applyTransactionAsync: vi.fn().mockResolvedValue(undefined),
    };
    const first = journal.record({
      source: 'cell-editor',
      label: 'first',
      patches: [{ rowId: 'r1', colId: 'qty', field: 'qty', oldValue: 0, newValue: 1 }],
    })!;
    const second = journal.record({
      source: 'cell-editor',
      label: 'second',
      patches: [{ rowId: 'r1', colId: 'qty', field: 'qty', oldValue: 1, newValue: 2 }],
    })!;

    expect(journal.canUndoEntry(first.id)).toBe(true);
    expect(journal.canUndoEntry(second.id)).toBe(true);

    await journal.undo(api);
    expect(journal.canUndoEntry(second.id)).toBe(false);
    expect(journal.canUndoEntry(first.id)).toBe(true);
  });
});