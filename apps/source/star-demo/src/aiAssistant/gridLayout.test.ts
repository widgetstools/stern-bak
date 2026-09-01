import { describe, expect, it } from 'vitest';
import {
  normalizeColumnLayoutArgs,
  normalizeRowGroupingArgs,
  normalizeSortArgs,
  normalizeGroupExpansionArgs,
  applyColumnLayout,
  applyRowGrouping,
  withGridStateSlices,
  type GridStateSlices,
  planGroupedVisibility,
} from './gridLayout';

describe('normalizeColumnLayoutArgs', () => {
  it('rejects a call that changes nothing', () => {
    const res = normalizeColumnLayoutArgs({});
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toContain('order');
  });

  it('rejects a column asked to be hidden and shown at once', () => {
    const res = normalizeColumnLayoutArgs({ hide: ['isin'], show: ['isin'] });
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toContain('isin');
  });

  it('rejects non-string column lists and non-positive widths', () => {
    expect(normalizeColumnLayoutArgs({ hide: [1] }).ok).toBe(false);
    expect(normalizeColumnLayoutArgs({ width: { a: 0 } }).ok).toBe(false);
    expect(normalizeColumnLayoutArgs({ width: { a: -5 } }).ok).toBe(false);
  });

  it('rounds fractional widths', () => {
    const res = normalizeColumnLayoutArgs({ width: { marketValue: 139.6 } });
    expect(res.ok === true && res.value.width).toEqual({ marketValue: 140 });
  });
});

describe('applyColumnLayout', () => {
  const prev: GridStateSlices = {
    columnOrder: { orderedColIds: ['a', 'b', 'c', 'd'] },
    columnVisibility: { hiddenColIds: ['d'] },
    columnPinning: { leftColIds: ['a'], rightColIds: [] },
    // An unrelated slice that must survive untouched.
    sort: { sortModel: [{ colId: 'b', sort: 'asc' }] },
  };

  /** Users say "put ticker first", not "here is the full column order". */
  it('treats a partial order as "these lead, the rest follow"', () => {
    const next = applyColumnLayout(prev, { order: ['c', 'a'] });
    expect(next.columnOrder?.orderedColIds).toEqual(['c', 'a', 'b', 'd']);
  });

  it('adds and removes hidden columns without dropping the others', () => {
    const next = applyColumnLayout(prev, { hide: ['b'], show: ['d'] });
    expect(next.columnVisibility?.hiddenColIds.sort()).toEqual(['b']);
  });

  it('moves a column between pinned edges rather than pinning it twice', () => {
    const next = applyColumnLayout(prev, { pinRight: ['a'] });
    expect(next.columnPinning).toEqual({ leftColIds: [], rightColIds: ['a'] });
  });

  it('unpins from either side', () => {
    const pinnedBoth: GridStateSlices = { columnPinning: { leftColIds: ['a'], rightColIds: ['z'] } };
    const next = applyColumnLayout(pinnedBoth, { unpin: ['a', 'z'] });
    expect(next.columnPinning).toEqual({ leftColIds: [], rightColIds: [] });
  });

  it('updates an existing width entry instead of duplicating the column', () => {
    const sized: GridStateSlices = { columnSizing: { columnSizingModel: [{ colId: 'a', width: 80, flex: 1 }] } };
    const next = applyColumnLayout(sized, { width: { a: 200, b: 90 } });
    expect(next.columnSizing?.columnSizingModel).toEqual([
      { colId: 'a', width: 200, flex: 1 },
      { colId: 'b', width: 90 },
    ]);
  });

  it('leaves slices it was not asked about alone', () => {
    const next = applyColumnLayout(prev, { hide: ['b'] });
    expect(next.sort).toEqual(prev.sort);
    expect(next.columnOrder).toEqual(prev.columnOrder);
  });
});

