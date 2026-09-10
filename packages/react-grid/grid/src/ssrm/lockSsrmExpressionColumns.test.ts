import { describe, expect, it } from 'vitest';
import { lockSsrmExpressionColumns } from './lockSsrmExpressionColumns.js';

describe('lockSsrmExpressionColumns', () => {
  it('locks branded expression columns and walks groups', () => {
    const out = lockSsrmExpressionColumns([
      { field: 'desk', sortable: true, filter: true },
      {
        headerName: 'Calc',
        children: [
          {
            colId: 'notional',
            context: { staruiVirtual: true },
            sortable: true,
            filter: true,
            enableRowGroup: true,
          },
          { field: 'px', context: { staruiExpression: true }, sortable: true },
        ],
      },
    ]);
    expect(out[0]).toEqual({ field: 'desk', sortable: true, filter: true });
    const kids = (out[1] as { children: Array<Record<string, unknown>> }).children;
    expect(kids[0]).toEqual(expect.objectContaining({
      sortable: false,
      filter: false,
      floatingFilter: false,
      enableRowGroup: false,
      enableValue: false,
      enablePivot: false,
      headerTooltip: expect.stringContaining('source column'),
    }));
    expect(kids[1].sortable).toBe(false);
  });

  it('keeps an existing header tooltip', () => {
    const [col] = lockSsrmExpressionColumns([
      { colId: 'x', context: { staruiSsrmClientExpr: true }, headerTooltip: 'keep' },
    ]);
    expect(col.headerTooltip).toBe('keep');
  });
});
