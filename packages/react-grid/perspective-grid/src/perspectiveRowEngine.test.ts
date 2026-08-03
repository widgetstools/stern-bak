import { describe, expect, it, vi } from 'vitest';
import type { PerspectiveViewConfig } from '@wellsfargo-starui/core';
import {
  createPerspectiveRowEngine,
  GRAND_TOTAL_FLAG,
  GRAND_TOTAL_ROW_ID,
  type GridApiLike,
  type GridNodeLike,
} from './perspectiveRowEngine.js';
import type { PerspectiveTableLike, UpdatableView } from './viewManager.js';

function makeTable(totalRows = 1000) {
  let fire: (() => void) | null = null;
  const table: PerspectiveTableLike = {
    view: vi.fn(async (config: PerspectiveViewConfig) => {
      const grouped = (config.group_by?.length ?? 0) > 0;
      const view: UpdatableView = {
        async to_columns(window) {
          const start = window?.start_row ?? 0;
          const n = Math.max(0, Math.min(window?.end_row ?? 0, totalRows) - start);
          const base: Record<string, unknown[]> = {
            pnl: Array.from({ length: n }, (_, i) => (start + i) * 10),
            positionId: Array.from({ length: n }, (_, i) => `p${start + i}`),
          };
          if (grouped) {
            base.__ROW_PATH__ = Array.from({ length: n }, (_, i) =>
              start + i === 0 ? [] : [`g${start + i}`],
            );
          }
          return base;
        },
        async num_rows() {
          return totalRows;
        },
        async delete() {},
        async on_update(cb: () => void) {
          fire = cb;
          return 1;
        },
      };
      return view;
    }),
  };
  return { table, tick: () => fire?.() };
}

function makeApi(nodes: GridNodeLike[] = [], hasTotalRow = true) {
  const refreshes: { route?: string[]; purge?: boolean }[] = [];
  const transactions: unknown[][] = [];
  const rowCounts: number[] = [];
  const api: GridApiLike = {
    refreshServerSide: (params) => refreshes.push(params),
    forEachNode: (cb) => nodes.forEach(cb),
    getRowNode: (id) => (hasTotalRow && id === GRAND_TOTAL_ROW_ID ? {} : undefined),
    applyServerSideTransaction: (tx) => transactions.push(tx.update ?? []),
    setRowCount: (rows) => rowCounts.push(rows),
  };
  return { api, refreshes, transactions, rowCounts };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe('createPerspectiveRowEngine — row count', () => {
  it('publishes the root row count once the grid is connected', async () => {
    const { table } = makeTable(20_000);
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });
    const grid = makeApi();

    await engine.datasource.getRows({
      request: { startRow: 0, endRow: 100 },
      success: () => {},
      fail: () => {},
    } as never);
    await settle();
    engine.setApi(grid.api);

    expect(grid.rowCounts).toContain(20_000);
  });

  it('does NOT publish a row count while grouping — AG error #28 is silent', async () => {
    const { table } = makeTable(20_000);
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });
    const grid = makeApi();
    engine.setApi(grid.api);

    engine.datasource.getRows({
      request: { startRow: 0, endRow: 100, rowGroupCols: [{ id: 'desk' }], groupKeys: [] },
      success: () => {},
      fail: () => {},
    } as never);
    await settle();

    expect(grid.rowCounts).toEqual([]);
  });
});

