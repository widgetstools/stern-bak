
import { describe, expect, it } from 'vitest';

import {
  CDS_FREQUENCY, creditTriangle, defaultProbability, parSpreadFromHazard, protectionLeg,
  RECOVERY_SENIOR_UNSECURED, RECOVERY_SUBORDINATED, riskyPv01, solveHazardFromSpread, survival,
} from './hazard.js';
import {
  cashSettlement, parSpreadBp, quoteAtStandard, spreadFromUpfront, standardCoupon,
  STANDARD_COUPON_HY, STANDARD_COUPON_IG, upfrontFromSpread,
} from './isdaModel.js';
import {
  bondCdsBasisBp, cs01, dailyCarry, directionSign, ir01, jumpToDefault, markToMarket,
  recovery01, type CdsPosition,
} from './cdsRisk.js';

const RATE = 0.045;

describe('hazard rates', () => {
  it('survives exponentially and defaults as the complement', () => {
    expect(survival(0.02, 0)).toBe(1);
    expect(survival(0.02, 5)).toBeCloseTo(Math.exp(-0.1), 12);
    expect(defaultProbability(0.02, 5)).toBeCloseTo(1 - Math.exp(-0.1), 12);
  });

  it('approximates the credit triangle', () => {
    expect(creditTriangle(0.0078, 0.4)).toBeCloseTo(0.013, 6);
    expect(creditTriangle(0.048, 0.4)).toBeCloseTo(0.08, 6);
    expect(creditTriangle(0.05, 1)).toBe(0);
  });

  it('accrues the premium leg ACT/360 on a quarterly schedule', () => {
    // A quarter is about 0.2535 years on ACT/360, not 0.25. Using 0.25
    // understates the risky annuity by roughly 1.4%, straight into CS01.
    expect(CDS_FREQUENCY).toBe(4);
    const riskless = riskyPv01(0, 0, 1);
    expect(riskless).toBeCloseTo(4 * (365 / 4 / 360), 10);
    expect(riskless).toBeGreaterThan(1);
  });

  it('shrinks the risky annuity as the hazard rate rises', () => {
    expect(riskyPv01(0.08, RATE, 5)).toBeLessThan(riskyPv01(0.013, RATE, 5));
  });

  it('grows the protection leg with hazard and with loss given default', () => {
    expect(protectionLeg(0.08, RATE, 0.4, 5)).toBeGreaterThan(protectionLeg(0.013, RATE, 0.4, 5));
    expect(protectionLeg(0.05, RATE, 0.2, 5)).toBeGreaterThan(protectionLeg(0.05, RATE, 0.6, 5));
  });

  it('round-trips hazard and par spread', () => {
    for (const spread of [0.002, 0.0078, 0.048, 0.16]) {
      const hazard = solveHazardFromSpread(spread, RATE, 0.4, 5);
      expect(parSpreadFromHazard(hazard, RATE, 0.4, 5)).toBeCloseTo(spread, 10);
    }
  });

  it('lands near the credit triangle, which is why it seeds the solve', () => {
    const hazard = solveHazardFromSpread(0.0078, RATE, 0.4, 5);
    expect(hazard).toBeCloseTo(creditTriangle(0.0078, 0.4), 2);
  });

  it('returns zero for a zero spread', () => {
    expect(solveHazardFromSpread(0, RATE, 0.4, 5)).toBe(0);
  });

  it('uses the market recovery conventions', () => {
    expect(RECOVERY_SENIOR_UNSECURED).toBe(0.4);
    expect(RECOVERY_SUBORDINATED).toBe(0.2);
  });
});

