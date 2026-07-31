/**
 * MockProvider lifecycle tests.
 *
 * The mock transport is what every dev app and every e2e run streams
 * from, so its lifecycle contract is load-bearing:
 *
 *   loading → (microtask) full snapshot with `replace: true` → ready →
 *   ticker.
 *
 * `restart(extra)` has two distinct paths that are easy to confuse. A
 * SOFT patch (interval / pause toggles only) must NOT rebuild the
 * snapshot — rebuilding would blow away every row id in the grid on a
 * pause click. Anything else is a hard restart: clear, re-seed, re-emit.
 *
 * The ticker is injected so no test depends on wall-clock time.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { probeMock, startMock } from './mock.js';
import { __resetMockUniverse, getUniverse } from './mockUniverse.js';
import type { ProviderEmitEvent } from '../Provider.js';
import type { MockProviderConfig } from '@wellsfargo-starui/types';

interface Harness {
  events: ProviderEmitEvent[];
  /** Fire the registered ticker callback once. */
  tick(): void;
  /** Interval the ticker was registered with, or null when none was. */
  interval(): number | null;
  cleared: number;
  rowEvents(): Array<{ rows: readonly unknown[]; replace?: boolean }>;
  statuses(): string[];
}

function harness() {
  const events: ProviderEmitEvent[] = [];
  let cb: (() => void) | null = null;
  let ms: number | null = null;
  const state = { cleared: 0 };

  const emit = (e: ProviderEmitEvent) => { events.push(e); };
  const setTicker = (fn: () => void, interval: number) => {
    cb = fn;
    ms = interval;
    return { handle: true };
  };
  const clearTicker = () => { state.cleared += 1; cb = null; ms = null; };

  const h: Harness = {
    events,
    tick: () => { if (!cb) throw new Error('no ticker registered'); cb(); },
    interval: () => ms,
    get cleared() { return state.cleared; },
    rowEvents: () => events.filter((e): e is { rows: readonly unknown[]; replace?: boolean } => 'rows' in e),
    statuses: () => events.filter((e): e is { status: string } => 'status' in e).map((e) => e.status),
  };
  return { h, emit, setTicker, clearTicker, hasTicker: () => cb !== null };
}

/** Let the provider's `Promise.resolve().then(fireSnapshot)` run. */
const flush = () => new Promise((r) => setTimeout(r, 0));

function cfg(overrides: Partial<MockProviderConfig> = {}): MockProviderConfig {
  return { providerType: 'mock', dataType: 'positions', ...overrides } as MockProviderConfig;
}

beforeEach(() => {
  __resetMockUniverse();
});

