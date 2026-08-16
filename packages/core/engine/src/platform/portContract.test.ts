/**
 * ONE suite, BOTH adapters.
 *
 * This is the artefact that keeps `platform.data`'s two implementations
 * honest. The SSRM/CSRM audit found three hand-written "does this row match
 * this filter model" predicates that had silently diverged; the fix is not
 * more care, it is a suite that fails when the two answers stop matching.
 * Every case below runs twice, over the SAME dataset, and asserts the SAME
 * result — so a change to either adapter that shifts semantics has to shift
 * both, deliberately.
 *
 * Modelled on `host-data`'s `engineContract.test.ts`, which already proves
 * the one-suite-many-implementations shape works in this repo.
 *
 * WHAT IT DOES NOT PROVE — the fake worker source below answers from an
 * in-memory row list; it is not the real `SsrmServer` (core cannot import
 * `@wellsfargo-starui/data`, which depends on core). The worker's own
 * semantics are pinned by `engineContract.test.ts` and hardened in Phase 1.
 * What this suite pins is the CONTRACT: scope, result envelopes, `complete`,
 * `missing` / `rejected`, and the capability answers each adapter gives.
 *
 * The cases named `divergence:` are deliberate. They record where the two
 * sides genuinely differ today, with the phase that closes each — a
 * documented gap the suite will catch if it ever changes silently, rather
 * than an assertion quietly relaxed to make the run green. Phase 1 closed the
 * empty-fold one: its case is gone and the parity assertion sits with the
 * other `aggregate` cases below.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { GridApi } from 'ag-grid-community';
import { ApiHub } from './ApiHub';
import { CsrmDataAdapter } from './CsrmDataAdapter';
import { SsrmDataAdapter } from './SsrmDataAdapter';
import { doesRowMatchFilterModel } from '../filters/filterPredicate';
import type { DataQuery, DataRow, GridDataPort, RowPatch } from './types';

// ─── The dataset both adapters answer from ─────────────────────────────────

interface TestRow extends Record<string, unknown> {
  id: string;
  book: string;
  px: number;
  note: string | null;
  /** AG-Grid's own serialised date form, which `Date.parse` reads as LOCAL
   *  time — the clock both the row value and the day comparison use. */
  when: string | null;
}

const ROWS: TestRow[] = [
  { id: 'r0', book: 'A', px: 10, note: 'alpha', when: '2026-03-01 09:00:00' },
  { id: 'r1', book: 'B', px: 20, note: null, when: '2026-03-05 09:00:00' },
  { id: 'r2', book: 'A', px: 30, note: 'gamma', when: '2026-03-05 17:00:00' },
  { id: 'r3', book: 'C', px: 40, note: 'alpha', when: '2026-03-09 09:00:00' },
  { id: 'r4', book: 'B', px: 50, note: 'delta', when: null },
];

/** Rows AG-Grid reports as passing the applied filter, for `scope: 'filtered'`. */
const APPLIED_FILTER = { book: { filterType: 'text', type: 'equals', filter: 'A' } };

const cloneRows = (): TestRow[] => ROWS.map((r) => ({ ...r }));

// ─── Fake client-side grid ─────────────────────────────────────────────────

interface FakeNode {
  id: string;
  data: TestRow | undefined;
}

/**
 * The parts of GridApi the client-side adapter uses. `forEachNodeAfterFilter`
 * honours APPLIED_FILTER — that is AG-Grid's job in production, so the fake
 * takes it as given rather than re-deriving it.
 */
