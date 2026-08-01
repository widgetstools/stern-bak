import { describe, expect, it } from 'vitest';
import { createRng, pick, randBetween, randInt } from './rng.js';

describe('createRng', () => {
  it('returns values in [0, 1)', () => {
    const rng = createRng(42);
    for (let i = 0; i < 100; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('is deterministic for the same seed', () => {
    const a = createRng(12345);
    const b = createRng(12345);
    const seqA = Array.from({ length: 5 }, () => a());
    const seqB = Array.from({ length: 5 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('treats seed 0 as 1', () => {
    const fromZero = createRng(0);
    const fromOne = createRng(1);
    expect(fromZero()).toBe(fromOne());
  });
});

describe('pick', () => {
  it('selects an element from the array', () => {
    const rng = createRng(99);
    const arr = ['a', 'b', 'c'] as const;
    const choice = pick(rng, arr);
    expect(arr).toContain(choice);
  });
});

describe('randBetween', () => {
  it('returns a value within range with decimals', () => {
    const rng = createRng(7);
    const v = randBetween(rng, 10, 20, 2);
    expect(v).toBeGreaterThanOrEqual(10);
    expect(v).toBeLessThanOrEqual(20);
  });

  it('returns raw float when decimals is null', () => {
    const rng = createRng(7);
    const v = randBetween(rng, 0, 1, null);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(1);
    // Without rounding, fractional part should exist for most draws
    expect(typeof v).toBe('number');
  });
});

describe('randInt', () => {
  it('returns an integer within inclusive bounds', () => {
    const rng = createRng(55);
    for (let i = 0; i < 50; i++) {
      const v = randInt(rng, 5, 10);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThanOrEqual(10);
      expect(Number.isInteger(v)).toBe(true);
    }
  });
});
