
import { describe, expect, it } from 'vitest';

import { yearOf } from '../core/dateInt.js';
import { isValidCusip } from '../core/identifiers.js';
import { SifmaCalendar } from '../core/sifmaCalendar.js';
import { buildSchedule } from '../analytics/schedule.js';
import { priceToWorkout, yieldToWorst } from '../analytics/workout.js';
import { buildMuniDeals, dealSecurities, muniCoupon, muniSpreadToScaleBp, STATE_SPREAD_BP } from './muniDeals.js';

const calendar = new SifmaCalendar();
const scaleYield = (tenor: number): number => 2.6 + 0.06 * Math.min(tenor, 20);
const { deals, securities } = buildMuniDeals({
  asOf: 20260115, seed: 801, startSecurityId: 200_000, scaleYield, dealCount: 40,
});

describe('serial deal structure', () => {
  it('builds many maturities per deal, not one bond at a time', () => {
    expect(deals).toHaveLength(40);
    expect(securities.length).toBeGreaterThan(deals.length * 10);
  });

  it('runs consecutive annual maturities within a deal', () => {
    const deal = deals.find((d) => dealSecurities(securities, d.cusipPrefix).length > 12);
    expect(deal).toBeDefined();
    const run = dealSecurities(securities, deal?.cusipPrefix as string);
    const years = run.map((s) => yearOf(s.maturityDate));
    for (let i = 1; i < years.length; i++) {
      const gap = (years[i] as number) - (years[i - 1] as number);
      expect(gap).toBeGreaterThanOrEqual(1);
    }
  });

  it('advances issue codes alphabetically BY MATURITY, so a deal reads as a run', () => {
    // This is the muni fingerprint: 13063DAA1, 13063DAB9, 13063DAC7 ...
    const deal = deals.find((d) => dealSecurities(securities, d.cusipPrefix).length > 10);
    const run = dealSecurities(securities, deal?.cusipPrefix as string);
    const codes = run.map((s) => s.cusip.slice(6, 8));
    for (let i = 1; i < codes.length; i++) {
      expect((codes[i] as string) > (codes[i - 1] as string)).toBe(true);
    }
  });

  it('shares one obligor prefix across a whole deal', () => {
    for (const deal of deals) {
      for (const security of dealSecurities(securities, deal.cusipPrefix)) {
        expect(security.issuerName).toBe(deal.obligorName);
      }
    }
  });

  it('mints valid, unique CUSIPs', () => {
    const seen = new Set<string>();
    for (const security of securities) {
      expect(isValidCusip(security.cusip)).toBe(true);
      expect(seen.has(security.cusip)).toBe(false);
      seen.add(security.cusip);
    }
  });

  it('denominates in the 5,000 increments munis trade in', () => {
    for (const security of securities) {
      expect(security.amountOutstandingUsd % 5_000).toBe(0);
    }
  });
});

describe('THE 5% COUPON CONVENTION', () => {
  it('issues EVERY long tax-exempt maturity at exactly 5.000%', () => {
    // Taxable deals price off the Treasury curve near par instead, so the
    // rule is stated over tax-exempt paper - where it holds without exception.
    const taxExemptPrefixes = new Set(
      deals.filter((d) => d.federalTax !== 'Taxable').map((d) => d.cusipPrefix),
    );
    const long = securities.filter(
      (s) => s.originalTermYears >= 11 && taxExemptPrefixes.has(s.cusip.slice(0, 6)),
    );
    expect(long.length).toBeGreaterThan(100);
    for (const bond of long) expect(bond.couponRate).toBe(5);

    // And taxable long bonds are NOT 5s - they price near par off Treasuries.
    const taxable = securities.filter(
      (s) => s.originalTermYears >= 11 && !taxExemptPrefixes.has(s.cusip.slice(0, 6)),
    );
    expect(taxable.length).toBeGreaterThan(0);
    expect(taxable.every((b) => b.couponRate === 5)).toBe(false);
  });

  it('applies the rule directly', () => {
    expect(muniCoupon(20, 3.4, 'TaxExempt')).toBe(5);
    expect(muniCoupon(11, 3.4, 'TaxExempt')).toBe(5);
    expect(muniCoupon(9, 3.1, 'TaxExempt')).toBe(4);
    expect(muniCoupon(5, 2.9, 'TaxExempt')).toBeCloseTo(2.875, 6);
    // Taxable munis price off the Treasury curve, near par.
    expect(muniCoupon(20, 5.2, 'Taxable')).toBeCloseTo(5.25, 6);
  });

  it('PRICES THE BOOK AT 108 TO 125, not near par', () => {
    // The consequence of the convention, and the phase gate. A 5% twenty-year
    // offered to a ten-year par call at 3.60 prices near 111.67.
    const terms = {
      schedule: buildSchedule({ effective: 20260115, maturity: 20460115, frequency: 2 as const, calendar }),
      couponRate: 5,
      frequency: 2,
      redemption: 100,
      dayCount: '30/360' as const,
    };
    const price = priceToWorkout(terms, 20260115, 3.6, { date: 20360115, price: 100, type: 'Call' });
    expect(price).toBeCloseTo(111.67, 1);
    expect(price).toBeGreaterThan(108);
    expect(price).toBeLessThan(125);
  });

  it('quotes a yield-to-worst well below yield-to-maturity on those bonds', () => {
    const terms = {
      schedule: buildSchedule({ effective: 20260115, maturity: 20460115, frequency: 2 as const, calendar }),
      couponRate: 5,
      frequency: 2,
      redemption: 100,
      dayCount: '30/360' as const,
    };
    const call = { date: 20360115, price: 100, type: 'Call' as const };
    const price = priceToWorkout(terms, 20260115, 3.6, call);
    const result = yieldToWorst(terms, 20260115, price, [call]);
    expect(result.yieldToWorst).toBeCloseTo(3.6, 4);
    expect(result.yieldToMaturity - result.yieldToWorst).toBeGreaterThan(0.4);
  });

  it('gives long maturities a ten-year par call', () => {
    const callable = securities.filter((s) => s.callable);
    expect(callable.length).toBeGreaterThan(100);
    for (const security of callable) {
      expect(security.callSchedule).toHaveLength(1);
      expect(security.callSchedule[0]?.price).toBe(100);
      expect(security.callSchedule[0]?.date as number).toBeLessThan(security.maturityDate);
    }
  });
});