function makeFakeGrid(rows: TestRow[], opts: { stubIndices?: number[] } = {}) {
  const stubs = new Set(opts.stubIndices ?? []);
  const nodes: FakeNode[] = rows.map((data, i) => ({
    id: data.id,
    data: stubs.has(i) ? undefined : data,
  }));
  const transactions: Array<Record<string, unknown>[]> = [];
  let pendingFlush: (() => void) | null = null;

  const api = {
    forEachNode(fn: (node: FakeNode) => void) {
      for (const n of nodes) fn(n);
    },
    forEachNodeAfterFilter(fn: (node: FakeNode) => void) {
      for (const n of nodes) {
        if (n.data && doesRowMatchFilterModel(n.data, APPLIED_FILTER)) fn(n);
      }
    },
    getCellValue({ rowNode, colKey }: { rowNode: unknown; colKey: string }) {
      return (rowNode as FakeNode).data?.[colKey];
    },
    getRowNode(id: string) {
      return nodes.find((n) => n.id === id && n.data);
    },
    getDisplayedRowAtIndex(index: number) {
      return nodes[index];
    },
    getDisplayedRowCount: () => nodes.length,
    getFilterModel: () => APPLIED_FILTER,
    getGridOption: () => '',
    applyTransactionAsync(
      tx: { update: Record<string, unknown>[] },
      callback: () => void,
    ) {
      transactions.push(tx.update);
      // Deferred on purpose: the port's promise must settle on the FLUSH, not
      // on the call returning. A fake that invoked the callback synchronously
      // could not tell the two apart — which is the bug the port closes.
      pendingFlush = callback;
    },
    applyServerSideTransaction(tx: { update: Record<string, unknown>[] }) {
      transactions.push(tx.update);
      return { status: 'Applied' };
    },
  };

  return {
    api: api as unknown as GridApi,
    transactions,
    flush: () => {
      const cb = pendingFlush;
      pendingFlush = null;
      cb?.();
    },
  };
}

// ─── Fake worker source ────────────────────────────────────────────────────

/**
 * Answers the three RPCs the server-side adapter stands on, from the same
 * row list. Filter evaluation deliberately routes through the repo's own
 * `doesRowMatchFilterModel` — the point of this suite is the port contract,
 * not a second filter engine written to agree with the first by construction.
 */
function makeFakeSsrmSource(rows: TestRow[]) {
  const calls = { getRows: 0, getSetFilterValues: 0, getStatusBar: 0 };

  const select = (filterModel: Record<string, unknown> | null | undefined): TestRow[] =>
    filterModel && Object.keys(filterModel).length > 0
      ? rows.filter((r) => doesRowMatchFilterModel(r, filterModel))
      : [...rows];

  return {
    calls,
    source: {
      async getRows(req: {
        startRow?: number;
        endRow?: number;
        filterModel?: Record<string, unknown> | null;
      }) {
        calls.getRows += 1;
        const matched = select(req.filterModel);
        const start = req.startRow ?? 0;
        const end = req.endRow ?? matched.length;
        return {
          rowData: matched.slice(start, end).map((r) => ({ ...r })),
          rowCount: matched.length,
        };
      },
      async getSetFilterValues(req: {
        column: string;
        filterModel?: Record<string, unknown> | null;
      }) {
        calls.getSetFilterValues += 1;
        // The real RPC deletes the requested column's own entry from the
        // model — a set-filter panel shows its column's whole domain, not
        // the domain its own selection has already narrowed. Modelled here
        // because it is exactly what makes the RPC the wrong answer for a
        // "values among the displayed rows" question.
        const scoped = { ...(req.filterModel ?? {}) };
        delete scoped[req.column];
        const seen = new Set<string>();
        for (const row of select(scoped)) {
          const v = row[req.column];
          seen.add(v == null ? '' : String(v));
        }
        return [...seen].sort((a, b) => a.localeCompare(b));
      },
      async getStatusBar(req?: {
        filterModel?: Record<string, unknown> | null;
        valueCols?: Array<{ field: string; aggFunc?: string | null }>;
      }) {
        calls.getStatusBar += 1;
        const matched = select(req?.filterModel);
        const aggregations = (req?.valueCols ?? []).map((v) => {
          // The worker counts a number or a numeric string, and NOTHING else —
          // `Number(null)` being 0 is exactly the coercion its `toNum` avoids,
          // and copying it here would hide the empty-fold answer below.
          const nums = matched
            .map((r) => r[v.field])
            .filter(
              (raw): raw is number | string =>
                (typeof raw === 'number' && Number.isFinite(raw)) ||
                (typeof raw === 'string' && raw.trim() !== '' && !Number.isNaN(Number(raw))),
            )
            .map(Number);
          const fold = () => {
            switch (v.aggFunc) {
              case 'min': return nums.length ? Math.min(...nums) : null;
              case 'max': return nums.length ? Math.max(...nums) : null;
              case 'avg': return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
              case 'count': return matched.length;
              default: return nums.reduce((a, b) => a + b, 0);
            }
          };
          // `computeStatusBar` carries the fold's own `null` through — a
          // blank, not a zero. It used to finish with `Number(x ?? 0)`, which
          // is what made the two adapters disagree on an empty fold.
          return { field: v.field, value: fold() };
        });
        return { totalRows: rows.length, filteredRows: matched.length, aggregations };
      },
    },
  };
}

