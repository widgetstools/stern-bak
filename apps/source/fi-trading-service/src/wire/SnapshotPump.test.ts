import { describe, expect, it } from 'vitest';

import type { RowSource } from '../datasets/RowSource.js';
import { FakeWebSocket } from '../test/support/FakeWebSocket.js';
import { OutboundQueue } from './OutboundQueue.js';
import { pumpSnapshot } from './SnapshotPump.js';

function sourceOf(rowCount: number): RowSource {
  const rows = Array.from({ length: rowCount }, (_, i) => ({ positionId: `P${i}` }));
  return {
    dataset: 'positions',
    keyColumn: 'positionId',
    size: () => rows.length,
    pendingLive: () => 0,
    drainLive: () => [],
    async *snapshot(batchSize: number) {
      for (let i = 0; i < rows.length; i += batchSize) yield rows.slice(i, i + batchSize);
    },
  };
}

function harness(rowCount: number) {
  const socket = new FakeWebSocket();
  const queue = new OutboundQueue(socket, { highWaterBytes: 100, lowWaterBytes: 20 });
  const batches: number[] = [];
  let completedWith: number | null = null;
  return {
    socket,
    queue,
    batches,
    complete: () => completedWith,
    deps: {
      source: sourceOf(rowCount),
      queue,
      batchSize: 500,
      sendBatch: (rows: readonly unknown[]) => batches.push(rows.length),
      sendComplete: (n: number) => {
        completedWith = n;
      },
      isCancelled: () => false,
      yieldToEventLoop: () => Promise.resolve(),
    },
  };
}

describe('pumpSnapshot', () => {
  it('emits full batches plus a final partial one, then completes', async () => {
    const h = harness(1250);
    const result = await pumpSnapshot(h.deps);
    expect(h.batches).toEqual([500, 500, 250]);
    expect(result).toMatchObject({ rowsSent: 1250, batchesSent: 3, cancelled: false });
    expect(h.complete()).toBe(1250);
  });

  it('completes with zero rows for an empty source', async () => {
    const h = harness(0);
    const result = await pumpSnapshot(h.deps);
    expect(h.batches).toEqual([]);
    expect(result.rowsSent).toBe(0);
    expect(h.complete()).toBe(0);
  });

  it('stops before the first batch when already cancelled', async () => {
    const h = harness(1000);
    const result = await pumpSnapshot({ ...h.deps, isCancelled: () => true });
    expect(result.cancelled).toBe(true);
    expect(h.batches).toEqual([]);
    expect(h.complete()).toBeNull();
  });

  it('abandons mid-stream on cancellation and never sends the sentinel', async () => {
    const h = harness(5000);
    let calls = 0;
    const result = await pumpSnapshot({
      ...h.deps,
      isCancelled: () => (calls += 1) > 3,
    });
    expect(result.cancelled).toBe(true);
    expect(h.complete()).toBeNull();
    expect(h.batches.length).toBeLessThan(10);
  });

  it('waits for the socket to drain rather than queueing frames', async () => {
    const h = harness(1500);
    h.socket.bufferedAmount = 500;
    setTimeout(() => {
      h.socket.bufferedAmount = 0;
    }, 1);
    const result = await pumpSnapshot(h.deps);
    expect(result.rowsSent).toBe(1500);
  });
});