describe('row grouping', () => {
  it('requires groupBy explicitly so "clear" is deliberate', () => {
    const res = normalizeRowGroupingArgs({});
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toContain('empty array');
  });

  it('rejects an aggregation AG-Grid state cannot round-trip', () => {
    const res = normalizeRowGroupingArgs({ groupBy: ['sector'], aggregations: { mv: 'median' } });
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toContain('sum');
  });

  it('records nesting order and the aggregation model', () => {
    const parsed = normalizeRowGroupingArgs({
      groupBy: ['issuerSector', 'currency'],
      aggregations: { marketValue: 'sum' },
    });
    expect(parsed.ok).toBe(true);
    const next = applyRowGrouping({}, parsed.ok === true ? parsed.value : { groupBy: [] });
    expect(next.rowGroup).toEqual({ groupColIds: ['issuerSector', 'currency'] });
    expect(next.aggregation).toEqual({ aggregationModel: [{ colId: 'marketValue', aggFunc: 'sum' }] });
  });

  /** Totals left behind on a flattened grid look like a bug. */
  it('clears aggregates when the grouping is cleared', () => {
    const grouped: GridStateSlices = {
      rowGroup: { groupColIds: ['sector'] },
      aggregation: { aggregationModel: [{ colId: 'mv', aggFunc: 'sum' }] },
    };
    const next = applyRowGrouping(grouped, { groupBy: [] });
    expect(next.rowGroup).toEqual({ groupColIds: [] });
    expect(next.aggregation).toEqual({ aggregationModel: [] });
  });
});

describe('withGridStateSlices', () => {
  it('builds a replayable envelope when the grid has never been saved', () => {
    const env = withGridStateSlices(null, { columnVisibility: { hiddenColIds: ['x'] } }, '2026-08-24T00:00:00.000Z');
    expect(env.schemaVersion).toBe(3);
    expect(env.viewportAnchor).toEqual({ firstRowIndex: 0, leftColId: null, horizontalPixel: 0 });
    expect(env.gridState.columnVisibility).toEqual({ hiddenColIds: ['x'] });
  });

  it('preserves an existing snapshot\'s other fields and state', () => {
    const prev = {
      schemaVersion: 3,
      savedAt: 'old',
      quickFilter: 'AAPL',
      viewportAnchor: { firstRowIndex: 12, leftColId: 'b', horizontalPixel: 40 },
      gridState: { sort: { sortModel: [] }, columnOrder: { orderedColIds: ['a'] } },
    };
    const env = withGridStateSlices(prev, { columnOrder: { orderedColIds: ['b', 'a'] } }, 'new');
    expect(env.savedAt).toBe('new');
    expect(env.quickFilter).toBe('AAPL');
    expect(env.viewportAnchor.firstRowIndex).toBe(12);
    expect(env.gridState.sort).toEqual({ sortModel: [] });
    expect(env.gridState.columnOrder).toEqual({ orderedColIds: ['b', 'a'] });
  });
});

/**
 * A grouped or pivoted blotter is a summary, so it shows a summary's columns:
 * the dimensions move into the group column / pivot headers, and only measures
 * are left in the body. Getting this wrong is what makes a 250-column blotter
 * unreadable the moment it rolls up.
 */
describe('pivot arguments', () => {
  it('turns pivot mode on as soon as a column dimension is named', () => {
    const res = normalizeRowGroupingArgs({
      groupBy: ['issuerSector'],
      pivotBy: ['currency'],
      aggregations: { marketValue: 'sum' },
    });
    expect(res.ok).toBe(true);
    expect(res.ok === true && res.value.pivotMode).toBe(true);
  });

  it('leaves pivot mode off for a plain grouping', () => {
    const res = normalizeRowGroupingArgs({ groupBy: ['issuerSector'] });
    expect(res.ok === true && res.value.pivotMode).toBe(false);
  });

  it('lets a caller configure pivot columns while staying in grouped view', () => {
    const res = normalizeRowGroupingArgs({
      groupBy: ['issuerSector'],
      pivotBy: ['currency'],
      pivotMode: false,
    });
    expect(res.ok === true && res.value.pivotMode).toBe(false);
  });

  /** AG-Grid pivots values WITHIN row groups — with none it renders one total row. */
  it('rejects a pivot with no row dimension', () => {
    const res = normalizeRowGroupingArgs({ groupBy: [], pivotBy: ['currency'], aggregations: { mv: 'sum' } });
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toContain('needs at least one row group');
  });

  /** Pivot columns with no measure produce a grid of empty cells. */
  it('rejects a pivot with no measure', () => {
    const res = normalizeRowGroupingArgs({ groupBy: ['issuerSector'], pivotBy: ['currency'] });
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toContain('aggregated measure');
  });

  it('rejects a column used as both dimensions', () => {
    const res = normalizeRowGroupingArgs({
      groupBy: ['currency'],
      pivotBy: ['currency'],
      aggregations: { mv: 'sum' },
    });
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toContain('not both');
  });

  it('writes the pivot slice, and clears it when pivoting stops', () => {
    const pivoted = applyRowGrouping({}, {
      groupBy: ['issuerSector'],
      pivotBy: ['currency'],
      pivotMode: true,
      aggregations: { marketValue: 'sum' },
    });
    expect(pivoted.pivot).toEqual({ pivotMode: true, pivotColIds: ['currency'] });

    // Written even when off — a stale slice would otherwise be replayed on the
    // next profile load and silently re-pivot the grid.
    const flattened = applyRowGrouping(pivoted, { groupBy: [] });
    expect(flattened.pivot).toEqual({ pivotMode: false, pivotColIds: [] });
  });
});