describe('createPerspectiveRowEngine — refreshing on a Table update', () => {
  it('refreshes the root and EVERY expanded level, not just the root', async () => {
    // MEASURED: `refreshServerSide` does not cascade into child stores, so a
    // root-only refresh leaves the rows under an expanded group frozen while
    // the totals above them tick.
    const parent: GridNodeLike = {
      group: true,
      expanded: true,
      level: 0,
      key: 'Rates',
      parent: null,
    };
    const child: GridNodeLike = { group: true, expanded: true, level: 1, key: 'EMEA', parent };
    const collapsed: GridNodeLike = {
      group: true,
      expanded: false,
      level: 0,
      key: 'Credit',
      parent: null,
    };

    const { table, tick } = makeTable();
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId', refreshMs: 1 });
    const grid = makeApi([parent, child, collapsed]);
    engine.setApi(grid.api);

    await engine.datasource.getRows({
      request: { startRow: 0, endRow: 100 },
      success: () => {},
      fail: () => {},
    } as never);
    await settle();

    tick();
    await new Promise((r) => setTimeout(r, 20));

    expect(grid.refreshes).toEqual([
      { purge: false },
      { route: ['Rates'], purge: false },
      { route: ['Rates', 'EMEA'], purge: false },
    ]);
  });

  it('coalesces a burst of updates into one refresh', async () => {
    const { table, tick } = makeTable();
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId', refreshMs: 20 });
    const grid = makeApi();
    engine.setApi(grid.api);
    await engine.datasource.getRows({
      request: { startRow: 0, endRow: 100 },
      success: () => {},
      fail: () => {},
    } as never);
    await settle();

    for (let i = 0; i < 10; i++) tick();
    await new Promise((r) => setTimeout(r, 40));

    expect(grid.refreshes.filter((r) => r.route === undefined)).toHaveLength(1);
  });

  it('does not re-read blocks that are still being read', async () => {
    // MEASURED on the 50k x 400 stress book: one 100-row block costs
    // 900-1,670 ms, because a read carries every column of the View. The
    // refresh invalidates every loaded block, so at the 250 ms throttle the
    // same ranges were re-requested five and six times over and the queue never
    // drained — a scroll then waited behind a second of work it did not ask for.
    let release: (() => void) | null = null;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const { table, tick } = makeTable();
    const view = table.view as unknown as ReturnType<typeof vi.fn>;
    const original = view.getMockImplementation()!;
    view.mockImplementation(async (config: PerspectiveViewConfig) => {
      const built = await original(config);
      const rows = built.to_columns.bind(built);
      built.to_columns = async (w: never) => {
        await gate;
        return rows(w);
      };
      return built;
    });

    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId', refreshMs: 1 });
    const grid = makeApi();
    engine.setApi(grid.api);
    const success = vi.fn();
    engine.datasource.getRows({
      request: { startRow: 0, endRow: 100 },
      success,
      fail: () => {},
    } as never);
    await settle();

    tick();
    await new Promise((r) => setTimeout(r, 40));
    expect(grid.refreshes).toHaveLength(0);

    release!();
    await vi.waitFor(() => expect(success).toHaveBeenCalled());
    await vi.waitFor(() => expect(grid.refreshes.length).toBeGreaterThan(0));
    await engine.close();
  });

  it('stops refreshing when live is off, and catches up when it returns', async () => {
    const { table, tick } = makeTable();
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId', refreshMs: 5 });
    const grid = makeApi();
    engine.setApi(grid.api);
    await engine.datasource.getRows({
      request: { startRow: 0, endRow: 100 },
      success: () => {},
      fail: () => {},
    } as never);
    await settle();

    engine.setLive(false);
    tick();
    await new Promise((r) => setTimeout(r, 20));
    expect(grid.refreshes).toHaveLength(0);

    engine.setLive(true);
    await new Promise((r) => setTimeout(r, 20));
    expect(grid.refreshes.length).toBeGreaterThan(0);
  });

  it('does not refresh before a grid is connected', async () => {
    const { table, tick } = makeTable();
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId', refreshMs: 1 });
    await engine.datasource.getRows({
      request: { startRow: 0, endRow: 100 },
      success: () => {},
      fail: () => {},
    } as never);
    await settle();

    tick();
    await new Promise((r) => setTimeout(r, 20));
    // Nothing to assert against but the absence of a crash: setApi was never
    // called, and a null api must not be dereferenced from the timer.
    expect(engine.rowsAtRoot).toBe(1000);
  });

  it('refreshNow ignores the throttle entirely', async () => {
    const { table } = makeTable();
    const engine = createPerspectiveRowEngine({
      table,
      keyColumn: 'positionId',
      refreshMs: 10_000,
    });
    const grid = makeApi();
    engine.setApi(grid.api);
    grid.refreshes.length = 0;

    engine.refreshNow();

    expect(grid.refreshes.length).toBeGreaterThan(0);
    await engine.close();
  });
});

