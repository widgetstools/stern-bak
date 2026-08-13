import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bindSsrmTicks } from './bindSsrmTicks.js';

/**
 * Reconnect/restart/refresh recovery. The STOMP transport rebuilds its
 * snapshot after a broker restart, but the snapshot flush fires on the
 * FIRST streamed chunk (partial cache) and later chunks are interest-gated
 * — so without a purge on the loading→ready transition the grid sits on
 * stale or partial rows until a manual reload. Status events fan to every
 * session, so this one subscription auto-refreshes ALL grids.
 */
function harness() {
  const statusHandlers: Array<(s: string) => void> = [];
  const provider = {
    onSsrmTick: vi.fn(() => () => {}),
    onStatus: vi.fn((h: (s: string) => void) => {
      statusHandlers.push(h);
      return () => {
        const i = statusHandlers.indexOf(h);
        if (i >= 0) statusHandlers.splice(i, 1);
      };
    }),
  } as never;
  const api = {
    refreshServerSide: vi.fn(),
    applyServerSideTransaction: vi.fn(),
    flashCells: vi.fn(),
    getRowNode: vi.fn(),
    getDisplayedRowCount: () => 0,
    getFilterModel: () => ({}),
    getRowGroupColumns: () => [],
    getColumnState: () => [],
    getColumns: () => [],
    isDestroyed: () => false,
  } as never;
  const status = (s: string) => statusHandlers.forEach((h) => h(s));
  return { provider, api, status, statusHandlers };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('bindSsrmTicks — refresh on provider ready', () => {
  it('purges once when the provider recovers (loading -> ready)', () => {
    const { provider, api, status } = harness();
    bindSsrmTicks(provider, api, { flash: false });

    status('loading');
    status('ready');
    vi.advanceTimersByTime(1_000);

    const purges = (api as { refreshServerSide: ReturnType<typeof vi.fn> })
      .refreshServerSide.mock.calls.filter((c) => c[0]?.purge === true);
    expect(purges.length).toBe(1);
  });

  it('purges on error -> ready (reconnect) but not on repeated ready', () => {
    const { provider, api, status } = harness();
    bindSsrmTicks(provider, api, { flash: false });

    status('error');
    status('ready');
    status('ready'); // no intervening interruption — no second purge
    vi.advanceTimersByTime(1_000);

    const purges = (api as { refreshServerSide: ReturnType<typeof vi.fn> })
      .refreshServerSide.mock.calls.filter((c) => c[0]?.purge === true);
    expect(purges.length).toBe(1);
  });

  it('unbind removes the status subscription', () => {
    const { provider, api, status, statusHandlers } = harness();
    const unbind = bindSsrmTicks(provider, api, { flash: false });
    unbind();
    expect(statusHandlers).toHaveLength(0);

    status('loading');
    status('ready');
    vi.advanceTimersByTime(1_000);
    expect(
      (api as { refreshServerSide: ReturnType<typeof vi.fn> }).refreshServerSide,
    ).not.toHaveBeenCalled();
  });

  it('tolerates providers without onStatus (bare ISsrmDataProvider mocks)', () => {
    const provider = { onSsrmTick: vi.fn(() => () => {}) } as never;
    const api = {
      refreshServerSide: vi.fn(),
      getColumns: () => [],
      isDestroyed: () => false,
    } as never;
    expect(() => bindSsrmTicks(provider, api, { flash: false })()).not.toThrow();
  });
});
