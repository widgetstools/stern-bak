import { describe, it, expect, vi } from 'vitest';
import { bufferedDispatch } from './bufferedDispatch.js';

type Row = { id: number; name: string };

function withFakeTimer() {
  let scheduled: (() => void) | null = null;
  const setTimer = vi.fn((cb: () => void, _ms: number) => {
    scheduled = cb;
    return 'tok';
  });
  const clearTimer = vi.fn(() => { scheduled = null; });
  const fire = (): void => { scheduled?.(); scheduled = null; };
  return { setTimer, clearTimer, fire };
}

describe('bufferedDispatch — passthrough mode', () => {
  it('flushes immediately when throttleMs is unset', () => {
    const flush = vi.fn();
    const h = bufferedDispatch<Row>({ flush });
    h.push([{ id: 1, name: 'a' }]);
    h.push([{ id: 2, name: 'b' }]);
    expect(flush).toHaveBeenCalledTimes(2);
    expect(flush.mock.calls[0]?.[0]).toEqual([{ id: 1, name: 'a' }]);
  });

  it('flushes immediately when throttleMs is 0', () => {
    const flush = vi.fn();
    const h = bufferedDispatch<Row>({ flush, throttleMs: 0 });
    h.push([{ id: 1, name: 'a' }]);
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('push of empty array is a no-op', () => {
    const flush = vi.fn();
    const h = bufferedDispatch<Row>({ flush });
    h.push([]);
    expect(flush).not.toHaveBeenCalled();
  });
});

describe('bufferedDispatch — throttled mode', () => {
  it('coalesces multiple pushes into one flush per window', () => {
    const flush = vi.fn();
    const t = withFakeTimer();
    const h = bufferedDispatch<Row>({
      flush, throttleMs: 100, setTimer: t.setTimer, clearTimer: t.clearTimer,
    });

    h.push([{ id: 1, name: 'a' }]);
    h.push([{ id: 2, name: 'b' }]);
    h.push([{ id: 3, name: 'c' }]);
    expect(flush).not.toHaveBeenCalled();
    expect(t.setTimer).toHaveBeenCalledTimes(1);

    t.fire();

    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush.mock.calls[0]?.[0]).toHaveLength(3);
  });

  it('schedules a fresh timer after each flush', () => {
    const flush = vi.fn();
    const t = withFakeTimer();
    const h = bufferedDispatch<Row>({
      flush, throttleMs: 50, setTimer: t.setTimer, clearTimer: t.clearTimer,
    });

    h.push([{ id: 1, name: 'a' }]);
    t.fire();
    h.push([{ id: 2, name: 'b' }]);
    t.fire();
    expect(flush).toHaveBeenCalledTimes(2);
  });

  it('flushNow drains immediately and cancels the pending timer', () => {
    const flush = vi.fn();
    const t = withFakeTimer();
    const h = bufferedDispatch<Row>({
      flush, throttleMs: 100, setTimer: t.setTimer, clearTimer: t.clearTimer,
    });

    h.push([{ id: 1, name: 'a' }]);
    h.flushNow();

    expect(flush).toHaveBeenCalledTimes(1);
    expect(t.clearTimer).toHaveBeenCalled();
  });

  it('teardown cancels pending flush and drops the buffer', () => {
    const flush = vi.fn();
    const t = withFakeTimer();
    const h = bufferedDispatch<Row>({
      flush, throttleMs: 100, setTimer: t.setTimer, clearTimer: t.clearTimer,
    });

    h.push([{ id: 1, name: 'a' }]);
    h.teardown();

    // The pending timer was cleared, no flush happens.
    expect(flush).not.toHaveBeenCalled();
    expect(t.clearTimer).toHaveBeenCalled();
  });
});

describe('bufferedDispatch — maxBufferedRows size cap', () => {
  it('flushes synchronously from push() the moment the cap is reached', () => {
    const flush = vi.fn();
    const t = withFakeTimer();
    const h = bufferedDispatch<Row>({
      flush, throttleMs: 100, maxBufferedRows: 3,
      setTimer: t.setTimer, clearTimer: t.clearTimer,
    });

    h.push([{ id: 1, name: 'a' }]);
    h.push([{ id: 2, name: 'b' }]);
    expect(flush).not.toHaveBeenCalled();

    // Third row hits the cap — flush fires WITHOUT the timer, and the
    // pending timer is cancelled so the window doesn't double-fire.
    h.push([{ id: 3, name: 'c' }]);
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush.mock.calls[0]?.[0]).toHaveLength(3);
    expect(t.clearTimer).toHaveBeenCalled();
  });

  it('keeps batches bounded when the timer never fires (starved thread)', () => {
    const flush = vi.fn();
    const t = withFakeTimer();
    const h = bufferedDispatch<Row>({
      flush, throttleMs: 100, maxBufferedRows: 2,
      setTimer: t.setTimer, clearTimer: t.clearTimer,
    });

    // Six rows arrive with the timer never serviced — the cap turns
    // them into three bounded flushes instead of one mega-batch.
    for (let i = 1; i <= 6; i++) h.push([{ id: i, name: `r${i}` }]);
    expect(flush).toHaveBeenCalledTimes(3);
    for (const call of flush.mock.calls) {
      expect((call[0] as Row[]).length).toBeLessThanOrEqual(2);
    }
  });

  it('counts unique keys under conflation — same-key churn never triggers the cap', () => {
    const flush = vi.fn();
    const t = withFakeTimer();
    const h = bufferedDispatch<Row>({
      flush, throttleMs: 100, maxBufferedRows: 3, conflateKeyFn: (r) => r.id,
      setTimer: t.setTimer, clearTimer: t.clearTimer,
    });

    // 10 updates for the same 2 keys — buffer size stays 2, below the cap.
    for (let i = 0; i < 10; i++) h.push([{ id: i % 2, name: `v${i}` }]);
    expect(flush).not.toHaveBeenCalled();

    t.fire();
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush.mock.calls[0]?.[0]).toHaveLength(2);
  });

  it('cap flush is ignored in passthrough mode (throttleMs unset)', () => {
    const flush = vi.fn();
    const h = bufferedDispatch<Row>({ flush, maxBufferedRows: 1 });
    h.push([{ id: 1, name: 'a' }, { id: 2, name: 'b' }]);
    // Passthrough forwards the batch as-is; the cap changes nothing.
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush.mock.calls[0]?.[0]).toHaveLength(2);
  });
});

