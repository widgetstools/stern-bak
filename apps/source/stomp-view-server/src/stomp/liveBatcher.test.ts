import { describe, expect, it } from 'vitest';
import { createRateBudgetBatcher } from './liveBatcher.js';

/** Fake clock: each call to the batcher advances time by `stepMs`. */
function clock(start: number, stepMs: number): () => number {
  let t = start - stepMs; // batcher creation lands on `start - stepMs`; first tick on `start`
  return () => (t += stepMs);
}

function batcher(
  overrides: Partial<Parameters<typeof createRateBudgetBatcher<number>>[0]> = {},
) {
  return createRateBudgetBatcher<number>({
    rowCount: 20_000,
    rowsPerSec: 10_000,
    maxRowsPerFrame: 2_000,
    tickRow: (i) => i,
    ...overrides,
  });
}

describe('createRateBudgetBatcher', () => {
  it('honours the requested aggregate rate exactly across ticks', () => {
    // 10 000 rows/sec at 40 ms ticks → 400 rows per tick.
    const next = batcher({ now: clock(0, 40) });
    let total = 0;
    for (let tick = 0; tick < 25; tick++) total += next().length; // 1 second
    expect(total).toBe(10_000);
  });

  it('carries fractional budget instead of dropping it', () => {
    // 30 rows/sec at 40 ms ticks → 1.2 rows/tick: 1,1,1,1,2 repeating.
    const next = batcher({ rowsPerSec: 30, now: clock(0, 40) });
    const sizes = Array.from({ length: 25 }, () => next().length);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(30);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(2);
  });

  it('emits nothing until the budget reaches one row', () => {
    // 5 rows/sec at 40 ms ticks → a row roughly every 5 ticks.
    const next = batcher({ rowsPerSec: 5, now: clock(0, 40) });
    const sizes = Array.from({ length: 25 }, () => next().length);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(5);
    expect(sizes.filter((n) => n === 0).length).toBe(20);
  });

  it('caps a single frame at maxRowsPerFrame and carries the remainder', () => {
    // One 1 s gap owes 10 000 rows; frames cap at 2 000.
    const next = batcher({ now: clock(0, 1000) });
    expect(next().length).toBe(2_000);
    // The carried 8 000 plus the next second's accrual is still frame-capped.
    expect(next().length).toBe(2_000);
  });

  it('caps catch-up after a stall at one second of updates', () => {
    // 10 s gap must NOT replay 100 000 rows — budget caps at rowsPerSec.
    const next = batcher({
      maxRowsPerFrame: 50_000,
      rowsPerSec: 3_000,
      now: clock(0, 10_000),
    });
    expect(next().length).toBe(3_000);
  });

  it('spreads updates randomly across the whole row set', () => {
    const seen = new Set<number>();
    const next = batcher({
      rowCount: 1_000,
      rowsPerSec: 5_000,
      maxRowsPerFrame: 5_000,
      tickRow: (i) => i,
      now: clock(0, 200),
    });
    for (let tick = 0; tick < 10; tick++) {
      for (const i of next()) seen.add(i);
    }
    // 10 000 random draws over 1 000 rows — near-full coverage, and
    // both halves of the index space are hit.
    expect(seen.size).toBeGreaterThan(900);
    expect([...seen].some((i) => i < 500)).toBe(true);
    expect([...seen].some((i) => i >= 500)).toBe(true);
  });

  it('never emits more distinct rows than exist', () => {
    const next = batcher({
      rowCount: 3,
      rowsPerSec: 1_000,
      now: clock(0, 1000),
    });
    expect(next().length).toBeLessThanOrEqual(3);
  });

  it('skips rows whose tickRow returns null without failing the frame', () => {
    const next = batcher({
      rowCount: 100,
      rowsPerSec: 100,
      tickRow: (i) => (i % 2 === 0 ? i : null),
      now: clock(0, 1000),
    });
    const frame = next();
    expect(frame.every((i) => i % 2 === 0)).toBe(true);
  });

  it('returns empty for an empty record set or zero rate', () => {
    expect(batcher({ rowCount: 0 })()).toEqual([]);
    expect(batcher({ rowsPerSec: 0 })()).toEqual([]);
  });
});