describe('startMock — positions', () => {
  it('emits loading, then a full snapshot with replace, then ready', async () => {
    const { h, emit, setTicker, clearTicker } = harness();
    startMock(cfg({ rowCount: 3 }), emit, { setTicker, clearTicker });

    // `loading` is synchronous so the grid shows its overlay immediately.
    expect(h.statuses()).toEqual(['loading']);

    await flush();
    expect(h.statuses()).toEqual(['loading', 'ready']);
    const [snapshot] = h.rowEvents();
    expect(snapshot.replace).toBe(true);
    expect(snapshot.rows).toHaveLength(3);
  });

  it('defaults dataType to positions', async () => {
    const { h, emit, setTicker, clearTicker } = harness();
    startMock({ providerType: 'mock', rowCount: 2 } as MockProviderConfig, emit, { setTicker, clearTicker });
    await flush();
    expect((h.rowEvents()[0].rows[0] as Record<string, unknown>).cusip).toBeTypeOf('string');
  });

  it('fills rowCount from the universe size when unset', async () => {
    const { h, emit, setTicker, clearTicker } = harness();
    startMock(cfg(), emit, { setTicker, clearTicker });
    await flush();
    expect(h.rowEvents()[0].rows).toHaveLength(getUniverse().length);
  });

  it('cycles the universe when rowCount exceeds it', async () => {
    const { h, emit, setTicker, clearTicker } = harness();
    const target = getUniverse().length + 5;
    startMock(cfg({ rowCount: target }), emit, { setTicker, clearTicker });
    await flush();
    expect(h.rowEvents()[0].rows).toHaveLength(target);
  });

  it('ticks a non-empty batch of updated rows', async () => {
    const { h, emit, setTicker, clearTicker } = harness();
    startMock(cfg({ rowCount: 40 }), emit, { setTicker, clearTicker });
    await flush();
    const before = h.rowEvents().length;

    h.tick();

    const batch = h.rowEvents()[before];
    expect(batch.rows.length).toBeGreaterThan(0);
    // Live updates are keyed upserts, never a replace.
    expect(batch.replace).toBeUndefined();
  });

  it('prefers updateIntervalMs over the legacy updateInterval, and defaults to 750', async () => {
    for (const [config, expected] of [
      [cfg({ rowCount: 1, updateIntervalMs: 100, updateInterval: 9999 }), 100],
      [cfg({ rowCount: 1, updateInterval: 250 }), 250],
      [cfg({ rowCount: 1 }), 750],
    ] as const) {
      const { h, emit, setTicker, clearTicker } = harness();
      startMock(config, emit, { setTicker, clearTicker });
      await flush();
      expect(h.interval()).toBe(expected);
    }
  });

  it('registers no ticker when updates are disabled', async () => {
    const { emit, setTicker, clearTicker, hasTicker } = harness();
    startMock(cfg({ rowCount: 5, enableUpdates: false }), emit, { setTicker, clearTicker });
    await flush();
    expect(hasTicker()).toBe(false);
  });

  it('registers no ticker for an empty snapshot', async () => {
    const { emit, setTicker, clearTicker, hasTicker } = harness();
    startMock(cfg({ rowCount: 0 }), emit, { setTicker, clearTicker });
    await flush();
    expect(hasTicker()).toBe(false);
  });

  it('stop() clears the ticker and is safe to call twice', async () => {
    const { h, emit, setTicker, clearTicker } = harness();
    const handle = startMock(cfg({ rowCount: 5 }), emit, { setTicker, clearTicker });
    await flush();

    handle.stop();
    handle.stop();

    expect(h.cleared).toBe(1);
  });
});

