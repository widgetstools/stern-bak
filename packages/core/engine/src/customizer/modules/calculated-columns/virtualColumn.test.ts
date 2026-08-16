import { describe, expect, it } from 'vitest';
import { ExpressionEngine } from '../../../expression/index.js';
import type { GridApi } from 'ag-grid-community';
import {
  buildVirtualColDef,
  fillAllRowsSnapshot,
  getAllRowsColumnCache,
  getAllRowsSnapshot,
  invalidateAllRowsCache,
} from './virtualColumn.js';
import { COMPUTED_FIELDS_KEY } from '../../../platform/computedFields.js';
import type { VirtualColumnDef } from './state.js';

const engine = new ExpressionEngine();
const cache = new WeakMap<GridApi, import('./virtualColumn.js').AllRowsEntry>();

function virtual(overrides: Partial<VirtualColumnDef> = {}): VirtualColumnDef {
  return {
    colId: 'total',
    headerName: 'Total',
    expression: '[price] * [qty]',
    ...overrides,
  };
}

const apiStub = () => ({}) as unknown as GridApi;

describe('getAllRowsSnapshot', () => {
  it('returns empty array when api is missing', () => {
    expect(getAllRowsSnapshot(null, cache)).toEqual([]);
  });

  it('is a pure read — never walks the row model itself', () => {
    // The walk belongs to the module's activate(), which does it through
    // platform.data.scan. A snapshot nobody filled is empty, not a
    // forEachNode over whatever this row model happens to hold.
    const api = {
      forEachNode: () => {
        throw new Error('the row model must not be touched from here');
      },
    } as unknown as GridApi;
    expect(getAllRowsSnapshot(api, cache)).toEqual([]);
  });

  it('returns the filled rows, and the same array instance on re-read', () => {
    const api = apiStub();
    const rows = [{ price: 10 }, { price: 20 }];
    fillAllRowsSnapshot(api, cache, rows);
    expect(getAllRowsSnapshot(api, cache)).toBe(rows);
  });
});

describe('fillAllRowsSnapshot', () => {
  it('swaps the rows in and drops the column memo built from the old set', () => {
    const api = apiStub();
    fillAllRowsSnapshot(api, cache, [{ x: 1 }]);
    getAllRowsColumnCache(api, cache)?.set('x', [1]);
    fillAllRowsSnapshot(api, cache, [{ x: 2 }]);
    expect(getAllRowsSnapshot(api, cache)).toEqual([{ x: 2 }]);
    expect(getAllRowsColumnCache(api, cache)?.size).toBe(0);
  });

  it('is a no-op without an api', () => {
    expect(() => fillAllRowsSnapshot(null, cache, [{ x: 1 }])).not.toThrow();
  });
});

describe('invalidateAllRowsCache', () => {
  it('clears cached rows and column memo', () => {
    const api = apiStub();
    fillAllRowsSnapshot(api, cache, [{ x: 1 }]);
    getAllRowsColumnCache(api, cache)?.set('x', [1]);
    invalidateAllRowsCache(api, cache);
    expect(getAllRowsSnapshot(api, cache)).toEqual([]);
    expect(getAllRowsColumnCache(api, cache)?.size).toBe(0);
  });
});