// ─── Harness ───────────────────────────────────────────────────────────────

interface Fixture {
  port: GridDataPort;
  rows: TestRow[];
  /** Rows the grid actually wrote, in transaction order. */
  transactions: Array<Record<string, unknown>[]>;
  /** Settle whatever `mutate` is waiting on. */
  settle: () => void;
}

type MakeFixture = (opts?: { stubIndices?: number[] }) => Fixture;

const makeCsrm: MakeFixture = (opts = {}) => {
  const rows = cloneRows();
  const grid = makeFakeGrid(rows, opts);
  const hub = new ApiHub();
  hub.attach(grid.api);
  return {
    port: new CsrmDataAdapter(hub),
    rows,
    transactions: grid.transactions,
    settle: grid.flush,
  };
};

const makeSsrm: MakeFixture = (opts = {}) => {
  const rows = cloneRows();
  const grid = makeFakeGrid(rows, opts);
  const hub = new ApiHub();
  hub.attach(grid.api);
  const { source } = makeFakeSsrmSource(rows);
  return {
    port: new SsrmDataAdapter(hub, { source, keyColumn: 'id' }),
    rows,
    transactions: grid.transactions,
    settle: () => {},
  };
};

const ADAPTERS: Array<[name: string, make: MakeFixture]> = [
  ['CsrmDataAdapter', makeCsrm],
  ['SsrmDataAdapter', makeSsrm],
];

/** Collect a scan into plain rows, so both adapters can be compared directly. */
async function scanRows(port: GridDataPort, query?: DataQuery) {
  const seen: DataRow[] = [];
  const result = await port.scan((row) => void seen.push(row), query);
  return { seen, result };
}

// ─── The contract ──────────────────────────────────────────────────────────