describe('startMock — restart', () => {
  it('soft-restarts on an interval change without rebuilding the snapshot', async () => {
    const { h, emit, setTicker, clearTicker } = harness();
    const handle = startMock(cfg({ rowCount: 5, updateIntervalMs: 750 }), emit, { setTicker, clearTicker });
    await flush();
    const rowEventsBefore = h.rowEvents().length;

    handle.restart({ updateIntervalMs: 100 });
    await flush();

    // No `replace: []` clear, no second `loading` — the grid keeps its rows.
    expect(h.rowEvents()).toHaveLength(rowEventsBefore);
    expect(h.statuses()).toEqual(['loading', 'ready']);
    expect(h.interval()).toBe(100);
  });

  it('soft-restarts on a pause toggle, dropping the ticker', async () => {
    const { emit, setTicker, clearTicker, hasTicker } = harness();
    const handle = startMock(cfg({ rowCount: 5 }), emit, { setTicker, clearTicker });
    await flush();
    expect(hasTicker()).toBe(true);

    handle.restart({ enableUpdates: false });

    expect(hasTicker()).toBe(false);
  });

  it('hard-restarts on a rowCount change: clear, loading, fresh snapshot', async () => {
    const { h, emit, setTicker, clearTicker } = harness();
    const handle = startMock(cfg({ rowCount: 5 }), emit, { setTicker, clearTicker });
    await flush();

    handle.restart({ rowCount: 2 });
    await flush();

    const rowEvents = h.rowEvents();
    // clear (replace, empty) then the new snapshot (replace, 2 rows)
    expect(rowEvents[1]).toEqual({ rows: [], replace: true });
    expect(rowEvents[2].rows).toHaveLength(2);
    expect(h.statuses()).toEqual(['loading', 'ready', 'loading', 'ready']);
  });

  it('treats __refresh as a hard restart even alongside a soft field', async () => {
    // `__refresh` is the editor's explicit "re-fetch" signal; collapsing
    // it into the soft path would make the button do nothing.
    const { h, emit, setTicker, clearTicker } = harness();
    const handle = startMock(cfg({ rowCount: 3 }), emit, { setTicker, clearTicker });
    await flush();

    handle.restart({ __refresh: 1, updateIntervalMs: 100 });
    await flush();

    expect(h.statuses()).toEqual(['loading', 'ready', 'loading', 'ready']);
  });

  it('treats __scenarioClear as a hard restart', async () => {
    const { h, emit, setTicker, clearTicker } = harness();
    const handle = startMock(cfg({ rowCount: 3 }), emit, { setTicker, clearTicker });
    await flush();

    handle.restart({ __scenarioClear: true, enableUpdates: true });
    await flush();

    expect(h.statuses()).toEqual(['loading', 'ready', 'loading', 'ready']);
  });

  it('hard-restarts with no overlay at all', async () => {
    const { h, emit, setTicker, clearTicker } = harness();
    const handle = startMock(cfg({ rowCount: 3 }), emit, { setTicker, clearTicker });
    await flush();

    handle.restart();
    await flush();

    expect(h.rowEvents()[2].rows).toHaveLength(3);
  });

  it('ignores a non-object overlay', async () => {
    const { h, emit, setTicker, clearTicker } = harness();
    const handle = startMock(cfg({ rowCount: 3 }), emit, { setTicker, clearTicker });
    await flush();

    handle.restart('nonsense' as unknown as Record<string, unknown>);
    await flush();

    expect(h.rowEvents()[2].rows).toHaveLength(3);
  });
});