describe('createPerspectiveRowEngine — grand total', () => {
  it('attaches the total to a root block, flagged and labelled', async () => {
    const { table } = makeTable();
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });
    const success = vi.fn();

    engine.datasource.getRows({
      request: { startRow: 0, endRow: 100 },
      success,
      fail: () => {},
    } as never);
    await vi.waitFor(() => expect(success).toHaveBeenCalled());

    const total = success.mock.calls[0][0].grandTotalData;
    expect(total[GRAND_TOTAL_FLAG]).toBe(true);
    expect(total.positionId).toBe('GRAND TOTAL');
  });

  it('updates the total by TRANSACTION, since grandTotalData does not update it', async () => {
    // MEASURED: five distinct fresh totals supplied over five non-purge
    // refreshes left the row showing the first one.
    const { table, tick } = makeTable();
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId', refreshMs: 1 });
    const grid = makeApi();
    engine.setApi(grid.api);
    await engine.datasource.getRows({
      request: { startRow: 0, endRow: 100 },
      success: () => {},
      fail: () => {},
    } as never);
    await settle();

    tick();
    await new Promise((r) => setTimeout(r, 30));

    expect(grid.transactions).toHaveLength(1);
    expect((grid.transactions[0][0] as Record<string, unknown>)[GRAND_TOTAL_FLAG]).toBe(true);
  });

  it('gives no total to a root block a newer one has superseded', async () => {
    // MEASURED on the 50k x 400 stress book: a filter-pill click left the
    // OUTGOING filter's block in flight, and its grand total built a whole
    // extra View (1,310 ms) for a row the grid was about to replace — in the
    // engine the block the user was waiting for had to queue behind.
    const { table } = makeTable();
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });
    const first = vi.fn();
    const second = vi.fn();

    engine.datasource.getRows({
      request: { startRow: 0, endRow: 100 },
      success: first,
      fail: () => {},
    } as never);
    // A newer ROOT request — a different filter — arrives before the first
    // block has settled.
    engine.datasource.getRows({
      request: {
        startRow: 0,
        endRow: 100,
        filterModel: { assetClass: { filterType: 'set', values: ['Rates'] } },
      },
      success: second,
      fail: () => {},
    } as never);

    await vi.waitFor(() => {
      expect(first).toHaveBeenCalled();
      expect(second).toHaveBeenCalled();
    });

    // Both blocks still settle exactly once (rule 1); only the current one
    // carries a total.
    expect(first.mock.calls[0][0].grandTotalData).toBeUndefined();
    expect(second.mock.calls[0][0].grandTotalData?.[GRAND_TOTAL_FLAG]).toBe(true);
  });

  it('skips the transaction when the grid has no total row', async () => {
    const { table, tick } = makeTable();
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId', refreshMs: 1 });
    const grid = makeApi([], false);
    engine.setApi(grid.api);
    await engine.datasource.getRows({
      request: { startRow: 0, endRow: 100 },
      success: () => {},
      fail: () => {},
    } as never);
    await settle();

    tick();
    await new Promise((r) => setTimeout(r, 30));

    expect(grid.transactions).toHaveLength(0);
  });
});

describe('createPerspectiveRowEngine — rows the status bar means', () => {
  it('takes the leaf count from the root level when the grid is flat', async () => {
    const { table } = makeTable(20_000);
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });
    await engine.datasource.getRows({
      request: { startRow: 0, endRow: 100 },
      success: () => {},
      fail: () => {},
    } as never);
    await settle();

    // No second View for a number already in hand: the root level IS the rows.
    expect(engine.status.leafRows).toBe(20_000);
    await engine.close();
  });

  it('reports NO leaf count while grouped, rather than the number of groups', async () => {
    // MEASURED on the stress tab: an unfiltered 50,000-row book grouped into
    // nine asset classes reported "Rows : 9 of 50,000", because `rowsAtRoot` is
    // what AG sizes its store from — the top-level groups. Recovering the real
    // figure costs a whole-book View, which is a question for the worker-side
    // query engine; until then the bar shows nothing rather than a wrong number.
    const { table } = makeTable(9);
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });
    await engine.datasource.getRows({
      request: { startRow: 0, endRow: 100, rowGroupCols: [{ id: 'desk' }], groupKeys: [] },
      success: () => {},
      fail: () => {},
    } as never);
    await settle();

    expect(engine.status.filteredRows).toBe(8);
    expect(engine.status.leafRows).toBeNull();
    await engine.close();
  });
});

describe('createPerspectiveRowEngine — lifecycle', () => {
  it('stops refreshing after close', async () => {
    const { table, tick } = makeTable();
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId', refreshMs: 1 });
    const grid = makeApi();
    engine.setApi(grid.api);
    await engine.datasource.getRows({
      request: { startRow: 0, endRow: 100 },
      success: () => {},
      fail: () => {},
    } as never);
    await settle();

    await engine.close();
    tick();
    await new Promise((r) => setTimeout(r, 20));

    expect(grid.refreshes).toHaveLength(0);
  });

  it('settles a block after close rather than leaking the request', async () => {
    // A leaked getRows deadlocks the WHOLE grid — AG only decrements its
    // bandwidth counter inside success/fail.
    const { table } = makeTable();
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });
    await engine.close();

    const success = vi.fn();
    const fail = vi.fn();
    engine.datasource.getRows({ request: { startRow: 0, endRow: 100 }, success, fail } as never);
    await vi.waitFor(() => expect(success.mock.calls.length + fail.mock.calls.length).toBe(1));
  });
});

