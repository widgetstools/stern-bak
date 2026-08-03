import { describe, expect, it, vi } from 'vitest';
import type { PerspectiveViewConfig } from '@wellsfargo-starui/core';
import { createViewManager, type PerspectiveTableLike, type UpdatableView } from './viewManager.js';

interface FakeView extends UpdatableView {
  config: PerspectiveViewConfig;
  deleted: boolean;
  fire(): void;
  reads: { start_row: number; end_row: number }[];
}

/**
 * A Table whose Views report their config and record the exact windows read,
 * so the group-level offset and the `__ROW_PATH__` remap can be asserted
 * rather than inferred.
 */
function makeTable(totalRows = 1000, schema?: Record<string, string>) {
  const views: FakeView[] = [];

  const table: PerspectiveTableLike = {
    ...(schema ? { schema: async () => schema } : {}),
    view: vi.fn(async (config: PerspectiveViewConfig) => {
      const grouped = (config.group_by?.length ?? 0) > 0;
      // Per-View, not shared: a retired View's callback can still fire while
      // its delete drains, and that is exactly what one of these tests asserts.
      let updateCb: (() => void) | null = null;
      const view: FakeView = {
        config,
        deleted: false,
        reads: [],
        fire: () => updateCb?.(),
        async to_columns(window) {
          const start = window?.start_row ?? 0;
          const end = window?.end_row ?? 0;
          view.reads.push({ start_row: start, end_row: end });
          const n = Math.max(0, Math.min(end, totalRows) - start);
          if (!grouped) {
            return {
              positionId: Array.from({ length: n }, (_, i) => `p${start + i}`),
              pnl: Array.from({ length: n }, (_, i) => (start + i) * 10),
            };
          }
          return {
            // Row 0 of a grouped view is the level total: an empty path.
            __ROW_PATH__: Array.from({ length: n }, (_, i) =>
              start + i === 0 ? [] : [`g${start + i}`],
            ),
            desk: Array.from({ length: n }, () => 7),
            pnl: Array.from({ length: n }, (_, i) => (start + i) * 10),
          };
        },
        async num_rows() {
          return totalRows;
        },
        async delete() {
          view.deleted = true;
        },
        async on_update(cb: () => void) {
          updateCb = cb;
          return 1;
        },
      };
      views.push(view);
      return view;
    }),
  };

  return { table, views };
}

const GROUPS = [{ id: 'sector' }, { id: 'book' }];

describe('createViewManager — View identity', () => {
  it('reuses the live View for an identical request', async () => {
    const { table } = makeTable();
    const views = createViewManager({ table });

    await views.getView({ startRow: 0, endRow: 100 });
    await views.getView({ startRow: 100, endRow: 200 });

    expect(table.view).toHaveBeenCalledTimes(1);
    expect(views.liveViews).toBe(1);
  });

  it('builds one View per group level and keeps them all alive', async () => {
    const { table } = makeTable();
    const views = createViewManager({ table });
    const base = { startRow: 0, endRow: 100, rowGroupCols: GROUPS };

    await views.getView({ ...base, groupKeys: [] });
    await views.getView({ ...base, groupKeys: ['Energy'] });
    await views.getView({ ...base, groupKeys: ['Technology'] });

    // A grouped grid pulls levels concurrently; collapsing them onto one View
    // would rebuild it per block.
    expect(table.view).toHaveBeenCalledTimes(3);
    expect(views.liveViews).toBe(3);
  });

  it('builds only ONE View when two blocks race for the same level', async () => {
    const { table } = makeTable();
    const views = createViewManager({ table });

    await Promise.all([
      views.getView({ startRow: 0, endRow: 100 }),
      views.getView({ startRow: 100, endRow: 200 }),
    ]);

    expect(table.view).toHaveBeenCalledTimes(1);
  });
});

