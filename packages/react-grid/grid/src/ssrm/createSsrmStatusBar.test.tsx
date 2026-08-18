/**
 * @vitest-environment jsdom
 *
 * AG Grid default status bar parity: totalAndFiltered (left), total /
 * filtered / selected (center), aggregation (right). Counts come from the
 * worker — the native count components only see the client row model, which
 * under SSRM never knows the unfiltered cache total.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import {
  createSsrmStatusBar,
  SsrmRowsStatusPanel,
  SsrmTotalRowsStatusPanel,
  SsrmFilteredRowsStatusPanel,
  mapNativeStatusBarToSsrm,
} from './createSsrmStatusBar.js';

const provider = {
  getStatusBar: vi.fn(async () => ({
    totalRows: 20_000,
    filteredRows: 1_234,
    selectedRows: 0,
    aggregations: [],
    revision: 1,
  })),
} as never;

const api = { isDestroyed: () => false, getFilterModel: () => ({}) } as never;

describe('createSsrmStatusBar default parity', () => {
  it('produces AG Grid\'s default five-panel arrangement', () => {
    const { statusBar } = createSsrmStatusBar({ provider });
    const panels = statusBar.statusPanels.map((p) => [
      p.key,
      typeof p.statusPanel === 'string' ? p.statusPanel : 'custom',
      p.align,
    ]);
    expect(panels).toEqual([
      ['ssrm-rows', 'custom', 'left'],
      ['ssrm-total-rows', 'custom', 'center'],
      ['ssrm-filtered-rows', 'custom', 'center'],
      ['ssrm-selected', 'agSelectedRowCountComponent', 'center'],
      ['ssrm-aggregation', 'agAggregationComponent', 'right'],
    ]);
  });

  it('Total Rows panel shows the worker cache total with AG Grid markup', async () => {
    render(<SsrmTotalRowsStatusPanel api={api} provider={provider} />);
    await waitFor(() => expect(screen.getByText('20,000')).toBeInTheDocument());
    expect(screen.getByText('Total Rows')).toBeInTheDocument();
    expect(document.querySelector('.ag-status-panel-total-row-count')).toBeTruthy();
  });

  // Label is "Filtered", not "Filtered Rows": AG Grid's own default is
  // `getLocaleTextFunc()('filteredRows', 'Filtered')` and no `localeText` is
  // supplied anywhere in this repo. See `createSsrmStatusBar.pagination.test.tsx`,
  // which reads it off a real CSRM grid rather than off the library source.
  it('Filtered panel shows the worker filtered count', async () => {
    render(<SsrmFilteredRowsStatusPanel api={api} provider={provider} />);
    await waitFor(() => expect(screen.getByText('1,234')).toBeInTheDocument());
    expect(screen.getByText('Filtered')).toBeInTheDocument();
    expect(document.querySelector('.ag-status-panel-filtered-row-count')).toBeTruthy();
  });

  it('reloads on tick arrival instead of free-running polling', async () => {
    vi.useFakeTimers();
    const tickHandlers: Array<() => void> = [];
    const p = {
      getStatusBar: vi.fn(async () => ({
        totalRows: 1, filteredRows: 1, selectedRows: 0, aggregations: [], revision: 1,
      })),
      onSsrmTick: (h: () => void) => { tickHandlers.push(h); return () => {}; },
    } as never;
    render(<SsrmTotalRowsStatusPanel api={api} provider={p} refreshThrottleMs={100} />);
    await vi.advanceTimersByTimeAsync(0);
    const initial = (p as { getStatusBar: { mock: { calls: unknown[] } } }).getStatusBar.mock.calls.length;

    tickHandlers.forEach((h) => h());
    await vi.advanceTimersByTimeAsync(100);
    expect((p as never as { getStatusBar: { mock: { calls: unknown[] } } }).getStatusBar.mock.calls.length)
      .toBe(initial + 1);

    // No ticks: only the slow 2s fallback may fire, not a 150ms free-run.
    await vi.advanceTimersByTimeAsync(1_000);
    expect((p as never as { getStatusBar: { mock: { calls: unknown[] } } }).getStatusBar.mock.calls.length)
      .toBe(initial + 1);
    vi.useRealTimers();
  });
});

describe('mapNativeStatusBarToSsrm', () => {
  const provider = { id: 'p' } as never;

  it('replaces the three native count components with worker-backed panels', () => {
    const mapped = mapNativeStatusBarToSsrm(
      {
        statusPanels: [
          { statusPanel: 'agTotalAndFilteredRowCountComponent', align: 'left' },
          { statusPanel: 'agFilteredRowCountComponent' },
          { statusPanel: 'agTotalRowCountComponent' },
        ],
      },
      { provider },
    )!;
    expect(mapped.statusPanels).toHaveLength(3);
    expect(mapped.statusPanels[0].statusPanel).toBe(SsrmRowsStatusPanel);
    expect(mapped.statusPanels[0].align).toBe('left');
    expect(mapped.statusPanels[1].statusPanel).toBe(SsrmFilteredRowsStatusPanel);
    expect(mapped.statusPanels[2].statusPanel).toBe(SsrmTotalRowsStatusPanel);
    // Worker provider injected so counts come from the whole cache.
    for (const panel of mapped.statusPanels) {
      expect((panel.statusPanelParams as { provider: unknown }).provider).toBe(provider);
    }
  });

  it('passes selected / aggregation / custom panels through untouched', () => {
    const custom = { statusPanel: 'myCustomPanel', align: 'left' as const };
    const mapped = mapNativeStatusBarToSsrm(
      {
        statusPanels: [
          { statusPanel: 'agSelectedRowCountComponent' },
          { statusPanel: 'agAggregationComponent', align: 'right' },
          custom,
        ],
      },
      { provider },
    )!;
    expect(mapped.statusPanels[0].statusPanel).toBe('agSelectedRowCountComponent');
    expect(mapped.statusPanels[1].statusPanel).toBe('agAggregationComponent');
    expect(mapped.statusPanels[1].align).toBe('right');
    expect(mapped.statusPanels[2]).toBe(custom);
  });

  it('returns undefined when the option is absent, malformed, or empty', () => {
    expect(mapNativeStatusBarToSsrm(undefined, { provider })).toBeUndefined();
    expect(mapNativeStatusBarToSsrm(true, { provider })).toBeUndefined();
    expect(mapNativeStatusBarToSsrm({}, { provider })).toBeUndefined();
    expect(mapNativeStatusBarToSsrm({ statusPanels: [] }, { provider })).toBeUndefined();
  });
});

/**
 * Two refresh-cost fixes from WORKLOG item 15. Both were per-panel, and the
 * default strip mounts three of them.
 */
