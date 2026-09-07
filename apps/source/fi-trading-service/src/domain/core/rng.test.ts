
import { describe, expect, it } from 'vitest';

import {
  createNormalDraw, createRng, deriveSeed, exponential, pick, pickWeighted, poisson,
  shuffle, uniform, uniformInt,
} from './rng.js';

function draws(seed: number, n: number): number[] {
  const rng = createRng(seed);
  return Array.from({ length: n }, () => rng());
}

describe('createRng', () => {
  it('is deterministic for a seed, which the whole corpus depends on', () => {
    expect(draws(42, 100)).toEqual(draws(42, 100));
  });

  it('gives uncorrelated streams for nearby seeds', () => {
    // An LCG seeded 1 and 2 produces near-identical opening draws. The
    // splitmix warm-up exists to prevent exactly that.
    const a = draws(1, 20);
    const b = draws(2, 20);
    expect(a).not.toEqual(b);
    expect(Math.abs((a[0] as number) - (b[0] as number))).toBeGreaterThan(0.001);
  });

  it('stays in [0, 1)', () => {
    for (const value of draws(7, 20_000)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('is uniform in the mean', () => {
    const values = draws(9, 200_000);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    expect(mean).toBeGreaterThan(0.495);
    expect(mean).toBeLessThan(0.505);
  });

  it('has clean LOW bits, which is why this is not an LCG', () => {
    // `Math.floor(rng() * 8)` leans on the low bits; an LCG bands visibly
    // here and every eighth security would land in the same bucket.
    const buckets = new Array<number>(8).fill(0);
    const rng = createRng(11);
    const n = 160_000;
    for (let i = 0; i < n; i++) {
      const bucket = Math.floor(rng() * 8);
      buckets[bucket] = (buckets[bucket] ?? 0) + 1;
    }
    for (const count of buckets) {
      expect(count).toBeGreaterThan(n / 8 - 1500);
      expect(count).toBeLessThan(n / 8 + 1500);
    }
  });

  it('treats a zero seed as a valid stream rather than degenerating', () => {
    expect(draws(0, 10)).toEqual(draws(0, 10));
    expect(new Set(draws(0, 10)).size).toBeGreaterThan(1);
  });
});

describe('deriveSeed', () => {
  it('is deterministic and order-sensitive', () => {
    expect(deriveSeed(1, 'eod', 20260315)).toBe(deriveSeed(1, 'eod', 20260315));
    expect(deriveSeed(1, 'eod', 20260315)).not.toBe(deriveSeed(1, 20260315, 'eod'));
  });

  it('separates partitions, so eight workers match one', () => {
    const seeds = new Set<number>();
    for (let day = 0; day < 252; day++) seeds.add(deriveSeed(20260907, 'positions', day));
    expect(seeds.size).toBe(252);
  });

  it('separates global seeds', () => {
    expect(deriveSeed(1, 'x')).not.toBe(deriveSeed(2, 'x'));
  });

  it('never returns zero', () => {
    for (let i = 0; i < 1000; i++) expect(deriveSeed(i, 'label', i)).not.toBe(0);
  });
});

describe('helpers', () => {
  it('uniform spans the range', () => {
    const rng = createRng(3);
    for (let i = 0; i < 1000; i++) {
      const value = uniform(rng, 5, 9);
      expect(value).toBeGreaterThanOrEqual(5);
      expect(value).toBeLessThan(9);
    }
  });

  it('uniformInt is inclusive at both ends', () => {
    const rng = createRng(4);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) seen.add(uniformInt(rng, 1, 6));
    expect([...seen].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('pick returns members and refuses an empty list', () => {
    const rng = createRng(5);
    const items = ['a', 'b', 'c'] as const;
    for (let i = 0; i < 100; i++) expect(items).toContain(pick(rng, items));
    expect(() => pick(rng, [])).toThrow(/empty/);
  });

  it('pickWeighted respects the weights', () => {
    const rng = createRng(6);
    const counts = { a: 0, b: 0 };
    for (let i = 0; i < 20_000; i++) counts[pickWeighted(rng, ['a', 'b'] as const, [3, 1])] += 1;
    expect(counts.a / (counts.a + counts.b)).toBeCloseTo(0.75, 2);
  });

  it('pickWeighted makes a zero weight genuinely unreachable', () => {
    const rng = createRng(7);
    for (let i = 0; i < 2000; i++) {
      expect(pickWeighted(rng, ['a', 'b'] as const, [1, 0])).toBe('a');
    }
  });

  it('pickWeighted falls back when every weight is non-positive', () => {
    expect(pickWeighted(createRng(8), ['a', 'b'] as const, [0, 0])).toBe('a');
    expect(() => pickWeighted(createRng(8), [], [])).toThrow(/empty/);
  });

  it('shuffle permutes without losing or duplicating', () => {
    const items = Array.from({ length: 100 }, (_, i) => i);
    const shuffled = shuffle(createRng(9), [...items]);
    expect([...shuffled].sort((a, b) => a - b)).toEqual(items);
    expect(shuffled).not.toEqual(items);
  });
});

describe('distributions', () => {
  it('normal draws have mean 0 and unit variance', () => {
    const draw = createNormalDraw(createRng(21));
    const values = Array.from({ length: 200_000 }, () => draw());
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
    expect(Math.abs(mean)).toBeLessThan(0.01);
    expect(variance).toBeGreaterThan(0.98);
    expect(variance).toBeLessThan(1.02);
  });

  it('normal draws stay deterministic despite the cached spare', () => {
    const a = Array.from({ length: 50 }, createNormalDraw(createRng(22)));
    const b = Array.from({ length: 50 }, createNormalDraw(createRng(22)));
    expect(a).toEqual(b);
  });

  it('exponential has mean 1/rate and rejects a non-positive rate', () => {
    const rng = createRng(23);
    const values = Array.from({ length: 100_000 }, () => exponential(rng, 4));
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    expect(mean).toBeCloseTo(0.25, 2);
    expect(values.every((v) => v > 0)).toBe(true);
    expect(() => exponential(rng, 0)).toThrow(/positive/);
  });

  it('poisson has mean lambda on both sides of the algorithm switch', () => {
    for (const lambda of [0.3, 5, 29, 100]) {
      const rng = createRng(24);
      const values = Array.from({ length: 40_000 }, () => poisson(rng, lambda));
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      expect(mean).toBeGreaterThan(lambda * 0.94);
      expect(mean).toBeLessThan(lambda * 1.06);
      expect(values.every((v) => v >= 0 && Number.isInteger(v))).toBe(true);
    }
  });

  it('poisson is zero for a non-positive rate', () => {
    expect(poisson(createRng(25), 0)).toBe(0);
    expect(poisson(createRng(25), -1)).toBe(0);
  });
});
