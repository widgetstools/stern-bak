import { describe, expect, it } from 'vitest';
import { createRateBudgetBatcher } from './liveBatcher.js';

/** Fake clock: each call to the batcher advances time by `stepMs`. */
function clock(start: number, stepMs: number): () => number {
  let t = start - stepMs; // batcher creation lands on `start - stepMs`; first tick on `start`
  return () => (t += stepMs);
}

/** Deterministic LCG so skew/burst assertions are reproducible. */
function lcg(seed = 42): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function batcher(
  overrides: Partial<Parameters<typeof createRateBudgetBatcher<number>>[0]> = {},
) {
  return createRateBudgetBatcher<number>({
    rowCount: 20_000,
    rowsPerSec: 10_000,
    maxRowsPerFrame: 2_000,
    tickRow: (i) => i,
    random: lcg(),
    ...overrides,
  });
}

/** Sum of generated updates across n ticks. */
function generatedOver(next: () => { updatesGenerated: number }, n: number): number {
  let total = 0;
  for (let i = 0; i < n; i++) total += next().updatesGenerated;
  return total;
}

describe('createRateBudgetBatcher — rate contract (rate = GENERATED updates/sec)', () => {
  it('honours the requested aggregate rate exactly across ticks', () => {
    // 10 000 updates/sec at 40 ms ticks over 1 s. Bursts move updates
    // between ticks but the budget only mints rate x elapsed, so the
    // 1 s total is exact.
    const next = batcher({ now: clock(0, 40) });
    // Bursts may hold back at most ~one tick's worth at the window edge.
    const total = generatedOver(next, 25);
    expect(total).toBeGreaterThan(9_400);
    expect(total).toBeLessThanOrEqual(10_000);
  });

  it('carries fractional budget instead of dropping it', () => {
    const next = batcher({ rowsPerSec: 30, now: clock(0, 40) });
    const total = generatedOver(next, 25);
    expect(total).toBeGreaterThanOrEqual(27);
    expect(total).toBeLessThanOrEqual(30);
  });

  it('ships at most as many rows as updates generated (conflation)', () => {
    const next = batcher({ now: clock(0, 40) });
    for (let tick = 0; tick < 25; tick++) {
      const { payloads, updatesGenerated } = next();
      expect(payloads.length).toBeLessThanOrEqual(updatesGenerated);
    }
  });

  it('caps a single frame at maxRowsPerFrame of GENERATED updates and carries the rest', () => {
    const next = batcher({ now: clock(0, 1000) });
    expect(next().updatesGenerated).toBe(2_000);
    expect(next().updatesGenerated).toBe(2_000);
  });

  it('caps catch-up after a stall at one second of updates', () => {
    const next = batcher({
      maxRowsPerFrame: 50_000,
      rowsPerSec: 3_000,
      now: clock(0, 10_000),
    });
    // The 1 s budget clamp bounds the replay; the burst factor floors it.
    const first = next().updatesGenerated;
    expect(first).toBeLessThanOrEqual(3_000);
    expect(first).toBeGreaterThanOrEqual(750);
  });

  it('returns empty for an empty record set or zero rate', () => {
    expect(batcher({ rowCount: 0 })().payloads).toEqual([]);
    expect(batcher({ rowsPerSec: 0 })().payloads).toEqual([]);
  });
});

describe('createRateBudgetBatcher — bursty, skewed arrivals', () => {
  it('tick sizes vary around the nominal per-tick rate (bursts), not a flat line', () => {
    const next = batcher({ now: clock(0, 40) });
    const sizes = Array.from({ length: 100 }, () => next().updatesGenerated);
    // Nominal is 400/tick. A real burst profile has meaningfully quiet
    // AND heavy ticks; the old batcher produced exactly 400 every time.
    expect(Math.min(...sizes)).toBeLessThan(320);
    expect(Math.max(...sizes)).toBeGreaterThan(480);
    // Long-run average still the requested rate (budget-preserving).
    const total = sizes.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(39_000); // 100 ticks = 4 s => 40 000
    expect(total).toBeLessThanOrEqual(40_000);
  });

  it('concentrates updates on hot rows (skew), while the tail still ticks', () => {
    const counts = new Map<number, number>();
    const next = batcher({
      rowCount: 10_000,
      rowsPerSec: 10_000,
      maxRowsPerFrame: 10_000,
      now: clock(0, 200),
      // Count GENERATED updates: shipped payloads are conflated per frame,
      // which caps a hot row at one count per tick and hides the skew.
      tickRow: (i) => {
        counts.set(i, (counts.get(i) ?? 0) + 1);
        return i;
      },
    });
    for (let tick = 0; tick < 50; tick++) next();
    // ~100k draws over 10k rows. Top 1% of rows by hits should carry a
    // wildly disproportionate share; uniform would give them ~1%.
    const sorted = [...counts.values()].sort((a, b) => b - a);
    const total = sorted.reduce((a, b) => a + b, 0);
    const top1pct = sorted.slice(0, 100).reduce((a, b) => a + b, 0);
    expect(top1pct / total).toBeGreaterThan(0.2);
    // But it is a skew, not a lockout: a majority of rows still ticked.
    expect(counts.size).toBeGreaterThan(3_000);
  });

  it('hot rows are a stable random subset, not simply the first indices', () => {
    const next = batcher({
      rowCount: 10_000,
      rowsPerSec: 10_000,
      maxRowsPerFrame: 10_000,
      now: clock(0, 500),
    });
    const seen = new Set<number>();
    for (let tick = 0; tick < 20; tick++) {
      for (const i of next().payloads) seen.add(i);
    }
    // If skew simply favoured low indices, high indices would be absent.
    expect([...seen].some((i) => i >= 5_000)).toBe(true);
    expect([...seen].some((i) => i < 5_000)).toBe(true);
  });
});

describe('createRateBudgetBatcher — key conflation within a frame', () => {
  it('collapses duplicate draws of one row into one shipped payload, last tick applied', () => {
    // One row: every generated update hits it; exactly one payload ships.
    let ticks = 0;
    const next = createRateBudgetBatcher<number>({
      rowCount: 1,
      rowsPerSec: 500,
      maxRowsPerFrame: 2_000,
      tickRow: () => ++ticks,
      random: () => 0.632120558, // -ln(1-u) = 1 -> spend exactly nominal
      now: clock(0, 1000),
    });
    const { payloads, updatesGenerated } = next();
    expect(updatesGenerated).toBe(500);
    expect(ticks).toBe(500); // every generated update mutated the row
    expect(payloads).toEqual([500]); // last payload won
  });

  it('merges duplicate payloads with mergePayloads when supplied (sparse deltas)', () => {
    const next = createRateBudgetBatcher<Record<string, number>>({
      rowCount: 1,
      rowsPerSec: 3,
      maxRowsPerFrame: 10,
      tickRow: (() => {
        let n = 0;
        return () => {
          n += 1;
          return { [`f${n}`]: n };
        };
      })(),
      mergePayloads: (prev, nextP) => ({ ...prev, ...nextP }),
      random: () => 0.632120558,
      now: clock(0, 1000),
    });
    const { payloads } = next();
    // Three updates to the same row in one window: fields union, one row.
    expect(payloads).toEqual([{ f1: 1, f2: 2, f3: 3 }]);
  });

  it('skips rows whose tickRow returns null without failing the frame', () => {
    const next = batcher({
      rowCount: 100,
      rowsPerSec: 100,
      tickRow: (i) => (i % 2 === 0 ? i : null),
      now: clock(0, 1000),
    });
    const { payloads } = next();
    expect(payloads.every((i) => i % 2 === 0)).toBe(true);
  });
});