describe('createViewManager — group level reads', () => {
  it('skips the level total row and remaps __ROW_PATH__ onto the group column', async () => {
    const { table, views: built } = makeTable();
    const views = createViewManager({ table });

    const view = await views.getView({
      startRow: 0,
      endRow: 3,
      rowGroupCols: GROUPS,
      groupKeys: [],
    });
    const columns = await view!.to_columns({ start_row: 0, end_row: 3 });

    // Read is offset by one: AG asked for children, row 0 is the total.
    expect(built[0].reads).toEqual([{ start_row: 1, end_row: 4 }]);
    expect(columns.sector).toEqual(['g1', 'g2', 'g3']);
    expect(columns.__ROW_PATH__).toBeUndefined();
  });

  it('does not offset at the leaf level, where rows are real rows', async () => {
    const { table, views: built } = makeTable();
    const views = createViewManager({ table });

    const view = await views.getView({
      startRow: 0,
      endRow: 3,
      rowGroupCols: GROUPS,
      groupKeys: ['Energy', 'FI-GOVT'],
    });
    const columns = await view!.to_columns({ start_row: 0, end_row: 3 });

    expect(built[0].reads).toEqual([{ start_row: 0, end_row: 3 }]);
    expect(columns.positionId).toEqual(['p0', 'p1', 'p2']);
  });

  it('excludes the total row from the row count of a grouped level only', async () => {
    const { table } = makeTable(500);
    const grouped = createViewManager({ table });
    await grouped.getView({ startRow: 0, endRow: 100, rowGroupCols: GROUPS, groupKeys: [] });
    expect(grouped.rowsAtRoot).toBe(499);

    const flat = createViewManager({ table: makeTable(500).table });
    await flat.getView({ startRow: 0, endRow: 100 });
    expect(flat.rowsAtRoot).toBe(500);
  });

  /**
   * AG leaves an un-aggregated column empty in a group row; Perspective fills
   * it with the type's default, which for a string is a distinct-count — so a
   * text column renders a number under a group header.
   */
  it('blanks an unaggregated text column using the Table schema', async () => {
    const { table } = makeTable(500, { desk: 'string', pnl: 'float' });
    const views = createViewManager({ table });

    const view = await views.getView({
      startRow: 0,
      endRow: 3,
      rowGroupCols: GROUPS,
      groupKeys: [],
    });
    const columns = await view!.to_columns({ start_row: 0, end_row: 3 });

    expect(columns.desk).toEqual([null, null, null]);
    expect(columns.pnl).toEqual([10, 20, 30]);
  });

  it('leaves every column alone when the Table cannot report a schema', async () => {
    const { table } = makeTable(500);
    const views = createViewManager({ table });

    const view = await views.getView({
      startRow: 0,
      endRow: 3,
      rowGroupCols: GROUPS,
      groupKeys: [],
    });
    const columns = await view!.to_columns({ start_row: 0, end_row: 3 });

    expect(columns.desk).toEqual([7, 7, 7]);
  });
});

describe('createViewManager — the generation fence', () => {
  // THE regression this guards: the datasource captures the generation before
  // `getView` and re-checks it after. Bumping on a request-driven swap fences
  // off the very request that asked for the View, and the grid renders blank
  // on first load and after every sort and filter change.
  it('does not move the generation when a request builds or swaps a View', async () => {
    const { table } = makeTable();
    const views = createViewManager({ table });

    expect(views.getGeneration()).toBe(0);
    await views.getView({ startRow: 0, endRow: 100 });
    expect(views.getGeneration()).toBe(0);

    await views.getView({ startRow: 0, endRow: 100, sortModel: [{ colId: 'pnl', sort: 'desc' }] });
    expect(views.getGeneration()).toBe(0);
  });

  it('moves it only on an explicit invalidate', async () => {
    const { table } = makeTable();
    const views = createViewManager({ table });
    await views.getView({ startRow: 0, endRow: 100 });

    views.invalidate();
    expect(views.getGeneration()).toBe(1);
  });
});

