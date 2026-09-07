
import { describe, expect, it } from 'vitest';

import { nssDiscountCurve } from '../curves/discount.js';
import { SifmaCalendar } from '../core/sifmaCalendar.js';
import {
  accruedFor, cleanPriceFromYield, dirtyPriceFromYield, periodCoupon, projectCashflows,
  pvFromCurve, yieldFromCleanPrice, zSpreadFromPrice, type BondTerms,
} from './pricing.js';
import { buildSchedule } from './schedule.js';

const calendar = new SifmaCalendar();

function bond(frequency: 1 | 2, couponRate = 5): BondTerms {
  return {
    schedule: buildSchedule({ effective: 20260115, maturity: 20360115, frequency, calendar }),
    couponRate,
    frequency,
    redemption: 100,
    dayCount: '30/360',
  };
}

const SETTLE = 20260115;

describe('the pricing golden', () => {
  it('prices a 5% ten-year at a 4% yield', () => {
    // Hand-computable: c*(1 - (1+y)^-n)/y + 100*(1+y)^-n.
    expect(cleanPriceFromYield(bond(1), SETTLE, 4)).toBeCloseTo(108.110896, 6);
    expect(cleanPriceFromYield(bond(2), SETTLE, 4)).toBeCloseTo(108.175717, 6);
  });

  it('prices a bond at its coupon back to par', () => {
    expect(cleanPriceFromYield(bond(2), SETTLE, 5)).toBeCloseTo(100, 10);
    expect(cleanPriceFromYield(bond(1), SETTLE, 5)).toBeCloseTo(100, 10);
  });

  it('prices a zero-coupon ten-year', () => {
    expect(cleanPriceFromYield(bond(2, 0), SETTLE, 4)).toBeCloseTo(67.297133, 6);
  });

  it('discounts more as the yield rises', () => {
    const prices = [3, 4, 5, 6, 7].map((y) => cleanPriceFromYield(bond(2), SETTLE, y));
    for (let i = 1; i < prices.length; i++) {
      expect(prices[i]).toBeLessThan(prices[i - 1] as number);
    }
  });
});

describe('projectCashflows', () => {
  it('projects one flow per remaining period, redemption on the last', () => {
    const flows = projectCashflows(bond(2), SETTLE);
    expect(flows).toHaveLength(20);
    expect(flows[0]?.amount).toBeCloseTo(2.5, 10);
    expect(flows[0]?.periods).toBeCloseTo(1, 10);
    expect(flows[19]?.amount).toBeCloseTo(102.5, 10);
    expect(flows[19]?.principal).toBeCloseTo(100, 10);
    expect(flows[19]?.years).toBeCloseTo(10, 10);
  });

  it('shortens the first flow when settling mid-period', () => {
    const flows = projectCashflows(bond(2), 20260415);
    expect(flows).toHaveLength(20);
    expect(flows[0]?.periods).toBeCloseTo(0.5, 10);
    expect(flows[1]?.periods).toBeCloseTo(1.5, 10);
  });

  it('drops flows already paid', () => {
    expect(projectCashflows(bond(2), 20310115)).toHaveLength(10);
    expect(projectCashflows(bond(2), 20360115)).toHaveLength(0);
  });

  it('redeems early at a call, truncating the tail', () => {
    const flows = projectCashflows(bond(2), SETTLE, { redeemOn: 20310115, redeemAt: 102 });
    expect(flows).toHaveLength(10);
    expect(flows[9]?.date).toBe(20310115);
    expect(flows[9]?.principal).toBeCloseTo(102, 10);
    expect(flows[9]?.amount).toBeCloseTo(104.5, 10);
  });

  it('prorates a stub coupon', () => {
    const stubbed = {
      ...bond(2),
      schedule: buildSchedule({ effective: 20260103, maturity: 20310115, frequency: 2, calendar }),
    };
    const first = stubbed.schedule[0];
    if (first === undefined) throw new Error('no stub');
    // 30/360 from 3 Jan to 15 Jan is 12 days.
    expect(periodCoupon(stubbed, first)).toBeCloseTo((5 * 12) / 360, 10);
  });

  it('scales with face', () => {
    const large = { ...bond(2), face: 1_000_000, redemption: 1_000_000 };
    expect(projectCashflows(large, SETTLE)[0]?.amount).toBeCloseTo(25_000, 6);
    expect(cleanPriceFromYield(large, SETTLE, 4)).toBeCloseTo(1_081_757.17, 2);
  });
});

