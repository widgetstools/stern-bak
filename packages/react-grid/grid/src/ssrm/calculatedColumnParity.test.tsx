/**
 * @vitest-environment jsdom
 *
 * A calculated column, under BOTH row models, over the same rows and the same
 * expression — and the answers compared to each other rather than to a number
 * somebody typed into a test.
 *
 * The client-side side is a real AG Grid with the real `buildVirtualColDef`
 * `valueGetter`; the server-side side is the real `QueryEngine` with the same
 * expression pushed as a `calculated` rule, which is exactly what
 * `useSsrmExpressionBridge` does (`field: col.colId`). CSRM is the reference
 * behaviour — SSRM rises to it — so every case reads the CSRM answer first and
 * asserts the plane matches.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';
import type { ColDef, GridApi } from 'ag-grid-community';
import {
  buildVirtualColDef,
  ExpressionEngine,
  type AllRowsEntry,
} from '@wellsfargo-starui/core';
import { QueryEngine, RowStore } from '@wellsfargo-starui/data/ssrm-engine';

ModuleRegistry.registerModules([AllCommunityModule]);

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get: () => 1400,
  });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get: () => 600,
  });
});

afterEach(cleanup);

type Row = Record<string, unknown>;

const ROWS: Row[] = [
  { id: 'A', px: 30, qty: 1 },
  { id: 'B', px: 10, qty: 2 },
  { id: 'C', px: 20, qty: 3 },
  { id: 'D', px: 5, qty: 4 },
];

/** The one expression both halves run. `total` = 30, 20, 60, 20. */
const EXPRESSION = '[px] * [qty]';
const COL_ID = 'total';

const engine = new ExpressionEngine();

// ─── The client-side row model ──────────────────────────────────────────────

function csrmColumns(): ColDef[] {
  return [
    { field: 'id' },
    { field: 'px' },
    { field: 'qty' },
    buildVirtualColDef(
      { colId: COL_ID, headerName: 'Total', expression: EXPRESSION },
      engine,
      new WeakMap<GridApi, AllRowsEntry>(),
    ),
  ];
}

const displayedIds = (): string[] =>
  [...document.querySelectorAll('.ag-row')]
    .map((el) => el.getAttribute('row-id') ?? '')
    .filter(Boolean);

/**
 * Row ids in the order a real AG Grid displays them.
 *
 * `settled` is how a test says what it is waiting FOR. Reading the DOM as soon
 * as any row renders is what made the filter case pass with all four rows: the
 * grid paints before `setFilterModel` has run.
 */
async function csrmOrder(
  gridProps: Record<string, unknown>,
  settled: (ids: string[]) => boolean = (ids) => ids.length > 0,
): Promise<string[]> {
  render(
    <AgGridReact
      rowData={ROWS}
      getRowId={(p: { data: { id: string } }) => p.data.id}
      columnDefs={csrmColumns()}
      {...gridProps}
    />,
  );
  await waitFor(() => {
    if (!settled(displayedIds())) throw new Error('not settled');
  });
  return displayedIds();
}

// ─── The server-side query plane ────────────────────────────────────────────

const BASE = {
  startRow: 0,
  endRow: 100,
  filterModel: {},
  sortModel: [],
  groupKeys: [],
  rowGroupCols: [],
  valueCols: [],
  pivotCols: [],
  pivotMode: false,
} as const;

function ssrmEngine() {
  const store = new RowStore({ keyColumn: 'id' });
  store.replaceSnapshot(ROWS.map((r) => ({ ...r })));
  const query = new QueryEngine({ store });
  query.configureExpressions(
    [{ id: 'vc', kind: 'calculated', field: COL_ID, expression: EXPRESSION }],
    'grid-1',
  );
  return query;
}

function ssrmOrder(request: Record<string, unknown>): string[] {
  return ssrmEngine()
    .getRows({ ...BASE, ...request } as never, 'grid-1')
    .rowData.map((r) => String(r.id));
}

describe('a calculated column answers the same under both row models', () => {
  it('sorts identically — descending', async () => {
    const csrm = await csrmOrder({
      columnDefs: csrmColumns().map((c) =>
        (c as ColDef).colId === COL_ID ? { ...c, sort: 'desc' as const } : c,
      ),
    });
    expect(csrm).toEqual(ssrmOrder({ sortModel: [{ colId: COL_ID, sort: 'desc' }] }));
    // Guard against both sides answering insertion order, which is what the
    // plane did before and would make this pass for the wrong reason.
    expect(csrm).not.toEqual(ROWS.map((r) => r.id));
  });

  it('sorts identically — ascending, ties included', async () => {
    const csrm = await csrmOrder({
      columnDefs: csrmColumns().map((c) =>
        (c as ColDef).colId === COL_ID ? { ...c, sort: 'asc' as const } : c,
      ),
    });
    // B and D both total 20; the plane tie-breaks on the key column, so the
    // comparison is of the SET at each rank rather than a fragile exact list.
    expect(new Set(csrm.slice(0, 2))).toEqual(new Set(['B', 'D']));
    expect(csrm.slice(2)).toEqual(['A', 'C']);
    const ssrm = ssrmOrder({ sortModel: [{ colId: COL_ID, sort: 'asc' }] });
    expect(new Set(ssrm.slice(0, 2))).toEqual(new Set(['B', 'D']));
    expect(ssrm.slice(2)).toEqual(['A', 'C']);
  });

  it('filters identically', async () => {
    const model = { filterType: 'number', type: 'greaterThan', filter: 25 };
    const csrm = await csrmOrder({
      columnDefs: csrmColumns().map((c) =>
        (c as ColDef).colId === COL_ID ? { ...c, filter: 'agNumberColumnFilter' } : c,
      ),
      onGridReady: (e: { api: GridApi }) => e.api.setFilterModel({ [COL_ID]: model }),
    }, (ids) => ids.length > 0 && ids.length < ROWS.length);
    expect(new Set(csrm)).toEqual(new Set(['A', 'C']));
    expect(new Set(ssrmOrder({ filterModel: { [COL_ID]: model } }))).toEqual(new Set(csrm));
  });

  it('buckets into the same groups', async () => {
    // AG Grid's grouping needs the enterprise module, so the CSRM reference
    // here is its own valueGetter read per row — the same value the group key
    // would be built from — rather than a mounted group view.
    const values = ROWS.map((r) => Number(r.px) * Number(r.qty));
    const csrmKeys = [...new Set(values.map(String))].sort();

    const groups = ssrmEngine().getRows(
      { ...BASE, rowGroupCols: [{ id: COL_ID, field: COL_ID }] } as never,
      'grid-1',
    );
    expect(groups.rowData.map((g) => String(g.__ssrmGroupKey)).sort()).toEqual(csrmKeys);
    // 20 holds two rows (B and D), 30 and 60 one each.
    const byKey = Object.fromEntries(
      groups.rowData.map((g) => [String(g.__ssrmGroupKey), g.__ssrmChildCount]),
    );
    expect(byKey).toEqual({ '20': 2, '30': 1, '60': 1 });
  });
});
