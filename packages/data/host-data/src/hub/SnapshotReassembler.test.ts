import { describe, expect, it, vi } from 'vitest';
import { SnapshotReassembler } from './SnapshotReassembler.js';

const CHUNK = 500;

function row(id: number): { id: number } {
  return { id };
}

function chunk(start: number, count: number): { id: number }[] {
  return Array.from({ length: count }, (_, i) => row(start + i));
}

describe('SnapshotReassembler', () => {
  it('assembles 500-row chunks into a single snapshot on ready', async () => {
    const onRowsReceived = vi.fn<(count: number) => void>();
    const onSnapshotReady = vi.fn<(rows: readonly { id: number }[]) => void>();
    const r = new SnapshotReassembler<{ id: number }>({
      onRowsReceived,
      onSnapshotReady,
    });

    r.onDelta(chunk(0, CHUNK), true);
    expect(onRowsReceived).toHaveBeenLastCalledWith(CHUNK);

    r.onDelta(chunk(CHUNK, CHUNK), false);
    expect(onRowsReceived).toHaveBeenLastCalledWith(CHUNK * 2);

    r.onDelta(chunk(CHUNK * 2, CHUNK), false);
    expect(onRowsReceived).toHaveBeenLastCalledWith(CHUNK * 3);

    r.onStatus('ready');
    await Promise.resolve();

    expect(onSnapshotReady).toHaveBeenCalledTimes(1);
    expect(onSnapshotReady.mock.calls[0]![0]).toHaveLength(CHUNK * 3);
    expect(onSnapshotReady.mock.calls[0]![0][0]).toEqual({ id: 0 });
    expect(onSnapshotReady.mock.calls[0]![0][CHUNK * 3 - 1]).toEqual({ id: CHUNK * 3 - 1 });
    expect(r.isSettled()).toBe(true);
  });

  it('commits an empty snapshot on ready', async () => {
    const onSnapshotReady = vi.fn<(rows: readonly unknown[]) => void>();
    const r = new SnapshotReassembler({ onSnapshotReady });

    r.onDelta([], true);
    r.onStatus('ready');
    await Promise.resolve();

    expect(onSnapshotReady).toHaveBeenCalledWith([]);
    expect(r.getRowCount()).toBe(0);
  });

  it('restarts mid-flight on post-settle replace and re-assembles', async () => {
    const onReset = vi.fn<(rows: readonly { id: number }[]) => void>();
    const onSnapshotReady = vi.fn<(rows: readonly { id: number }[]) => void>();
    const onTick = vi.fn<(rows: readonly { id: number }[]) => void>();
    const r = new SnapshotReassembler<{ id: number }>({
      onReset,
      onSnapshotReady,
      onTick,
    });

    r.onDelta(chunk(0, CHUNK), true);
    r.onDelta(chunk(CHUNK, CHUNK), false);
    r.onStatus('ready');
    await Promise.resolve();
    expect(onSnapshotReady).toHaveBeenCalledTimes(1);

    r.onDelta(chunk(9000, CHUNK), true);
    expect(onReset).toHaveBeenCalledWith(chunk(9000, CHUNK));
    expect(r.isSettled()).toBe(false);
    expect(r.getPhase()).toBe('loading');

    r.onDelta(chunk(9000 + CHUNK, 100), false);
    r.onStatus('loading');
    r.onStatus('ready');
    await Promise.resolve();

    expect(onSnapshotReady).toHaveBeenCalledTimes(2);
    const second = onSnapshotReady.mock.calls[1]![0];
    expect(second).toHaveLength(CHUNK + 100);
    expect(second[0]).toEqual({ id: 9000 });
    expect(onTick).not.toHaveBeenCalled();
  });

  it('routes post-settle non-replace deltas to onTick', async () => {
    const onTick = vi.fn<(rows: readonly { id: number }[]) => void>();
    const r = new SnapshotReassembler<{ id: number }>({ onTick });

    r.onDelta([{ id: 1 }], true);
    r.onStatus('ready');
    await Promise.resolve();

    r.onDelta([{ id: 2 }], false);
    expect(onTick).toHaveBeenCalledWith([{ id: 2 }]);
  });

  it('ignores non-replace deltas after error status', () => {
    const onTick = vi.fn();
    const r = new SnapshotReassembler({ onTick });

    r.onStatus('error', 'boom');
    r.onDelta([{ id: 1 }], false);
    expect(onTick).not.toHaveBeenCalled();
    expect(r.getPhase()).toBe('error');
  });

  it('accepts replace:true during error (STOMP reconnect ordering)', () => {
    const onReset = vi.fn();
    const r = new SnapshotReassembler<{ id: number }>({ onReset });

    r.onDelta([{ id: 1 }], true);
    r.onStatus('ready');
    r.onStatus('error', 'boom');
    r.onDelta([{ id: 2 }], true);

    expect(onReset).toHaveBeenCalledWith([{ id: 2 }]);
    expect(r.getPhase()).toBe('loading');
    expect(r.getRowCount()).toBe(1);
  });

  it('commits buffered rows on ready after error when loading was missed', async () => {
    const onSnapshotReady = vi.fn();
    const r = new SnapshotReassembler<{ id: number }>({ onSnapshotReady });

    r.onDelta([{ id: 1 }], true);
    r.onStatus('ready');
    await Promise.resolve();
    r.onStatus('error', 'boom');
    r.onDelta([{ id: 2 }], true);
    r.onStatus('ready');
    await Promise.resolve();

    expect(onSnapshotReady).toHaveBeenLastCalledWith([{ id: 2 }]);
    expect(r.isSettled()).toBe(true);
  });

  it('assembles cache refresh replay without disturbing settled state', async () => {
    const onSnapshotReady = vi.fn();
    const onCacheRefresh = vi.fn<(rows: readonly { id: number }[]) => void>();
    const onReset = vi.fn();
    const onTick = vi.fn();
    const r = new SnapshotReassembler<{ id: number }>({
      onSnapshotReady,
      onCacheRefresh,
      onReset,
      onTick,
    });

    r.onDelta([{ id: 1 }], true);
    r.onStatus('ready');
    await Promise.resolve();
    expect(r.isSettled()).toBe(true);

    r.beginCacheRefresh();
    r.onStatus('loading');
    r.onDelta(chunk(0, CHUNK), true);
    r.onDelta(chunk(CHUNK, CHUNK), false);
    r.onStatus('ready');
    await Promise.resolve();

    expect(onCacheRefresh).toHaveBeenCalledTimes(1);
    expect(onCacheRefresh.mock.calls[0]![0]).toHaveLength(CHUNK * 2);
    expect(onReset).not.toHaveBeenCalled();
    expect(r.isSettled()).toBe(true);
    expect(r.getPhase()).toBe('ready');

    r.onDelta([{ id: 99 }], false);
    expect(onTick).toHaveBeenCalledWith([{ id: 99 }]);
  });
});
