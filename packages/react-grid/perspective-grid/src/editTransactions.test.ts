import { describe, expect, it } from 'vitest';
import { toPerspectiveEdits } from './editTransactions.js';
import { GRAND_TOTAL_FLAG } from './perspectiveRowEngine.js';

const KEY = 'positionId';

describe('toPerspectiveEdits', () => {
  it('emits only the fields that differ from the row the grid holds', () => {
    const current = { positionId: 'P1', quantity: 100, currentPrice: 99.5, desk: 'Rates' };

    const edits = toPerspectiveEdits(
      { update: [{ ...current, quantity: 200 }] },
      KEY,
      { currentRow: () => current },
    );

    // The transaction carried all four fields; only one of them is an edit.
    // Writing the rest back would push this window's stale `currentPrice` into
    // the shared Table and every peer window would see the feed rewind.
    expect(edits).toEqual([{ key: 'P1', field: 'quantity', value: 200 }]);
  });

  it('never emits the key column, even when it appears to differ', () => {
    const edits = toPerspectiveEdits(
      { update: [{ positionId: 'P2', quantity: 5 }] },
      KEY,
      { currentRow: () => ({ positionId: 'P1', quantity: 1 }) },
    );

    // Rewriting the index is a re-key: it upserts a second row and orphans the
    // first, while every `getRowId` in the grid still points at the old one.
    expect(edits).toEqual([{ key: 'P2', field: 'quantity', value: 5 }]);
  });

  it('writes every non-key field when the row is outside the loaded blocks', () => {
    const edits = toPerspectiveEdits(
      { update: [{ positionId: 'P3', quantity: 7, desk: 'Credit' }] },
      KEY,
      { currentRow: () => undefined },
    );

    // Best effort beats dropping an edit the user made. This window holds only
    // its viewport, so "not loaded" is normal, not exceptional.
    expect(edits).toEqual([
      { key: 'P3', field: 'quantity', value: 7 },
      { key: 'P3', field: 'desk', value: 'Credit' },
    ]);
  });

  it('treats a null just like any other changed value', () => {
    const edits = toPerspectiveEdits(
      { update: [{ positionId: 'P4', desk: null }] },
      KEY,
      { currentRow: () => ({ positionId: 'P4', desk: 'Rates' }) },
    );

    // Clearing a cell is a legal edit at every type (`coerceEditedValue`), so
    // a null must not be mistaken for "no value supplied".
    expect(edits).toEqual([{ key: 'P4', field: 'desk', value: null }]);
  });

  it('skips the grand-total row', () => {
    const edits = toPerspectiveEdits(
      { update: [{ [GRAND_TOTAL_FLAG]: true, positionId: 'total', quantity: 999 }] },
      KEY,
    );

    // It carries aggregates, not a row of the book; upserting it would invent
    // an index value.
    expect(edits).toEqual([]);
  });

  it('skips a row with no key rather than inventing one', () => {
    expect(toPerspectiveEdits({ update: [{ quantity: 1 }] }, KEY)).toEqual([]);
    expect(toPerspectiveEdits({ update: [{ positionId: null, quantity: 1 }] }, KEY)).toEqual([]);
  });

  it('ignores add and remove entirely', () => {
    const edits = toPerspectiveEdits(
      { add: [{ positionId: 'NEW', quantity: 1 }], remove: [{ positionId: 'P1' }] },
      KEY,
    );

    // Membership of the book belongs to the provider filling the Table, not to
    // an editing module in one window — a delete here would delete it for every
    // blotter on the desk, and it would return on the next snapshot anyway.
    expect(edits).toEqual([]);
  });

  it('handles an empty or absent update list', () => {
    expect(toPerspectiveEdits({}, KEY)).toEqual([]);
    expect(toPerspectiveEdits({ update: [] }, KEY)).toEqual([]);
    expect(toPerspectiveEdits({ update: [null, 'nonsense'] }, KEY)).toEqual([]);
  });

  it('maps a multi-row bulk update to one edit per row', () => {
    const rows = ['P1', 'P2', 'P3'].map((positionId) => ({ positionId, quantity: 4242 }));

    const edits = toPerspectiveEdits({ update: rows }, KEY, {
      currentRow: (key) => ({ positionId: key, quantity: 1 }),
    });

    expect(edits).toEqual([
      { key: 'P1', field: 'quantity', value: 4242 },
      { key: 'P2', field: 'quantity', value: 4242 },
      { key: 'P3', field: 'quantity', value: 4242 },
    ]);
  });
});