describe('bufferedDispatch — conflate-by-key', () => {
  it('upserts by key — last write wins within a window', () => {
    const flush = vi.fn();
    const t = withFakeTimer();
    const h = bufferedDispatch<Row>({
      flush,
      throttleMs: 100,
      conflateKeyFn: (r) => r.id,
      setTimer: t.setTimer,
      clearTimer: t.clearTimer,
    });

    h.push([{ id: 1, name: 'a' }]);
    h.push([{ id: 1, name: 'b' }]); // overwrites 1
    h.push([{ id: 2, name: 'c' }]);
    h.push([{ id: 1, name: 'd' }]); // overwrites 1 again

    t.fire();

    expect(flush).toHaveBeenCalledTimes(1);
    const out = flush.mock.calls[0]?.[0] as Row[];
    expect(out).toHaveLength(2);
    const byId = Object.fromEntries(out.map((r) => [r.id, r.name]));
    expect(byId[1]).toBe('d');
    expect(byId[2]).toBe('c');
  });

  it('starts fresh after each flush — values from previous windows do not leak', () => {
    const flush = vi.fn();
    const t = withFakeTimer();
    const h = bufferedDispatch<Row>({
      flush, throttleMs: 100, conflateKeyFn: (r) => r.id,
      setTimer: t.setTimer, clearTimer: t.clearTimer,
    });

    h.push([{ id: 1, name: 'a' }]);
    t.fire();

    h.push([{ id: 2, name: 'b' }]);
    t.fire();

    expect(flush).toHaveBeenCalledTimes(2);
    expect((flush.mock.calls[1]?.[0] as Row[])).toEqual([{ id: 2, name: 'b' }]);
  });

  it('keeps rows with a null key un-conflated (order preserved)', () => {
    const flush = vi.fn();
    const t = withFakeTimer();
    const h = bufferedDispatch<{ id: number | null; name: string }>({
      flush, throttleMs: 100, conflateKeyFn: (r) => r.id,
      setTimer: t.setTimer, clearTimer: t.clearTimer,
    });

    h.push([{ id: null, name: 'x' }]);
    h.push([{ id: null, name: 'y' }]);
    t.fire();

    const out = flush.mock.calls[0]?.[0] as { name: string }[];
    expect(out.map((r) => r.name)).toEqual(['x', 'y']);
  });
});
