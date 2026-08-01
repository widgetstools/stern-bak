/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import {
  defaultPlusMinusNudge,
  EditJournal,
  ExpressionEngine,
  INITIAL_PLUS_MINUS,
} from '@wellsfargo-starui/engine';
import { applyPlusMinusNudge } from './applyPlusMinusNudge.js';

describe('applyPlusMinusNudge', () => {
  it('applies nudge patches and returns count', async () => {
    const applyTransactionAsync = vi.fn().mockResolvedValue(undefined);
    const api = {
      applyTransactionAsync,
      getRowNode: () => ({ data: { id: 'r1', quantityFace: 1000 } }),
    } as never;
    const engine = new ExpressionEngine();
    const nudges = [{
      ...defaultPlusMinusNudge('Qty'),
      scope: { columnIds: ['quantityFace'] },
      incrementStep: 500,
    }];

    const count = await applyPlusMinusNudge(
      api,
      {
        cells: [{ rowId: 'r1', colId: 'quantityFace', field: 'quantityFace', value: 1000 }],
        direction: 'increment',
        nudges,
        engine,
      },
    );

    expect(count).toBe(1);
    expect(applyTransactionAsync).toHaveBeenCalled();
  });

  it('records journal entry when journal provided', async () => {
    const applyTransactionAsync = vi.fn().mockResolvedValue(undefined);
    const api = {
      applyTransactionAsync,
      getRowNode: () => ({ data: { id: 'r1', quantityFace: 1000 } }),
    } as never;
    const journal = new EditJournal();
    const engine = new ExpressionEngine();
    const nudges = [{
      ...defaultPlusMinusNudge('Qty'),
      scope: { columnIds: ['quantityFace'] },
      incrementStep: 500,
    }];

    await applyPlusMinusNudge(
      api,
      {
        cells: [{ rowId: 'r1', colId: 'quantityFace', field: 'quantityFace', value: 1000 }],
        direction: 'decrement',
        nudges,
        engine,
      },
      { journal },
    );

    expect(journal.canUndo).toBe(true);
    expect(journal.entries[0]?.source).toBe('plus-minus');
  });

  it('returns 0 when no patches match', async () => {
    const applyTransactionAsync = vi.fn();
    const api = {
      applyTransactionAsync,
      getRowNode: () => ({ data: { id: 'r1', quantityFace: 1000 } }),
    } as never;
    const count = await applyPlusMinusNudge(
      api,
      {
        cells: [{ rowId: 'r1', colId: 'other', field: 'other', value: 1 }],
        direction: 'increment',
        nudges: INITIAL_PLUS_MINUS.nudges,
        engine: new ExpressionEngine(),
      },
    );
    expect(count).toBe(0);
    expect(applyTransactionAsync).not.toHaveBeenCalled();
  });
});
