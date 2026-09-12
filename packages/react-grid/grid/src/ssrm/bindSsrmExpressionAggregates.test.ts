import { afterEach, describe, expect, it, vi } from 'vitest';
import { SSRM_EXPR_AGG_KEY } from '@wellsfargo-starui/core';
import type { GridApi } from 'ag-grid-community';
import type { ISsrmDataProvider } from '@wellsfargo-starui/data';
import { bindSsrmExpressionAggregates } from './bindSsrmExpressionAggregates.js';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function provider(values: Record<string, number> = { price_sum: 1000, price_count: 50 }): ISsrmDataProvider {
  return {
    getAggregates: vi.fn(async () => ({ values })),
    onSsrmTick: vi.fn(() => () => undefined),
    onRefresh: vi.fn(() => () => undefined),
  } as unknown as ISsrmDataProvider;
}

function api(quickFilter: string | undefined = 'ABC'): GridApi {
  const listeners = new Map<string, Set<() => void>>();
  return {
    getFilterModel: () => ({ price: { filterType: 'number', type: 'greaterThan', filter: 0 } }),
    getGridOption: vi.fn((name: string) => (name === 'quickFilterText' ? quickFilter : undefined)),
    refreshCells: vi.fn(),
    addEventListener: (evt: string, fn: () => void) => {
      if (!listeners.has(evt)) listeners.set(evt, new Set());
      listeners.get(evt)!.add(fn);
    },
    removeEventListener: (evt: string, fn: () => void) => {
      listeners.get(evt)?.delete(fn);
    },
  } as unknown as GridApi;
}

describe('bindSsrmExpressionAggregates', () => {
  it('resolves SUM/COUNT from getAggregates over the current filter, not loaded blocks', async () => {
    const p = provider();
    const grid = api();
    const stop = bindSsrmExpressionAggregates(p, grid);
    const session = (grid as GridApi & { [SSRM_EXPR_AGG_KEY]?: { resolve: (f: string, c: string) => unknown } })[
      SSRM_EXPR_AGG_KEY
    ];
    expect(session).toBeDefined();
    expect(session!.resolve('SUM', 'price')).toBeNull();
    // T4: the statistical set resolves engine-side too — pending, not refused.
    expect(session!.resolve('MEDIAN', 'price')).toBeNull();
    // Outside the aggregate map entirely → undefined (falls back to allRows).
    expect(session!.resolve('MODE', 'price')).toBeUndefined();

    await vi.waitFor(() => {
      expect(session!.resolve('SUM', 'price')).toBe(1000);
      expect(session!.resolve('COUNT', 'price')).toBe(50);
    });
    const reqs = vi.mocked(p.getAggregates).mock.calls.map((c) => c[0]);
    expect(reqs.some((r) => r.quickFilterText === 'ABC' && r.filterModel)).toBe(true);
    expect(reqs.some((r) =>
      (r.specs ?? []).some((s) => s.fn === 'sum' && s.column === 'price'),
    )).toBe(true);
    expect(grid.refreshCells).toHaveBeenCalledWith({ force: true, suppressFlash: true });
    stop();
  });

  it('keeps the last values when getAggregates fails and replaces a prior session', async () => {
    const p = provider();
    const grid = api();
    bindSsrmExpressionAggregates(p, grid);
    const first = (grid as GridApi & { [SSRM_EXPR_AGG_KEY]?: { stop: () => void } })[
      SSRM_EXPR_AGG_KEY
    ];
    first!.stop = vi.fn(first!.stop);
    const failing = provider();
    vi.mocked(failing.getAggregates).mockRejectedValueOnce(new Error('offline'));
    const stop = bindSsrmExpressionAggregates(failing, grid);
    expect(first!.stop).toHaveBeenCalled();
    const session = (grid as GridApi & { [SSRM_EXPR_AGG_KEY]?: { resolve: (f: string, c: string) => unknown } })[
      SSRM_EXPR_AGG_KEY
    ]!;
    session.resolve('SUM', 'price');
    await vi.waitFor(() => expect(failing.getAggregates).toHaveBeenCalled());
    expect(session.resolve('SUM', 'price')).toBeNull();
    stop();
  });

  it('omits quickFilterText when the grid has none and survives refreshCells errors', async () => {
    const p = provider();
    const grid = api('');
    vi.mocked(grid.refreshCells).mockImplementation(() => {
      throw new Error('destroyed');
    });
    const stop = bindSsrmExpressionAggregates(p, grid);
    const session = (grid as GridApi & { [SSRM_EXPR_AGG_KEY]?: { resolve: (f: string, c: string) => unknown } })[
      SSRM_EXPR_AGG_KEY
    ]!;
    session.resolve('AVG', 'price');
    await vi.waitFor(() => expect(p.getAggregates).toHaveBeenCalled());
    expect(vi.mocked(p.getAggregates).mock.calls[0][0].quickFilterText).toBeUndefined();
    stop();
  });

  it('stops the session and detaches it from the api', async () => {
    const p = provider();
    const grid = api();
    const stop = bindSsrmExpressionAggregates(p, grid);
    (grid as GridApi & { [SSRM_EXPR_AGG_KEY]?: { resolve: (f: string, c: string) => unknown } })[
      SSRM_EXPR_AGG_KEY
    ]!.resolve('SUM', 'price');
    await vi.waitFor(() => expect(p.getAggregates).toHaveBeenCalled());
    stop();
    expect(
      (grid as GridApi & { [SSRM_EXPR_AGG_KEY]?: unknown })[SSRM_EXPR_AGG_KEY],
    ).toBeUndefined();
  });
});
