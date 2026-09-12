import { describe, expect, it } from 'vitest';
import type { ColDef, ColGroupDef } from 'ag-grid-community';
import { compileSsrmComputedColumns } from './compileSsrmComputedColumns.js';
import { lockSsrmExpressionColumns } from './lockSsrmExpressionColumns.js';

const virtual = (colId: string, source: string): ColDef => ({
  colId,
  sortable: true,
  filter: true,
  context: { staruiVirtual: true, staruiExprSource: source },
});

describe('compileSsrmComputedColumns', () => {
  it('compiles tier-`compiled` sources into wire specs and marks them engine-backed', () => {
    const { computed, engineBacked } = compileSsrmComputedColumns([
      { field: 'px' },
      virtual('notional', '[px] * [qty]'),
      virtual('flag', "REGEX_MATCH([desk], '^G')"), // outside grammar v1
      virtual('broken', '[px] +'), // does not parse
    ]);
    expect(computed).toEqual([{
      as: 'notional',
      version: 1,
      expr: { k: 'bin', op: 'mul', l: { k: 'col', name: 'px' }, r: { k: 'col', name: 'qty' } },
    }]);
    expect([...engineBacked]).toEqual(['notional']);
  });

  it('walks column groups and ignores plain columns', () => {
    const defs: Array<ColDef | ColGroupDef> = [
      { headerName: 'g', children: [virtual('share', '[mv] / SUM([mv])')] },
      { field: 'mv' },
    ];
    const { computed, engineBacked } = compileSsrmComputedColumns(defs);
    expect(computed.map((c) => c.as)).toEqual(['share']);
    expect(engineBacked.has('share')).toBe(true);
  });

  it('leaves engine-backed columns unlocked; locks the rest', () => {
    const defs = [virtual('notional', '[px] * [qty]'), virtual('flag', "REGEX_MATCH([desk], '^G')")];
    const { engineBacked } = compileSsrmComputedColumns(defs);
    const locked = lockSsrmExpressionColumns(defs, engineBacked);
    const byId = new Map(locked.map((d) => [d.colId, d]));
    // Engine-backed: untouched — sort/filter stay live.
    expect(byId.get('notional')).toMatchObject({ sortable: true, filter: true });
    // Outside the grammar: the brand-based lock applies.
    expect(byId.get('flag')).toMatchObject({ sortable: false, filter: false, enableRowGroup: false });
  });
});
