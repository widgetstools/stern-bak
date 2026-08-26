import { describe, expect, it } from 'vitest';
import {
  normalizeColumnBehaviorArgs,
  applyColumnBehavior,
  describeColumnBehavior,
  type NormalizedColumnBehavior,
} from './columnBehavior';

function ok(args: Record<string, unknown>): NormalizedColumnBehavior {
  const res = normalizeColumnBehaviorArgs({ colId: 'quantity', ...args });
  if (!res.ok) throw new Error(`expected ok, got: ${res.error}`);
  return res.value;
}
function err(args: Record<string, unknown>): string {
  const res = normalizeColumnBehaviorArgs({ colId: 'quantity', ...args });
  if (res.ok) throw new Error('expected a rejection');
  return res.error;
}

describe('targets', () => {
  it('requires at least one column and explains why there is no allColumns', () => {
    const res = normalizeColumnBehaviorArgs({ targetGridId: 'grid-test', editor: 'agTextCellEditor' });
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toContain('per-column');
  });

  it('de-duplicates colId against colIds', () => {
    expect(ok({ colIds: ['quantity', 'price'], editor: 'agTextCellEditor' }).colIds).toEqual(['quantity', 'price']);
  });

  it('rejects a call that changes nothing', () => {
    expect(err({})).toContain('Nothing to change');
  });
});

describe('cell editors', () => {
  it('accepts a bare kind string', () => {
    expect(ok({ editor: 'agDateCellEditor' }).editor).toEqual({ kind: 'agDateCellEditor' });
  });

  /** An editor on a locked cell never opens — the classic silent no-op. */
  it('makes the column editable when an editor is set', () => {
    const next = applyColumnBehavior({ colId: 'quantity' }, ok({ editor: 'agNumberCellEditor' }));
    expect(next.editable).toBe(true);
    expect(next.cellEditor).toEqual({ kind: 'agNumberCellEditor' });
  });

  it('keeps existing editor tuning when only the kind changes', () => {
    const prev = { colId: 'desk', cellEditor: { kind: 'agSelectCellEditor', values: ['A', 'B'] } };
    const next = applyColumnBehavior(prev, ok({ editor: 'agRichSelectCellEditor' }));
    expect(next.cellEditor).toEqual({ kind: 'agRichSelectCellEditor', values: ['A', 'B'] });
  });

  /** Clearing the kind must not re-lock a column the user wants editable. */
  it('clears the editor without touching editable', () => {
    const prev = { colId: 'desk', cellEditor: { kind: 'agSelectCellEditor' }, editable: true };
    const next = applyColumnBehavior(prev, ok({ editor: 'none' }));
    expect(next.cellEditor).toBeUndefined();
    expect(next.editable).toBe(true);
  });

  it('rejects an unknown kind, listing the real ones', () => {
    expect(err({ editor: 'agFancyEditor' })).toContain('agRichSelectCellEditor');
  });

  it('rejects values on an editor that has no value list', () => {
    expect(err({ editor: { kind: 'agNumberCellEditor', values: [1, 2] } })).toContain('agSelectCellEditor');
  });

  it('rejects a valuesSource that is not an AppData reference', () => {
    expect(err({ editor: { kind: 'agSelectCellEditor', valuesSource: 'desks' } })).toContain('{{providerName.key}}');
    expect(ok({ editor: { kind: 'agSelectCellEditor', valuesSource: '{{refData.desks}}' } }).editor?.valuesSource)
      .toBe('{{refData.desks}}');
  });
});