describe.each(ADAPTERS)('grid data port contract — %s', (_name, make) => {
  let fx: Fixture;
  beforeEach(() => {
    fx = make();
  });

  describe('scan', () => {
    it('visits every row in the dataset for the default scope', async () => {
      const { seen, result } = await scanRows(fx.port);
      expect(seen.map((r) => r.id)).toEqual(['r0', 'r1', 'r2', 'r3', 'r4']);
      expect(result).toEqual({ scanned: 5, stopped: false, complete: true });
    });

    it('visits only rows the grid has filtered to for scope "filtered"', async () => {
      const { seen, result } = await scanRows(fx.port, { scope: 'filtered' });
      expect(seen.map((r) => r.id)).toEqual(['r0', 'r2']);
      expect(result.complete).toBe(true);
    });

    it('ANDs an extra filter model onto the whole dataset', async () => {
      const { seen } = await scanRows(fx.port, {
        filterModel: { px: { filterType: 'number', type: 'greaterThan', filter: 25 } },
      });
      expect(seen.map((r) => r.id)).toEqual(['r2', 'r3', 'r4']);
    });

    it('ANDs an extra filter model onto the rows the grid has filtered to', async () => {
      // The client-side grid does this per row, so the server-side one must
      // too. `book` is not what the grid is filtering on, so the worker can
      // carry the whole model in one request.
      const { seen } = await scanRows(fx.port, {
        scope: 'filtered',
        filterModel: { px: { filterType: 'number', type: 'greaterThan', filter: 20 } },
      });
      expect(seen.map((r) => r.id)).toEqual(['r2']);
    });

    it('ANDs an extra filter model that names an ALREADY-FILTERED column', async () => {
      // The grid is filtering `book` to A; the caller additionally wants
      // A-or-B. Intersected that is still just A — which is what a
      // client-side grid gives, and what a merged filter model would NOT
      // (merging replaces the applied entry, yielding r1 and r4 as well).
      const { seen } = await scanRows(fx.port, {
        scope: 'filtered',
        filterModel: { book: { filterType: 'set', values: ['A', 'B'] } },
      });
      expect(seen.map((r) => r.id)).toEqual(['r0', 'r2']);
    });

    it('stops early on a false visitor, and reports the stop as a success', async () => {
      let visits = 0;
      const result = await fx.port.scan(() => {
        visits += 1;
        return visits < 2;
      });
      expect(visits).toBe(2);
      expect(result).toMatchObject({ scanned: 2, stopped: true, complete: true });
    });

    it('hands out rows whose data matches the dataset', async () => {
      const { seen } = await scanRows(fx.port);
      expect(seen[0].data).toMatchObject({ id: 'r0', book: 'A', px: 10 });
    });
  });

  describe('count', () => {
    it('counts the whole dataset by default', async () => {
      await expect(fx.port.count()).resolves.toEqual({ count: 5, complete: true });
    });

    it('counts what the grid has filtered to', async () => {
      await expect(fx.port.count({ scope: 'filtered' })).resolves.toEqual({
        count: 2,
        complete: true,
      });
    });

    it('counts a hypothetical filter model against the whole dataset', async () => {
      await expect(
        fx.port.count({ filterModel: { book: { filterType: 'set', values: ['B'] } } }),
      ).resolves.toEqual({ count: 2, complete: true });
    });

    it('counts a filter model ANDed onto an already-filtered column', async () => {
      await expect(
        fx.port.count({
          scope: 'filtered',
          filterModel: { book: { filterType: 'set', values: ['A', 'B'] } },
        }),
      ).resolves.toEqual({ count: 2, complete: true });
    });

    it('reports zero-and-complete for a filter nothing matches', async () => {
      await expect(
        fx.port.count({ filterModel: { book: { filterType: 'set', values: ['ZZ'] } } }),
      ).resolves.toEqual({ count: 0, complete: true });
    });
  });

  describe('aggregate', () => {
    it.each([
      ['sum', 150],
      ['min', 10],
      ['max', 50],
      ['avg', 30],
      ['count', 5],
    ] as const)('folds %s over the whole dataset', async (fn, expected) => {
      await expect(fx.port.aggregate('px', fn)).resolves.toEqual({
        value: expected,
        complete: true,
      });
    });

    it('folds over what the grid has filtered to', async () => {
      await expect(fx.port.aggregate('px', 'sum', { scope: 'filtered' })).resolves.toEqual({
        value: 40,
        complete: true,
      });
    });

    it('folds over a hypothetical filter model', async () => {
      await expect(
        fx.port.aggregate('px', 'sum', {
          filterModel: { book: { filterType: 'set', values: ['B'] } },
        }),
      ).resolves.toEqual({ value: 70, complete: true });
    });

    it('folds over a filter model ANDed onto an already-filtered column', async () => {
      await expect(
        fx.port.aggregate('px', 'sum', {
          scope: 'filtered',
          filterModel: { book: { filterType: 'set', values: ['A', 'B'] } },
        }),
      ).resolves.toEqual({ value: 40, complete: true });
    });

    it('reports an empty fold as blank, not as zero', async () => {
      // `note` holds no numeric value at all. A 0 here would read as a price
      // of zero; `null` reads as "nothing to fold". The server-side side of
      // this used to answer 0, because `computeStatusBar` finished with
      // `Number(value ?? 0)` and undid the worker's own deliberate null.
      await expect(fx.port.aggregate('note', 'min')).resolves.toEqual({
        value: null,
        complete: true,
      });
      await expect(fx.port.aggregate('note', 'avg')).resolves.toEqual({
        value: null,
        complete: true,
      });
    });

    it('still folds count and sum to real zeroes', async () => {
      await expect(fx.port.aggregate('note', 'count')).resolves.toEqual({
        value: 5,
        complete: true,
      });
      await expect(fx.port.aggregate('note', 'sum')).resolves.toEqual({
        value: 0,
        complete: true,
      });
    });
  });

  describe('distinct', () => {
    it('lists a text column’s domain over the whole dataset', async () => {
      const { values, complete } = await fx.port.distinct('book');
      expect([...values].sort()).toEqual(['A', 'B', 'C']);
      expect(complete).toBe(true);
    });

    it('lists the domain of what the grid has filtered to', async () => {
      const { values } = await fx.port.distinct('book', { query: { scope: 'filtered' } });
      expect([...values]).toEqual(['A']);
    });

    it('reports truncation rather than pretending the list is whole', async () => {
      const { values, complete } = await fx.port.distinct('book', { limit: 2 });
      expect(values).toHaveLength(2);
      expect(complete).toBe(false);
    });
  });

  describe('addressed reads', () => {
    it('resolves rows by id and names the ids it could not', async () => {
      const { rows, missing } = await fx.port.getRowsById(['r1', 'nope', 'r3']);
      expect(rows.map((r) => r.id)).toEqual(['r1', 'r3']);
      expect(missing).toEqual(['nope']);
    });

    it('resolves an inclusive displayed-index range', async () => {
      const { rows, missingIndices } = await fx.port.getRowsInRange(1, 3);
      expect(rows.map((r) => r.id)).toEqual(['r1', 'r2', 'r3']);
      expect(missingIndices).toEqual([]);
    });

    it('reports a loading stub as a missing index — never skips past it', async () => {
      const stubbed = make({ stubIndices: [2] });
      const { rows, missingIndices } = await stubbed.port.getRowsInRange(1, 3);
      expect(rows.map((r) => r.id)).toEqual(['r1', 'r3']);
      expect(missingIndices).toEqual([2]);
    });

    it('reports every index as missing past the end of the grid', async () => {
      const { rows, missingIndices } = await fx.port.getRowsInRange(90, 91);
      expect(rows).toEqual([]);
      expect(missingIndices).toEqual([90, 91]);
    });
  });

  describe('mutate', () => {
    it('confirms only after the grid has taken the write', async () => {
      const promise = fx.port.mutate([{ rowId: 'r1', fields: { px: 999 } }]);
      fx.settle();
      await expect(promise).resolves.toEqual({ applied: ['r1'], rejected: [], ok: true });
      expect(fx.transactions).toEqual([
        [{ id: 'r1', book: 'B', px: 999, note: null, when: '2026-03-05 09:00:00' }],
      ]);
    });

    it('merges patches for one row into a single full-row update', async () => {
      const promise = fx.port.mutate([
        { rowId: 'r1', fields: { px: 1 } },
        { rowId: 'r1', fields: { note: 'edited' } },
      ]);
      fx.settle();
      await promise;
      expect(fx.transactions).toHaveLength(1);
      expect(fx.transactions[0]).toEqual([
        { id: 'r1', book: 'B', px: 1, note: 'edited', when: '2026-03-05 09:00:00' },
      ]);
    });

    it('rejects a row it cannot address, with a reason, and applies the rest', async () => {
      const promise = fx.port.mutate([
        { rowId: 'r1', fields: { px: 1 } },
        { rowId: 'ghost', fields: { px: 2 } },
      ]);
      fx.settle();
      const result = await promise;
      expect(result.applied).toEqual(['r1']);
      expect(result.rejected).toHaveLength(1);
      expect(result.rejected[0].rowId).toBe('ghost');
      expect(result.rejected[0].reason).not.toBe('');
      expect(result.ok).toBe(false);
    });

    it('writes nothing and rejects everything when no row resolves', async () => {
      const result = await fx.port.mutate([{ rowId: 'ghost', fields: { px: 1 } }]);
      expect(result).toMatchObject({ applied: [], ok: false });
      expect(fx.transactions).toEqual([]);
    });

    it('treats an empty patch list as a trivially successful no-op', async () => {
      await expect(fx.port.mutate([])).resolves.toEqual({
        applied: [],
        rejected: [],
        ok: true,
      });
      expect(fx.transactions).toEqual([]);
    });
  });

  /**
   * The filter-model surface, at the PORT level: an operator a caller puts in
   * a `DataQuery` narrows both adapters the same way.
   *
   * The operator matrix itself — every AG Grid option, the Advanced Filter
   * tree, and the explicit refusals — is pinned where the predicate lives, in
   * `filters/filterPredicate.test.ts`. What this proves is narrower and still
   * worth having: a module that hands the port a filter model gets the same
   * answer whichever row model it is running on.
   *
   * Dates are here since Phase 2. They used to be absent because the client
   * predicate had no date arm and fell through to match-all, so both adapters
   * would have agreed on a wrong answer; there is one predicate now, and it
   * evaluates them.
   */
  describe('filter-model surface', () => {
    const countWith = (filterModel: Record<string, unknown>) =>
      fx.port.count({ filterModel });

    it.each([
      ['contains', 'lph', 2],
      ['notContains', 'lph', 3],
      ['equals', 'alpha', 2],
      ['notEqual', 'alpha', 3],
      ['startsWith', 'al', 2],
      ['endsWith', 'ta', 1],
    ] as const)('text %s narrows to %s rows', async (type, filter, expected) => {
      await expect(countWith({ note: { filterType: 'text', type, filter } })).resolves
        .toMatchObject({ count: expected });
    });

    it.each([
      ['equals', 30, undefined, 1],
      ['notEqual', 30, undefined, 4],
      ['lessThan', 30, undefined, 2],
      ['lessThanOrEqual', 30, undefined, 3],
      ['greaterThan', 30, undefined, 2],
      ['greaterThanOrEqual', 30, undefined, 3],
      ['inRange', 20, 40, 3],
    ] as const)('number %s narrows to %s rows', async (type, filter, filterTo, expected) => {
      await expect(
        countWith({ px: { filterType: 'number', type, filter, filterTo } }),
      ).resolves.toMatchObject({ count: expected });
    });

    it('joins a combined condition list with the operator it names', async () => {
      const conditions = [
        { filterType: 'number', type: 'lessThan', filter: 20 },
        { filterType: 'number', type: 'greaterThan', filter: 40 },
      ];
      await expect(
        countWith({ px: { filterType: 'number', operator: 'OR', conditions } }),
      ).resolves.toMatchObject({ count: 2 });
      await expect(
        countWith({ px: { filterType: 'number', operator: 'AND', conditions } }),
      ).resolves.toMatchObject({ count: 0 });
    });

    it.each([
      ['equals', '2026-03-05 00:00:00', undefined, 2],
      ['notEqual', '2026-03-05 00:00:00', undefined, 3],
      ['lessThan', '2026-03-05 00:00:00', undefined, 1],
      ['greaterThan', '2026-03-05 00:00:00', undefined, 3],
      ['greaterThanOrEqual', '2026-03-05 00:00:00', undefined, 3],
      ['inRange', '2026-03-05 00:00:00', '2026-03-09 00:00:00', 3],
      ['blank', undefined, undefined, 1],
      ['notBlank', undefined, undefined, 4],
    ] as const)('date %s narrows to %s rows', async (type, dateFrom, dateTo, expected) => {
      await expect(
        countWith({ when: { filterType: 'date', type, dateFrom, dateTo } }),
      ).resolves.toMatchObject({ count: expected });
    });

    it('ANDs the tabs of a multi filter', async () => {
      await expect(
        countWith({
          note: {
            filterType: 'multi',
            filterModels: [{ filterType: 'text', type: 'contains', filter: 'a' }, null],
          },
        }),
      ).resolves.toMatchObject({ count: 4 });
    });

    it('a set filter with nothing selected matches no rows, in both models', async () => {
      // The client predicate read `values: []` as "no restriction" and counted
      // the whole dataset. Empty-BUT-COMPLETE is the honest answer, and the
      // `complete` flag is what separates it from "could not look".
      await expect(countWith({ book: { filterType: 'set', values: [] } })).resolves.toEqual({
        count: 0,
        complete: true,
      });
    });

    it('refuses an operator neither side can evaluate, as complete: false', async () => {
      // The refusal must be a REFUSAL, not a count: a widened "everything" or a
      // narrowed "nothing" answers confidently and wrongly. `complete: false`
      // is the port's channel for "could not look", and both adapters raise it
      // for the same input — the client-side one because it evaluates the model
      // itself, the server-side one because it declines before the round trip.
      const refused = { note: { filterType: 'text', type: 'soundsLike', filter: 'a' } };
      await expect(fx.port.count({ filterModel: refused })).resolves.toEqual({
        count: 0,
        complete: false,
      });
      await expect(fx.port.aggregate('px', 'sum', { filterModel: refused })).resolves.toEqual({
        value: null,
        complete: false,
      });
      const { result } = await scanRows(fx.port, { filterModel: refused });
      expect(result).toEqual({ scanned: 0, stopped: false, complete: false });
    });

    it('refuses a relative-date preset rather than answering zero rows', async () => {
      await expect(
        fx.port.count({ filterModel: { when: { filterType: 'date', type: 'last7Days' } } }),
      ).resolves.toEqual({ count: 0, complete: false });
    });
  });

  describe('capabilities', () => {
    it('gives a reason for every capability it withholds', () => {
      for (const verdict of Object.values(fx.port.capabilities)) {
        if (verdict.supported) expect(verdict.reason).toBe('');
        // A `false` with no copy is the silent no-op this port exists to
        // remove — Phase 6 renders these strings verbatim.
        else expect(verdict.reason.length).toBeGreaterThan(20);
      }
    });
  });
});

