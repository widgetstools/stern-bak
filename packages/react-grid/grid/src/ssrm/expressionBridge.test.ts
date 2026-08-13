import { describe, expect, it } from 'vitest';
import { toSsrmExpressionRules } from './expressionBridge.js';

describe('toSsrmExpressionRules', () => {
  it('maps calculated, style, alert, and editable rules', () => {
    const rules = toSsrmExpressionRules({
      calculatedColumns: [
        { id: 'c1', field: 'gross', expression: 'data.qty * data.price' },
      ],
      styleRules: [{ id: 's1', expression: 'data.pnl < 0' }],
      alertRules: [{ id: 'a1', expression: 'data.pnl < -1000' }],
      editableRules: [
        { id: 'e1', field: 'currentPrice', expression: 'data.trader === "me"' },
      ],
    });

    expect(rules).toEqual([
      {
        id: 'c1',
        kind: 'calculated',
        field: 'gross',
        expression: 'data.qty * data.price',
      },
      { id: 's1', kind: 'style', expression: 'data.pnl < 0' },
      { id: 'a1', kind: 'alert', expression: 'data.pnl < -1000' },
      {
        id: 'e1',
        kind: 'editable',
        field: 'currentPrice',
        expression: 'data.trader === "me"',
      },
    ]);
  });

  it('skips blank expressions and missing calculated fields', () => {
    expect(
      toSsrmExpressionRules({
        calculatedColumns: [
          { field: '', expression: '1' },
          { field: 'x', expression: '   ' },
          { field: 'ok', expression: 'data.a' },
        ],
        styleRules: [{ id: 's', expression: '' }],
        alertRules: [{ id: 'a', expression: '  ' }],
        editableRules: [{ id: 'e', expression: '' }],
      }),
    ).toEqual([
      { id: 'calc-ok', kind: 'calculated', field: 'ok', expression: 'data.a' },
    ]);
  });

  it('returns empty array for empty snapshot', () => {
    expect(toSsrmExpressionRules({})).toEqual([]);
  });
});