describe('createPerspectiveRowEngine — status', () => {
  const tableWithSize = (bookRows: number, viewRows: number) => {
    const { table, tick } = makeTable(viewRows);
    return {
      table: { ...table, size: vi.fn(async () => bookRows) } as typeof table,
      tick,
    };
  };

  it('reports the book total from the TABLE, not from the rows this window holds', async () => {
    // A stock AG status panel counts loaded rows and would say "100".
    const { table } = tableWithSize(20_000, 20_000);
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });

    engine.subscribe(() => {});
    await settle();

    expect(engine.status.bookRows).toBe(20_000);
  });

  it('separates the filtered count from the book, and flags that a filter is on', async () => {
    const { table } = tableWithSize(20_000, 3_333);
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });
    engine.subscribe(() => {});

    await engine.datasource.getRows({
      request: {
        startRow: 0,
        endRow: 100,
        filterModel: { desk: { filterType: 'text', type: 'equals', filter: 'Rates' } },
      },
      success: () => {},
      fail: () => {},
    } as never);
    await settle();

    expect(engine.status).toMatchObject({
      bookRows: 20_000,
      filteredRows: 3_333,
      filtered: true,
    });
  });

  it('does not claim "filtered" before the book has been measured', async () => {
    // Rendering "0 of N" from an unmeasured book is worse than rendering
    // nothing — it reads as a real, alarming number.
    const { table } = makeTable(500); // no size()
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });
    engine.subscribe(() => {});
    await engine.datasource.getRows({
      request: { startRow: 0, endRow: 100 },
      success: () => {},
      fail: () => {},
    } as never);
    await settle();

    expect(engine.status.bookRows).toBeNull();
    expect(engine.status.filtered).toBe(false);
  });

  it('notifies subscribers when a new View changes the filtered count', async () => {
    const { table } = tableWithSize(20_000, 20_000);
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });
    const seen: number[] = [];
    engine.subscribe((s) => {
      if (typeof s.filteredRows === 'number') seen.push(s.filteredRows);
    });

    await engine.datasource.getRows({
      request: { startRow: 0, endRow: 100 },
      success: () => {},
      fail: () => {},
    } as never);
    await settle();

    expect(seen.length).toBeGreaterThan(0);
  });

  it('tracks live state and failed blocks', async () => {
    const { table } = tableWithSize(10, 10);
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });
    engine.subscribe(() => {});

    expect(engine.status.live).toBe(true);
    engine.setLive(false);
    expect(engine.status.live).toBe(false);
    expect(engine.status.failedBlocks).toBe(0);
  });

  it('counts a failed block and reports it through onError', async () => {
    const errors: unknown[] = [];
    const table: PerspectiveTableLike = {
      view: vi.fn(async () => ({
        async to_columns() {
          throw new Error('view deleted mid-read');
        },
        async num_rows() {
          return 0;
        },
        async delete() {},
      })),
    };
    const engine = createPerspectiveRowEngine({
      table,
      keyColumn: 'positionId',
      onError: (e) => errors.push(e),
    });
    engine.subscribe(() => {});

    const fail = vi.fn();
    engine.datasource.getRows({
      request: { startRow: 0, endRow: 100 },
      success: () => {},
      fail,
    } as never);
    await vi.waitFor(() => expect(fail).toHaveBeenCalled());

    expect(engine.status.failedBlocks).toBe(1);
    expect(errors.length).toBeGreaterThan(0);
    await engine.close();
  });

  it('unsubscribes cleanly and stops notifying after close', async () => {
    const { table } = tableWithSize(10, 10);
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });
    let calls = 0;
    const off = engine.subscribe(() => {
      calls += 1;
    });
    const afterSubscribe = calls;
    off();
    engine.setLive(false);
    expect(calls).toBe(afterSubscribe);

    await engine.close();
  });

  it('survives a Table whose size() rejects — a status figure must not break the grid', async () => {
    const { table } = makeTable(100);
    const failing = {
      ...table,
      size: vi.fn(async () => {
        throw new Error('worker busy');
      }),
    };
    const engine = createPerspectiveRowEngine({ table: failing as never, keyColumn: 'positionId' });
    engine.subscribe(() => {});
    await settle();

    expect(engine.status.bookRows).toBeNull();
  });
});

/**
 * A blotter attaches the moment its window opens — which, on a cold worker,
 * is before the snapshot has landed. Everything below is about surviving that
 * ordering: the Table starts empty, fills to 20,000 rows, and the grid has to
 * notice.
 */