describe('spreads to the AAA scale', () => {
  it('widens down the rating scale', () => {
    const base = { purpose: 'General Obligation' as const, state: 'OH', federalTax: 'TaxExempt' as const, bankQualified: false, insurer: null };
    const spreads = [0, 1, 2, 3, 4].map((r) => muniSpreadToScaleBp(base, r));
    for (let i = 1; i < spreads.length; i++) {
      expect(spreads[i] as number).toBeGreaterThan(spreads[i - 1] as number);
    }
  });

  it('charges for the sector: hospitals and tobacco wide, water tight', () => {
    const at = (purpose: Parameters<typeof muniSpreadToScaleBp>[0]['purpose']): number =>
      muniSpreadToScaleBp({ purpose, state: 'OH', federalTax: 'TaxExempt', bankQualified: false, insurer: null }, 2);
    expect(at('Tobacco Settlement')).toBeGreaterThan(at('Hospital'));
    expect(at('Hospital')).toBeGreaterThan(at('General Obligation'));
    expect(at('Water & Sewer')).toBeLessThan(at('General Obligation'));
  });

  it('reflects in-state demand, so California trades rich and Illinois cheap', () => {
    expect(STATE_SPREAD_BP.CA as number).toBeLessThan(0);
    expect(STATE_SPREAD_BP.IL as number).toBeGreaterThan(20);
    expect(STATE_SPREAD_BP.PR as number).toBeGreaterThan(200);
  });

  it('charges for AMT and credits bank-qualified paper', () => {
    const base = { purpose: 'Airport' as const, state: 'OH', bankQualified: false, insurer: null };
    expect(muniSpreadToScaleBp({ ...base, federalTax: 'AMT' }, 2)).toBeGreaterThan(
      muniSpreadToScaleBp({ ...base, federalTax: 'TaxExempt' }, 2),
    );
    expect(
      muniSpreadToScaleBp({ ...base, federalTax: 'TaxExempt', bankQualified: true }, 2),
    ).toBeLessThan(muniSpreadToScaleBp({ ...base, federalTax: 'TaxExempt' }, 2));
  });

  it('caps an insured bond near a AA credit but keeps the underlying rating', () => {
    const insured = deals.filter((d) => d.insurer !== null);
    expect(insured.length).toBeGreaterThan(0);
    for (const deal of insured) {
      expect(deal.underlyingRatingIndex).toBeGreaterThanOrEqual(2);
      const bonds = dealSecurities(securities, deal.cusipPrefix);
      for (const bond of bonds) expect(bond.ratingIndex).toBeLessThanOrEqual(1);
    }
  });
});

describe('classification and liquidity', () => {
  it('marks tax status, and mostly issues tax-exempt', () => {
    const statuses = new Set(deals.map((d) => d.federalTax));
    expect(statuses.has('TaxExempt')).toBe(true);
    expect(deals.filter((d) => d.federalTax === 'TaxExempt').length / deals.length).toBeGreaterThan(0.6);
  });

  it('puts most of the book in the illiquid tiers, as munis are', () => {
    const illiquid = securities.filter((s) => s.liquidityTier === 'T4' || s.liquidityTier === 'T5');
    expect(illiquid.length / securities.length).toBeGreaterThan(0.8);
  });

  it('quotes munis in yield', () => {
    expect(securities.every((s) => s.quotationBasis === 'Yield')).toBe(true);
  });

  it('is deterministic', () => {
    const again = buildMuniDeals({ asOf: 20260115, seed: 801, startSecurityId: 200_000, scaleYield, dealCount: 40 });
    expect(again.securities.map((s) => s.cusip)).toEqual(securities.map((s) => s.cusip));
  });
});