describe('startMock — trades', () => {
  it('seeds a trade book and emits it as a replace snapshot', async () => {
    const { h, emit, setTicker, clearTicker } = harness();
    startMock(cfg({ dataType: 'trades', rowCount: 10 }), emit, { setTicker, clearTicker });
    await flush();

    const [snapshot] = h.rowEvents();
    expect(snapshot.replace).toBe(true);
    expect(snapshot.rows).toHaveLength(10);
    expect((snapshot.rows[0] as Record<string, unknown>).tradeId).toBeTypeOf('string');
    expect(h.statuses()).toEqual(['loading', 'ready']);
  });

  it('defaults the trade book to 200 rows', async () => {
    const { h, emit, setTicker, clearTicker } = harness();
    startMock(cfg({ dataType: 'trades' }), emit, { setTicker, clearTicker });
    await flush();
    expect(h.rowEvents()[0].rows).toHaveLength(200);
  });

  it('ticks new and mutated trades', async () => {
    const { h, emit, setTicker, clearTicker } = harness();
    startMock(cfg({ dataType: 'trades', rowCount: 20 }), emit, { setTicker, clearTicker });
    await flush();
    const before = h.rowEvents().length;

    for (let i = 0; i < 25; i++) h.tick();

    const batches = h.rowEvents().slice(before);
    expect(batches.length).toBeGreaterThan(0);
    for (const batch of batches) expect(batch.rows.length).toBeGreaterThan(0);
  });

  it('keeps ticking from an empty book by minting a trade', async () => {
    // `book.length === 0` forces the mint branch, so an empty book
    // recovers instead of emitting nothing forever.
    const { h, emit, setTicker, clearTicker } = harness();
    startMock(cfg({ dataType: 'trades', rowCount: 0 }), emit, { setTicker, clearTicker });
    await flush();
    const before = h.rowEvents().length;

    h.tick();

    // One mint, then 1–3 mutations of that same trade, so the batch is
    // non-empty and every row is the trade that was just minted.
    const rows = h.rowEvents()[before].rows as Array<Record<string, unknown>>;
    expect(rows.length).toBeGreaterThan(0);
    expect(new Set(rows.map((r) => r.tradeId)).size).toBe(1);
  });

  it('still registers a ticker for an empty book (unlike positions)', async () => {
    const { emit, setTicker, clearTicker, hasTicker } = harness();
    startMock(cfg({ dataType: 'trades', rowCount: 0 }), emit, { setTicker, clearTicker });
    await flush();
    expect(hasTicker()).toBe(true);
  });

  it('registers no ticker when updates are disabled', async () => {
    const { emit, setTicker, clearTicker, hasTicker } = harness();
    startMock(cfg({ dataType: 'trades', rowCount: 5, enableUpdates: false }), emit, { setTicker, clearTicker });
    await flush();
    expect(hasTicker()).toBe(false);
  });

  it('soft-restarts on an interval change', async () => {
    const { h, emit, setTicker, clearTicker } = harness();
    const handle = startMock(cfg({ dataType: 'trades', rowCount: 5, updateIntervalMs: 750 }), emit, { setTicker, clearTicker });
    await flush();
    const before = h.rowEvents().length;

    handle.restart({ updateIntervalMs: 120 });
    await flush();

    expect(h.rowEvents()).toHaveLength(before);
    expect(h.interval()).toBe(120);
  });

  it('hard-restarts on a rowCount change', async () => {
    const { h, emit, setTicker, clearTicker } = harness();
    const handle = startMock(cfg({ dataType: 'trades', rowCount: 5 }), emit, { setTicker, clearTicker });
    await flush();

    handle.restart({ rowCount: 2 });
    await flush();

    expect(h.rowEvents()[1]).toEqual({ rows: [], replace: true });
    expect(h.rowEvents()[2].rows).toHaveLength(2);
  });

  it('stop() clears the ticker', async () => {
    const { h, emit, setTicker, clearTicker } = harness();
    const handle = startMock(cfg({ dataType: 'trades', rowCount: 5 }), emit, { setTicker, clearTicker });
    await flush();
    handle.stop();
    expect(h.cleared).toBe(1);
  });
});