describe('createPerspectiveRowEngine — a Table that fills after the grid attached', () => {
  function makeGrowingTable() {
    let total = 0;
    let fire: (() => void) | null = null;
    const table: PerspectiveTableLike = {
      size: async () => total,
      view: vi.fn(async () => ({
        async to_columns(window: { start_row?: number; end_row?: number } | undefined) {
          const start = window?.start_row ?? 0;
          const n = Math.max(0, Math.min(window?.end_row ?? 0, total) - start);
          return {
            positionId: Array.from({ length: n }, (_, i) => `p${start + i}`),
            pnl: Array.from({ length: n }, (_, i) => start + i),
          };
        },
        async num_rows() {
          return total;
        },
        async delete() {},
        async on_update(cb: () => void) {
          fire = cb;
          return 1;
        },
      })) as never,
    } as PerspectiveTableLike;
    return {
      table,
      fill: (rows: number) => {
        total = rows;
        fire?.();
      },
    };
  }

  // MEASURED on the live feed: a root store that settled at zero rows has no
  // blocks to invalidate, so `refreshServerSide({purge:false})` reloads
  // nothing. The grid sat empty over a full 20,000-row book, reporting
  // "0 of 20,000" with no error anywhere.
  it('purges the root store when it settled empty, so the first rows appear', async () => {
    const { table, fill } = makeGrowingTable();
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId', refreshMs: 1 });
    const grid = makeApi([], false);
    engine.setApi(grid.api);

    await engine.datasource.getRows({
      request: { startRow: 0, endRow: 100 },
      success: () => {},
      fail: () => {},
    } as never);
    await settle();
    expect(grid.refreshes).toEqual([]);

    fill(20_000);
    await new Promise((r) => setTimeout(r, 20));

    expect(grid.refreshes[0]).toEqual({ purge: true });
  });

  // The other half of the rule: a purge drops every loaded block, which throws
  // the user's scroll position away. On a populated store that would happen on
  // every tick.
  it('does not purge once the store holds rows', async () => {
    const { table, fill } = makeGrowingTable();
    fill(20_000);
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId', refreshMs: 1 });
    const grid = makeApi([], false);
    engine.setApi(grid.api);

    await engine.datasource.getRows({
      request: { startRow: 0, endRow: 100 },
      success: () => {},
      fail: () => {},
    } as never);
    await settle();

    fill(20_001);
    await new Promise((r) => setTimeout(r, 20));

    expect(grid.refreshes[0]).toEqual({ purge: false });
  });
});

/**
 * The status bar is the only place a user can see how much of the book the
 * grid is actually looking at, so a figure that stops moving is a bug the same
 * way a frozen row is.
 */
describe('createPerspectiveRowEngine — status publishing', () => {
  it('publishes the filtered count for a re-measured CACHED View', async () => {
    // MEASURED: the `view` event fires only when a View is BUILT, so once the
    // book settled the bar sat at "0 of 20,000" over a grid that had filled.
    let total = 0;
    const table: PerspectiveTableLike = {
      size: async () => total,
      view: vi.fn(async () => ({
        async to_columns() {
          return { positionId: [] };
        },
        async num_rows() {
          return total;
        },
        async delete() {},
        async on_update() {
          return 1;
        },
      })) as never,
    } as PerspectiveTableLike;

    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId', refreshMs: 1 });
    const seen: Array<number | null> = [];
    engine.subscribe((s) => seen.push(s.filteredRows));

    const ask = () =>
      engine.datasource.getRows({
        request: { startRow: 0, endRow: 100 },
        success: () => {},
        fail: () => {},
      } as never);

    await ask();
    await settle();
    total = 20_000;
    await ask();
    await settle();

    // Two Views for the life of this test — the root one and the grand total —
    // and neither is rebuilt for the second request. The count still moved.
    expect(table.view).toHaveBeenCalledTimes(2);
    expect(seen).toContain(20_000);
  });
});

describe('applyEdit', () => {
  /** A Table that records writes and reports a typed schema. */
  function makeWritableTable(schema: Record<string, string> | null = null) {
    const writes: Record<string, unknown>[][] = [];
    const table: PerspectiveTableLike = {
      view: vi.fn(async () => ({
        async to_columns() {
          return { positionId: [] };
        },
        async num_rows() {
          return 0;
        },
        async delete() {},
        async on_update() {
          return 1;
        },
      })),
      update: vi.fn(async (rows: Record<string, unknown>[]) => {
        writes.push(rows);
      }),
      ...(schema ? { schema: async () => schema } : {}),
    };
    return { table, writes };
  }

  it('stages an edit and writes it on flush', async () => {
    const { table, writes } = makeWritableTable();
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });

    engine.applyEdit({ key: 'p7', field: 'trader', value: 'AR' });
    await engine.flushEdits();

    expect(writes).toEqual([[{ positionId: 'p7', trader: 'AR' }]]);
    await engine.close();
  });

  it('coerces against the Table schema, which it fetches once', async () => {
    const { table, writes } = makeWritableTable({ positionId: 'string', quantity: 'float' });
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });

    engine.applyEdit({ key: 'p1', field: 'quantity', value: '1250.5' });
    await engine.flushEdits();

    expect(writes[0]).toEqual([{ positionId: 'p1', quantity: 1250.5 }]);
    await engine.close();
  });

  it('flushes a pending edit on close — a Table swap must not eat it', async () => {
    const { table, writes } = makeWritableTable();
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });

    engine.applyEdit({ key: 'p1', field: 'trader', value: 'AR' });
    await engine.close();

    expect(writes).toEqual([[{ positionId: 'p1', trader: 'AR' }]]);
  });

  it('drops an edit made after close rather than writing to a dead Table', async () => {
    const { table, writes } = makeWritableTable();
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });
    await engine.close();

    engine.applyEdit({ key: 'p1', field: 'trader', value: 'AR' });
    await engine.flushEdits();

    expect(writes).toHaveLength(0);
  });
});

