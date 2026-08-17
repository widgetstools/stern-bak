import { describe, expect, it } from 'vitest';
import { EditJournal } from '@wellsfargo-starui/core';
import { makeFakeEditPlatform } from './applyAndRecord.test.js';
import { journalRedo, journalUndo, journalUndoEntry } from './journalUndoRedo';

describe('journalUndoRedo', () => {
  it('journalUndo reverses the last patch', async () => {
    const journal = new EditJournal();
    const fx = makeFakeEditPlatform({ r1: { id: 'r1', qty: 2 } });
    journal.record({
      source: 'bulk-update',
      label: 'Set qty',
      patches: [{ rowId: 'r1', colId: 'qty', field: 'qty', oldValue: 1, newValue: 2 }],
    });

    const ok = await journalUndo(fx.platform, journal);
    expect(ok).toBe(true);
    expect(journal.canUndo).toBe(false);
    expect(journal.canRedo).toBe(true);
    expect(fx.rows.r1).toEqual({ id: 'r1', qty: 1 });
  });

  it('journalRedo reapplies after undo', async () => {
    const journal = new EditJournal();
    const fx = makeFakeEditPlatform({ r1: { id: 'r1', qty: 2 } });
    journal.record({
      source: 'bulk-update',
      label: 'Set qty',
      patches: [{ rowId: 'r1', colId: 'qty', field: 'qty', oldValue: 1, newValue: 2 }],
    });
    await journalUndo(fx.platform, journal);

    const ok = await journalRedo(fx.platform, journal);
    expect(ok).toBe(true);
    expect(journal.canRedo).toBe(false);
    expect(fx.rows.r1).toEqual({ id: 'r1', qty: 2 });
  });

  it('journalUndoEntry targets a specific entry', async () => {
    const journal = new EditJournal();
    const fx = makeFakeEditPlatform({ r1: { id: 'r1', qty: 3 } });
    journal.record({
      source: 'bulk-update',
      label: 'First',
      patches: [{ rowId: 'r1', colId: 'qty', field: 'qty', oldValue: 1, newValue: 2 }],
    });
    journal.record({
      source: 'bulk-update',
      label: 'Second',
      patches: [{ rowId: 'r1', colId: 'qty', field: 'qty', oldValue: 2, newValue: 3 }],
    });
    const secondId = journal.entries[0]!.id;

    const ok = await journalUndoEntry(fx.platform, journal, secondId);
    expect(ok).toBe(true);
    expect(journal.canUndoEntry(secondId)).toBe(false);
    expect(fx.rows.r1).toEqual({ id: 'r1', qty: 2 });
  });

  /** A refused undo must not move the cursor, or the panel lies about state. */
  it('reports false and leaves the stack when the port refuses', async () => {
    const journal = new EditJournal();
    const fx = makeFakeEditPlatform({ r1: { id: 'r1', qty: 2 } });
    journal.record({
      source: 'bulk-update',
      label: 'Set qty',
      patches: [{ rowId: 'r1', colId: 'qty', field: 'qty', oldValue: 1, newValue: 2 }],
    });
    fx.refuseWhen(() => 'That row is not loaded.');

    expect(await journalUndo(fx.platform, journal)).toBe(false);
    expect(journal.canUndo).toBe(true);
    expect(fx.rows.r1).toEqual({ id: 'r1', qty: 2 });
  });
});