describe('dirty versus clean', () => {
  it('differ by exactly the accrued interest', () => {
    const settle = 20260415;
    const dirty = dirtyPriceFromYield(bond(2), settle, 4);
    const clean = cleanPriceFromYield(bond(2), settle, 4);
    expect(dirty - clean).toBeCloseTo(accruedFor(bond(2), settle), 12);
    expect(accruedFor(bond(2), settle)).toBeCloseTo(1.25, 10);
  });

  it('leaves the clean price smooth across a coupon date', () => {
    // The dirty price drops by the coupon; the clean price should not.
    const before = cleanPriceFromYield(bond(2), 20260714, 4);
    const after = cleanPriceFromYield(bond(2), 20260716, 4);
    expect(Math.abs(after - before)).toBeLessThan(0.01);
  });
});

describe('yieldFromCleanPrice', () => {
  it('inverts the price function exactly', () => {
    for (const y of [0.5, 2, 4, 5, 8, 15]) {
      const price = cleanPriceFromYield(bond(2), SETTLE, y);
      expect(yieldFromCleanPrice(bond(2), SETTLE, price)).toBeCloseTo(y, 8);
    }
  });

  it('inverts mid-period and at other frequencies', () => {
    const price = cleanPriceFromYield(bond(2), 20260415, 4.37);
    expect(yieldFromCleanPrice(bond(2), 20260415, price)).toBeCloseTo(4.37, 8);
    const annual = cleanPriceFromYield(bond(1), SETTLE, 4.37);
    expect(yieldFromCleanPrice(bond(1), SETTLE, annual)).toBeCloseTo(4.37, 8);
  });

  it('converges from a poor starting guess', () => {
    const price = cleanPriceFromYield(bond(2), SETTLE, 12);
    expect(yieldFromCleanPrice(bond(2), SETTLE, price, { guess: 0.01 })).toBeCloseTo(12, 6);
    expect(yieldFromCleanPrice(bond(2), SETTLE, price, { guess: 90 })).toBeCloseTo(12, 6);
  });

  it('handles a deeply distressed price without diverging', () => {
    const yieldPct = yieldFromCleanPrice(bond(2), SETTLE, 20);
    expect(Number.isFinite(yieldPct)).toBe(true);
    expect(yieldPct).toBeGreaterThan(20);
    expect(cleanPriceFromYield(bond(2), SETTLE, yieldPct)).toBeCloseTo(20, 6);
  });

  it('inverts a single remaining flow under the street convention', () => {
    const settle = 20350715;
    const price = cleanPriceFromYield(bond(2), settle, 4.2);
    expect(yieldFromCleanPrice(bond(2), settle, price)).toBeCloseTo(4.2, 8);
  });

  it('returns zero when nothing remains', () => {
    expect(yieldFromCleanPrice(bond(2), 20360115, 100)).toBe(0);
    expect(dirtyPriceFromYield(bond(2), 20360115, 4)).toBe(0);
  });
});

describe('street versus compound convention', () => {
  it('agree while several coupons remain', () => {
    const street = cleanPriceFromYield(bond(2), SETTLE, 4, { convention: 'Street' });
    const compound = cleanPriceFromYield(bond(2), SETTLE, 4, { convention: 'Compound' });
    expect(street).toBeCloseTo(compound, 10);
  });

  it('diverge on the final period, which is the point of the convention', () => {
    const settle = 20350801;
    const street = cleanPriceFromYield(bond(2), settle, 4, { convention: 'Street' });
    const compound = cleanPriceFromYield(bond(2), settle, 4, { convention: 'Compound' });
    expect(street).not.toBeCloseTo(compound, 6);
    expect(Math.abs(street - compound)).toBeLessThan(0.05);
  });
});

describe('curve pricing', () => {
  const curve = nssDiscountCurve({ b0: 4.95, b1: -0.85, b2: -1.6, b3: 1.4 });

  it('prices off the curve and moves with the spread', () => {
    const base = pvFromCurve(bond(2), SETTLE, curve, 0);
    const wide = pvFromCurve(bond(2), SETTLE, curve, 1);
    expect(base).toBeGreaterThan(0);
    expect(wide).toBeLessThan(base);
  });

  it('recovers the z-spread that produced a price', () => {
    for (const spread of [-0.25, 0, 0.5, 2.5]) {
      const dirty = pvFromCurve(bond(2), SETTLE, curve, spread);
      const clean = dirty - accruedFor(bond(2), SETTLE);
      expect(zSpreadFromPrice(bond(2), SETTLE, curve, clean)).toBeCloseTo(spread, 6);
    }
  });

  it('gives a bond yielding above the curve a positive spread', () => {
    const cheap = cleanPriceFromYield(bond(2), SETTLE, 7);
    expect(zSpreadFromPrice(bond(2), SETTLE, curve, cheap)).toBeGreaterThan(0);
  });
});
