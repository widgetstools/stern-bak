import { describe, expect, it } from 'vitest';
import {
  createFiPositionsLargeConfig,
  createFiPositionsSmallConfig,
} from './mockPresets.js';
import { startMock } from './mock.js';
import type { ProviderEmit } from '../Provider.js';

describe('mockPresets — createFiPositionsLargeConfig', () => {
  it('produces high-frequency 500-row defaults', () => {
    const cfg = createFiPositionsLargeConfig();
    expect(cfg.providerType).toBe('mock');
    expect(cfg.dataType).toBe('positions');
    expect(cfg.rowCount).toBe(500);
    expect(cfg.updateIntervalMs).toBe(50);
    expect(cfg.enableUpdates).toBe(true);
    expect(cfg.keyColumn).toBe('cusip');
  });

  it('respects overrides without dropping unset defaults', () => {
    const cfg = createFiPositionsLargeConfig({ rowCount: 2_000 });
    expect(cfg.rowCount).toBe(2_000);
    expect(cfg.updateIntervalMs).toBe(50);
    expect(cfg.enableUpdates).toBe(true);
  });

  it('lets the consumer disable ticking', () => {
    const cfg = createFiPositionsLargeConfig({ enableUpdates: false });
    expect(cfg.enableUpdates).toBe(false);
  });
});

describe('mockPresets — createFiPositionsSmallConfig', () => {
  it('produces calm 50-row defaults', () => {
    const cfg = createFiPositionsSmallConfig();
    expect(cfg.rowCount).toBe(50);
    expect(cfg.updateIntervalMs).toBe(750);
    expect(cfg.enableUpdates).toBe(true);
  });
});

describe('mockPresets — end-to-end with startMock', () => {
  it('large config produces 500 rows with the configured tick cadence', async () => {
    // Deterministic ticker: capture (cb, ms) so we can advance manually.
    let scheduledCb: (() => void) | null = null;
    let scheduledMs: number | null = null;
    const setTicker = (cb: () => void, ms: number) => {
      scheduledCb = cb;
      scheduledMs = ms;
      return 'ticker-handle';
    };
    const clearTicker = () => {
      scheduledCb = null;
    };

    const snapshots: Array<{ rows?: unknown[]; replace?: boolean }> = [];
    const statuses: string[] = [];
    const tickBatches: number[] = [];
    let snapshotReceived = false;

    const emit: ProviderEmit = (msg) => {
      if (msg.status) statuses.push(msg.status);
      if (msg.rows && msg.replace) {
        snapshots.push({ rows: msg.rows, replace: true });
        snapshotReceived = true;
      } else if (msg.rows && !msg.replace) {
        tickBatches.push(msg.rows.length);
      }
    };

    const cfg = createFiPositionsLargeConfig();
    const handle = startMock(cfg, emit, { setTicker, clearTicker });

    // The provider fires the snapshot inside a Promise.resolve().then(...);
    // a single microtask flush is enough to surface it.
    await Promise.resolve();
    expect(snapshotReceived).toBe(true);
    expect(snapshots[0]?.rows?.length).toBe(500);
    expect(statuses).toContain('loading');
    expect(statuses).toContain('ready');
    expect(scheduledMs).toBe(50);
    expect(scheduledCb).not.toBeNull();

    // Trigger a single tick — batch should be 1-4% of 500 rows (5-20).
    scheduledCb!();
    expect(tickBatches.length).toBe(1);
    expect(tickBatches[0]).toBeGreaterThanOrEqual(1);
    expect(tickBatches[0]).toBeLessThanOrEqual(20);

    handle.stop();
    expect(scheduledCb).toBeNull();
  });

  it('small config produces 50 rows at the slower cadence', async () => {
    let scheduledMs: number | null = null;
    const setTicker = (_cb: () => void, ms: number) => {
      scheduledMs = ms;
      return 'h';
    };
    const clearTicker = () => {};

    let snapshotRows: unknown[] | undefined;
    const emit: ProviderEmit = (msg) => {
      if (msg.rows && msg.replace) snapshotRows = msg.rows;
    };

    const handle = startMock(createFiPositionsSmallConfig(), emit, { setTicker, clearTicker });
    await Promise.resolve();
    expect(snapshotRows?.length).toBe(50);
    expect(scheduledMs).toBe(750);
    handle.stop();
  });

  it('respects rowCount overrides end-to-end', async () => {
    const setTicker = () => 'h';
    const clearTicker = () => {};
    let snapshotRows: unknown[] | undefined;
    const emit: ProviderEmit = (msg) => {
      if (msg.rows && msg.replace) snapshotRows = msg.rows;
    };
    const handle = startMock(
      createFiPositionsLargeConfig({ rowCount: 2_000, updateIntervalMs: 100 }),
      emit,
      { setTicker, clearTicker },
    );
    await Promise.resolve();
    expect(snapshotRows?.length).toBe(2_000);
    handle.stop();
  });

  it('row shape covers nested fields and >100 columns (FI requirement)', async () => {
    const setTicker = () => 'h';
    const clearTicker = () => {};
    let firstRow: Record<string, unknown> | undefined;
    const emit: ProviderEmit = (msg) => {
      if (msg.rows && msg.replace && !firstRow) {
        firstRow = msg.rows[0] as Record<string, unknown>;
      }
    };
    const handle = startMock(createFiPositionsLargeConfig(), emit, { setTicker, clearTicker });
    await Promise.resolve();
    expect(firstRow).toBeTruthy();
    // Top-level field count must clear the 100-column bar in the plan.
    expect(Object.keys(firstRow!).length).toBeGreaterThanOrEqual(100);
    // Nested objects must exist on the row (ratings, exposures, schedules).
    // mockPosition.ts seeds nested ratings + exposure tables.
    const nestedKeys = Object.entries(firstRow!).filter(
      ([, v]) => v !== null && typeof v === 'object' && !Array.isArray(v),
    );
    expect(nestedKeys.length).toBeGreaterThan(0);
    handle.stop();
  });

  it('soft restart for interval-only changes does not replace the snapshot', async () => {
    let scheduledMs: number | null = null;
    const setTicker = (_cb: () => void, ms: number) => {
      scheduledMs = ms;
      return 'h';
    };
    const clearTicker = () => {};

    let replaceCount = 0;
    const emit: ProviderEmit = (msg) => {
      if (msg.rows && msg.replace) replaceCount += 1;
    };

    const handle = startMock(createFiPositionsSmallConfig(), emit, { setTicker, clearTicker });
    await Promise.resolve();
    expect(replaceCount).toBe(1);
    expect(scheduledMs).toBe(750);

    handle.restart({ updateIntervalMs: 200, enableUpdates: true, rowCount: 50 });
    await Promise.resolve();

    expect(replaceCount).toBe(1);
    expect(scheduledMs).toBe(200);
    handle.stop();
  });
});
