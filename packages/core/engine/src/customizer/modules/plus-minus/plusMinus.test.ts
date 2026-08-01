import { describe, expect, it } from 'vitest';
import { ExpressionEngine } from '../../../expression/index.js';
import { buildNudgePatches } from './buildNudgePatches.js';
import { defaultPlusMinusNudge, deserializePlusMinusState } from './state.js';
import { resolveNudgeForCell } from './resolveNudgeForCell.js';

const engine = new ExpressionEngine();

describe('resolveNudgeForCell', () => {
  const cell = { rowId: 'r1', colId: 'quantityFace', field: 'quantityFace', value: 100 };
  const row = { id: 'r1', side: 'Long', quantityFace: 100 };

  it('returns first enabled nudge matching column scope', () => {
    const nudges = [
      { ...defaultPlusMinusNudge('A'), scope: { columnIds: ['midPrice'] }, incrementStep: 10 },
      { ...defaultPlusMinusNudge('B'), scope: { columnIds: ['quantityFace'] }, incrementStep: 1000 },
    ];
    const match = resolveNudgeForCell(cell, row, nudges, engine);
    expect(match?.name).toBe('B');
    expect(match?.incrementStep).toBe(1000);
  });

  it('gates on expression when set', () => {
    const nudge = {
      ...defaultPlusMinusNudge('Long only'),
      scope: { columnIds: ['quantityFace'] },
      expression: '[side] == "Long"',
      incrementStep: 500,
    };
    expect(resolveNudgeForCell(cell, row, [nudge], engine)?.incrementStep).toBe(500);
    expect(
      resolveNudgeForCell(cell, { ...row, side: 'Short' }, [nudge], engine),
    ).toBeNull();
  });
});

describe('buildNudgePatches', () => {
  it('builds add/subtract patches from matching nudges', () => {
    const nudges = [
      {
        ...defaultPlusMinusNudge('Qty'),
        scope: { columnIds: ['quantityFace'] },
        incrementStep: 1000,
        decrementStep: 500,
      },
    ];
    const cells = [{ rowId: 'r1', colId: 'quantityFace', field: 'quantityFace', value: 2500 }];
    const up = buildNudgePatches({
      cells,
      direction: 'increment',
      nudges,
      engine,
      getRowData: () => ({ id: 'r1', quantityFace: 2500 }),
    });
    expect(up[0]?.newValue).toBe(3500);

    const down = buildNudgePatches({
      cells,
      direction: 'decrement',
      nudges,
      engine,
      getRowData: () => ({ id: 'r1', quantityFace: 2500 }),
    });
    expect(down[0]?.newValue).toBe(2000);
  });
});

describe('deserializePlusMinusState', () => {
  it('drops invalid nudges and merges settings', () => {
    const state = deserializePlusMinusState({
      settings: { enabled: false, recordHistory: false },
      nudges: [
        { id: 'n1', name: 'Ok', enabled: true, scope: { columnIds: ['qty'] }, incrementStep: 10 },
        { id: 'bad', name: 'No step' },
      ],
    });
    expect(state.settings.enabled).toBe(false);
    expect(state.nudges).toHaveLength(1);
    expect(state.nudges[0]?.incrementStep).toBe(10);
  });

  it('parses optional decrementStep and expression, rejecting bad scopes', () => {
    const state = deserializePlusMinusState({
      nudges: [{
        id: 'n2',
        name: 'Expr',
        enabled: false,
        scope: 'bad',
        expression: 'true',
        incrementStep: 5,
        decrementStep: -1,
      }],
    });
    expect(state.nudges[0]).toMatchObject({
      id: 'n2',
      enabled: false,
      scope: { columnIds: [] },
      expression: 'true',
      incrementStep: 5,
      decrementStep: undefined,
    });
  });

  it('returns defaults for non-object input and mints new nudge ids', () => {
    expect(deserializePlusMinusState(null).nudges).toEqual([]);
    const nudge = defaultPlusMinusNudge('Test');
    expect(nudge.id).toMatch(/^pm-/);
    expect(nudge.incrementStep).toBe(1);
  });
});
