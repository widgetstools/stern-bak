/**
 * The server-side delta path: a tick that patches rows in place reports the
 * nodes it changed to `platform.rows`.
 *
 * WHY THIS EXISTS — `RowChangeBus` reads its deltas from
 * `asyncTransactionsFlushed`, which only `applyTransactionAsync` fires.
 * `applyServerSideTransaction` fires nothing of the kind, so before this the
 * server-side row model had NO delta source: every tick's `modelUpdated`
 * classified as a `full` structural change carrying three empty arrays.
 * Subscribers paid a whole-grid pass AND learned nothing about what moved —
 * timed activations `forEachNode`-scanned every row per tick, and the
 * filter-pill badges fell through to one worker RPC per pill per emit.
 *
 * The nodes were always right there: both transaction sites already captured
 * the result and fed `result.update` to `flashCells`. This binding hands the
 * same object to the platform.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RowChangeSink, RowNodeDelta } from '@wellsfargo-starui/core';
import { bindSsrmTicks } from './bindSsrmTicks.js';

interface TickPayload {
  event: {
    type: string;
    rows?: Array<Record<string, unknown>>;
    columns?: string[];
  };
  interestedKeys: string[];
}

function harness(opts: { sorted?: boolean; displayed?: number } = {}) {
  const tickHandlers: Array<(t: TickPayload) => void> = [];
  const provider = {
    onSsrmTick: vi.fn((h: (t: TickPayload) => void) => {
      tickHandlers.push(h);
      return () => {
        const i = tickHandlers.indexOf(h);
        if (i >= 0) tickHandlers.splice(i, 1);
      };
    }),
    onStatus: vi.fn(() => () => {}),
  } as never;

  /** AG-Grid returns the nodes the store actually touched. */
  const applyServerSideTransaction = vi.fn(
    (tx: { update?: Array<Record<string, unknown>> }) => ({
      status: 'Applied',
      update: (tx.update ?? []).map((row) => ({ id: String(row.id), data: row })),
    }),
  );

  const api = {
    refreshServerSide: vi.fn(),
    applyServerSideTransaction,
    flashCells: vi.fn(),
    getRowNode: vi.fn(),
    getDisplayedRowCount: () => opts.displayed ?? 10,
    getFilterModel: () => ({}),
    getRowGroupColumns: () => [],
    getColumnState: () => (opts.sorted ? [{ colId: 'px', sort: 'asc' }] : []),
    getColumns: () => [],
    isDestroyed: () => false,
  } as never;

  const deltas: RowNodeDelta[] = [];
  const rows: RowChangeSink = {
    transactionApplied: (d) => { deltas.push(d); },
  };

  const tick = (payload: TickPayload) => tickHandlers.forEach((h) => h(payload));
  return { provider, api, rows, deltas, tick, applyServerSideTransaction };
}

const rowsTick = (ids: string[], columns?: string[]): TickPayload => ({
  event: {
    type: 'rows',
    rows: ids.map((id) => ({ id, px: 1 })),
    columns,
  },
  interestedKeys: ids,
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('bindSsrmTicks — the row-change delta', () => {
  it('reports the patched nodes when the tick lands unsorted', () => {
    const { provider, api, rows, deltas, tick } = harness();
    bindSsrmTicks(provider, api, { flash: false, rows, keyColumn: 'id' });

    tick(rowsTick(['a', 'b']));

    expect(deltas).toHaveLength(1);
    expect(deltas[0].update?.map((n) => n.id)).toEqual(['a', 'b']);
  });

  it('reports them on the sorted path too, which patches before it reshuffles', () => {
    const { provider, api, rows, deltas, tick } = harness({ sorted: true });
    bindSsrmTicks(provider, api, { flash: false, rows, keyColumn: 'id' });

    tick(rowsTick(['a']));

    expect(deltas).toHaveLength(1);
    expect(deltas[0].update?.map((n) => n.id)).toEqual(['a']);
  });

  it('reports nothing on a tick that never applies a transaction', () => {
    // No interested keys and no view filter: the binding schedules a refresh
    // at most. A refetch replaces rows wholesale — no per-row delta describes
    // it, and claiming one would suppress the subscribers' structural pass.
    const { provider, api, rows, deltas, tick } = harness();
    bindSsrmTicks(provider, api, { flash: false, rows, keyColumn: 'id' });

    tick({ event: { type: 'rows', rows: [{ id: 'a' }] }, interestedKeys: [] });
    tick({ event: { type: 'snapshot' }, interestedKeys: [] });
    tick({ event: { type: 'aggregates' }, interestedKeys: ['a'] });

    expect(deltas).toHaveLength(0);
  });

  it('reports the delta before flashing, so a flash on a torn-down grid cannot eat it', () => {
    const { provider, api, rows, deltas, tick } = harness();
    (api as unknown as { flashCells: () => void }).flashCells = () => {
      throw new Error('grid destroyed mid-tick');
    };
    bindSsrmTicks(provider, api, { flash: true, rows, keyColumn: 'id' });

    expect(() => tick(rowsTick(['a'], ['px']))).not.toThrow();
    expect(deltas).toHaveLength(1);
  });

  it('still ticks with no sink — a caller driving a bare GridApi has no platform', () => {
    const { provider, api, applyServerSideTransaction, tick } = harness();
    bindSsrmTicks(provider, api, { flash: false, keyColumn: 'id' });

    expect(() => tick(rowsTick(['a']))).not.toThrow();
    expect(applyServerSideTransaction).toHaveBeenCalledTimes(1);
  });
});
