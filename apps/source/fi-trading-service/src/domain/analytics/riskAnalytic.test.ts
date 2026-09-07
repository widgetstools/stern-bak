
import { describe, expect, it } from 'vitest';

import { SifmaCalendar } from '../core/sifmaCalendar.js';
import { nssDiscountCurve } from '../curves/discount.js';
import { cleanPriceFromYield, projectCashflows, type BondTerms } from './pricing.js';
import {
  bondRisk, convexity, cs01, dv01, macaulayDuration, modifiedFromMacaulay, spreadDuration,
} from './riskAnalytic.js';
import { buildSchedule } from './schedule.js';

const calendar = new SifmaCalendar();
const SETTLE = 20260115;

function bond(couponRate = 5, maturity = 20360115, frequency: 1 | 2 = 2): BondTerms {
  return {
    schedule: buildSchedule({ effective: 20260115, maturity, frequency, calendar }),
    couponRate,
    frequency,
    redemption: 100,
    dayCount: '30/360',
  };
}

describe('the risk goldens', () => {
  const risk = bondRisk(bond(), SETTLE, 4);

  it('reproduces duration, convexity and DV01 for a 5% ten-year at 4%', () => {
    expect(risk.dirtyPrice).toBeCloseTo(108.175717, 6);
    expect(risk.macaulayDuration).toBeCloseTo(8.080936, 6);
    expect(risk.modifiedDuration).toBeCloseTo(7.922486, 6);
    expect(risk.convexity).toBeCloseTo(75.472467, 5);
    expect(risk.dv01).toBeCloseTo(0.085702, 6);
  });

  it('gives a zero-coupon bond a duration equal to its maturity', () => {
    const strip = bondRisk(bond(0, 20560115), SETTLE, 4);
    expect(strip.macaulayDuration).toBeCloseTo(30, 8);
    expect(strip.convexity).toBeCloseTo(879.47, 1);
  });

  it('makes modified duration shorter than Macaulay', () => {
    expect(risk.modifiedDuration).toBeLessThan(risk.macaulayDuration);
    expect(modifiedFromMacaulay(8.080936, 4, 2)).toBeCloseTo(7.922486, 6);
  });

  it('reports the accrued split and time to maturity', () => {
    expect(risk.accrued).toBeCloseTo(0, 10);
    expect(risk.cleanPrice).toBeCloseTo(108.175717, 6);
    expect(risk.timeToMaturity).toBeCloseTo(10, 8);
  });
});

describe('DV01 is the actual derivative', () => {
  it('predicts what a one basis point move does to the price', () => {
    // In the generator this replaces, dv01 was an independent random number
    // and predicted nothing. Here it must reprice the bond.
    for (const [coupon, maturity] of [[5, 20360115], [2, 20310115], [8, 20560115]] as const) {
      const terms = bond(coupon, maturity);
      const risk = bondRisk(terms, SETTLE, 4);
      const up = cleanPriceFromYield(terms, SETTLE, 4.01);
      const down = cleanPriceFromYield(terms, SETTLE, 3.99);
      expect((down - up) / 2).toBeCloseTo(risk.dv01, 5);
    }
  });

  it('predicts a larger move with convexity included', () => {
    const terms = bond();
    const risk = bondRisk(terms, SETTLE, 4);
    const shift = 0.01; // 100 bp
    const actual = cleanPriceFromYield(terms, SETTLE, 5) - risk.cleanPrice;
    const firstOrder = -risk.modifiedDuration * risk.dirtyPrice * shift;
    const secondOrder = firstOrder + 0.5 * risk.convexity * risk.dirtyPrice * shift * shift;
    expect(Math.abs(secondOrder - actual)).toBeLessThan(Math.abs(firstOrder - actual));
    expect(secondOrder).toBeCloseTo(actual, 1);
  });

  it('lengthens duration as the coupon falls', () => {
    const high = bondRisk(bond(8), SETTLE, 4).modifiedDuration;
    const low = bondRisk(bond(2), SETTLE, 4).modifiedDuration;
    const zero = bondRisk(bond(0), SETTLE, 4).modifiedDuration;
    expect(low).toBeGreaterThan(high);
    expect(zero).toBeGreaterThan(low);
  });

  it('is positive for every ordinary bond', () => {
    for (const coupon of [0, 2, 5, 9]) {
      expect(bondRisk(bond(coupon), SETTLE, 4).convexity).toBeGreaterThan(0);
      expect(bondRisk(bond(coupon), SETTLE, 4).dv01).toBeGreaterThan(0);
    }
  });

  it('scales DV01 with face', () => {
    expect(dv01(7.92, 108.18, 1_000_000)).toBeCloseTo(dv01(7.92, 108.18, 100) * 10_000, 6);
  });

  it('guards a degenerate price', () => {
    const flows = projectCashflows(bond(), SETTLE);
    expect(macaulayDuration(flows, 4, 2, 0)).toBe(0);
    expect(convexity(flows, 4, 2, 0)).toBe(0);
    expect(macaulayDuration([], 4, 2, 100)).toBe(0);
  });
});

describe('spread duration', () => {
  const curve = nssDiscountCurve({ b0: 4.95, b1: -0.85, b2: -1.6, b3: 1.4 });

  it('is close to rate duration for a fixed bullet', () => {
    const terms = bond();
    const rate = bondRisk(terms, SETTLE, curve.parYield(10, 2)).modifiedDuration;
    expect(spreadDuration(terms, SETTLE, curve, 0)).toBeCloseTo(rate, 0);
  });

  it('is positive and grows with maturity', () => {
    const short = spreadDuration(bond(5, 20310115), SETTLE, curve, 0);
    const long = spreadDuration(bond(5, 20560115), SETTLE, curve, 0);
    expect(short).toBeGreaterThan(0);
    expect(long).toBeGreaterThan(short);
  });

  it('prices a basis point of spread as CS01', () => {
    const value = cs01(bond(), SETTLE, curve, 0, 1_000_000);
    expect(value).toBeGreaterThan(0);
    expect(cs01(bond(), SETTLE, curve, 0, 100) * 10_000).toBeCloseTo(value, 4);
  });
});
