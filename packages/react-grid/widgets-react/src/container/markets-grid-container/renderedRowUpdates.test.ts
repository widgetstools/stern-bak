import { describe, expect, it, vi } from 'vitest';
import type { GridApi, IRowNode } from 'ag-grid-community';
import { createRenderedRowUpdater, readKeyColumns, syncRowInPlace } from './renderedRowUpdates.js';

type Row = { id: string; px?: number; qty?: number; extra?: string };

interface StubOpts {
  nodes?: Row[];
  rendered?: string[];
  sort?: string[];
  filter?: string[];
  groups?: string[];
  values?: string[];
  quick?: string;
  pivot?: boolean;
  advanced?: unknown;
  external?: boolean;
  wait?: number;
}

function makeApi(o: StubOpts = {}) {
  const nodes = new Map<string, IRowNode<Row>>();
  for (const r of o.nodes ?? []) nodes.set(r.id, { id: r.id, data: r, group: false } as unknown as IRowNode<Row>);
  const refreshCells = vi.fn();
  const api = {
    getRowNode: (id: string) => nodes.get(id) ?? null,
    getRenderedNodes: () => (o.rendered ?? []).map((id) => nodes.get(id)).filter(Boolean),
    refreshCells,
    getGridOption: (k: string) => {
      if (k === 'asyncTransactionWaitMillis') return o.wait;
      if (k === 'quickFilterText') return o.quick;
      if (k === 'isExternalFilterPresent') return o.external ? () => true : undefined;
      return undefined;
    },
    isPivotMode: () => Boolean(o.pivot),
    getAdvancedFilterModel: () => o.advanced ?? null,
    getColumnState: () => (o.sort ?? []).map((colId) => ({ colId, sort: 'asc' })),
    getFilterModel: () => Object.fromEntries((o.filter ?? []).map((c) => [c, {}])),
    getRowGroupColumns: () => (o.groups ?? []).map((c) => ({ getColId: () => c })),
    getValueColumns: () => (o.values ?? []).map((c) => ({ getColId: () => c })),
    getCellValue: ({ rowNode, colKey }: { rowNode: IRowNode<Row>; colKey: string }) =>
      (rowNode.data as Record<string, unknown>)[colKey],
  } as unknown as GridApi<Row>;
  return { api, nodes, refreshCells };
}

function makeTimers() {
  const timers: Array<{ fn: () => void; ms: number }> = [];
  const clearTimer = vi.fn();
  const setTimer = (fn: () => void, ms: number) => { timers.push({ fn, ms }); return timers.length; };
  const runAll = () => { for (const t of timers.splice(0)) t.fn(); };
  return { timers, setTimer, clearTimer, runAll };
}

const ids = (rows: Row[]) => rows.map((r) => r.id);

