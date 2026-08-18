/**
 * What a tick makes the grid DO. The three existing suites pin the delta, the
 * alert hits and the recovery purge; this one covers the decision in between —
 * given a tick, does the binding patch rows in place, schedule a refresh, or
 * do nothing at all, and how does it behave against a grid that is failing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bindSsrmTicks } from './bindSsrmTicks.js';

interface TickPayload {
  event: { type: string; rows?: Array<Record<string, unknown>>; columns?: string[] };
  interestedKeys: string[];
}

interface HarnessOpts {
  sorted?: boolean;
  grouping?: boolean;
  displayed?: number;
  filterModel?: Record<string, unknown> | null;
  destroyed?: boolean;
}

function harness(opts: HarnessOpts = {}) {
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

  const api = {
    refreshServerSide: vi.fn(),
    applyServerSideTransaction: vi.fn((tx: { update?: Array<Record<string, unknown>> }) => ({
      status: 'Applied',
      update: (tx.update ?? []).map((row) => ({ id: String(row.id), data: row })),
    })),
    flashCells: vi.fn(),
    getRowNode: vi.fn(() => null),
    getDisplayedRowCount: vi.fn(() => opts.displayed ?? 10),
    getFilterModel: vi.fn(() => opts.filterModel ?? {}),
    getRowGroupColumns: vi.fn(() => (opts.grouping ? [{ getColId: () => 'region' }] : [])),
    getColumnState: vi.fn(() => (opts.sorted ? [{ colId: 'px', sort: 'asc' }] : [])),
    getColumns: vi.fn(() => []),
    getColumnFilterHandler: vi.fn(() => null),
    getColumnFilterInstance: vi.fn(() => null),
    isDestroyed: () => opts.destroyed === true,
  } as never;

  return {
    provider,
    api,
    tick: (payload: TickPayload) => tickHandlers.forEach((h) => h(payload)),
    tickCount: () => tickHandlers.length,
  };
}

const rowsTick = (ids: string[], over: Partial<TickPayload> = {}): TickPayload => ({
  event: { type: 'rows', rows: ids.map((id) => ({ id, px: 1 })) },
  interestedKeys: ids,
  ...over,
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('unsorted, unfiltered', () => {
  it('patches the interested rows in place instead of re-querying', () => {
    const h = harness();
    bindSsrmTicks(h.provider, h.api, { keyColumn: 'id' });

    h.tick(rowsTick(['r1', 'r2']));

    expect(h.api.applyServerSideTransaction).toHaveBeenCalledWith({
      update: [{ id: 'r1', px: 1 }, { id: 'r2', px: 1 }],
    });
    vi.advanceTimersByTime(1000);
    expect(h.api.refreshServerSide).not.toHaveBeenCalled();
  });

  it('patches only the rows this session is looking at', () => {
    const h = harness();
    bindSsrmTicks(h.provider, h.api, { keyColumn: 'id' });

    h.tick({
      event: { type: 'rows', rows: [{ id: 'r1' }, { id: 'off-screen' }] },
      interestedKeys: ['r1'],
    });

    expect(h.api.applyServerSideTransaction).toHaveBeenCalledWith({ update: [{ id: 'r1' }] });
  });

  it('falls back to a refresh when the transaction throws', () => {
    const h = harness();
    (h.api.applyServerSideTransaction as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('store rejected it');
    });
    bindSsrmTicks(h.provider, h.api, { keyColumn: 'id' });

    h.tick(rowsTick(['r1']));
    vi.advanceTimersByTime(1000);
    expect(h.api.refreshServerSide).toHaveBeenCalledWith({ purge: false });
  });

  it('does nothing for a tick with no interested rows and no view filter', () => {
    const h = harness();
    bindSsrmTicks(h.provider, h.api, { keyColumn: 'id' });

    h.tick({ event: { type: 'rows', rows: [{ id: 'r1' }] }, interestedKeys: [] });
    vi.advanceTimersByTime(1000);

    expect(h.api.applyServerSideTransaction).not.toHaveBeenCalled();
    expect(h.api.refreshServerSide).not.toHaveBeenCalled();
  });

  it('ignores a tick type it does not handle', () => {
    const h = harness();
    bindSsrmTicks(h.provider, h.api, { keyColumn: 'id' });

    h.tick({ event: { type: 'something-else' }, interestedKeys: ['r1'] });
    vi.advanceTimersByTime(1000);
    expect(h.api.refreshServerSide).not.toHaveBeenCalled();
  });

  it('keys rows off the configured key column', () => {
    const h = harness();
    bindSsrmTicks(h.provider, h.api, { keyColumn: 'positionId' });

    h.tick({
      event: { type: 'rows', rows: [{ positionId: 'p1' }, { positionId: 'p2' }] },
      interestedKeys: ['p1'],
    });

    expect(h.api.applyServerSideTransaction).toHaveBeenCalledWith({
      update: [{ positionId: 'p1' }],
    });
  });
});

describe('grouping', () => {
  it('refreshes after patching, so group aggregates recompute', () => {
    const h = harness({ grouping: true });
    bindSsrmTicks(h.provider, h.api, { keyColumn: 'id' });

    h.tick(rowsTick(['r1']));
    expect(h.api.applyServerSideTransaction).toHaveBeenCalled();

    vi.advanceTimersByTime(1000);
    expect(h.api.refreshServerSide).toHaveBeenCalledWith({ purge: false });
  });

  it('refreshes on an off-screen change while grouped', () => {
    const h = harness({ grouping: true });
    bindSsrmTicks(h.provider, h.api, { keyColumn: 'id' });

    h.tick({ event: { type: 'rows', rows: [{ id: 'r1' }] }, interestedKeys: [] });
    vi.advanceTimersByTime(1000);
    expect(h.api.refreshServerSide).toHaveBeenCalledWith({ purge: false });
  });

  it('stays quiet on an off-screen change while grouped and showing nothing', () => {
    const h = harness({ grouping: true, displayed: 0 });
    bindSsrmTicks(h.provider, h.api, { keyColumn: 'id' });

    h.tick({ event: { type: 'rows', rows: [{ id: 'r1' }] }, interestedKeys: [] });
    vi.advanceTimersByTime(1000);
    expect(h.api.refreshServerSide).not.toHaveBeenCalled();
  });
});

describe('sorting', () => {
  it('patches then soft-refreshes so rows reshuffle into place', () => {
    const h = harness({ sorted: true });
    bindSsrmTicks(h.provider, h.api, { keyColumn: 'id' });

    h.tick(rowsTick(['r1']));
    expect(h.api.applyServerSideTransaction).toHaveBeenCalled();

    vi.advanceTimersByTime(1000);
    expect(h.api.refreshServerSide).toHaveBeenCalledWith({ purge: false });
  });

  it('refreshes even when the patch throws', () => {
    const h = harness({ sorted: true });
    (h.api.applyServerSideTransaction as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('mid-teardown');
    });
    bindSsrmTicks(h.provider, h.api, { keyColumn: 'id' });

    h.tick(rowsTick(['r1']));
    vi.advanceTimersByTime(1000);
    expect(h.api.refreshServerSide).toHaveBeenCalledWith({ purge: false });
  });

  it('refreshes when a sorted tick touches nothing on screen', () => {
    const h = harness({ sorted: true });
    bindSsrmTicks(h.provider, h.api, { keyColumn: 'id' });

    h.tick({ event: { type: 'rows', rows: [{ id: 'r1' }] }, interestedKeys: ['other'] });
    vi.advanceTimersByTime(1000);
    expect(h.api.refreshServerSide).toHaveBeenCalledWith({ purge: false });
  });
});

describe('filtered to nothing', () => {
  const FILTER = { region: { filterType: 'text', type: 'equals', filter: 'EMEA' } };

  it('refreshes when a row enters the filtered view', () => {
    const h = harness({ displayed: 0, filterModel: FILTER });
    bindSsrmTicks(h.provider, h.api, { keyColumn: 'id' });

    h.tick({
      event: { type: 'rows', rows: [{ id: 'r1', region: 'EMEA' }] },
      interestedKeys: [],
    });
    vi.advanceTimersByTime(1000);
    expect(h.api.refreshServerSide).toHaveBeenCalledWith({ purge: false });
  });

  it('never churns a refresh for a row that still does not match', () => {
    const h = harness({ displayed: 0, filterModel: FILTER });
    bindSsrmTicks(h.provider, h.api, { keyColumn: 'id' });

    h.tick({
      event: { type: 'rows', rows: [{ id: 'r1', region: 'APAC' }] },
      interestedKeys: [],
    });
    vi.advanceTimersByTime(1000);
    expect(h.api.refreshServerSide).not.toHaveBeenCalled();
  });

  it('stays quiet on an empty tick', () => {
    const h = harness({ displayed: 0, filterModel: FILTER });
    bindSsrmTicks(h.provider, h.api, { keyColumn: 'id' });

    h.tick({ event: { type: 'rows', rows: [] }, interestedKeys: [] });
    vi.advanceTimersByTime(1000);
    expect(h.api.refreshServerSide).not.toHaveBeenCalled();
  });

  it('honours a quick filter as a view filter of its own', () => {
    const h = harness({ displayed: 0 });
    bindSsrmTicks(h.provider, h.api, { keyColumn: 'id', getQuickFilterText: () => 'zzz' });

    h.tick({ event: { type: 'rows', rows: [{ id: 'r1', region: 'EMEA' }] }, interestedKeys: [] });
    vi.advanceTimersByTime(1000);
    expect(h.api.refreshServerSide).not.toHaveBeenCalled();
  });

  it('refreshes when a row matches the quick filter', () => {
    const h = harness({ displayed: 0 });
    bindSsrmTicks(h.provider, h.api, { keyColumn: 'id', getQuickFilterText: () => 'emea' });

    h.tick({ event: { type: 'rows', rows: [{ id: 'r1', region: 'EMEA' }] }, interestedKeys: [] });
    vi.advanceTimersByTime(1000);
    expect(h.api.refreshServerSide).toHaveBeenCalledWith({ purge: false });
  });
});

describe('an unevaluatable filter', () => {
  it('over-includes rather than freezing a live row, and warns once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // A filter model the shared predicate cannot evaluate. Under-including
    // would silently freeze the row; over-including is corrected by the next
    // block load, where the refusal reaches the user for real.
    const h = harness({ displayed: 0, filterModel: { region: { filterType: 'nonsense' } } });
    bindSsrmTicks(h.provider, h.api, { keyColumn: 'id' });

    h.tick({ event: { type: 'rows', rows: [{ id: 'r1' }] }, interestedKeys: [] });
    h.tick({ event: { type: 'rows', rows: [{ id: 'r2' }] }, interestedKeys: [] });
    vi.advanceTimersByTime(1000);

    expect(h.api.refreshServerSide).toHaveBeenCalled();
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('cannot evaluate')).length)
      .toBeLessThanOrEqual(1);
  });
});

describe('aggregate ticks', () => {
  it('refreshes so the totals recompute', () => {
    const h = harness();
    bindSsrmTicks(h.provider, h.api, { keyColumn: 'id' });

    h.tick({ event: { type: 'aggregates' }, interestedKeys: ['r1'] });
    vi.advanceTimersByTime(1000);
    expect(h.api.refreshServerSide).toHaveBeenCalledWith({ purge: false });
  });
});

describe('snapshot ticks', () => {
  it('purges by default', () => {
    const h = harness();
    bindSsrmTicks(h.provider, h.api, { keyColumn: 'id' });

    h.tick({ event: { type: 'snapshot' }, interestedKeys: [] });
    vi.advanceTimersByTime(1000);
    expect(h.api.refreshServerSide).toHaveBeenCalledWith({ purge: true });
  });

  it('respects a caller that asks not to purge', () => {
    const h = harness();
    bindSsrmTicks(h.provider, h.api, { keyColumn: 'id', purgeOnSnapshot: false });

    h.tick({ event: { type: 'snapshot' }, interestedKeys: [] });
    vi.advanceTimersByTime(1000);
    expect(h.api.refreshServerSide).toHaveBeenCalledWith({ purge: false });
  });

  it('refreshes each set filter through its handler', () => {
    const refreshFilterValues = vi.fn();
    const h = harness();
    (h.api.getColumns as ReturnType<typeof vi.fn>).mockReturnValue([{ getColId: () => 'region' }]);
    (h.api.getColumnFilterHandler as ReturnType<typeof vi.fn>).mockReturnValue({
      refreshFilterValues,
    });
    bindSsrmTicks(h.provider, h.api, { keyColumn: 'id' });

    h.tick({ event: { type: 'snapshot' }, interestedKeys: [] });
    expect(refreshFilterValues).toHaveBeenCalled();
  });

  it('falls back to the async filter instance when there is no handler', async () => {
    const refreshFilterValues = vi.fn();
    const handlerRefresh = vi.fn();
    const h = harness();
    (h.api.getColumns as ReturnType<typeof vi.fn>).mockReturnValue([{ getColId: () => 'region' }]);
    (h.api.getColumnFilterHandler as ReturnType<typeof vi.fn>).mockReturnValue(null);
    (h.api.getColumnFilterInstance as ReturnType<typeof vi.fn>).mockReturnValue(
      Promise.resolve({ refreshFilterValues, getHandler: () => ({ refreshFilterValues: handlerRefresh }) }),
    );
    bindSsrmTicks(h.provider, h.api, { keyColumn: 'id' });

    h.tick({ event: { type: 'snapshot' }, interestedKeys: [] });
    await vi.waitFor(() => expect(refreshFilterValues).toHaveBeenCalled());
    expect(handlerRefresh).toHaveBeenCalled();
  });

  it('falls through to the async path when the handler lookup throws', async () => {
    const refreshFilterValues = vi.fn();
    const h = harness();
    (h.api.getColumns as ReturnType<typeof vi.fn>).mockReturnValue([{ getColId: () => 'region' }]);
    (h.api.getColumnFilterHandler as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('no such column');
    });
    (h.api.getColumnFilterInstance as ReturnType<typeof vi.fn>).mockReturnValue(
      Promise.resolve({ refreshFilterValues }),
    );
    bindSsrmTicks(h.provider, h.api, { keyColumn: 'id' });

    h.tick({ event: { type: 'snapshot' }, interestedKeys: [] });
    await vi.waitFor(() => expect(refreshFilterValues).toHaveBeenCalled());
  });

  it('survives a grid with no filter API at all', () => {
    const h = harness();
    (h.api as Record<string, unknown>).getColumns = undefined;
    bindSsrmTicks(h.provider, h.api, { keyColumn: 'id' });

    expect(() => h.tick({ event: { type: 'snapshot' }, interestedKeys: [] })).not.toThrow();
  });
});

describe('a grid that is going away', () => {
  it('ignores ticks once it has been unbound', () => {
    const h = harness();
    const unbind = bindSsrmTicks(h.provider, h.api, { keyColumn: 'id' });
    unbind();

    h.tick(rowsTick(['r1']));
    vi.advanceTimersByTime(1000);
    expect(h.api.applyServerSideTransaction).not.toHaveBeenCalled();
  });

  it('drops a refresh that was already scheduled', () => {
    const h = harness({ sorted: true });
    const unbind = bindSsrmTicks(h.provider, h.api, { keyColumn: 'id' });
    h.tick(rowsTick(['r1']));

    unbind();
    vi.advanceTimersByTime(1000);
    expect(h.api.refreshServerSide).not.toHaveBeenCalled();
  });

  it('ignores ticks on a destroyed grid', () => {
    const h = harness({ destroyed: true });
    bindSsrmTicks(h.provider, h.api, { keyColumn: 'id' });

    h.tick(rowsTick(['r1']));
    vi.advanceTimersByTime(1000);
    expect(h.api.applyServerSideTransaction).not.toHaveBeenCalled();
  });

  it('gives up on a tick whose grid state reads throw', () => {
    const h = harness();
    (h.api.getDisplayedRowCount as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('destroyed');
    });
    bindSsrmTicks(h.provider, h.api, { keyColumn: 'id' });

    h.tick(rowsTick(['r1']));
    vi.advanceTimersByTime(1000);
    expect(h.api.applyServerSideTransaction).not.toHaveBeenCalled();
  });

  it('swallows a refresh that throws on a grid destroyed mid-timer', () => {
    const h = harness({ sorted: true });
    (h.api.refreshServerSide as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('destroyed between the check and the call');
    });
    bindSsrmTicks(h.provider, h.api, { keyColumn: 'id' });

    h.tick(rowsTick(['r1']));
    expect(() => vi.advanceTimersByTime(1000)).not.toThrow();
  });

  it('reads no filter model from a grid that refuses', () => {
    const h = harness({ displayed: 0 });
    (h.api.getFilterModel as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('destroyed');
    });
    bindSsrmTicks(h.provider, h.api, { keyColumn: 'id' });

    // No filter model and nothing displayed → the unfiltered path, which is
    // silent for an off-screen change.
    h.tick({ event: { type: 'rows', rows: [{ id: 'r1' }] }, interestedKeys: [] });
    vi.advanceTimersByTime(1000);
    expect(h.api.refreshServerSide).not.toHaveBeenCalled();
  });
});

describe('flashing', () => {
  it('flashes only the real columns a tick named', () => {
    const h = harness();
    bindSsrmTicks(h.provider, h.api, { keyColumn: 'id' });

    h.tick({
      event: { type: 'rows', rows: [{ id: 'r1' }], columns: ['px', '__ssrmRowId'] },
      interestedKeys: ['r1'],
    });

    expect(h.api.flashCells).toHaveBeenCalledWith({
      rowNodes: [expect.anything()],
      columns: ['px'],
    });
  });

  it('flashes whole rows when the tick named no columns', () => {
    const h = harness();
    bindSsrmTicks(h.provider, h.api, { keyColumn: 'id' });

    h.tick(rowsTick(['r1']));
    expect(h.api.flashCells).toHaveBeenCalledWith({ rowNodes: [expect.anything()] });
  });

  it('flashes whole rows when every named column is internal', () => {
    const h = harness();
    bindSsrmTicks(h.provider, h.api, { keyColumn: 'id' });

    h.tick({
      event: { type: 'rows', rows: [{ id: 'r1' }], columns: ['__ssrmRowId'] },
      interestedKeys: ['r1'],
    });
    expect(h.api.flashCells).toHaveBeenCalledWith({ rowNodes: [expect.anything()] });
  });

  it('does not flash when the caller turned it off', () => {
    const h = harness();
    bindSsrmTicks(h.provider, h.api, { keyColumn: 'id', flash: false });

    h.tick(rowsTick(['r1']));
    expect(h.api.flashCells).not.toHaveBeenCalled();
  });

  it('survives a flash on a grid mid-teardown', () => {
    const h = harness();
    (h.api.flashCells as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('destroyed');
    });
    bindSsrmTicks(h.provider, h.api, { keyColumn: 'id' });

    expect(() => h.tick(rowsTick(['r1']))).not.toThrow();
  });
});

describe('unbind', () => {
  it('releases the tick subscription', () => {
    const h = harness();
    const unbind = bindSsrmTicks(h.provider, h.api, { keyColumn: 'id' });
    expect(h.tickCount()).toBe(1);

    unbind();
    expect(h.tickCount()).toBe(0);
  });
});