describe('createViewManager — retirement', () => {
  it('retires every View when the sort/filter/grouping shape changes', async () => {
    const { table, views: built } = makeTable();
    const views = createViewManager({ table });
    const base = { startRow: 0, endRow: 100, rowGroupCols: GROUPS };

    await views.getView({ ...base, groupKeys: [] });
    await views.getView({ ...base, groupKeys: ['Energy'] });
    expect(views.liveViews).toBe(2);

    // A new sort makes both levels garbage; keeping them would charge the
    // engine on every tick for a shape nothing will ask for again.
    await views.getView({ ...base, groupKeys: [], sortModel: [{ colId: 'pnl', sort: 'desc' }] });
    expect(views.liveViews).toBe(1);
    await Promise.resolve();
    expect(built[0].deleted).toBe(true);
    expect(built[1].deleted).toBe(true);
  });

  it('evicts the least recently used beyond maxViews', async () => {
    const { table } = makeTable();
    const views = createViewManager({ table, maxViews: 2 });
    const base = { startRow: 0, endRow: 100, rowGroupCols: GROUPS };

    await views.getView({ ...base, groupKeys: [] });
    await views.getView({ ...base, groupKeys: ['A'] });
    await views.getView({ ...base, groupKeys: ['B'] });

    expect(views.liveViews).toBe(2);
  });

  it('re-opens a View retired under an in-flight block instead of settling short', async () => {
    const { table } = makeTable();
    const views = createViewManager({ table });

    const stale = await views.getView({ startRow: 0, endRow: 3 });
    // A sort lands, retiring the View the block is about to read from.
    await views.getView({ startRow: 0, endRow: 3, sortModel: [{ colId: 'pnl', sort: 'desc' }] });

    const columns = await stale!.to_columns({ start_row: 0, end_row: 3 });

    // An empty window at a non-zero start row is indistinguishable from the
    // end of the book and would cap the store forever, so it must be rows.
    expect(columns.positionId).toEqual(['p0', 'p1', 'p2']);
  });

  it('closes every live View on close()', async () => {
    const { table, views: built } = makeTable();
    const views = createViewManager({ table });
    await views.getView({ startRow: 0, endRow: 100, rowGroupCols: GROUPS, groupKeys: [] });
    await views.getView({ startRow: 0, endRow: 100, rowGroupCols: GROUPS, groupKeys: ['Energy'] });

    await views.close();

    expect(built.every((v) => v.deleted)).toBe(true);
    expect(views.liveViews).toBe(0);
    expect(await views.getView({ startRow: 0, endRow: 100 })).toBeNull();
  });
});