describe('setQuickFilter', () => {
  /** Records the View configs built, and reports a mixed-type schema. */
  function makeSearchableTable() {
    const configs: PerspectiveViewConfig[] = [];
    const table: PerspectiveTableLike = {
      async size() {
        return 1000;
      },
      async schema() {
        return { positionId: 'string', desk: 'string', quantity: 'float', asOf: 'datetime' };
      },
      view: vi.fn(async (config: PerspectiveViewConfig) => {
        configs.push(config);
        const view: UpdatableView = {
          async to_columns() {
            return { positionId: [] };
          },
          async num_rows() {
            return 1000;
          },
          async delete() {},
          async on_update() {
            return 1;
          },
        };
        return view;
      }),
    };
    return { table, configs };
  }

  const block = (engine: { datasource: { getRows(p: unknown): unknown } }) =>
    engine.datasource.getRows({
      request: { startRow: 0, endRow: 100 },
      success: () => {},
      fail: () => {},
    } as never);

  it('compiles the text into an expression column and a clause', async () => {
    const { table, configs } = makeSearchableTable();
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });
    const grid = makeApi();
    engine.setApi(grid.api);

    await engine.setQuickFilter('mike');
    await block(engine);
    await settle();

    const withQuick = configs.find((c) => c.expressions?.__quick__);
    expect(withQuick).toBeDefined();
    expect(withQuick!.filter).toContainEqual(['__quick__', '==', true]);
    await engine.close();
  });

  it('searches TEXT columns only by default', async () => {
    // MEASURED: one match() per column per token, recharged on every Table
    // update while the View lives — 26 columns x 2 tokens was unusable.
    const { table, configs } = makeSearchableTable();
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });
    engine.setApi(makeApi().api);

    await engine.setQuickFilter('mike');
    await block(engine);
    await settle();

    const expr = configs.find((c) => c.expressions?.__quick__)!.expressions!.__quick__;
    expect(expr).toContain('"positionId"');
    expect(expr).toContain('"desk"');
    expect(expr).not.toContain('"quantity"');
    expect(expr).not.toContain('"asOf"');
    await engine.close();
  });

  it('includes every column when asked to', async () => {
    const { table, configs } = makeSearchableTable();
    const engine = createPerspectiveRowEngine({
      table,
      keyColumn: 'positionId',
      quickFilterAllColumns: true,
    });
    engine.setApi(makeApi().api);

    await engine.setQuickFilter('mike');
    await block(engine);
    await settle();

    const expr = configs.find((c) => c.expressions?.__quick__)!.expressions!.__quick__;
    expect(expr).toContain('"quantity"');
    expect(expr).toContain('"asOf"');
    await engine.close();
  });

  it('purges — AG does not know this filter exists, so it would not', async () => {
    const { table } = makeSearchableTable();
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });
    const grid = makeApi();
    engine.setApi(grid.api);
    grid.refreshes.length = 0;

    await engine.setQuickFilter('mike');

    expect(grid.refreshes).toContainEqual({ purge: true });
    await engine.close();
  });

  it('does nothing when the text has not actually changed', async () => {
    const { table } = makeSearchableTable();
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });
    const grid = makeApi();
    engine.setApi(grid.api);

    await engine.setQuickFilter('mike');
    grid.refreshes.length = 0;
    await engine.setQuickFilter('mike');
    await engine.setQuickFilter('  mike  ');

    // Load-bearing: the purge fires modelUpdated, which is what re-invokes the
    // bridge. Without this guard the pair would loop.
    expect(grid.refreshes).toHaveLength(0);
    await engine.close();
  });

  it('clearing the text removes the expression entirely', async () => {
    const { table, configs } = makeSearchableTable();
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });
    engine.setApi(makeApi().api);

    await engine.setQuickFilter('mike');
    await block(engine);
    await settle();
    configs.length = 0;
    await engine.setQuickFilter('');
    await block(engine);
    await settle();

    expect(configs.every((c) => c.expressions?.__quick__ === undefined)).toBe(true);
    await engine.close();
  });

  it('is a no-op once closed', async () => {
    const { table } = makeSearchableTable();
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });
    await engine.close();
    await expect(engine.setQuickFilter('mike')).resolves.toBeUndefined();
  });
});

