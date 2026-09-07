
import { describe, expect, it } from 'vitest';

import { SifmaCalendar } from '../core/sifmaCalendar.js';
import { nssDiscountCurve } from '../curves/discount.js';
import {
  effectiveDurationFromCurve, keyRateDurations, KRD_KNOTS, parallelBumpedCurve,
  sumKeyRateDurations, tentBumpedCurve, tentWeight,
} from './keyRate.js';
import type { BondTerms } from './pricing.js';
import { buildSchedule } from './schedule.js';

const calendar = new SifmaCalendar();
const curve = nssDiscountCurve({ b0: 4.95, b1: -0.85, b2: -1.6, b3: 1.4 });
const SETTLE = 20260115;

function bond(couponRate: number, maturity: number, frequency: 1 | 2 = 2): BondTerms {
  return {
    schedule: buildSchedule({ effective: 20260115, maturity, frequency, calendar }),
    couponRate,
    frequency,
    redemption: 100,
    dayCount: '30/360',
  };
}

describe('the tent basis', () => {
  it('is one at its own knot and zero at its neighbours', () => {
    for (let i = 0; i < KRD_KNOTS.length; i++) {
      expect(tentWeight(KRD_KNOTS[i] as number, i)).toBeCloseTo(1, 12);
      if (i > 0) expect(tentWeight(KRD_KNOTS[i - 1] as number, i)).toBeCloseTo(0, 12);
      if (i < KRD_KNOTS.length - 1) {
        expect(tentWeight(KRD_KNOTS[i + 1] as number, i)).toBeCloseTo(0, 12);
      }
    }
  });

  it('sums to exactly one at every tenor - a partition of unity', () => {
    // This is what makes the KRD identity hold. Without the flat extension at
    // the ends it would fail below the first knot and above the last.
    for (const tau of [0.01, 0.1, 0.25, 0.7, 1.5, 4, 8.3, 12, 25, 30, 45, 100]) {
      let total = 0;
      for (let i = 0; i < KRD_KNOTS.length; i++) total += tentWeight(tau, i);
      expect(total).toBeCloseTo(1, 12);
    }
  });

  it('is never negative and never exceeds one', () => {
    for (let tau = 0.01; tau <= 40; tau += 0.13) {
      for (let i = 0; i < KRD_KNOTS.length; i++) {
        const weight = tentWeight(tau, i);
        expect(weight).toBeGreaterThanOrEqual(0);
        expect(weight).toBeLessThanOrEqual(1);
      }
    }
  });

  it('extends flat past the ends', () => {
    expect(tentWeight(0.01, 0)).toBe(1);
    expect(tentWeight(100, KRD_KNOTS.length - 1)).toBe(1);
    expect(tentWeight(100, 0)).toBe(0);
  });

  it('interpolates linearly between knots', () => {
    // Halfway between the 5 and 7 year knots the weight is half on each.
    expect(tentWeight(6, KRD_KNOTS.indexOf(5))).toBeCloseTo(0.5, 12);
    expect(tentWeight(6, KRD_KNOTS.indexOf(7))).toBeCloseTo(0.5, 12);
  });
});

describe('bumped curves', () => {
  it('shifts a tent bump only near its knot', () => {
    const bumped = tentBumpedCurve(curve, KRD_KNOTS.indexOf(10), 0.01);
    expect(bumped.zeroRate(10) - curve.zeroRate(10)).toBeCloseTo(0.01, 12);
    expect(bumped.zeroRate(2) - curve.zeroRate(2)).toBeCloseTo(0, 12);
    expect(bumped.df(10)).toBeLessThan(curve.df(10));
  });

  it('shifts a parallel bump everywhere equally', () => {
    const bumped = parallelBumpedCurve(curve, 0.25);
    for (const tau of [0.5, 5, 30]) {
      expect(bumped.zeroRate(tau) - curve.zeroRate(tau)).toBeCloseTo(0.25, 12);
      expect(bumped.parYield(tau, 2) - curve.parYield(tau, 2)).toBeCloseTo(0.25, 12);
    }
  });
});

describe('key-rate durations', () => {
  it('SUMS TO THE EFFECTIVE DURATION for every security', () => {
    // The identity this module exists for. It catches interpolation errors,
    // tent-basis errors, sign errors and stale cashflows in one assertion.
    const securities = [
      bond(5, 20360115), bond(0, 20560115), bond(2, 20280115), bond(9, 20460115),
      bond(5, 20360115, 1), bond(0, 20270115), bond(3.5, 20310115),
    ];
    for (const terms of securities) {
      const krd = keyRateDurations(terms, SETTLE, curve);
      const effective = effectiveDurationFromCurve(terms, SETTLE, curve);
      expect(sumKeyRateDurations(krd)).toBeCloseTo(effective, 3);
    }
  });

  it('holds the identity mid-period and with a spread applied', () => {
    const terms = bond(5, 20360115);
    for (const settle of [20260115, 20260415, 20300901]) {
      for (const spreadPct of [0, 1.5]) {
        const krd = keyRateDurations(terms, settle, curve, { spreadPct });
        const effective = effectiveDurationFromCurve(terms, settle, curve, { spreadPct });
        expect(sumKeyRateDurations(krd)).toBeCloseTo(effective, 3);
      }
    }
  });

  it('concentrates a zero-coupon bond at its maturity knot', () => {
    const krd = keyRateDurations(bond(0, 20360115), SETTLE, curve);
    const tenYear = KRD_KNOTS.indexOf(10);
    expect(krd[tenYear] as number).toBeGreaterThan(9);
    for (let i = 0; i < KRD_KNOTS.length; i++) {
      if (i === tenYear) continue;
      expect(Math.abs(krd[i] as number)).toBeLessThan(0.5);
    }
  });

  it('spreads a coupon bond across the curve', () => {
    const krd = keyRateDurations(bond(5, 20360115), SETTLE, curve);
    const nonTrivial = [...krd].filter((value) => Math.abs(value) > 0.05);
    expect(nonTrivial.length).toBeGreaterThan(3);
  });

  it('puts no duration beyond a bond maturity', () => {
    const krd = keyRateDurations(bond(5, 20310115), SETTLE, curve);
    expect(Math.abs(krd[KRD_KNOTS.indexOf(30)] as number)).toBeLessThan(1e-6);
    expect(Math.abs(krd[KRD_KNOTS.indexOf(20)] as number)).toBeLessThan(1e-6);
  });

  it('matches the analytic duration closely for a bullet', () => {
    const terms = bond(5, 20360115);
    const effective = effectiveDurationFromCurve(terms, SETTLE, curve);
    // Continuously compounded curve duration, so within a few percent of the
    // semiannual modified duration rather than identical to it.
    expect(effective).toBeGreaterThan(7.5);
    expect(effective).toBeLessThan(8.3);
  });

  it('is insensitive to the bump size, as a well-behaved derivative should be', () => {
    const terms = bond(5, 20360115);
    const fine = sumKeyRateDurations(keyRateDurations(terms, SETTLE, curve, { bumpBp: 1 }));
    const coarse = sumKeyRateDurations(keyRateDurations(terms, SETTLE, curve, { bumpBp: 25 }));
    expect(fine).toBeCloseTo(coarse, 2);
  });

  it('returns zeros for a security with no remaining cashflows', () => {
    const matured = bond(5, 20360115);
    expect([...keyRateDurations(matured, 20360115, curve)]).toEqual(new Array(KRD_KNOTS.length).fill(0));
    expect(effectiveDurationFromCurve(matured, 20360115, curve)).toBe(0);
  });
});
