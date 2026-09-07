
import { describe, expect, it } from 'vitest';

import {
  TICK_SIZE, formatEighths, formatPrice, formatTreasuryTick, parseEighths,
  parseTreasuryTick, roundToTick,
} from './tickPrice.js';

describe('Treasury 32nds', () => {
  it('parses the three forms of the grammar', () => {
    expect(parseTreasuryTick('99-16')).toBeCloseTo(99.5, 12);
    expect(parseTreasuryTick('99-16+')).toBeCloseTo(99.515625, 12);
    expect(parseTreasuryTick('99-162')).toBeCloseTo(99.5078125, 12);
    expect(parseTreasuryTick('99-166')).toBeCloseTo(99.5234375, 12);
  });

  it("treats '+' as exactly half a 32nd", () => {
    expect(parseTreasuryTick('99-16+')).toBe(parseTreasuryTick('99-164'));
  });

  it('formats back to the canonical string', () => {
    expect(formatTreasuryTick(99.5)).toBe('99-16');
    expect(formatTreasuryTick(99.515625)).toBe('99-16+');
    expect(formatTreasuryTick(99.5078125)).toBe('99-162');
    expect(formatTreasuryTick(100)).toBe('100-00');
  });

  it('pads the 32nds to two digits, as a runs sheet does', () => {
    expect(formatTreasuryTick(99 + 2 / 32)).toBe('99-02');
  });

  it('round-trips every 256th of a point', () => {
    for (let ticks = 0; ticks < 256; ticks++) {
      const price = 99 + ticks / 256;
      const text = formatTreasuryTick(price);
      expect(parseTreasuryTick(text)).toBeCloseTo(price, 12);
    }
  });

  it('honours the requested precision', () => {
    expect(formatTreasuryTick(99.5078125, '32')).toBe('99-16');
    expect(formatTreasuryTick(99.5078125, '256')).toBe('99-162');
  });

  it('carries into the next point and the next 32nd', () => {
    expect(formatTreasuryTick(99.99999)).toBe('100-00');
    expect(formatTreasuryTick(99 + 31.99 / 32)).toBe('100-00');
  });

  it('handles negative prices, which spreads and basis produce', () => {
    expect(parseTreasuryTick('-1-16')).toBeCloseTo(-1.5, 12);
    expect(formatTreasuryTick(-1.5)).toBe('-1-16');
  });

  it('rejects malformed input rather than returning a wrong price', () => {
    expect(parseTreasuryTick('99')).toBeNull();
    expect(parseTreasuryTick('99-32')).toBeNull();
    expect(parseTreasuryTick('99-16x')).toBeNull();
    expect(parseTreasuryTick('abc')).toBeNull();
  });
});

describe('eighths', () => {
  it('parses and formats the high-yield convention', () => {
    expect(parseEighths('101 3/8')).toBeCloseTo(101.375, 12);
    expect(parseEighths('101')).toBe(101);
    expect(formatEighths(101.375)).toBe('101 3/8');
    expect(formatEighths(101)).toBe('101');
  });

  it('reduces the fraction the way a quote sheet would', () => {
    expect(formatEighths(101.5)).toBe('101 1/2');
    expect(formatEighths(101.25)).toBe('101 1/4');
    expect(formatEighths(101.75)).toBe('101 3/4');
  });

  it('handles negatives and rejects nonsense', () => {
    expect(formatEighths(-2.5)).toBe('-2 1/2');
    expect(parseEighths('101 3/0')).toBeNull();
    expect(parseEighths('nope')).toBeNull();
  });
});

describe('tick grids', () => {
  it('snaps a price onto the grid', () => {
    expect(roundToTick(99.5123, 1 / 32)).toBeCloseTo(99.5, 12);
    expect(roundToTick(101.31, 1 / 8)).toBeCloseTo(101.25, 12);
    expect(roundToTick(99.5123, 0)).toBe(99.5123);
  });

  it('gives benchmark Treasuries a finer grid than off-the-runs', () => {
    expect(TICK_SIZE.treasuryBenchmark).toBeLessThan(TICK_SIZE.treasuryOffTheRun as number);
    expect(TICK_SIZE.highYield).toBeGreaterThan(TICK_SIZE.corporate as number);
  });
});

describe('formatPrice', () => {
  it('quotes each family the way it actually trades', () => {
    expect(formatPrice(99.515625, 'Thirty2nds')).toBe('99-16+');
    expect(formatPrice(101.375, 'Eighths')).toBe('101 3/8');
    expect(formatPrice(99.5, 'Decimal')).toBe('99.500');
    expect(formatPrice(3.42, 'Yield')).toBe('3.420');
    expect(formatPrice(-0.955, 'PointsUpfront')).toBe('-0.955');
  });
});
