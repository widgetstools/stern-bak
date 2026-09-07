import { describe, expect, it } from 'vitest';

import { LEGACY_SNAPSHOT_END_TOKEN, SNAPSHOT_END_TOKEN } from '../wire/contract.js';
import { assertNoSentinelCollision, SyntheticBook } from './SyntheticBook.js';

async function collect(book: SyntheticBook, batchSize: number): Promise<unknown[]> {
  const out: unknown[] = [];
  for await (const batch of book.snapshot(batchSize)) out.push(...batch);
  return out;
}

describe('SyntheticBook', () => {
  it('is deterministic for a given seed and differs across seeds', async () => {
    const a = await collect(new SyntheticBook({ rowCount: 50, seed: 1 }), 50);
    const b = await collect(new SyntheticBook({ rowCount: 50, seed: 1 }), 50);
    const c = await collect(new SyntheticBook({ rowCount: 50, seed: 2 }), 50);
    // lastUpdate is wall-clock, so compare everything else.
    const strip = (rows: unknown[]) =>
      rows.map((r) => {
        const { lastUpdate: _lastUpdate, maturityDate: _maturityDate, ...rest } =
          r as Record<string, unknown>;
        return rest;
      });
    expect(strip(a)).toEqual(strip(b));
    expect(strip(a)).not.toEqual(strip(c));
  });

  it('gives every row a unique key', async () => {
    const book = new SyntheticBook({ rowCount: 2000, seed: 3 });
    const rows = (await collect(book, 500)) as { positionId: string }[];
    expect(rows).toHaveLength(2000);
    expect(new Set(rows.map((r) => r.positionId)).size).toBe(2000);
  });

  it('yields the last partial batch', async () => {
    const book = new SyntheticBook({ rowCount: 250, seed: 3 });
    const sizes: number[] = [];
    for await (const batch of book.snapshot(100)) sizes.push(batch.length);
    expect(sizes).toEqual([100, 100, 50]);
  });

  it('starts with nothing pending and reports what a tick dirtied', () => {
    const book = new SyntheticBook({ rowCount: 100, seed: 4 });
    expect(book.pendingLive()).toBe(0);
    book.tick(10);
    expect(book.pendingLive()).toBeGreaterThan(0);
    expect(book.pendingLive()).toBeLessThanOrEqual(10);
  });

  it('drains at most the requested rows and clears what it handed over', () => {
    const book = new SyntheticBook({ rowCount: 500, seed: 5 });
    book.tick(200);
    const pending = book.pendingLive();
    const first = book.drainLive(50);
    expect(first).toHaveLength(50);
    expect(book.pendingLive()).toBe(pending - 50);
    book.drainLive(pending);
    expect(book.pendingLive()).toBe(0);
    expect(book.drainLive(10)).toEqual([]);
  });

  it('never repeats a key within one drain, so the hub can skip dedupe', () => {
    const book = new SyntheticBook({ rowCount: 300, seed: 6 });
    book.tick(300);
    const rows = book.drainLive(1000);
    expect(new Set(rows.map((r) => r.positionId)).size).toBe(rows.length);
  });

  it('returns nothing for a non-positive drain', () => {
    const book = new SyntheticBook({ rowCount: 10, seed: 6 });
    book.tick(5);
    expect(book.drainLive(0)).toEqual([]);
  });

  it('actually reprices the rows it ticks', () => {
    const book = new SyntheticBook({ rowCount: 200, seed: 8 });
    const before = new Map(book.allRows().map((r) => [r.positionId, r.midPrice]));
    book.tick(200);
    const changed = book
      .drainLive(1000)
      .filter((r) => before.get(r.positionId) !== r.midPrice);
    expect(changed.length).toBeGreaterThan(0);
  });

  it('keeps market value consistent with the repriced mid', () => {
    const book = new SyntheticBook({ rowCount: 100, seed: 9 });
    book.tick(100);
    for (const row of book.drainLive(1000)) {
      const expected = Number(
        (((row.midPrice as number) / 100) * (row.quantityFace as number)).toFixed(2),
      );
      expect(row.marketValue).toBe(expected);
    }
  });

  it('tolerates an empty book', () => {
    const book = new SyntheticBook({ rowCount: 0, seed: 1 });
    expect(book.tick(10)).toBe(0);
    expect(book.size()).toBe(0);
  });

  it('caps a tick at the book size', () => {
    const book = new SyntheticBook({ rowCount: 5, seed: 1 });
    expect(book.tick(50)).toBe(5);
  });
});

describe('assertNoSentinelCollision', () => {
  it('passes for the generated book - no row may contain an end token', () => {
    const book = new SyntheticBook({ rowCount: 3000, seed: 11 });
    expect(() =>
      assertNoSentinelCollision(book.allRows(), [SNAPSHOT_END_TOKEN, LEGACY_SNAPSHOT_END_TOKEN]),
    ).not.toThrow();
  });

  it('catches a colliding value in any casing, naming the field', () => {
    expect(() =>
      assertNoSentinelCollision([{ orderState: 'PartialSuccess' }], ['Success']),
    ).toThrow(/orderState/);
  });

  it('ignores non-string values', () => {
    expect(() => assertNoSentinelCollision([{ n: 1, b: true, o: null }], ['success'])).not.toThrow();
  });
});