describe('THE SNAC CONVERSION TABLE', () => {
  it('reproduces the three reference cases', () => {
    // Flat 4.5% discounting, five years. Independently computed.
    const ig = upfrontFromSpread({ spreadBp: 78, couponBp: 100, recovery: 0.4, discountRate: RATE, years: 5 });
    expect(ig.hazard).toBeCloseTo(0.0131, 4);
    expect(ig.riskyPv01).toBeCloseTo(4.375, 2);
    expect(ig.pointsUpfront).toBeCloseTo(-0.962, 2);

    const hy = upfrontFromSpread({ spreadBp: 480, couponBp: 500, recovery: 0.4, discountRate: RATE, years: 5 });
    expect(hy.hazard).toBeCloseTo(0.0807, 4);
    expect(hy.riskyPv01).toBeCloseTo(3.743, 2);
    expect(hy.pointsUpfront).toBeCloseTo(-0.749, 2);

    const distressed = upfrontFromSpread({ spreadBp: 1600, couponBp: 500, recovery: 0.25, discountRate: RATE, years: 5 });
    expect(distressed.hazard).toBeCloseTo(0.2151, 3);
    expect(distressed.riskyPv01).toBeCloseTo(2.821, 2);
    expect(distressed.pointsUpfront).toBeCloseTo(31.03, 1);
  });

  it('pays the BUYER when the credit trades inside its fixed coupon', () => {
    // 78 bp against a 100 bp coupon: the buyer is overpaying on the running
    // coupon, so they receive about a point up front.
    const tight = upfrontFromSpread({ spreadBp: 78, couponBp: 100, recovery: 0.4, discountRate: RATE, years: 5 });
    expect(tight.pointsUpfront).toBeLessThan(0);
    const wide = upfrontFromSpread({ spreadBp: 320, couponBp: 100, recovery: 0.4, discountRate: RATE, years: 5 });
    expect(wide.pointsUpfront).toBeGreaterThan(0);
  });

  it('is exactly zero when the credit trades at its coupon', () => {
    const atCoupon = upfrontFromSpread({ spreadBp: 100, couponBp: 100, recovery: 0.4, discountRate: RATE, years: 5 });
    expect(atCoupon.pointsUpfront).toBeCloseTo(0, 8);
  });

  it('quotes CDX.HY in price, which is 100 less the upfront', () => {
    const conversion = upfrontFromSpread({ spreadBp: 480, couponBp: 500, recovery: 0.4, discountRate: RATE, years: 5 });
    expect(conversion.price).toBeCloseTo(100 - conversion.pointsUpfront, 10);
    expect(conversion.price).toBeGreaterThan(100);
  });

  it('inverts back to the spread it came from', () => {
    for (const spreadBp of [45, 78, 250, 480, 1600]) {
      const coupon = spreadBp > 300 ? 500 : 100;
      const puf = upfrontFromSpread({ spreadBp, couponBp: coupon, recovery: 0.4, discountRate: RATE, years: 5 }).pointsUpfront;
      expect(spreadFromUpfront(puf, coupon, 0.4, RATE, 5)).toBeCloseTo(spreadBp, 2);
    }
  });

  it('nets the accrued coupon out of the cash settled', () => {
    const puf = -0.962;
    const notional = 10_000_000;
    const gross = (puf / 100) * notional;
    // 45 days into the quarter at a 100 bp coupon.
    expect(cashSettlement(puf, 100, notional, 45)).toBeCloseTo(gross - (0.01 * 45 / 360) * notional, 4);
    expect(cashSettlement(puf, 100, notional, 0)).toBeCloseTo(gross, 6);
  });

  it('uses the two standard coupons', () => {
    expect(STANDARD_COUPON_IG).toBe(100);
    expect(STANDARD_COUPON_HY).toBe(500);
    expect(standardCoupon(false)).toBe(100);
    expect(standardCoupon(true)).toBe(500);
  });

  it('reports the par spread implied by a hazard rate', () => {
    const hazard = solveHazardFromSpread(0.0078, RATE, 0.4, 5);
    expect(parSpreadBp(hazard, RATE, 0.4, 5)).toBeCloseTo(78, 4);
  });

  it('quotes at the standard conventions in one call', () => {
    expect(quoteAtStandard(78, false, RATE).pointsUpfront).toBeCloseTo(-0.962, 2);
    expect(quoteAtStandard(480, true, RATE).pointsUpfront).toBeCloseTo(-0.749, 2);
  });
});

describe('CDS RISK MEASURES', () => {
  const igQuote = { spreadBp: 78, couponBp: 100, recovery: 0.4, discountRate: RATE, years: 5 };
  const buyer: CdsPosition = { notional: 10_000_000, direction: 'BuyProtection', quote: igQuote };
  const seller: CdsPosition = { notional: 10_000_000, direction: 'SellProtection', quote: igQuote };

  it('gives CS01 of about $4,340 per $10mm on a five-year investment grade name', () => {
    expect(cs01(buyer)).toBeCloseTo(4375, -2);
    expect(cs01(buyer)).toBeGreaterThan(4000);
    expect(cs01(buyer)).toBeLessThan(4700);
  });

  it('scales CS01 with notional and shortens it with tenor', () => {
    expect(cs01({ ...buyer, notional: 50_000_000 })).toBeCloseTo(cs01(buyer) * 5, 4);
    expect(cs01({ ...buyer, quote: { ...igQuote, years: 1 } })).toBeLessThan(cs01(buyer));
  });

  it('marks the two directions as exact opposites', () => {
    expect(markToMarket(buyer)).toBeCloseTo(-markToMarket(seller), 6);
    expect(markToMarket(buyer)).toBeCloseTo(-96_200, -2);
  });

  it('gives JUMP TO DEFAULT of about six million on a $10mm protection buyer', () => {
    // Large and discontinuous next to a mark near zero, which is exactly why
    // it is carried as a separate measure from CS01.
    const jtd = jumpToDefault(buyer);
    expect(jtd).toBeGreaterThan(5_900_000);
    expect(jtd).toBeLessThan(6_200_000);
    expect(jumpToDefault(seller)).toBeLessThan(-5_900_000);
  });

  it('shrinks jump risk as the recovery assumption rises', () => {
    const highRecovery: CdsPosition = { ...buyer, quote: { ...igQuote, recovery: 0.7 } };
    expect(jumpToDefault(highRecovery)).toBeLessThan(jumpToDefault(buyer));
  });

  it('makes recovery01 matter for a distressed name and barely at all for a tight one', () => {
    const distressed: CdsPosition = {
      notional: 10_000_000, direction: 'BuyProtection',
      quote: { spreadBp: 1600, couponBp: 500, recovery: 0.25, discountRate: RATE, years: 5 },
    };
    expect(Math.abs(recovery01(distressed))).toBeGreaterThan(Math.abs(recovery01(buyer)) * 3);
  });

  it('pays carry to the seller and charges it to the buyer', () => {
    expect(dailyCarry(seller)).toBeGreaterThan(0);
    expect(dailyCarry(buyer)).toBeLessThan(0);
    expect(dailyCarry(seller)).toBeCloseTo((0.01 * 10_000_000) / 360, 6);
    expect(directionSign('BuyProtection')).toBe(-1);
    expect(directionSign('SellProtection')).toBe(1);
  });

  it('has small but non-zero rate sensitivity', () => {
    expect(Math.abs(ir01(buyer))).toBeGreaterThan(0);
    expect(Math.abs(ir01(buyer))).toBeLessThan(Math.abs(cs01(buyer)));
  });

  it('computes the bond-CDS basis, which is only meaningful because they share an issuer', () => {
    expect(bondCdsBasisBp(78, 95)).toBe(-17);
    expect(bondCdsBasisBp(120, 95)).toBe(25);
  });
});
