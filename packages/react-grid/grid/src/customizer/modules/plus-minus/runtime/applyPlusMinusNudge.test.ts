/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import {
  defaultPlusMinusNudge,
  EditJournal,
  ExpressionEngine,
  INITIAL_PLUS_MINUS,
} from '@wellsfargo-starui/core';
import { makeFakeEditPlatform } from '../../../editing/applyAndRecord.test.js';
import { applyPlusMinusNudge } from './applyPlusMinusNudge.js';

const qtyNudge = [{
  ...defaultPlusMinusNudge('Qty'),
  scope: { columnIds: ['quantityFace'] },
  incrementStep: 500,
}];

describe('applyPlusMinusNudge', () => {
  it('applies nudge patches through the port', async () => {
    const fx = makeFakeEditPlatform({ r1: { id: 'r1', quantityFace: 1000 } });

    const result = await applyPlusMinusNudge(
      fx.platform,
      {
        cells: [{ rowId: 'r1', colId: 'quantityFace', field: 'quantityFace', value: 1000 }],
        direction: 'increment',
        nudges: qtyNudge,
        engine: new ExpressionEngine(),
      },
    );

    expect(result.applied).toHaveLength(1);
    expect(fx.rows.r1).toEqual({ id: 'r1', quantityFace: 1500 });
  });

  it('records journal entry when journal provided', async () => {
    const fx = makeFakeEditPlatform({ r1: { id: 'r1', quantityFace: 1000 } });
    const journal = new EditJournal();

    await applyPlusMinusNudge(
      fx.platform,
      {
        cells: [{ rowId: 'r1', colId: 'quantityFace', field: 'quantityFace', value: 1000 }],
        direction: 'decrement',
        nudges: qtyNudge,
        engine: new ExpressionEngine(),
      },
      { journal },
    );

    expect(journal.canUndo).toBe(true);
    expect(journal.entries[0]?.source).toBe('plus-minus');
  });

  it('applies nothing when no patches match', async () => {
    const fx = makeFakeEditPlatform({ r1: { id: 'r1', quantityFace: 1000 } });
    const result = await applyPlusMinusNudge(
      fx.platform,
      {
        cells: [{ rowId: 'r1', colId: 'other', field: 'other', value: 1 }],
        direction: 'increment',
        nudges: INITIAL_PLUS_MINUS.nudges,
        engine: new ExpressionEngine(),
      },
    );
    expect(result.applied).toEqual([]);
    expect(fx.mutations).toEqual([]);
  });

  /**
   * The nudge rule is matched against the whole row, so a row the port cannot
   * hand over contributes no patch — the same outcome as an unmatched rule,
   * and never a patch built from a row nobody read.
   */
  it('skips a cell whose row the port cannot produce', async () => {
    const fx = makeFakeEditPlatform({});
    const result = await applyPlusMinusNudge(
      fx.platform,
      {
        cells: [{ rowId: 'ghost', colId: 'quantityFace', field: 'quantityFace', value: 1000 }],
        direction: 'increment',
        nudges: qtyNudge,
        engine: new ExpressionEngine(),
      },
    );
    expect(result.applied).toEqual([]);
    expect(fx.mutations).toEqual([]);
  });
});
