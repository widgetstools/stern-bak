
import { describe, expect, it } from 'vitest';

import { SifmaCalendar } from '../core/sifmaCalendar.js';
import { nssDiscountCurve } from '../curves/discount.js';
import { effectiveDurationConvexity, isNegativelyConvex } from './effective.js';
import { parallelBumpedCurve } from './keyRate.js';
import { pvFromCurve, type BondTerms } from './pricing.js';
import { buildSchedule } from './schedule.js';

const calendar = new SifmaCalendar();
const curve = nssDiscountCurve({ b0: 4.95, b1: -0.85, b2: -1.6, b3: 1.4 });
const SETTLE = 20260115;

function bullet(couponRate: number, maturity: number): BondTerms {
  return {
    schedule: buildSchedule({ effective: 20260115, maturity, frequency: 2, calendar }),
    couponRate,
    frequency: 2,
    redemption: 100,
    dayCount: '30/360',
  };
}

function repricer(terms: BondTerms) {
  return (shiftPct: number): number => pvFromCurve(terms, SETTLE, parallelBumpedCurve(curve, shiftPct), 0);
}

describe('effectiveDurationConvexity', () => {
  it('reproduces the analytic duration of a bullet', () => {
    const measures = effectiveDurationConvexity(repricer(bullet(5, 20360115)));
    expect(measures.effectiveDuration).toBeGreaterThan(7.5);
    expect(measures.effectiveDuration).toBeLessThan(8.3);
  });

  it('makes an ordinary bond positively convex', () => {
    for (const terms of [bullet(5, 20360115), bullet(0, 20560115), bullet(8, 20310115)]) {
      const measures = effectiveDurationConvexity(repricer(terms));
      expect(measures.effectiveConvexity).toBeGreaterThan(0);
      expect(isNegativelyConvex(measures)).toBe(false);
    }
  });

  it('reports the three prices it used', () => {
    const measures = effectiveDurationConvexity(repricer(bullet(5, 20360115)));
    expect(measures.downPrice).toBeGreaterThan(measures.basePrice);
    expect(measures.basePrice).toBeGreaterThan(measures.upPrice);
  });

  it('is stable across bump sizes for a well-behaved instrument', () => {
    const reprice = repricer(bullet(5, 20360115));
    const fine = effectiveDurationConvexity(reprice, 5);
    const coarse = effectiveDurationConvexity(reprice, 50);
    expect(fine.effectiveDuration).toBeCloseTo(coarse.effectiveDuration, 2);
  });

  it('detects negative convexity when the bump feeds back into the cashflows', () => {
    // Stands in for a mortgage: as rates fall the instrument SHORTENS, so it
    // gains less on a rally than it loses on a sell-off. Shifting only the
    // discount rate would leave it positively convex, which is exactly the
    // shortcut that gives synthetic mortgage data away.
    const base = 102;
    const reprice = (shiftPct: number): number => {
      const effectiveLife = 4 + 2.5 * Math.tanh(shiftPct * 2);
      return base * Math.exp(-effectiveLife * (shiftPct / 100));
    };
    const measures = effectiveDurationConvexity(reprice);
    expect(measures.effectiveDuration).toBeGreaterThan(0);
    expect(measures.effectiveConvexity).toBeLessThan(0);
    expect(isNegativelyConvex(measures)).toBe(true);
  });

  it('handles a negative duration, as an interest-only strip has', () => {
    // An IO gains when rates rise, because prepayments slow.
    const reprice = (shiftPct: number): number => 20 * (1 + 0.18 * shiftPct);
    const measures = effectiveDurationConvexity(reprice);
    expect(measures.effectiveDuration).toBeLessThan(0);
  });

  it('guards a zero base price', () => {
    const measures = effectiveDurationConvexity(() => 0);
    expect(measures.effectiveDuration).toBe(0);
    expect(measures.effectiveConvexity).toBe(0);
  });
});