describe('createViewManager — grand total', () => {
  it('reads row 0, which is the total over the whole filtered book', async () => {
    const { table } = makeTable();
    const views = createViewManager({ table });

    const total = await views.readGrandTotal({
      startRow: 0,
      endRow: 100,
      rowGroupCols: GROUPS,
      groupKeys: [],
    });

    expect(total).toMatchObject({ pnl: 0 });
    expect(total).not.toHaveProperty('__ROW_PATH__');
  });

  it('reuses the root level View when grouping is on — the total is free', async () => {
    const { table } = makeTable();
    const views = createViewManager({ table });
    const request = { startRow: 0, endRow: 100, rowGroupCols: GROUPS, groupKeys: [] };

    await views.getView(request);
    await views.readGrandTotal(request);

    expect(table.view).toHaveBeenCalledTimes(1);
    expect(views.liveViews).toBe(1);
  });

  it('liveOnly answers null rather than building a View for a retired shape', async () => {
    // MEASURED on the 50k x 400 stress book: the throttled refresh's total was
    // scheduled a few milliseconds before a filter change, found its View
    // retired by the shape swap, and BUILT a fresh one — 1,310 ms of engine
    // work ahead of the block the user was waiting for, for a total row the
    // purge had already destroyed.
    const { table } = makeTable();
    const views = createViewManager({ table });
    const request = { startRow: 0, endRow: 100, rowGroupCols: GROUPS, groupKeys: [] };

    await views.getView(request);
    const builtForTheGrid = (table.view as ReturnType<typeof vi.fn>).mock.calls.length;

    // A new filter is a new shape: `getView` retires every live View.
    await views.getView({
      ...request,
      filterModel: { sector: { filterType: 'set', values: ['Energy'] } },
    });
    const afterSwap = (table.view as ReturnType<typeof vi.fn>).mock.calls.length;

    // The shape the grid has moved off has no live View, so there is nothing
    // to read and nothing worth building.
    expect(await views.readGrandTotal(request, { liveOnly: true })).toBeNull();
    expect((table.view as ReturnType<typeof vi.fn>).mock.calls.length).toBe(afterSwap);
    expect(afterSwap).toBeGreaterThan(builtForTheGrid);

    // Without the flag it builds, which is what a block request needs.
    expect(await views.readGrandTotal(request)).not.toBeNull();
    expect((table.view as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(afterSwap);
  });

  it('adds a constant-expression group when flat, because plain rows have no total', async () => {
    const { table } = makeTable();
    const views = createViewManager({ table });

    await views.readGrandTotal({ startRow: 0, endRow: 100 });

    const config = (table.view as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(config.group_by).toEqual(['__all__']);
    expect(config.expressions).toEqual({ __all__: "'ALL'" });
  });

  it('blanks an unaggregated text column, so a total row does not read like data', async () => {
    const { table } = makeTable(100, { desk: 'string', pnl: 'float' });
    const views = createViewManager({ table });

    const total = await views.readGrandTotal({
      startRow: 0,
      endRow: 100,
      rowGroupCols: GROUPS,
      groupKeys: [],
    });

    expect(total!.desk).toBeNull();
    expect(total!.pnl).toBe(0);
  });

  it('answers null once closed', async () => {
    const { table } = makeTable();
    const views = createViewManager({ table });
    await views.close();
    expect(await views.readGrandTotal({ startRow: 0, endRow: 100 })).toBeNull();
  });
});

describe('createViewManager — update subscription', () => {
  it('reports a Table update on a live View', async () => {
    const { table, views: built } = makeTable();
    const onUpdate = vi.fn();
    const views = createViewManager({ table, onUpdate });
    await views.getView({ startRow: 0, endRow: 100 });

    built[0].fire();

    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it('ignores a tick from a View that has been retired', async () => {
    const { table, views: built } = makeTable();
    const onUpdate = vi.fn();
    const views = createViewManager({ table, onUpdate });
    await views.getView({ startRow: 0, endRow: 100 });
    await views.getView({ startRow: 0, endRow: 100, sortModel: [{ colId: 'pnl', sort: 'desc' }] });

    // The first View's callback can still fire while its delete drains.
    built[0].fire();

    expect(onUpdate).not.toHaveBeenCalled();
  });
});

describe('createViewManager — rowsAtRoot', () => {
  it('reports the root level, not the grand-total View', async () => {
    const { table } = makeTable(20_000);
    const views = createViewManager({ table });
    const request = { startRow: 0, endRow: 100 };

    await views.getView(request);
    expect(views.rowsAtRoot).toBe(20_000);

    // The grand-total View is depth 0 as well and holds exactly ONE group, so
    // recording its count here published a row count of 1 to the grid and
    // capped the store at a single row.
    await views.readGrandTotal(request);
    expect(views.rowsAtRoot).toBe(20_000);
  });

  it('follows the root level across a sort change', async () => {
    const { table } = makeTable(500);
    const views = createViewManager({ table });

    await views.getView({ startRow: 0, endRow: 100 });
    await views.readGrandTotal({ startRow: 0, endRow: 100 });
    await views.getView({ startRow: 0, endRow: 100, sortModel: [{ colId: 'pnl', sort: 'desc' }] });

    expect(views.rowsAtRoot).toBe(500);
  });
});

/**
 * A blotter opens long before ~20,000 rows have arrived, so its first View is
 * built against a Table that is still filling. Everything here is about that
 * View reporting what the Table holds NOW rather than what it held at build.
 */
describe('createViewManager — a book that grows under a live View', () => {
  function makeGrowingTable() {
    let total = 0;
    const table: PerspectiveTableLike = {
      view: vi.fn(async (config: PerspectiveViewConfig) => {
        const grouped = (config.group_by?.length ?? 0) > 0;
        const view: UpdatableView = {
          async to_columns(window) {
            const start = window?.start_row ?? 0;
            const n = Math.max(0, Math.min(window?.end_row ?? 0, total) - start);
            const cols: Record<string, unknown[]> = {
              positionId: Array.from({ length: n }, (_, i) => `p${start + i}`),
            };
            if (grouped) {
              cols.__ROW_PATH__ = Array.from({ length: n }, (_, i) =>
                start + i === 0 ? [] : [`g${start + i}`],
              );
            }
            return cols;
          },
          async num_rows() {
            return total;
          },
          async delete() {},
          async on_update() {
            return 1;
          },
        };
        return view;
      }),
    };
    return {
      table,
      fill: (rows: number) => {
        total = rows;
      },
    };
  }

  // MEASURED on the live feed: the count was captured once at build time, so a
  // View created during the snapshot reported 0 forever. AG sizes its store
  // from that number — the grid stayed empty over a full book and refreshing
  // could not help, because every refresh re-used the same cached count.
  it('re-measures the row count each time the cached View is handed out', async () => {
    const { table, fill } = makeGrowingTable();
    const views = createViewManager({ table });

    const first = await views.getView({ startRow: 0, endRow: 100 });
    expect(await first!.num_rows()).toBe(0);
    expect(views.rowsAtRoot).toBe(0);

    fill(20_000);
    const second = await views.getView({ startRow: 0, endRow: 100 });

    // Same View — re-measured, not rebuilt.
    expect(table.view).toHaveBeenCalledTimes(1);
    expect(await second!.num_rows()).toBe(20_000);
    expect(views.rowsAtRoot).toBe(20_000);
  });

  it('keeps the group-level offset when re-measuring', async () => {
    const { table, fill } = makeGrowingTable();
    const views = createViewManager({ table });
    const base = { startRow: 0, endRow: 100, rowGroupCols: GROUPS, groupKeys: [] };

    await views.getView(base);
    fill(51);
    const view = await views.getView(base);

    // Row 0 of a grouped View is that level's own total, not a child AG asked for.
    expect(await view!.num_rows()).toBe(50);
  });
});

/**
 * Neither the quick search nor a calculated column is part of the AG request,
 * yet both change which rows and columns a View holds — so both have to move
 * the shape or every live View would survive with the wrong contents.
 */
describe('createViewManager — quick filter and calculated columns', () => {
  it('compiles the quick text into the next View, and reports whether it changed', async () => {
    const { table } = makeTable();
    const views = createViewManager({ table });

    expect(views.setQuickFilter('energy', ['sector'])).toBe(true);
    // Trimmed-equal text is the same search; re-purging for it would loop with
    // the `modelUpdated` the purge itself fires.
    expect(views.setQuickFilter('  energy  ', ['sector'])).toBe(false);

    await views.getView({ startRow: 0, endRow: 100 });
    const config = (table.view as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
    expect(config.expressions.__quick__).toContain('"sector"');
    expect(config.filter).toContainEqual(['__quick__', '==', true]);
  });

  it('retires the live Views on the block AFTER the quick text changes', async () => {
    // Retiring inside `setQuickFilter` would delete Views with reads still in
    // flight from the request that is about to be superseded.
    const { table, views: built } = makeTable();
    const views = createViewManager({ table });
    await views.getView({ startRow: 0, endRow: 100 });

    views.setQuickFilter('energy', ['sector']);
    expect(built[0].deleted).toBe(false);

    await views.getView({ startRow: 0, endRow: 100 });
    expect(built[0].deleted).toBe(true);
    expect(views.liveViews).toBe(1);
  });

  it('carries calculated columns into every View it builds', async () => {
    const { table } = makeTable();
    const views = createViewManager({ table });

    expect(views.setExpressions({ grossPnl: '"price" * "qty"' })).toBe(true);
    expect(views.setExpressions({ grossPnl: '"price" * "qty"' })).toBe(false);

    await views.getView({ startRow: 0, endRow: 100 });
    const config = (table.view as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
    expect(config.expressions).toMatchObject({ grossPnl: '"price" * "qty"' });
  });
});

describe('readAllRows', () => {
  function makeBookTable(total: number) {
    const built: PerspectiveViewConfig[] = [];
    const reads: { start_row: number; end_row: number }[] = [];
    const table: PerspectiveTableLike = {
      view: vi.fn(async (config: PerspectiveViewConfig) => {
        built.push(config);
        const view: UpdatableView = {
          async to_columns(window) {
            const start = window?.start_row ?? 0;
            const end = Math.min(window?.end_row ?? 0, total);
            reads.push({ start_row: start, end_row: end });
            const n = Math.max(0, end - start);
            return {
              positionId: Array.from({ length: n }, (_, i) => `p${start + i}`),
              pnl: Array.from({ length: n }, (_, i) => start + i),
            };
          },
          async num_rows() {
            return total;
          },
          async delete() {},
          async on_update() {
            return 1;
          },
        };
        return view;
      }),
    };
    return { table, built, reads };
  }

  it('returns every row as an object, in order', async () => {
    const { table } = makeBookTable(2500);
    const views = createViewManager({ table });

    const rows = await views.readAllRows({ startRow: 0, endRow: 100 }, 200_000);
    expect(rows).toHaveLength(2500);
    expect(rows![0]).toEqual({ positionId: 'p0', pnl: 0 });
    expect(rows![2499]).toEqual({ positionId: 'p2499', pnl: 2499 });
  });

  it('reads in chunks — one call for 20,000 rows would cross the proxy at once', async () => {
    const { table, reads } = makeBookTable(25_000);
    const views = createViewManager({ table });

    await views.readAllRows({ startRow: 0, endRow: 100 }, 200_000);
    expect(reads.length).toBeGreaterThan(1);
    expect(Math.max(...reads.map((r) => r.end_row - r.start_row))).toBeLessThanOrEqual(10_000);
  });

  it('carries the current sort and filter, so the file matches the screen', async () => {
    const { table, built } = makeBookTable(10);
    const views = createViewManager({ table });

    await views.readAllRows(
      {
        startRow: 0,
        endRow: 100,
        sortModel: [{ colId: 'pnl', sort: 'desc' }],
        filterModel: { desk: { filterType: 'set', values: ['Rates'] } },
      },
      200_000,
    );

    expect(built.at(-1)!.sort).toEqual([['pnl', 'desc']]);
    expect(built.at(-1)!.filter).toEqual([['desk', 'in', ['Rates']]]);
  });

  it('drops grouping — an export wants leaf rows, not a group tree', async () => {
    const { table, built } = makeBookTable(10);
    const views = createViewManager({ table });

    await views.readAllRows(
      { startRow: 0, endRow: 100, rowGroupCols: [{ id: 'desk' }], groupKeys: [] },
      200_000,
    );

    expect(built.at(-1)!.group_by).toBeUndefined();
  });

  it('answers null past the ceiling rather than a short file', async () => {
    // A file that stopped early is indistinguishable from a complete one once
    // it is open in Excel.
    const { table } = makeBookTable(300_000);
    const views = createViewManager({ table });

    expect(await views.readAllRows({ startRow: 0, endRow: 100 }, 200_000)).toBeNull();
  });

  it('does not retire the Views the grid is scrolling', async () => {
    const { table } = makeBookTable(100);
    const views = createViewManager({ table });
    await views.getView({ startRow: 0, endRow: 100 });
    expect(views.liveViews).toBe(1);

    await views.readAllRows({ startRow: 0, endRow: 100 }, 200_000);

    expect(views.liveViews).toBe(1);
  });

  it('returns null once closed', async () => {
    const { table } = makeBookTable(10);
    const views = createViewManager({ table });
    await views.close();
    expect(await views.readAllRows({ startRow: 0, endRow: 100 }, 200_000)).toBeNull();
  });

  it('handles an empty book', async () => {
    const { table } = makeBookTable(0);
    const views = createViewManager({ table });
    expect(await views.readAllRows({ startRow: 0, endRow: 100 }, 200_000)).toEqual([]);
  });
});

describe('readMatchingRows — the child rows behind a master row', () => {
  function makeDetailTable(total = 3) {
    const built: PerspectiveViewConfig[] = [];
    const deleted: PerspectiveViewConfig[] = [];
    let fail = false;
    const table: PerspectiveTableLike = {
      view: vi.fn(async (config: PerspectiveViewConfig) => {
        if (fail) throw new Error('Value Error - Input column "nope" does not exist.');
        built.push(config);
        const view: UpdatableView = {
          async to_columns(window) {
            const start = window?.start_row ?? 0;
            const end = Math.min(window?.end_row ?? 0, total);
            const n = Math.max(0, end - start);
            return {
              leg: Array.from({ length: n }, (_, i) => `L${start + i}`),
              notional: Array.from({ length: n }, (_, i) => (start + i) * 100),
            };
          },
          async num_rows() {
            return total;
          },
          async delete() {
            deleted.push(config);
          },
          async on_update() {
            return 1;
          },
        };
        return view;
      }),
    };
    return {
      table,
      built,
      deleted,
      breakIt: () => {
        fail = true;
      },
    };
  }

  it('selects the book rows matching every field of the master', async () => {
    const { table, built } = makeDetailTable();
    const views = createViewManager({ table });

    const rows = await views.readMatchingRows({ tradeId: 'T1', book: 'RATES' }, 500);
    expect(rows).toHaveLength(3);
    expect(rows![0]).toEqual({ leg: 'L0', notional: 0 });
    expect(built.at(-1)!.filter).toEqual([
      ['tradeId', '==', 'T1'],
      ['book', '==', 'RATES'],
    ]);
  });

  /** `== null` matches nothing in Perspective, so a master keyed on a missing
   *  value would open onto an empty detail grid. */
  it('uses the null predicate for a null match value', async () => {
    const { table, built } = makeDetailTable();
    const views = createViewManager({ table });

    await views.readMatchingRows({ book: null, desk: undefined }, 500);
    expect(built.at(-1)!.filter).toEqual([
      ['book', 'is null'],
      ['desk', 'is null'],
    ]);
  });

  /**
   * Deliberately NOT scoped to the grid's sort or filter — a master row must
   * expand onto the same children whatever else is on screen.
   */
  it('carries no sort and no grid filter', async () => {
    const { table, built } = makeDetailTable();
    const views = createViewManager({ table });

    await views.readMatchingRows({ tradeId: 'T1' }, 500);
    const config = built.at(-1)!;
    expect(config.sort ?? []).toEqual([]);
    expect(config.group_by ?? []).toEqual([]);
    expect(config.filter).toEqual([['tradeId', '==', 'T1']]);
  });

  it('carries the calculated columns — a detail column may be one', async () => {
    const { table, built } = makeDetailTable();
    const views = createViewManager({ table });
    views.setExpressions({ grossPnl: '"price" * "qty"' });

    await views.readMatchingRows({ tradeId: 'T1' }, 500);
    expect(built.at(-1)!.expressions).toMatchObject({ grossPnl: '"price" * "qty"' });
  });

  /** Truncates rather than refusing — a detail panel is a bounded surface the
   *  user is looking at, not a file that will be read later. */
  it('truncates to the limit', async () => {
    const { table } = makeDetailTable(1000);
    const views = createViewManager({ table });

    const rows = await views.readMatchingRows({ tradeId: 'T1' }, 5);
    expect(rows).toHaveLength(5);
  });

  /** No clauses would select the WHOLE book as one row's children. */
  it('answers empty for an empty match rather than the whole book', async () => {
    const { table, built } = makeDetailTable();
    const views = createViewManager({ table });

    expect(await views.readMatchingRows({}, 500)).toEqual([]);
    expect(built).toHaveLength(0);
  });

  it('answers empty when nothing matches', async () => {
    const { table } = makeDetailTable(0);
    const views = createViewManager({ table });
    expect(await views.readMatchingRows({ tradeId: 'T1' }, 500)).toEqual([]);
  });

  it('deletes its View', async () => {
    const { table, deleted } = makeDetailTable();
    const views = createViewManager({ table });

    await views.readMatchingRows({ tradeId: 'T1' }, 500);
    await Promise.resolve();
    await Promise.resolve();
    expect(deleted).toHaveLength(1);
  });

  it('answers null when the View cannot be built, and once closed', async () => {
    const { table, breakIt } = makeDetailTable();
    const views = createViewManager({ table });
    breakIt();
    expect(await views.readMatchingRows({ tradeId: 'T1' }, 500)).toBeNull();

    const fresh = makeDetailTable();
    const other = createViewManager({ table: fresh.table });
    await other.close();
    expect(await other.readMatchingRows({ tradeId: 'T1' }, 500)).toBeNull();
  });

  it('drains its transient View on close, so nothing outlives the manager', async () => {
    const { table, deleted } = makeDetailTable(1000);
    const views = createViewManager({ table });

    const reading = views.readMatchingRows({ tradeId: 'T1' }, 500);
    await views.close();
    await reading;

    expect(deleted).toHaveLength(1);
  });
});

describe('tree mode', () => {
  const TREE = ['sector', 'book'];

  it('stands the tree fields in for the rowGroupCols AG does not send', async () => {
    const { table, views: built } = makeTable(500);
    const views = createViewManager({ table, treeFields: TREE });

    await views.getView({ startRow: 0, endRow: 100 });
    // Root level groups by the OUTERMOST field only — one level at a time.
    expect(built.at(-1)!.config.group_by).toEqual(['sector']);
  });

  it('pushes ancestor keys down as filter clauses, level by level', async () => {
    const { table, views: built } = makeTable(500);
    const views = createViewManager({ table, treeFields: TREE });

    await views.getView({ startRow: 0, endRow: 100, groupKeys: ['Energy'] });
    const config = built.at(-1)!.config;
    expect(config.group_by).toEqual(['book']);
    expect(config.filter).toContainEqual(['sector', '==', 'Energy']);
  });

  /** Every group column consumed — the level is real rows, not parents. */
  it('serves the leaf level from an UNgrouped View', async () => {
    const { table, views: built } = makeTable(500);
    const views = createViewManager({ table, treeFields: TREE });

    await views.getView({ startRow: 0, endRow: 100, groupKeys: ['Energy', 'GOVT'] });
    const config = built.at(-1)!.config;
    expect(config.group_by ?? []).toEqual([]);
    expect(config.filter).toContainEqual(['sector', '==', 'Energy']);
    expect(config.filter).toContainEqual(['book', '==', 'GOVT']);
  });

  /**
   * AG reads a tree hierarchy off the DATA — there are no group columns to
   * read it from — so the parent rows have to carry the markers.
   */
  it('stamps __treeKey and __treeGroup onto parent rows', async () => {
    const { table } = makeTable(500);
    const views = createViewManager({ table, treeFields: TREE });

    const view = await views.getView({ startRow: 0, endRow: 3 });
    const columns = await view!.to_columns({ start_row: 0, end_row: 3 });
    expect(columns.__treeGroup).toEqual([true, true, true]);
    expect(columns.__treeKey).toEqual(['g1', 'g2', 'g3']);
    // And the level's own column still carries the key, as grouping does.
    expect(columns.sector).toEqual(['g1', 'g2', 'g3']);
  });

  it('leaves leaf rows unmarked, so isServerSideGroup answers false', async () => {
    const { table } = makeTable(500);
    const views = createViewManager({ table, treeFields: TREE });

    const view = await views.getView({
      startRow: 0,
      endRow: 3,
      groupKeys: ['Energy', 'GOVT'],
    });
    const columns = await view!.to_columns({ start_row: 0, end_row: 3 });
    expect(columns.__treeGroup).toBeUndefined();
    expect(columns.__treeKey).toBeUndefined();
    expect(columns.positionId).toEqual(['p0', 'p1', 'p2']);
  });

  /**
   * A column dragged into the group panel is an explicit user intent and wins
   * over the configured hierarchy, rather than silently merging with it.
   */
  it('lets an explicit rowGroupCols request win over the tree fields', async () => {
    const { table, views: built } = makeTable(500);
    const views = createViewManager({ table, treeFields: TREE });

    await views.getView({ startRow: 0, endRow: 100, rowGroupCols: [{ id: 'region' }] });
    expect(built.at(-1)!.config.group_by).toEqual(['region']);
  });

  it('does not mark rows when no tree fields are configured', async () => {
    const { table } = makeTable(500);
    const views = createViewManager({ table });

    const view = await views.getView({
      startRow: 0,
      endRow: 3,
      rowGroupCols: [{ id: 'sector' }],
    });
    const columns = await view!.to_columns({ start_row: 0, end_row: 3 });
    expect(columns.__treeGroup).toBeUndefined();
    expect(columns.sector).toEqual(['g1', 'g2', 'g3']);
  });
});