describe('setCalcExpressions', () => {
  function makeExprTable(validator?: (e: Record<string, string>) => unknown) {
    const configs: PerspectiveViewConfig[] = [];
    const table: PerspectiveTableLike = {
      async size() {
        return 1000;
      },
      async schema() {
        return { positionId: 'string', price: 'float' };
      },
      ...(validator
        ? { validate_expressions: async (e: Record<string, string>) => validator(e) as never }
        : {}),
      view: vi.fn(async (config: PerspectiveViewConfig) => {
        configs.push(config);
        const view: UpdatableView = {
          async to_columns() {
            return { positionId: [] };
          },
          async num_rows() {
            return 1000;
          },
          async delete() {},
          async on_update() {
            return 1;
          },
        };
        return view;
      }),
    };
    return { table, configs };
  }

  const block = (engine: { datasource: { getRows(p: unknown): unknown } }) =>
    engine.datasource.getRows({
      request: { startRow: 0, endRow: 100 },
      success: () => {},
      fail: () => {},
    } as never);

  it('publishes calc columns into the View config', async () => {
    const { table, configs } = makeExprTable();
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });
    engine.setApi(makeApi().api);

    await engine.setCalcExpressions({ grossPnl: '"price" * "quantity"' });
    await block(engine);
    await settle();

    expect(configs.some((c) => c.expressions?.grossPnl === '"price" * "quantity"')).toBe(true);
    await engine.close();
  });

  it('drops an expression that does not compile, and reports it', async () => {
    // MEASURED: one bad expression makes table.view() throw and takes the WHOLE
    // View down, so a typo in one calculated column would blank the grid.
    const errors: unknown[] = [];
    const { table, configs } = makeExprTable(() => ({
      expression_schema: { good: 'float' },
      errors: { bad: { error_message: 'Input column "nope" does not exist.' } },
    }));
    const engine = createPerspectiveRowEngine({
      table,
      keyColumn: 'positionId',
      onError: (e) => errors.push(e),
    });
    engine.setApi(makeApi().api);

    await engine.setCalcExpressions({ good: '"price" * 2', bad: '"nope" * 2' });
    await block(engine);
    await settle();

    // Every View carries the good one and none carries the bad one. (Checked
    // per-key rather than by deep-equal: the grand-total View adds its own
    // `__all__` constant expression alongside these.)
    const withExprs = configs.filter((c) => c.expressions);
    expect(withExprs.length).toBeGreaterThan(0);
    expect(withExprs.every((c) => c.expressions!.good === '"price" * 2')).toBe(true);
    expect(withExprs.some((c) => 'bad' in c.expressions!)).toBe(false);
    expect(errors).toHaveLength(1);
    expect(String(errors[0])).toContain('bad');
    await engine.close();
  });

  it('keeps every expression when the validator itself fails', async () => {
    // A broken check must not cost the user all of their calculated columns.
    const errors: unknown[] = [];
    const { table, configs } = makeExprTable(() => {
      throw new Error('validator exploded');
    });
    const engine = createPerspectiveRowEngine({
      table,
      keyColumn: 'positionId',
      onError: (e) => errors.push(e),
    });
    engine.setApi(makeApi().api);

    await engine.setCalcExpressions({ a: '"price" * 2' });
    await block(engine);
    await settle();

    expect(configs.some((c) => c.expressions?.a)).toBe(true);
    expect(errors).toHaveLength(1);
    await engine.close();
  });

  it('works on a Table with no validator at all', async () => {
    const { table, configs } = makeExprTable();
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });
    engine.setApi(makeApi().api);

    await engine.setCalcExpressions({ a: '"price" * 2' });
    await block(engine);
    await settle();

    expect(configs.some((c) => c.expressions?.a)).toBe(true);
    await engine.close();
  });

  it('purges, since AG cannot know a calc column changed', async () => {
    const { table } = makeExprTable();
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });
    const grid = makeApi();
    engine.setApi(grid.api);
    grid.refreshes.length = 0;

    await engine.setCalcExpressions({ a: '"price" * 2' });

    expect(grid.refreshes).toContainEqual({ purge: true });
    await engine.close();
  });

  it('does nothing when the map has not changed', async () => {
    const { table } = makeExprTable();
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });
    const grid = makeApi();
    engine.setApi(grid.api);

    await engine.setCalcExpressions({ a: '"price" * 2' });
    grid.refreshes.length = 0;
    await engine.setCalcExpressions({ a: '"price" * 2' });

    expect(grid.refreshes).toHaveLength(0);
    await engine.close();
  });

  it('is a no-op once closed', async () => {
    const { table } = makeExprTable();
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });
    await engine.close();
    await expect(engine.setCalcExpressions({ a: '"price" * 2' })).resolves.toBeUndefined();
  });
});