// ─── Adapter-specific truths ───────────────────────────────────────────────

describe('capability answers differ, and that is the point', () => {
  it('the client-side adapter supports everything', () => {
    const caps = makeCsrm().port.capabilities;
    expect(Object.values(caps).every((c) => c.supported)).toBe(true);
  });

  it('the server-side adapter withholds exactly the five it cannot honour', () => {
    const caps = makeSsrm().port.capabilities;
    expect(Object.entries(caps).filter(([, c]) => !c.supported).map(([k]) => k)).toEqual([
      'canAddressUnloadedRows',
      'exportCoversFullDataset',
      'supportsCustomComparator',
      'supportsAdvancedFilter',
      'mutationsReachSource',
    ]);
  });
});

describe('unmounted grid', () => {
  it.each(['csrm', 'ssrm'] as const)(
    '%s reports incomplete rather than empty when there is no grid',
    async (kind) => {
      const hub = new ApiHub();
      const port: GridDataPort =
        kind === 'csrm'
          ? new CsrmDataAdapter(hub)
          : new SsrmDataAdapter(hub, { source: makeFakeSsrmSource([]).source });
      const { rows, missing } = await port.getRowsById(['r1']);
      expect(rows).toEqual([]);
      expect(missing).toEqual(['r1']);
      const mutation = await port.mutate([{ rowId: 'r1', fields: { px: 1 } }]);
      expect(mutation.ok).toBe(false);
      expect(mutation.rejected[0].reason).toBe('The grid is not ready yet.');
    },
  );

  it('the client-side adapter cannot read without a grid at all', async () => {
    const port = new CsrmDataAdapter(new ApiHub());
    await expect(port.count()).resolves.toEqual({ count: 0, complete: false });
    await expect(port.aggregate('px', 'sum')).resolves.toEqual({
      value: null,
      complete: false,
    });
  });

  it('the server-side adapter still reads: the worker holds the data, not the grid', async () => {
    const { source } = makeFakeSsrmSource(cloneRows());
    const port = new SsrmDataAdapter(new ApiHub(), { source, keyColumn: 'id' });
    await expect(port.count()).resolves.toEqual({ count: 5, complete: true });
  });
});