describe('buildVirtualColDef', () => {
  it('evaluates expression per row and returns null on parse failure', () => {
    const good = buildVirtualColDef(virtual(), engine, cache);
    const bad = buildVirtualColDef(virtual({ expression: '((((' }), engine, cache);

    const getter = good.valueGetter as (p: { data: Record<string, unknown> }) => unknown;
    expect(getter({ data: { price: 2, qty: 3 } })).toBe(6);

    const badGetter = bad.valueGetter as (p: { data: Record<string, unknown> }) => unknown;
    expect(badGetter({ data: { price: 2, qty: 3 } })).toBeNull();
  });

  it('returns aggregate data on group rows without row data', () => {
    const col = buildVirtualColDef(virtual(), engine, cache);
    const getter = col.valueGetter as (p: {
      data?: Record<string, unknown>;
      node?: { group?: boolean; aggData?: Record<string, unknown> };
    }) => unknown;
    expect(
      getter({
        data: undefined,
        node: { group: true, aggData: { total: 999 } },
      }),
    ).toBe(999);
    expect(getter({ data: undefined, node: { group: true } })).toBeNull();
  });

  it('swallows runtime evaluation errors per row', () => {
    const col = buildVirtualColDef(
      virtual({ expression: 'NOPE([price])' }),
      engine,
      cache,
    );
    const getter = col.valueGetter as (p: { data: Record<string, unknown> }) => unknown;
    expect(getter({ data: { price: 1, qty: 1 } })).toBeNull();
  });

  it('installs excel color cellStyle when formatter carries color tags', () => {
    const col = buildVirtualColDef(
      virtual({
        valueFormatterTemplate: { kind: 'excelFormat', format: '[Red]0.00' },
      }),
      engine,
      cache,
    );
    expect(typeof col.cellStyle).toBe('function');
    const style = (col.cellStyle as (p: { value: number }) => Record<string, string>)({ value: 1 });
    expect(style.color).toBeTruthy();
  });

  it('uses aggregate allRows snapshot for column-wide expressions', () => {
    const col = buildVirtualColDef(virtual({ expression: 'SUM([price])' }), engine, cache);
    const api = apiStub();
    fillAllRowsSnapshot(api, cache, [{ price: 10 }, { price: 20 }]);
    const getter = col.valueGetter as (p: {
      data: Record<string, unknown>;
      api: GridApi;
    }) => unknown;
    expect(getter({ data: { price: 10 }, api })).toBe(30);
  });

  // ── The source-computed short circuit ───────────────────────────────
  //
  // This is the pair of assertions the aggregate defect lives or dies on:
  // a column-wide aggregate must read the same at any scroll position,
  // which it can only do if the answer comes from whoever holds the whole
  // dataset rather than from the rows this window happens to have.

  it('returns the value the source computed instead of re-evaluating', () => {
    const col = buildVirtualColDef(virtual({ expression: 'SUM([price])' }), engine, cache);
    const api = apiStub();
    // A window holding two rows — what a block cache looks like mid-scroll.
    fillAllRowsSnapshot(api, cache, [{ price: 10 }, { price: 20 }]);
    const getter = col.valueGetter as (p: {
      data: Record<string, unknown>;
      api: GridApi;
    }) => unknown;

    const scrolledToTop = {
      price: 10,
      total: 1_000_000,
      [COMPUTED_FIELDS_KEY]: ['total'],
    };
    const scrolledToBottom = {
      price: 99,
      total: 1_000_000,
      [COMPUTED_FIELDS_KEY]: ['total'],
    };
    expect(getter({ data: scrolledToTop, api })).toBe(1_000_000);
    expect(getter({ data: scrolledToBottom, api })).toBe(1_000_000);
  });

  it('honours a computed value of undefined — an answer, not an absence', () => {
    const col = buildVirtualColDef(virtual(), engine, cache);
    const getter = col.valueGetter as (p: { data: Record<string, unknown> }) => unknown;
    expect(
      getter({
        data: { price: 2, qty: 3, total: undefined, [COMPUTED_FIELDS_KEY]: ['total'] },
      }),
    ).toBeUndefined();
  });

  it('evaluates locally when the source stamped a different field', () => {
    const col = buildVirtualColDef(virtual(), engine, cache);
    const getter = col.valueGetter as (p: { data: Record<string, unknown> }) => unknown;
    // `total` is present but unstamped — a data field that happens to share
    // the column id must not be mistaken for a computed answer.
    expect(
      getter({
        data: { price: 2, qty: 3, total: 41, [COMPUTED_FIELDS_KEY]: ['other'] },
      }),
    ).toBe(6);
  });

  it('clears inline color when formatter has no color tag', () => {
    const col = buildVirtualColDef(
      virtual({ valueFormatterTemplate: { kind: 'preset', preset: 'number' } }),
      engine,
      cache,
    );
    expect(typeof col.cellStyle).toBe('function');
    const style = (col.cellStyle as () => Record<string, string>)();
    expect(style).toEqual({ color: '' });
  });

  it('formats values when a formatter template is configured', () => {
    const col = buildVirtualColDef(
      virtual({ valueFormatterTemplate: { kind: 'preset', preset: 'number' } }),
      engine,
      cache,
    );
    const fmt = col.valueFormatter as (p: { value: number }) => string;
    expect(fmt({ value: 1234 })).toContain('1,234');
  });
});