describe('export and master/detail pulls', () => {
  function makeDetailTable(total = 3) {
    const built: PerspectiveViewConfig[] = [];
    const table: PerspectiveTableLike = {
      async size() {
        return 1000;
      },
      view: vi.fn(async (config: PerspectiveViewConfig) => {
        built.push(config);
        const view: UpdatableView = {
          async to_columns(window) {
            const start = window?.start_row ?? 0;
            const n = Math.max(0, Math.min(window?.end_row ?? 0, total) - start);
            return { leg: Array.from({ length: n }, (_, i) => `L${start + i}`) };
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
    return { table, built };
  }

  it("reads a master row's children from the book", async () => {
    const { table, built } = makeDetailTable();
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });

    const rows = await engine.readMatchingRows({ tradeId: 'T1' });
    expect(rows).toHaveLength(3);
    expect(built.at(-1)!.filter).toEqual([['tradeId', '==', 'T1']]);
    await engine.close();
  });

  it('applies the configured detail ceiling by default', async () => {
    const { table } = makeDetailTable(1000);
    const engine = createPerspectiveRowEngine({
      table,
      keyColumn: 'positionId',
      maxDetailRows: 7,
    });

    expect(await engine.readMatchingRows({ tradeId: 'T1' })).toHaveLength(7);
    // An explicit limit still wins.
    expect(await engine.readMatchingRows({ tradeId: 'T1' }, 2)).toHaveLength(2);
    await engine.close();
  });

  it('answers null once closed rather than throwing', async () => {
    const { table } = makeDetailTable();
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });
    await engine.close();
    expect(await engine.readMatchingRows({ tradeId: 'T1' })).toBeNull();
  });

  it('exports the whole book against the last ROOT request', async () => {
    const { table, built } = makeDetailTable(3);
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });

    await engine.datasource.getRows({
      request: { startRow: 0, endRow: 100, sortModel: [{ colId: 'pnl', sort: 'desc' }] },
      success: () => {},
      fail: () => {},
    } as never);
    await settle();

    const rows = await engine.readAllRows();
    expect(rows).toHaveLength(3);
    expect(built.at(-1)!.sort).toEqual([['pnl', 'desc']]);
    await engine.close();
  });

  it('answers null for an export past the ceiling, rather than a short file', async () => {
    const { table } = makeDetailTable(500);
    const engine = createPerspectiveRowEngine({
      table,
      keyColumn: 'positionId',
      maxExportRows: 10,
    });

    expect(await engine.readAllRows()).toBeNull();
    await engine.close();
  });

  it('answers null for an export once closed', async () => {
    const { table } = makeDetailTable();
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });
    await engine.close();
    expect(await engine.readAllRows()).toBeNull();
  });

  /**
   * `setRowCount` raises AG error #28 whenever a row-group column exists, and
   * the error is SILENT without ValidationModule. A tree level is a group
   * level by another name, so tree mode must count as grouped from the very
   * first block — including the one AG requests before `onGridReady`.
   */
  it('never publishes a row count in tree mode', async () => {
    const { table } = makeTable(20_000);
    const engine = createPerspectiveRowEngine({
      table,
      keyColumn: 'positionId',
      treeFields: ['sector', 'book'],
    });
    const grid = makeApi();
    engine.setApi(grid.api);

    await engine.datasource.getRows({
      request: { startRow: 0, endRow: 100 },
      success: () => {},
      fail: () => {},
    } as never);
    await settle();

    expect(grid.rowCounts).toEqual([]);
  });

  /** The flat control: without tree fields the same request DOES publish it,
   *  so the assertion above is about tree mode and not about the fixture. */
  it('still publishes a row count when flat', async () => {
    const { table } = makeTable(20_000);
    const engine = createPerspectiveRowEngine({ table, keyColumn: 'positionId' });
    const grid = makeApi();
    engine.setApi(grid.api);

    await engine.datasource.getRows({
      request: { startRow: 0, endRow: 100 },
      success: () => {},
      fail: () => {},
    } as never);
    await settle();

    expect(grid.rowCounts).toContain(20_000);
  });
});
