/**
 * `updateThrottleMs` — coalesces the unsorted "patch in place" path's
 * `applyServerSideTransaction` calls into at most one per window, mirroring
 * AG Grid's own `asyncTransactionWaitMillis` (the CSRM knob behind MAX
 * UPDATES/SEC) for the server-side row model, which has no async/throttled
 * variant of `applyServerSideTransaction` to lean on directly.
 *
 * `0` (the default, and what every OTHER `bindSsrmTicks*.test.ts` file
 * exercises by omitting the option) must stay byte-identical to the
 * pre-throttle synchronous-per-tick behaviour — see the dedicated test below
 * pinning that explicitly, not just relying on the default.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RowChangeSink, RowNodeDelta } from '@wellsfargo-starui/core';
import { bindSsrmTicks } from './bindSsrmTicks.js';

interface TickPayload {
  event: { type: string; rows?: Array<Record<string, unknown>>; columns?: string[] };
  interestedKeys: string[];
}

function harness(opts: { grouping?: boolean } = {}) {
  const tickHandlers: Array<(t: TickPayload) => void> = [];
  const provider = {
    onSsrmTick: vi.fn((h: (t: TickPayload) => void) => {
      tickHandlers.push(h);
      return () => {
        const i = tickHandlers.indexOf(h);
        if (i >= 0) tickHandlers.splice(i, 1);
      };
    }),
    onStatus: vi.fn(() => () => undefined),
  } as never;

  const applyServerSideTransaction = vi.fn(
    (tx: { update?: Array<Record<string, unknown>> }) => ({
      status: 'Applied',
      update: (tx.update ?? []).map((row) => ({ id: String(row.id), data: row })),
    }),
  );
  const flashCells = vi.fn();
  const refreshServerSide = vi.fn();

  const api = {
    refreshServerSide,
    applyServerSideTransaction,
    flashCells,
    getRowNode: vi.fn(() => null),
    getDisplayedRowCount: vi.fn(() => 10),
    getFilterModel: vi.fn(() => ({})),
    getRowGroupColumns: vi.fn(() => (opts.grouping ? [{ getColId: () => 'region' }] : [])),
    getColumnState: vi.fn(() => []),
    getColumns: vi.fn(() => []),
    getColumnFilterHandler: vi.fn(() => null),
    getColumnFilterInstance: vi.fn(() => null),
    isDestroyed: () => false,
  } as never;

  const deltas: RowNodeDelta[] = [];
  const rows: RowChangeSink = {
    transactionApplied: (d) => { deltas.push(d); },
  };

  return {
    provider,
    api,
    rows,
    deltas,
    applyServerSideTransaction,
    flashCells,
    refreshServerSide,
    tick: (payload: TickPayload) => tickHandlers.forEach((h) => h(payload)),
  };
}

const rowsTick = (
  entries: Array<{ id: string; px: number }>,
  columns?: string[],
): TickPayload => ({
  event: { type: 'rows', rows: entries.map(({ id, px }) => ({ id, px })), columns },
  interestedKeys: entries.map((e) => e.id),
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('bindSsrmTicks — updateThrottleMs', () => {
  it('coalesces ticks inside the window into one transaction, latest value winning per row key', () => {
    const h = harness();
    bindSsrmTicks(h.provider, h.api, { keyColumn: 'id', flash: false, updateThrottleMs: 200 });

    h.tick(rowsTick([{ id: 'a', px: 1 }]));
    h.tick(rowsTick([{ id: 'a', px: 2 }, { id: 'b', px: 5 }]));
    expect(h.applyServerSideTransaction).not.toHaveBeenCalled();

    vi.advanceTimersByTime(200);

    expect(h.applyServerSideTransaction).toHaveBeenCalledTimes(1);
    const update = h.applyServerSideTransaction.mock.calls[0]![0].update as Array<{ id: string; px: number }>;
    expect(update).toHaveLength(2);
    expect(update.find((r) => r.id === 'a')?.px).toBe(2); // latest wins, not 1
  });

  it('updateThrottleMs: 0 flushes synchronously and unbatched — pins the backward-compat contract', () => {
    const h = harness();
    bindSsrmTicks(h.provider, h.api, { keyColumn: 'id', flash: false, updateThrottleMs: 0 });

    h.tick(rowsTick([{ id: 'a', px: 1 }]));
    h.tick(rowsTick([{ id: 'a', px: 2 }]));

    expect(h.applyServerSideTransaction).toHaveBeenCalledTimes(2);
  });

  it('reports one batched delta to the RowChangeSink per flush, not once per raw tick', () => {
    const h = harness();
    bindSsrmTicks(h.provider, h.api, {
      keyColumn: 'id', flash: false, rows: h.rows, updateThrottleMs: 200,
    });

    h.tick(rowsTick([{ id: 'a', px: 1 }]));
    h.tick(rowsTick([{ id: 'b', px: 1 }]));
    h.tick(rowsTick([{ id: 'c', px: 1 }]));
    expect(h.deltas).toHaveLength(0);

    vi.advanceTimersByTime(200);

    expect(h.deltas).toHaveLength(1);
    expect(h.deltas[0]!.update?.map((n) => n.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('escalates to a whole-row flash when any tick in the window carried no columns', () => {
    const h = harness();
    bindSsrmTicks(h.provider, h.api, { keyColumn: 'id', flash: true, updateThrottleMs: 200 });

    h.tick(rowsTick([{ id: 'a', px: 1 }], ['px']));
    h.tick(rowsTick([{ id: 'a', px: 2 }])); // no columns => whole-row flash

    vi.advanceTimersByTime(200);

    expect(h.flashCells).toHaveBeenCalledTimes(1);
    const call = h.flashCells.mock.calls[0]![0] as { columns?: string[] };
    expect(call.columns).toBeUndefined();
  });

  it("the grouping follow-up refresh doesn't arm until the batch itself flushes", () => {
    const h = harness({ grouping: true });
    bindSsrmTicks(h.provider, h.api, {
      keyColumn: 'id', flash: false, updateThrottleMs: 200, sortRefreshThrottleMs: 50,
    });

    h.tick(rowsTick([{ id: 'a', px: 1 }]));
    vi.advanceTimersByTime(50); // past sortThrottleMs, short of updateThrottleMs
    expect(h.refreshServerSide).not.toHaveBeenCalled();

    vi.advanceTimersByTime(150); // now past updateThrottleMs too
    vi.advanceTimersByTime(50); // let the grouping-triggered scheduleRefresh fire
    expect(h.refreshServerSide).toHaveBeenCalled();
  });

  it('drops a pending batch on unbind — no late apply after teardown', () => {
    const h = harness();
    const unbind = bindSsrmTicks(h.provider, h.api, {
      keyColumn: 'id', flash: false, updateThrottleMs: 200,
    });

    h.tick(rowsTick([{ id: 'a', px: 1 }]));
    unbind();
    vi.advanceTimersByTime(200);

    expect(h.applyServerSideTransaction).not.toHaveBeenCalled();
  });
});
