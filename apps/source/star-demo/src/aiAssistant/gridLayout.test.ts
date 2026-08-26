import { describe, expect, it } from 'vitest';
import {
  normalizeColumnLayoutArgs,
  normalizeRowGroupingArgs,
  applyColumnLayout,
  applyRowGrouping,
  withGridStateSlices,
  type GridStateSlices,
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
