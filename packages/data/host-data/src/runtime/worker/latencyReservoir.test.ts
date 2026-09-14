import { describe, expect, it } from 'vitest';
import { LatencyReservoir } from './latencyReservoir.js';

describe('LatencyReservoir', () => {
  it('is empty until a sample lands', () => {
    expect(new LatencyReservoir().summary()).toEqual({ n: 0, totalMs: 0, p50: null, p99: null, max: null });
  });

  it('reports count, total and percentiles over the retained samples', () => {
    const r = new LatencyReservoir(8);
    for (const ms of [1, 2, 3, 4, 5, 6, 7, 8]) r.record(ms);
    expect(r.summary()).toEqual({ n: 8, totalMs: 36, p50: 5, p99: 8, max: 8 });
  });

  it('keeps the running count and total past the window but percentiles over the last `capacity` only', () => {
    const r = new LatencyReservoir(4);
    for (const ms of [100, 100, 100, 100]) r.record(ms);
    for (const ms of [1, 2, 3, 4]) r.record(ms);
    const s = r.summary();
    expect(s.n).toBe(8);
    expect(s.totalMs).toBe(410);
    expect(s.max).toBe(4);
    expect(s.p50).toBe(3);
  });

  it('rounds to a tenth of a millisecond', () => {
    const r = new LatencyReservoir();
    r.record(0.123456);
    expect(r.summary()).toMatchObject({ p50: 0.1, max: 0.1, totalMs: 0.1 });
  });
});
