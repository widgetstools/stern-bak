import { describe, expect, it } from 'vitest';
import type { ColDef } from 'ag-grid-community';
import { baseColumns } from '../../../markets-grid-lab/src/data/columns';
import { withSsrmSafeColumns } from './ssrmColumnDefs';

describe('withSsrmSafeColumns', () => {
  it('brands valueGetter-only columns so the SSRM honesty lock disables sort/filter/group', () => {
    const out = withSsrmSafeColumns(baseColumns as ColDef[]);
    const synthetic = out.filter((c) => !c.field && c.valueGetter);
    expect(synthetic.map((c) => c.colId)).toEqual(['bidAskWidthBps', 'krdSparkline']);
    for (const col of synthetic) {
      expect((col.context as Record<string, unknown>).staruiSsrmClientExpr).toBe(true);
    }
  });

  it('leaves field-backed columns untouched (reference-equal)', () => {
    const out = withSsrmSafeColumns(baseColumns as ColDef[]);
    const byField = new Map(baseColumns.map((c) => [c.field ?? c.colId, c]));
    for (const col of out) {
      if (col.field) expect(col).toBe(byField.get(col.field));
    }
  });

  it('recurses into column groups', () => {
    const grouped = [{
      headerName: 'G',
      children: [
        { field: 'a' },
        { colId: 'syn', valueGetter: () => 1 },
      ],
    }] as unknown as ColDef[];
    const out = withSsrmSafeColumns(grouped) as Array<{ children: ColDef[] }>;
    expect((out[0].children[1].context as Record<string, unknown>).staruiSsrmClientExpr).toBe(true);
    expect(out[0].children[0].context).toBeUndefined();
  });
});