describe('planGroupedVisibility', () => {
  const columns = [
    { colId: 'issuerSector', numeric: false },
    { colId: 'currency', numeric: false },
    { colId: 'cusip', numeric: false },
    { colId: 'marketValue', numeric: true },
    { colId: 'dv01', numeric: true },
  ];
  const fresh = { columns, previouslyHidden: [], previouslyAutoHidden: [] };

  it('hides the grouped column itself — its value is in the group column already', () => {
    const plan = planGroupedVisibility(
      { groupBy: ['issuerSector'], aggregations: { marketValue: 'sum' } },
      fresh,
    );
    expect(plan.autoHiddenColIds).toContain('issuerSector');
  });

  it('hides every non-numeric column but keeps the measures', () => {
    const plan = planGroupedVisibility(
      { groupBy: ['issuerSector'], aggregations: { marketValue: 'sum' } },
      fresh,
    );
    expect(plan.hiddenColIds.sort()).toEqual(['currency', 'cusip', 'issuerSector']);
    expect(plan.hiddenColIds).not.toContain('marketValue');
    // Numeric but unaggregated columns stay too — they can still be totalled.
    expect(plan.hiddenColIds).not.toContain('dv01');
  });

  it('hides both dimensions of a pivot', () => {
    const plan = planGroupedVisibility(
      { groupBy: ['issuerSector'], pivotBy: ['currency'], pivotMode: true, aggregations: { marketValue: 'sum' } },
      fresh,
    );
    expect(plan.autoHiddenColIds).toEqual(expect.arrayContaining(['issuerSector', 'currency']));
  });

  /** Asking for the number is what makes a column a measure, whatever its type. */
  it('keeps an explicitly aggregated column even when it is not numeric', () => {
    const plan = planGroupedVisibility(
      { groupBy: ['issuerSector'], aggregations: { cusip: 'count' } },
      fresh,
    );
    expect(plan.hiddenColIds).not.toContain('cusip');
  });

  it('keeps text columns when the caller opts out', () => {
    const plan = planGroupedVisibility(
      { groupBy: ['issuerSector'], hideNonNumeric: false, aggregations: { marketValue: 'sum' } },
      fresh,
    );
    // The grouped column still goes — that one is not a preference.
    expect(plan.autoHiddenColIds).toEqual(['issuerSector']);
    expect(plan.hiddenColIds).not.toContain('cusip');
  });

  it('hides nothing when the grid is neither grouped nor pivoting', () => {
    const plan = planGroupedVisibility({ groupBy: [] }, fresh);
    expect(plan.hiddenColIds).toEqual([]);
    expect(plan.autoHiddenColIds).toEqual([]);
  });

  it('restores what the grouped view hid when the grid is flattened', () => {
    const plan = planGroupedVisibility({ groupBy: [] }, {
      columns,
      previouslyHidden: ['issuerSector', 'currency', 'cusip'],
      previouslyAutoHidden: ['issuerSector', 'currency', 'cusip'],
    });
    expect(plan.hiddenColIds).toEqual([]);
  });

  /** The whole point of tracking what WE hid rather than clearing the lot. */
  it('leaves a column the user hid by hand hidden after flattening', () => {
    const plan = planGroupedVisibility({ groupBy: [] }, {
      columns,
      previouslyHidden: ['cusip', 'issuerSector'],
      previouslyAutoHidden: ['issuerSector'],
    });
    expect(plan.hiddenColIds).toEqual(['cusip']);
  });

  /** Otherwise re-grouping on a new dimension accumulates hidden columns forever. */
  it('releases the previous view before applying the new one', () => {
    const plan = planGroupedVisibility(
      { groupBy: ['currency'], hideNonNumeric: false, aggregations: { marketValue: 'sum' } },
      { columns, previouslyHidden: ['issuerSector'], previouslyAutoHidden: ['issuerSector'] },
    );
    expect(plan.hiddenColIds).toEqual(['currency']);
  });
});