describe('a failing source is reported, never answered with a zero', () => {
  const broken = {
    getRows: () => Promise.reject(new Error('worker gone')),
    getSetFilterValues: () => Promise.reject(new Error('worker gone')),
    getStatusBar: () => Promise.reject(new Error('worker gone')),
  };

  it.each([
    ['count', (p: GridDataPort) => p.count()],
    ['aggregate', (p: GridDataPort) => p.aggregate('px', 'sum')],
    ['distinct', (p: GridDataPort) => p.distinct('book')],
    ['scan', (p: GridDataPort) => p.scan(() => {})],
  ] as const)('%s comes back incomplete', async (_name, call) => {
    const port = new SsrmDataAdapter(new ApiHub(), { source: broken });
    await expect(call(port)).resolves.toMatchObject({ complete: false });
  });
});

describe('server-side pagination', () => {
  it('pages a dataset larger than one round trip and visits every row once', async () => {
    const rows: TestRow[] = Array.from({ length: 5_000 }, (_, i) => ({
      id: `p${i}`,
      book: i % 2 ? 'A' : 'B',
      px: i,
      note: null,
    }));
    const { source, calls } = makeFakeSsrmSource(rows);
    const port = new SsrmDataAdapter(new ApiHub(), { source, keyColumn: 'id' });

    const seen = new Set<string>();
    const result = await port.scan((row) => void seen.add(row.id));

    expect(result).toEqual({ scanned: 5_000, stopped: false, complete: true });
    expect(seen.size).toBe(5_000);
    expect(calls.getRows).toBeGreaterThan(1);
  });

  it('stops paging the moment the visitor says stop', async () => {
    const rows: TestRow[] = Array.from({ length: 5_000 }, (_, i) => ({
      id: `p${i}`, book: 'A', px: i, note: null,
    }));
    const { source, calls } = makeFakeSsrmSource(rows);
    const port = new SsrmDataAdapter(new ApiHub(), { source, keyColumn: 'id' });
    await port.scan(() => false);
    expect(calls.getRows).toBe(1);
  });
});

