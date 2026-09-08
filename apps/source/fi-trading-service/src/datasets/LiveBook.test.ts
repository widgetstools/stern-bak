import { describe, expect, it } from 'vitest';
import { SNAPSHOT_END_TOKEN, LEGACY_SNAPSHOT_END_TOKEN } from '../wire/contract.js';
import { assertNoSentinelCollision } from './sentinel.js';
import { LiveBook } from './LiveBook.js';

/** One small book, shared: building is deterministic and not free. */
const book = new LiveBook({ seed: 20260907, scaleMultiplier: 0.15, ticksPerSession: 20 });

async function collect(source: LiveBook, batchSize: number): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for await (const batch of source.snapshot(batchSize)) {
    out.push(...(batch as Record<string, unknown>[]));
  }
  return out;
}

describe('LiveBook', () => {
  it('serves the positions dataset keyed by position id', () => {
    expect(book.dataset).toBe('positions');
    expect(book.keyColumn).toBe('positionId');
    expect(book.size()).toBeGreaterThan(0);
  });

  it('delivers every row exactly once across snapshot batches', async () => {
    const rows = await collect(book, 37);
    expect(rows).toHaveLength(book.size());
    expect(new Set(rows.map((row) => row.positionId)).size).toBe(book.size());
  });

  it('never emits a value that would truncate the snapshot at the client', () => {
    expect(() =>
      assertNoSentinelCollision(book.allRows() as Record<string, unknown>[], [
        SNAPSHOT_END_TOKEN, LEGACY_SNAPSHOT_END_TOKEN,
      ]),
    ).not.toThrow();
  });

  it('scales with the multiplier', () => {
    const small = new LiveBook({ seed: 1, scaleMultiplier: 0.1, ticksPerSession: 5 });
    const large = new LiveBook({ seed: 1, scaleMultiplier: 0.3, ticksPerSession: 5 });
    expect(large.size()).toBeGreaterThan(small.size());
  });

  it('is deterministic for a seed', () => {
    const a = new LiveBook({ seed: 99, scaleMultiplier: 0.1, ticksPerSession: 5 });
    const b = new LiveBook({ seed: 99, scaleMultiplier: 0.1, ticksPerSession: 5 });
    expect(a.positions()).toEqual(b.positions());
  });
});

describe('tick', () => {
  it('publishes a subset, not the whole book, on any one tick', () => {
    const source = new LiveBook({ seed: 4, scaleMultiplier: 0.15, ticksPerSession: 50 });
    const quoted = source.tick(100_000);
    expect(quoted).toBeGreaterThan(0);
    expect(quoted).toBeLessThan(source.size());
  });

  it('respects the cap it is given', () => {
    const source = new LiveBook({ seed: 4, scaleMultiplier: 0.15, ticksPerSession: 50 });
    expect(source.tick(7)).toBe(7);
    expect(source.pendingLive()).toBe(7);
    expect(source.tick(0)).toBe(0);
  });

  it('moves prices — the factors advance within the session', () => {
    const source = new LiveBook({ seed: 8, scaleMultiplier: 0.15, ticksPerSession: 40 });
    const before = source.positions().map((row) => row.midPrice as number);
    for (let i = 0; i < 12; i++) source.tick(100_000);
    const after = source.positions().map((row) => row.midPrice as number);
    expect(after).not.toEqual(before);
  });

  it('reaches the whole book, not just the front of it', () => {
    // Starting the scan at index 0 every tick and stopping at the budget meant
    // the first few hundred positions were quoted over and over while the tail
    // never ticked: 24,000 updates carrying 229 distinct keys.
    const source = new LiveBook({ seed: 31, scaleMultiplier: 0.3, ticksPerSession: 400 });
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) {
      source.tick(50);
      for (const row of source.drainLive(100_000)) seen.add(row.positionId as string);
    }
    // A 50-row budget over 60 ticks cannot touch everything, but it must reach
    // far more than the 50 nearest the front.
    expect(seen.size).toBeGreaterThan(source.size() * 0.5);
  });

  it('reaches almost every position given enough ticks', () => {
    // Not ALL of them: the least liquid tail sits at the 0.04 quote floor, so
    // over 400 ticks a handful legitimately never print. That is the point of
    // the floor — an off-the-run CLO tranche does not trade every minute.
    const source = new LiveBook({ seed: 33, scaleMultiplier: 0.15, ticksPerSession: 2000 });
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) {
      source.tick(100);
      for (const row of source.drainLive(100_000)) seen.add(row.positionId as string);
    }
    expect(seen.size).toBeGreaterThan(source.size() * 0.97);
  });

  it('quotes a Treasury more often than a high yield bond over many ticks', () => {
    const source = new LiveBook({ seed: 12, scaleMultiplier: 0.3, ticksPerSession: 400 });
    const counts = new Map<string, number>();
    for (let i = 0; i < 120; i++) {
      source.tick(100_000);
      for (const row of source.drainLive(100_000)) {
        const key = row.assetClass as string;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    const rows = source.positions();
    const share = (assetClass: string): number =>
      (counts.get(assetClass) ?? 0) / Math.max(1, rows.filter((r) => r.assetClass === assetClass).length);
    expect(share('Rates')).toBeGreaterThan(share('CorpHY'));
  });

  it('lands exactly on the daily close when the session rolls over', () => {
    const source = new LiveBook({ seed: 16, scaleMultiplier: 0.15, ticksPerSession: 6 });
    const close = source.factorState();
    for (let i = 0; i < 5; i++) source.tick(100_000);
    const midSession = source.positions().map((row) => row.midPrice as number);

    source.tick(100_000); // the roll
    const atClose = source.positions().map((row) => row.midPrice as number);
    expect(atClose).not.toEqual(midSession);

    // The state advanced, and the session opened from the close it landed on.
    expect(source.factorState().asOf).toBeGreaterThan(close.asOf);
  });

  it('advances to a business day, never onto a weekend or a holiday', () => {
    const source = new LiveBook({ asOf: 20261120, seed: 20, scaleMultiplier: 0.1, ticksPerSession: 2 });
    const seen: number[] = [];
    for (let i = 0; i < 20; i++) {
      source.tick(10);
      seen.push(source.factorState().asOf);
    }
    // Thanksgiving 2026 is 26 November; the market is shut that day.
    expect(seen).not.toContain(20261126);
    expect(seen.some((date) => date > 20261126)).toBe(true);
  });
});

describe('drainLive', () => {
  it('hands each dirty row out once and then reports nothing pending', () => {
    const source = new LiveBook({ seed: 24, scaleMultiplier: 0.15, ticksPerSession: 30 });
    source.tick(40);
    const drained = source.drainLive(1000);
    expect(drained).toHaveLength(40);
    expect(new Set(drained.map((row) => row.positionId)).size).toBe(40);
    expect(source.pendingLive()).toBe(0);
    expect(source.drainLive(1000)).toHaveLength(0);
  });

  it('drains in instalments when the wire has a small budget', () => {
    const source = new LiveBook({ seed: 28, scaleMultiplier: 0.15, ticksPerSession: 30 });
    source.tick(30);
    expect(source.drainLive(12)).toHaveLength(12);
    expect(source.pendingLive()).toBe(18);
    expect(source.drainLive(0)).toHaveLength(0);
  });
});
