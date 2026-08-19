import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBlockRequestLimiter } from './blockRequestLimiter.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('createBlockRequestLimiter', () => {
  it('runs tasks immediately while under the cap', () => {
    const limiter = createBlockRequestLimiter(4);
    const ran = vi.fn();

    limiter.schedule(ran);
    limiter.schedule(ran);
    limiter.schedule(ran);
    limiter.schedule(ran);

    expect(ran).toHaveBeenCalledTimes(4);
  });

  it('queues the 5th task in a burst rather than running it immediately', () => {
    const limiter = createBlockRequestLimiter(4);
    const ran = vi.fn();

    for (let i = 0; i < 5; i++) limiter.schedule(ran);

    expect(ran).toHaveBeenCalledTimes(4);
    vi.advanceTimersByTime(1000);
    expect(ran).toHaveBeenCalledTimes(5);
  });

  it('never exceeds the cap in any rolling 1s window under sustained load', () => {
    const limiter = createBlockRequestLimiter(4);
    const timestamps: number[] = [];
    const start = Date.now();

    // 30 requests fired one every 50ms (20/sec) — far faster than the 4/sec
    // cap, so most queue up. Feeding 30 at 20/sec while draining at 4/sec
    // takes roughly 30/4 = 7.5s total to fully empty; advance well past that.
    for (let i = 0; i < 30; i++) {
      limiter.schedule(() => timestamps.push(Date.now()));
      vi.advanceTimersByTime(50);
    }
    vi.advanceTimersByTime(10_000); // drain whatever's left queued

    expect(timestamps).toHaveLength(30); // nothing dropped, all eventually ran

    // Slide a 1000ms window across the recorded dispatch times and confirm
    // no window ever contains more than 4.
    for (const t of timestamps) {
      const inWindow = timestamps.filter((x) => x >= t && x < t + 1000).length;
      expect(inWindow).toBeLessThanOrEqual(4);
    }
    // Sanity: the whole run took meaningfully longer than the naive
    // "30 requests at 50ms apart" 1500ms, because the cap forced queuing.
    const totalSpanMs = timestamps[timestamps.length - 1]! - start;
    expect(totalSpanMs).toBeGreaterThan(1500);
  });

  it('runs tasks in FIFO order', () => {
    const limiter = createBlockRequestLimiter(2);
    const order: number[] = [];
    for (let i = 0; i < 5; i++) limiter.schedule(() => order.push(i));
    vi.advanceTimersByTime(3000);
    expect(order).toEqual([0, 1, 2, 3, 4]);
  });

  it('a fresh burst after the window has fully drained runs immediately again', () => {
    const limiter = createBlockRequestLimiter(4);
    const ran = vi.fn();
    for (let i = 0; i < 4; i++) limiter.schedule(ran);
    expect(ran).toHaveBeenCalledTimes(4);

    vi.advanceTimersByTime(1100); // let the whole window clear
    ran.mockClear();
    for (let i = 0; i < 4; i++) limiter.schedule(ran);
    expect(ran).toHaveBeenCalledTimes(4);
  });
});
