import { describe, expect, it } from 'vitest';

import { LiveBatcher } from './liveBatcher.js';

describe('LiveBatcher', () => {
  it('grants nothing on the first call, which only starts the clock', () => {
    const batcher = new LiveBatcher(1000);
    expect(batcher.take(0)).toBe(0);
  });

  it('honours the rate exactly over many small ticks', () => {
    const batcher = new LiveBatcher(1000);
    batcher.take(0);
    let total = 0;
    for (let t = 40; t <= 1000; t += 40) total += batcher.take(t);
    expect(total).toBe(1000);
  });

  it('carries the fractional remainder rather than truncating it away', () => {
    // 10 rows/sec over 40ms ticks is 0.4 rows each - naive flooring yields 0.
    const batcher = new LiveBatcher(10);
    batcher.take(0);
    let total = 0;
    for (let t = 40; t <= 1000; t += 40) total += batcher.take(t);
    expect(total).toBe(10);
  });

  it('caps carry so a long stall cannot become a stampede', () => {
    const batcher = new LiveBatcher(1000);
    batcher.take(0);
    expect(batcher.take(30_000)).toBe(1000);
  });

  it('respects a custom carry ceiling', () => {
    const batcher = new LiveBatcher(1000, { maxCarrySeconds: 2 });
    batcher.take(0);
    expect(batcher.take(30_000)).toBe(2000);
  });

  it('grants nothing at rate 0 but keeps the clock moving', () => {
    const batcher = new LiveBatcher(0);
    batcher.take(0);
    expect(batcher.take(5000)).toBe(0);
  });

  it('ignores a clock that goes backwards', () => {
    const batcher = new LiveBatcher(1000);
    batcher.take(1000);
    expect(batcher.take(500)).toBe(0);
  });

  it('reset drops accumulated budget', () => {
    const batcher = new LiveBatcher(1000);
    batcher.take(0);
    batcher.reset(5000);
    expect(batcher.take(5040)).toBe(40);
  });

  it('setRate clamps negatives to zero', () => {
    const batcher = new LiveBatcher(100);
    batcher.setRate(-5);
    expect(batcher.rate).toBe(0);
  });
});
