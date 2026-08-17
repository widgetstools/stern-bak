import { describe, expect, it } from 'vitest';
import { EditJournal } from './EditJournal.js';
import { makeFakePort } from './applyPatches.test.js';
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
    const { port } = makeFakePort({ r1: { id: 'r1', qty: 200 } });
    journal.record({
      source: 'smart-edit',
      label: '×2',
      patches: [{ rowId: 'r1', colId: 'qty', field: 'qty', oldValue: 100, newValue: 200 }],
    });
    expect(journal.canUndo).toBe(true);
    expect(journal.undoStackSize).toBe(1);
    expect(journal.entries).toHaveLength(1);
    await journal.undo(port);
    expect(journal.undoStackSize).toBe(0);
    expect(journal.entries).toHaveLength(1);
    expect(journal.canRedo).toBe(true);
  });

  /**
   * The timeline moves only when the write does. Before this phase `undo` had
   * already popped the stack by the time it awaited a transaction that was
   * inert under the server-side row model, so the cursor walked backwards over
   * values that never changed.
   */
  it('leaves the stack alone when the grid refuses the undo', async () => {
    const journal = new EditJournal({ limit: 10 });
    const fx = makeFakePort({ r1: { id: 'r1', qty: 200 } });
    fx.refuseWhen(() => 'The grid is still loading those rows from the server.');

    journal.record({
      source: 'smart-edit',
      label: '×2',
      patches: [{ rowId: 'r1', colId: 'qty', field: 'qty', oldValue: 100, newValue: 200 }],
    });

    expect(await journal.undo(fx.port)).toBe(false);
    expect(journal.undoStackSize).toBe(1);
    expect(journal.canUndo).toBe(true);
    expect(journal.canRedo).toBe(false);
    expect(fx.rows.r1).toEqual({ id: 'r1', qty: 200 });
  });

  it('leaves the stack alone when the grid refuses the redo', async () => {
    const journal = new EditJournal({ limit: 10 });
    const fx = makeFakePort({ r1: { id: 'r1', qty: 200 } });
    journal.record({
      source: 'smart-edit',
      label: '×2',
      patches: [{ rowId: 'r1', colId: 'qty', field: 'qty', oldValue: 100, newValue: 200 }],
    });
    await journal.undo(fx.port);
    expect(journal.canRedo).toBe(true);

    fx.refuseWhen(() => 'The grid is still loading those rows from the server.');
    expect(await journal.redo(fx.port)).toBe(false);
    expect(journal.canRedo).toBe(true);
    expect(journal.canUndo).toBe(false);
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
    const { port, rows: data } = makeFakePort({ r1: { id: 'r1', qty: 100 } });

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

    await journal.undoEntry(port, a.id);
    expect(data.r1!.qty).toBe(100);
    expect(journal.canUndo).toBe(false);
    expect(journal.canRedo).toBe(true);
    expect(journal.canUndoEntry(a.id)).toBe(false);

    await journal.redo(port);
    expect(data.r1!.qty).toBe(200);

    await journal.redo(port);
    expect(data.r1!.qty).toBe(300);

    await journal.redo(port);
    expect(data.r1!.qty).toBe(400);
  });

  it('undoEntry stops at the first entry the grid refuses', async () => {
    const journal = new EditJournal({ limit: 10 });
    const fx = makeFakePort({ r1: { id: 'r1', qty: 300 }, r2: { id: 'r2', qty: 1 } });

    const a = journal.record({
      source: 'smart-edit',
      label: 'A on r1',
      patches: [{ rowId: 'r1', colId: 'qty', field: 'qty', oldValue: 100, newValue: 200 }],
    })!;
    journal.record({
      source: 'smart-edit',
      label: 'B on r2 — the one that will be refused',
      patches: [{ rowId: 'r2', colId: 'qty', field: 'qty', oldValue: 0, newValue: 1 }],
    });
    journal.record({
      source: 'smart-edit',
      label: 'C on r1',
      patches: [{ rowId: 'r1', colId: 'qty', field: 'qty', oldValue: 200, newValue: 300 }],
    });

    fx.refuseWhen((rowId) => (rowId === 'r2' ? 'That row is still loading.' : null));

    expect(await journal.undoEntry(fx.port, a.id)).toBe(true);
    // C came off; B was refused, so A stays applied and stays undoable.
    expect(fx.rows.r1).toEqual({ id: 'r1', qty: 200 });
    expect(journal.canUndoEntry(a.id)).toBe(true);
    expect(journal.undoStackSize).toBe(2);
    expect(journal.canRedo).toBe(true);
  });

  it('canUndoEntry reflects undo stack membership', async () => {
    const journal = new EditJournal();
    const { port } = makeFakePort({ r1: { id: 'r1', qty: 1 } });
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

    await journal.undo(port);
    expect(journal.canUndoEntry(second.id)).toBe(false);
    expect(journal.canUndoEntry(first.id)).toBe(true);
  });
});