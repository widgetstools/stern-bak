
import { describe, expect, it } from 'vitest';

import { accrueBurnout, burnout } from './burnout.js';
import {
  CURTAILMENT_CPR, INVOLUNTARY_CPR, MAX_CPR, cprToSmm, effectiveIncentive, lockIn, psaToCpr,
  refiCpr, seasonality, smmToCpr, turnoverCpr,
} from './sCurve.js';

describe('the refinancing S-curve', () => {
  it('matches the calibrated table', () => {
    const expected: Record<string, number> = {
      '-1': 0.77, '-0.5': 1.56, '0': 4.52, '0.5': 13.46, '1': 29.17, '1.5': 41.38, '2': 46.18,
    };
    for (const [x, cpr] of Object.entries(expected)) {
      expect(refiCpr(Number(x))).toBeCloseTo(cpr, 2);
    }
  });

  it('is flat out of the money, steep through the first 150 bp, then saturates', () => {
    expect(refiCpr(-2)).toBeLessThan(1);
    const steep = refiCpr(1) - refiCpr(0.5);
    const saturated = refiCpr(3) - refiCpr(2.5);
    expect(steep).toBeGreaterThan(10);
    expect(saturated).toBeLessThan(1);
  });

  it('is monotone increasing in the incentive', () => {
    let previous = 0;
    for (let x = -3; x <= 4; x += 0.05) {
      const value = refiCpr(x);
      expect(value).toBeGreaterThan(previous);
      previous = value;
    }
  });
});

describe('lock-in', () => {
  it('matches the calibrated table', () => {
    expect(lockIn(-3)).toBeCloseTo(0.3745, 4);
    expect(lockIn(-1)).toBeCloseTo(0.7329, 4);
    expect(lockIn(0)).toBeCloseTo(0.9328, 4);
  });

  it('cuts turnover to about a third deep out of the money', () => {
    // A borrower with a 3% mortgage against a 7% market does not move house.
    // Without this every low-coupon pool prepays three times too fast.
    expect(lockIn(-4)).toBeLessThan(0.4);
    expect(lockIn(1)).toBeGreaterThan(0.98);
  });
});

describe('turnover and seasonality', () => {
  it('ramps turnover over a 30-month seasoning period', () => {
    expect(turnoverCpr(0)).toBe(0);
    expect(turnoverCpr(15)).toBeCloseTo(3, 6);
    expect(turnoverCpr(30)).toBeCloseTo(6, 6);
    expect(turnoverCpr(120)).toBeCloseTo(6, 6);
    expect(turnoverCpr(-5)).toBe(0);
  });

  it('peaks in July and troughs in January, following home sales', () => {
    expect(seasonality(7)).toBeCloseTo(1.22, 2);
    expect(seasonality(1)).toBeCloseTo(0.78, 2);
    const months = Array.from({ length: 12 }, (_, i) => seasonality(i + 1));
    expect(Math.max(...months)).toBeCloseTo(1.22, 2);
    expect(Math.min(...months)).toBeCloseTo(0.78, 2);
    expect(months.reduce((a, b) => a + b, 0) / 12).toBeCloseTo(1, 2);
  });
});

describe('the media and capacity lag', () => {
  it('blends the current incentive with the trailing best', () => {
    expect(effectiveIncentive(0.5, 1.5)).toBeCloseTo(0.65 * 0.5 + 0.35 * 1.5, 10);
  });

  it('never falls below the current incentive when rates are at their best', () => {
    expect(effectiveIncentive(1.5, 0.2)).toBeCloseTo(1.5, 10);
  });
});

describe('burnout', () => {
  it('starts at one and decays to a floor of 0.45', () => {
    expect(burnout(0)).toBeCloseTo(1, 10);
    expect(burnout(1000)).toBeCloseTo(0.45, 6);
    expect(burnout(-5)).toBeCloseTo(1, 10);
  });

  it('halves the refinancing response over roughly two years', () => {
    expect(burnout(24)).toBeLessThan(0.6);
    expect(burnout(24)).toBeGreaterThan(0.5);
  });

  it('is monotone decreasing', () => {
    for (let cim = 1; cim < 60; cim++) expect(burnout(cim)).toBeLessThan(burnout(cim - 1));
  });

  it('accrues SMOOTHLY, not through a threshold', () => {
    // A hard cutoff puts a step in the price function exactly where the
    // S-curve is steepest, and effective convexity is a second difference, so
    // it amplifies that step into nonsense. Adjacent incentives must produce
    // adjacent burn rates.
    const rates = [0.1, 0.2, 0.24, 0.25, 0.26, 0.3, 0.4].map((x) => accrueBurnout(0, x));
    for (let i = 1; i < rates.length; i++) {
      expect(rates[i] as number).toBeGreaterThan(rates[i - 1] as number);
      expect((rates[i] as number) - (rates[i - 1] as number)).toBeLessThan(0.15);
    }
  });

  it('burns a deeply in-the-money pool far faster than a marginal one', () => {
    expect(accrueBurnout(0, 2)).toBeGreaterThan(0.9);
    expect(accrueBurnout(0, -2)).toBeLessThan(0.1);
  });
});

describe('speed conversions', () => {
  it('round-trips CPR and SMM', () => {
    for (const cpr of [0, 2, 6, 15, 40, 59]) {
      expect(smmToCpr(cprToSmm(cpr))).toBeCloseTo(cpr, 8);
    }
  });

  it('clamps at the ceiling and the floor', () => {
    expect(cprToSmm(200)).toBeCloseTo(cprToSmm(MAX_CPR), 12);
    expect(cprToSmm(-5)).toBe(0);
  });

  it('converts PSA on the standard ramp', () => {
    expect(psaToCpr(100, 30)).toBeCloseTo(6, 6);
    expect(psaToCpr(100, 15)).toBeCloseTo(3, 6);
    expect(psaToCpr(200, 30)).toBeCloseTo(12, 6);
    expect(psaToCpr(100, 0)).toBe(0);
  });

  it('keeps the baseline non-voluntary components small but non-zero', () => {
    expect(INVOLUNTARY_CPR).toBeGreaterThan(0);
    expect(CURTAILMENT_CPR).toBeGreaterThan(0);
    expect(INVOLUNTARY_CPR + CURTAILMENT_CPR).toBeLessThan(2);
  });
});