describe('normalizeSortArgs', () => {
  it('reads an ordered sort list, defaulting direction to asc', () => {
    const res = normalizeSortArgs({ sortBy: [{ column: 'desk' }, { column: 'marketValue', direction: 'desc' }] });
    expect(res.ok && res.value.sortModel).toEqual([
      { colId: 'desk', sort: 'asc' },
      { colId: 'marketValue', sort: 'desc' },
    ]);
  });

  /** "stop sorting" has to be expressible without a second tool. */
  it('treats clear:true and an empty list as "remove all sorting"', () => {
    expect(normalizeSortArgs({ clear: true })).toEqual({ ok: true, value: { sortModel: [] } });
    expect(normalizeSortArgs({ sortBy: [] })).toEqual({ ok: true, value: { sortModel: [] } });
  });

  it('rejects a direction that is not asc or desc', () => {
    const res = normalizeSortArgs({ sortBy: [{ column: 'desk', direction: 'descending' }] });
    expect(res.ok).toBe(false);
    expect(!res.ok && res.error).toContain('"asc" or "desc"');
  });

  /** AG-Grid would silently keep only one; better to say so. */
  it('rejects the same column sorted twice', () => {
    const res = normalizeSortArgs({ sortBy: [{ column: 'desk' }, { column: 'desk', direction: 'desc' }] });
    expect(res.ok).toBe(false);
    expect(!res.ok && res.error).toContain('twice');
  });

  it('rejects an entry with no column, and a missing sortBy', () => {
    expect(normalizeSortArgs({ sortBy: [{ direction: 'asc' }] }).ok).toBe(false);
    expect(normalizeSortArgs({}).ok).toBe(false);
  });
});

describe('normalizeGroupExpansionArgs', () => {
  /**
   * expand-all is a general-settings DEFAULT, not a snapshot — it has to keep
   * applying to groups that appear later on a streaming blotter.
   */
  it('maps mode "all" to groupDefaultExpanded -1', () => {
    const res = normalizeGroupExpansionArgs({ mode: 'all' });
    expect(res.ok && res.value.groupDefaultExpanded).toBe(-1);
  });

  it('maps mode "none" to groupDefaultExpanded 0', () => {
    const res = normalizeGroupExpansionArgs({ mode: 'none' });
    expect(res.ok && res.value.groupDefaultExpanded).toBe(0);
  });

  it('takes an explicit list of groups to open, and leaves the default alone', () => {
    const res = normalizeGroupExpansionArgs({ mode: 'specific', expandGroups: ['row-group-sector-Financials'] });
    expect(res.ok && res.value.expandedRowGroupIds).toEqual(['row-group-sector-Financials']);
    expect(res.ok && res.value.groupDefaultExpanded).toBeUndefined();
  });

  /** Without a mode or a list there is nothing to do — and guessing would
   *  silently collapse every group, since the list is absolute. */
  it('rejects a call that names neither a mode nor any groups', () => {
    const res = normalizeGroupExpansionArgs({});
    expect(res.ok).toBe(false);
    expect(!res.ok && res.error).toContain('mode');
  });

  it('rejects an unknown mode', () => {
    expect(normalizeGroupExpansionArgs({ mode: 'expand-everything' }).ok).toBe(false);
  });
});