// ─── Known divergences ─────────────────────────────────────────────────────

describe('divergence: distinct values are string-projected server-side (Phase 6)', () => {
  it('same domain, different value types — and the port says which', async () => {
    const csrm = await makeCsrm().port.distinct('px');
    const ssrm = await makeSsrm().port.distinct('px');

    expect(csrm.stringProjected).toBe(false);
    expect(ssrm.stringProjected).toBe(true);
    expect([...csrm.values].sort()).toEqual([10, 20, 30, 40, 50]);
    expect([...ssrm.values].sort()).toEqual(['10', '20', '30', '40', '50']);
    // Projected to the same domain: the sets agree, the types do not. A
    // consumer writing a chosen value back into a number field must coerce,
    // which is what `stringProjected` is for.
    const project = (v: unknown) => (v == null ? '' : String(v));
    expect([...ssrm.values].map(project).sort()).toEqual(
      [...csrm.values].map(project).sort(),
    );
  });

  it('null collapses to empty string server-side', async () => {
    const csrm = await makeCsrm().port.distinct('note');
    const ssrm = await makeSsrm().port.distinct('note');
    expect([...csrm.values].sort()).toEqual(['alpha', 'delta', 'gamma', null]);
    expect([...ssrm.values].sort()).toEqual(['', 'alpha', 'delta', 'gamma']);
  });
});