describe('createRenderedRowUpdater', () => {
  it('refreshes rendered changed rows once per flush window, without force, and feeds the bus', () => {
    const r1 = { id: 'r1', px: 1 }; const r2 = { id: 'r2', px: 2 }; const r3 = { id: 'r3', px: 3 };
    const { api, nodes, refreshCells } = makeApi({ nodes: [r1, r2, r3], rendered: ['r1', 'r2'], wait: 125 });
    const t = makeTimers();
    const noteRowsChanged = vi.fn();
    const u = createRenderedRowUpdater<Row>({ getRowChangeFeed: () => ({ noteRowsChanged }), setTimer: t.setTimer, clearTimer: t.clearTimer });

    expect(u.apply(api, [r1, r2, r3], ids([r1, r2, r3]))).toEqual([]);
    expect(noteRowsChanged).toHaveBeenCalledWith([nodes.get('r1'), nodes.get('r2'), nodes.get('r3')]);
    expect(refreshCells).not.toHaveBeenCalled();
    expect(t.timers).toHaveLength(1);
    expect(t.timers[0].ms).toBe(125);

    u.apply(api, [r1], ['r1']); // same window: no second timer
    expect(t.timers).toHaveLength(1);

    t.runAll();
    expect(refreshCells).toHaveBeenCalledTimes(1);
    const params = refreshCells.mock.calls[0][0] as { rowNodes: IRowNode<Row>[]; force?: boolean };
    expect(params.rowNodes.map((n) => n.id)).toEqual(['r1', 'r2']);
    expect(params).not.toHaveProperty('force');
  });

  it('flushes on the next task when the grid has no wait window', () => {
    const r1 = { id: 'r1' };
    const { api } = makeApi({ nodes: [r1], rendered: ['r1'] });
    const t = makeTimers();
    createRenderedRowUpdater<Row>({ setTimer: t.setTimer }).apply(api, [r1], ['r1']);
    expect(t.timers[0].ms).toBe(0);
  });

  it('sends no row through a transaction when nothing is sorted, filtered or grouped', () => {
    const rows = [{ id: 'a', px: 1 }, { id: 'b', px: 2 }];
    const { api } = makeApi({ nodes: rows });
    expect(createRenderedRowUpdater<Row>({ setTimer: () => 1 }).apply(api, rows, ids(rows))).toEqual([]);
  });

  it('routes a row through a transaction when its sorted column changed, once on first touch', () => {
    const a = { id: 'a', px: 1, qty: 5 }; const b = { id: 'b', px: 2, qty: 6 };
    const { api } = makeApi({ nodes: [a, b], sort: ['px'] });
    const u = createRenderedRowUpdater<Row>({ setTimer: () => 1 });
    // first touch: no snapshot yet → transaction, snapshot taken
    expect(u.apply(api, [a, b], ['a', 'b'])).toEqual([a, b]);
    // non-key field changed → refresh path
    a.qty = 9;
    expect(u.apply(api, [a, b], ['a', 'b'])).toEqual([]);
    // sorted column changed → transaction for that row only
    a.px = 10;
    expect(u.apply(api, [a, b], ['a', 'b'])).toEqual([a]);
    expect(u.apply(api, [a], ['a'])).toEqual([]);
  });

  it('treats grouped value columns and filtered columns as keys', () => {
    const a = { id: 'a', px: 1, qty: 5 };
    const { api } = makeApi({ nodes: [a], groups: ['extra'], values: ['qty'], filter: ['px'] });
    const u = createRenderedRowUpdater<Row>({ setTimer: () => 1 });
    u.apply(api, [a], ['a']);
    a.qty = 6;
    expect(u.apply(api, [a], ['a'])).toEqual([a]);
    a.px = 2;
    expect(u.apply(api, [a], ['a'])).toEqual([a]);
    expect(u.apply(api, [a], ['a'])).toEqual([]);
  });

  it('every updated row is a transaction while a quick filter, pivot or external filter is active', () => {
    const a = { id: 'a', px: 1 };
    for (const o of [{ quick: 'x' }, { pivot: true }, { external: true }, { advanced: { filterType: 'join' } }]) {
      const { api } = makeApi({ nodes: [a], ...o });
      const u = createRenderedRowUpdater<Row>({ setTimer: () => 1 });
      expect(u.apply(api, [a], ['a'])).toEqual([a]);
      expect(u.apply(api, [a], ['a'])).toEqual([a]);
    }
  });

  it('syncs a full-row object onto the node data and keeps the node object', () => {
    const nodeRow: Row = { id: 'a', px: 1, extra: 'old' };
    const { api, nodes } = makeApi({ nodes: [nodeRow] });
    const delivered: Row = { id: 'a', px: 2 };
    createRenderedRowUpdater<Row>({ setTimer: () => 1 }).apply(api, [delivered], ['a']);
    expect(nodes.get('a')!.data).toBe(nodeRow);
    expect(nodeRow).toEqual({ id: 'a', px: 2 });
  });

  it('rows without a node still ride a transaction', () => {
    const { api } = makeApi({ nodes: [] });
    const ghost = { id: 'ghost' };
    expect(createRenderedRowUpdater<Row>({ setTimer: () => 1 }).apply(api, [ghost], ['ghost'])).toEqual([ghost]);
  });

  it('a key-set change resets the snapshot; clear drops pending work; dispose cancels the timer', () => {
    const a = { id: 'a', px: 1 };
    const sorted = makeApi({ nodes: [a], rendered: ['a'], sort: ['px'] });
    const t = makeTimers();
    const u = createRenderedRowUpdater<Row>({ setTimer: t.setTimer, clearTimer: t.clearTimer });
    expect(u.apply(sorted.api, [a], ['a'])).toEqual([a]);
    expect(u.apply(sorted.api, [a], ['a'])).toEqual([]);
    const resorted = makeApi({ nodes: [a], rendered: ['a'], sort: ['qty'] });
    expect(u.apply(resorted.api, [a], ['a'])).toEqual([a]); // new key set → first touch again

    const plain = makeApi({ nodes: [a], rendered: ['a'] });
    u.apply(plain.api, [a], ['a']);
    expect(t.timers).toHaveLength(1);
    u.clear();
    expect(t.clearTimer).toHaveBeenCalledTimes(1);
    t.runAll();
    expect(plain.refreshCells).not.toHaveBeenCalled();

    u.apply(plain.api, [a], ['a']);
    u.dispose();
    expect(t.clearTimer).toHaveBeenCalledTimes(2);
  });
});

describe('readKeyColumns', () => {
  it('unions sort, filter, group and (when grouped) value columns', () => {
    const { api } = makeApi({ sort: ['px', 'qty'], filter: ['qty'], groups: ['extra'], values: ['px'] });
    const k = readKeyColumns(api);
    expect(k.all).toBe(false);
    expect(k.cols).toEqual(['px', 'qty', 'extra']);
    expect(readKeyColumns(makeApi({ values: ['px'] }).api).cols).toEqual([]); // values only count when grouped
  });

  it('cannot attribute a quick filter to columns', () => {
    expect(readKeyColumns(makeApi({ quick: 'abc' }).api)).toEqual({ all: true, cols: [], signature: '*' });
  });
});

describe('syncRowInPlace', () => {
  it('assigns present fields and deletes absent ones', () => {
    const target: Record<string, unknown> = { a: 1, b: 2, c: 3 };
    syncRowInPlace(target, { a: 9, c: 3 });
    expect(target).toEqual({ a: 9, c: 3 });
  });
});
