import { describe, expect, it } from 'vitest';
import { ExpressionEngine } from '../../../expression/index.js';
import type { GridApi } from 'ag-grid-community';
import {
  buildVirtualColDef,
  getAllRowsColumnCache,
  getAllRowsSnapshot,
  invalidateAllRowsCache,
} from './virtualColumn.js';
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

describe('getAllRowsSnapshot', () => {
  it('returns empty array when api is missing', () => {
    expect(getAllRowsSnapshot(null, cache)).toEqual([]);
  });

  it('walks forEachNode and caches rows', () => {
    const api = {
      forEachNode: (cb: (node: { data?: Record<string, unknown> }) => void) => {
        cb({ data: { price: 10 } });
        cb({ data: { price: 20 } });
        cb({ data: undefined });
      },
    } as unknown as GridApi;

    const rows = getAllRowsSnapshot(api, cache);
    expect(rows).toEqual([{ price: 10 }, { price: 20 }]);
    expect(getAllRowsSnapshot(api, cache)).toBe(rows);
  });

  it('swallows forEachNode errors and returns empty rows', () => {
    const api = {
      forEachNode: () => {
        throw new Error('grid gone');
      },
    } as unknown as GridApi;
    expect(getAllRowsSnapshot(api, cache)).toEqual([]);
  });
});

describe('invalidateAllRowsCache', () => {
  it('clears cached rows and column memo', () => {
    const api = {
      forEachNode: (cb: (node: { data?: Record<string, unknown> }) => void) => {
        cb({ data: { x: 1 } });
      },
    } as unknown as GridApi;
    getAllRowsSnapshot(api, cache);
    const colCache = getAllRowsColumnCache(api, cache);
    colCache?.set('x', [1]);
    invalidateAllRowsCache(api, cache);
    expect(getAllRowsSnapshot(api, cache)).toEqual([{ x: 1 }]);
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
});