describe('refresh cost', () => {
  it('a tick right after mount does not re-fetch what the mount load fetched', async () => {
    vi.useFakeTimers();
    const handlers: Array<() => void> = [];
    const p = {
      getStatusBar: vi.fn(async () => ({
        totalRows: 1, filteredRows: 1, selectedRows: 0, aggregations: [], revision: 1,
      })),
      onSsrmTick: (h: () => void) => { handlers.push(h); return () => {}; },
    } as never;

    render(<SsrmTotalRowsStatusPanel api={api} provider={p} refreshThrottleMs={100} />);
    await vi.advanceTimersByTimeAsync(0);
    const afterMount = (p as { getStatusBar: { mock: { calls: unknown[] } } }).getStatusBar.mock.calls.length;

    // `lastLoadAt` used to start at 0, so this tick read `elapsed` as the whole
    // epoch, took the leading edge, and duplicated the mount fetch.
    handlers.forEach((h) => h());
    await vi.advanceTimersByTimeAsync(0);
    expect((p as never as { getStatusBar: { mock: { calls: unknown[] } } }).getStatusBar.mock.calls.length)
      .toBe(afterMount);
    vi.useRealTimers();
  });

  it('runs no idle poll when the provider has a tick stream', async () => {
    vi.useFakeTimers();
    const p = {
      getStatusBar: vi.fn(async () => ({
        totalRows: 1, filteredRows: 1, selectedRows: 0, aggregations: [], revision: 1,
      })),
      onSsrmTick: () => () => {},
    } as never;

    render(<SsrmTotalRowsStatusPanel api={api} provider={p} refreshThrottleMs={100} />);
    await vi.advanceTimersByTimeAsync(0);
    const afterMount = (p as { getStatusBar: { mock: { calls: unknown[] } } }).getStatusBar.mock.calls.length;

    // The 2s fallback used to run regardless, costing a worker round trip per
    // panel forever on an idle grid.
    await vi.advanceTimersByTimeAsync(10_000);
    expect((p as never as { getStatusBar: { mock: { calls: unknown[] } } }).getStatusBar.mock.calls.length)
      .toBe(afterMount);
    vi.useRealTimers();
  });

  it('still polls for a provider with NO tick stream', async () => {
    vi.useFakeTimers();
    const p = {
      getStatusBar: vi.fn(async () => ({
        totalRows: 1, filteredRows: 1, selectedRows: 0, aggregations: [], revision: 1,
      })),
    } as never;

    render(<SsrmTotalRowsStatusPanel api={api} provider={p} />);
    await vi.advanceTimersByTimeAsync(0);
    const afterMount = (p as { getStatusBar: { mock: { calls: unknown[] } } }).getStatusBar.mock.calls.length;

    await vi.advanceTimersByTimeAsync(5_000);
    expect((p as never as { getStatusBar: { mock: { calls: unknown[] } } }).getStatusBar.mock.calls.length)
      .toBeGreaterThan(afterMount);
    vi.useRealTimers();
  });
});