describe('an unloaded row is refused with the capability’s own copy', () => {
  it('a server-side edit to a row outside the block window names the limit', async () => {
    // A stub node is exactly what the block cache hands back for a row it
    // has not fetched. `collectBulkUpdateTargets` silently `continue`s past
    // one today, which is how a bulk update reports success over rows it
    // never touched (roadmap T2-1 / Phase 4).
    const fx = makeSsrm({ stubIndices: [2] });
    const patches: RowPatch[] = [
      { rowId: 'r1', fields: { px: 1 } },
      { rowId: 'r2', fields: { px: 2 } },
    ];
    const result = await fx.port.mutate(patches);

    expect(result.applied).toEqual(['r1']);
    expect(result.rejected).toEqual([
      { rowId: 'r2', reason: fx.port.capabilities.canAddressUnloadedRows.reason },
    ]);
    expect(result.ok).toBe(false);
    expect(fx.transactions).toEqual([
      [{ id: 'r1', book: 'B', px: 1, note: null, when: '2026-03-05 09:00:00' }],
    ]);
  });
});

describe('divergence: distinct over a column the user has filtered (Phase 6)', () => {
  it('the server-side adapter falls back to a scan rather than answer wrongly', async () => {
    // `getSetFilterValues` strips the requested column's own filter, so the
    // one-round-trip path would report the column's whole domain here. The
    // adapter detects the overlap and scans instead — both answers come from
    // RPCs that exist today.
    const { source, calls } = makeFakeSsrmSource(cloneRows());
    const grid = makeFakeGrid(cloneRows());
    const hub = new ApiHub();
    hub.attach(grid.api);
    const port = new SsrmDataAdapter(hub, { source, keyColumn: 'id' });

    const { values } = await port.distinct('book', { query: { scope: 'filtered' } });
    expect([...values]).toEqual(['A']);
    expect(calls.getSetFilterValues).toBe(0);
    expect(calls.getRows).toBeGreaterThan(0);
  });

  it('and takes the cheap RPC when the column is not itself filtered', async () => {
    const { source, calls } = makeFakeSsrmSource(cloneRows());
    const grid = makeFakeGrid(cloneRows());
    const hub = new ApiHub();
    hub.attach(grid.api);
    const port = new SsrmDataAdapter(hub, { source, keyColumn: 'id' });

    const { values } = await port.distinct('note', { query: { scope: 'filtered' } });
    expect([...values].sort()).toEqual(['alpha', 'gamma']);
    expect(calls.getSetFilterValues).toBe(1);
    expect(calls.getRows).toBe(0);

    // …and it is the same answer the client-side adapter gives.
    const csrm = await makeCsrm().port.distinct('note', { query: { scope: 'filtered' } });
    expect([...csrm.values].sort()).toEqual(['alpha', 'gamma']);
  });
});
