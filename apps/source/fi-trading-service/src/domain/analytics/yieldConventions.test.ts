
import { describe, expect, it } from 'vitest';

import {
  annualEquivalentYield, bondEquivalentYield, continuousEquivalent, currentYield,
  discountRateFromPrice, priceFromDiscountRate, semiannualEquivalentYield,
} from './yieldConventions.js';

describe('Treasury bills', () => {
  it('round-trips price and discount rate', () => {
    for (const [rate, days] of [[4.5, 91], [4.5, 182], [4.2, 364], [5.1, 28]] as const) {
      const price = priceFromDiscountRate(rate, days);
      expect(discountRateFromPrice(price, days)).toBeCloseTo(rate, 10);
    }
  });

  it('prices a 13-week bill at a 4.50 discount rate', () => {
    expect(priceFromDiscountRate(4.5, 91)).toBeCloseTo(98.8625, 6);
  });

  it('quotes a bond-equivalent yield ABOVE the discount rate', () => {
    // These are different numbers for the same instrument, and emitting both
    // correctly is one of the cheapest realism details available.
    expect(bondEquivalentYield(4.5, 91)).toBeCloseTo(4.615, 3);
    expect(bondEquivalentYield(4.5, 182)).toBeCloseTo(4.66871, 4);
    expect(bondEquivalentYield(4.5, 91)).toBeGreaterThan(4.5);
  });

  it('solves the quadratic past half a year', () => {
    // Beyond 182 days semiannual compounding makes the conversion a quadratic
    // root. Most implementations skip this and misprice every 52-week bill.
    expect(bondEquivalentYield(4.5, 364)).toBeCloseTo(4.72434, 4);
    expect(bondEquivalentYield(4.4, 364)).toBeCloseTo(4.61571, 4);
  });

  it('is continuous across the 182-day boundary', () => {
    const before = bondEquivalentYield(4.5, 182);
    const after = bondEquivalentYield(4.5, 183);
    expect(Math.abs(after - before)).toBeLessThan(0.001);
  });

  it('guards degenerate inputs', () => {
    expect(bondEquivalentYield(4.5, 0)).toBe(0);
    expect(discountRateFromPrice(99, 0)).toBe(0);
    expect(bondEquivalentYield(4.5, 183 * 2)).toBeGreaterThan(0);
  });
});

describe('compounding conversions', () => {
  it('converts between annual and semiannual equivalents', () => {
    expect(annualEquivalentYield(4)).toBeCloseTo(4.04, 6);
    expect(semiannualEquivalentYield(4.04)).toBeCloseTo(4, 6);
  });

  it('round-trips', () => {
    for (const y of [1, 4, 7.5, 12]) {
      expect(semiannualEquivalentYield(annualEquivalentYield(y))).toBeCloseTo(y, 10);
    }
  });

  it('gives a continuously compounded equivalent below the periodic one', () => {
    expect(continuousEquivalent(4, 2)).toBeLessThan(4);
    expect(continuousEquivalent(4, 2)).toBeCloseTo(2 * Math.log(1.02) * 100, 10);
    // More frequent compounding brings the two closer together.
    expect(continuousEquivalent(4, 365)).toBeGreaterThan(continuousEquivalent(4, 2));
  });
});

describe('currentYield', () => {
  it('is the coupon over the price', () => {
    expect(currentYield(5, 100)).toBeCloseTo(5, 10);
    expect(currentYield(5, 108.175717)).toBeCloseTo(4.62211, 4);
    expect(currentYield(5, 90)).toBeCloseTo(5.5556, 4);
  });

  it('guards a non-positive price', () => {
    expect(currentYield(5, 0)).toBe(0);
  });
});