describe('filters', () => {
  it('turns a bare kind into an enabled filter config', () => {
    const next = applyColumnBehavior({ colId: 'quantity' }, ok({ filter: 'streamSafeMultiNumberColumnFilter' }));
    expect(next.filter).toEqual({ kind: 'streamSafeMultiNumberColumnFilter', enabled: true });
  });

  /** The streamSafe wrappers carry their own multi+set composition; a stale
   *  override force-casts them back to a plain multi filter. */
  it('drops a prior multiFilters override when the kind changes', () => {
    const prev = { colId: 'quantity', filter: { enabled: true, kind: 'agMultiColumnFilter', multiFilters: [{ filter: 'agTextColumnFilter' }] } };
    const next = applyColumnBehavior(prev, ok({ filter: 'streamSafeMultiColumnFilter' }));
    expect((next.filter as Record<string, unknown>).multiFilters).toBeUndefined();
  });

  it('toggles the floating filter without disturbing the kind', () => {
    const prev = { colId: 'quantity', filter: { enabled: true, kind: 'agNumberColumnFilter' } };
    const next = applyColumnBehavior(prev, ok({ filter: { floatingFilter: true } }));
    expect(next.filter).toEqual({ enabled: true, kind: 'agNumberColumnFilter', floatingFilter: true });
  });

  it('honours an explicit enabled:false', () => {
    const next = applyColumnBehavior({ colId: 'quantity' }, ok({ filter: { enabled: false } }));
    expect((next.filter as Record<string, unknown>).enabled).toBe(false);
  });

  it('removes the filter config entirely on "none"', () => {
    const next = applyColumnBehavior({ colId: 'q', filter: { enabled: true } }, ok({ filter: 'none' }));
    expect(next.filter).toBeUndefined();
  });

  it('rejects an unknown kind, a negative debounce and a bogus button', () => {
    expect(err({ filter: 'agMagicFilter' })).toContain('streamSafe');
    expect(err({ filter: { debounceMs: -1 } })).toContain('debounceMs');
    expect(err({ filter: { buttons: ['explode'] } })).toContain('apply');
  });
});

describe('grouping flags', () => {
  it('merges into any existing rowGrouping config', () => {
    const prev = { colId: 'quantity', rowGrouping: { enableRowGroup: true } };
    const next = applyColumnBehavior(prev, ok({ grouping: { aggFunc: 'sum' } }));
    expect(next.rowGrouping).toEqual({ enableRowGroup: true, aggFunc: 'sum' });
  });

  it('accepts a custom aggregation with its expression', () => {
    expect(ok({ grouping: { aggFunc: 'custom', customAggExpression: 'SUM([value]) * 1.1' } }).grouping)
      .toEqual({ aggFunc: 'custom', customAggExpression: 'SUM([value]) * 1.1' });
  });

  /** The expression is only read when aggFunc is 'custom', so a lone one would
   *  look applied and do nothing. */
  it('refuses an expression without aggFunc "custom"', () => {
    expect(err({ grouping: { aggFunc: 'sum', customAggExpression: 'SUM([value])' } })).toContain('"custom"');
    expect(err({ grouping: { customAggExpression: 'SUM([value])' } })).toContain('"custom"');
  });

  it('rejects an unknown aggregation', () => {
    expect(err({ grouping: { aggFunc: 'median' } })).toContain('avg');
  });
});

describe('templates and flags', () => {
  it('replaces rather than appends the template reference', () => {
    const prev = { colId: 'quantity', templateIds: ['tpl_old'] };
    expect(applyColumnBehavior(prev, ok({ templateId: 'tpl_numeric' })).templateIds).toEqual(['tpl_numeric']);
  });

  it('drops the reference on "none"', () => {
    const prev = { colId: 'quantity', templateIds: ['tpl_old'] };
    expect(applyColumnBehavior(prev, ok({ templateId: 'none' })).templateIds).toBeUndefined();
  });

  it('carries the structural flags through', () => {
    const next = applyColumnBehavior(
      { colId: 'quantity' },
      ok({ sortable: false, filterable: true, resizable: false, headerTooltip: 'Executed quantity' }),
    );
    expect(next).toMatchObject({ sortable: false, filterable: true, resizable: false, headerTooltip: 'Executed quantity' });
  });

  it('rejects non-boolean flags', () => {
    expect(err({ sortable: 'yes' })).toContain('sortable');
  });
});

describe('describeColumnBehavior', () => {
  it('names the editor, filter, aggregation and template', () => {
    const summary = describeColumnBehavior(
      ok({
        editor: 'agNumberCellEditor',
        filter: { kind: 'streamSafeMultiNumberColumnFilter', floatingFilter: true },
        grouping: { aggFunc: 'sum' },
        templateId: 'tpl_numeric',
      }),
    );
    expect(summary).toContain('agNumberCellEditor editor (and made editable)');
    expect(summary).toContain('streamSafeMultiNumberColumnFilter');
    expect(summary).toContain('floating filter on');
    expect(summary).toContain('sum aggregation');
    expect(summary).toContain('tpl_numeric');
  });
});