describe('startMock — legacy orders / custom', () => {
  it('emits deterministic legacy rows for dataType=orders', async () => {
    const { h, emit, setTicker, clearTicker } = harness();
    startMock(cfg({ dataType: 'orders', rowCount: 3 }), emit, { setTicker, clearTicker });
    await flush();

    const rows = h.rowEvents()[0].rows as Array<Record<string, unknown>>;
    expect(rows.map((r) => r.id)).toEqual(['row-0', 'row-1', 'row-2']);
    expect(rows[0].instrument).toBe('AAPL');
    expect(rows[0].side).toBe('Buy');
    expect(rows[1].side).toBe('Sell');
    expect(h.statuses()).toEqual(['loading', 'ready']);
  });

  it('routes dataType=custom to the same legacy generator', async () => {
    const { h, emit, setTicker, clearTicker } = harness();
    startMock(cfg({ dataType: 'custom', rowCount: 2 }), emit, { setTicker, clearTicker });
    await flush();
    expect((h.rowEvents()[0].rows[0] as Record<string, unknown>).id).toBe('row-0');
  });

  it('defaults to 50 rows and a 2000ms interval', async () => {
    const { h, emit, setTicker, clearTicker } = harness();
    startMock(cfg({ dataType: 'orders' }), emit, { setTicker, clearTicker });
    await flush();
    expect(h.rowEvents()[0].rows).toHaveLength(50);
    expect(h.interval()).toBe(2000);
  });

  it('ticks exactly one repriced row', async () => {
    const { h, emit, setTicker, clearTicker } = harness();
    startMock(cfg({ dataType: 'orders', rowCount: 4 }), emit, { setTicker, clearTicker });
    await flush();
    const before = h.rowEvents().length;

    h.tick();

    const batch = h.rowEvents()[before];
    expect(batch.rows).toHaveLength(1);
    expect((batch.rows[0] as Record<string, unknown>).price).toBeTypeOf('number');
  });

  it('registers no ticker for rowCount 0 or updates off', async () => {
    for (const config of [
      cfg({ dataType: 'orders', rowCount: 0 }),
      cfg({ dataType: 'orders', rowCount: 5, enableUpdates: false }),
    ]) {
      const { emit, setTicker, clearTicker, hasTicker } = harness();
      startMock(config, emit, { setTicker, clearTicker });
      await flush();
      expect(hasTicker()).toBe(false);
    }
  });

  it('soft-restarts on an interval change and keeps the rows', async () => {
    const { h, emit, setTicker, clearTicker } = harness();
    const handle = startMock(cfg({ dataType: 'orders', rowCount: 4, updateIntervalMs: 2000 }), emit, { setTicker, clearTicker });
    await flush();
    const before = h.rowEvents().length;

    handle.restart({ updateIntervalMs: 300 });
    await flush();

    expect(h.rowEvents()).toHaveLength(before);
    expect(h.interval()).toBe(300);
  });

  it('hard-restarts on a rowCount change', async () => {
    const { h, emit, setTicker, clearTicker } = harness();
    const handle = startMock(cfg({ dataType: 'orders', rowCount: 4 }), emit, { setTicker, clearTicker });
    await flush();

    handle.restart({ rowCount: 2 });
    await flush();

    expect(h.rowEvents()[1]).toEqual({ rows: [], replace: true });
    expect(h.rowEvents()[2].rows).toHaveLength(2);
  });

  it('stop() clears the ticker', async () => {
    const { h, emit, setTicker, clearTicker } = harness();
    const handle = startMock(cfg({ dataType: 'orders', rowCount: 4 }), emit, { setTicker, clearTicker });
    await flush();
    handle.stop();
    expect(h.cleared).toBe(1);
  });

  it('falls back to real timers when no ticker is injected', async () => {
    const setInterval = vi.spyOn(globalThis, 'setInterval');
    const clearInterval = vi.spyOn(globalThis, 'clearInterval');
    const events: ProviderEmitEvent[] = [];

    const handle = startMock(cfg({ dataType: 'orders', rowCount: 2, updateIntervalMs: 5000 }), (e) => events.push(e));
    await flush();
    handle.stop();

    expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 5000);
    expect(clearInterval).toHaveBeenCalled();
    setInterval.mockRestore();
    clearInterval.mockRestore();
  });
});

describe('probeMock', () => {
  it('returns five position rows by default', () => {
    const { ok, rows } = probeMock(cfg());
    expect(ok).toBe(true);
    expect(rows).toHaveLength(5);
    expect((rows[0] as Record<string, unknown>).cusip).toBeTypeOf('string');
  });

  it('returns trade rows for dataType=trades', () => {
    const { rows } = probeMock(cfg({ dataType: 'trades' }), { maxRows: 2 });
    expect(rows).toHaveLength(2);
    expect((rows[0] as Record<string, unknown>).tradeId).toBeTypeOf('string');
  });

  it('returns legacy rows for anything else', () => {
    const { rows } = probeMock(cfg({ dataType: 'orders' }), { maxRows: 3 });
    expect((rows as Array<Record<string, unknown>>).map((r) => r.id)).toEqual(['row-0', 'row-1', 'row-2']);
  });

  it('honours maxRows, including zero', () => {
    expect(probeMock(cfg(), { maxRows: 1 }).rows).toHaveLength(1);
    expect(probeMock(cfg(), { maxRows: 0 }).rows).toEqual([]);
  });

  it('spins up no ticker — the editor probe must not start a feed', () => {
    const setInterval = vi.spyOn(globalThis, 'setInterval');
    probeMock(cfg());
    expect(setInterval).not.toHaveBeenCalled();
    setInterval.mockRestore();
  });
});
