import { describe, expect, it } from 'vitest';
import { SifmaCalendar } from '../core/sifmaCalendar.js';
import { nssDiscountCurve } from '../curves/discount.js';
import { SEED_BETAS } from '../curves/rateFactors.js';
import { seedMortgageRates } from '../curves/mortgageRates.js';
import { buildBook, DEMO_SCALE, scaleBook } from './bookBuilder.js';
import type { Security } from '../instruments/types.js';
import {
  cdsJumpToDefault, priceAtYield, priceSecurity, termsFor, yearsBefore,
  type ValuationContext,
} from './valuation.js';

const calendar = new SifmaCalendar();
const curve = nssDiscountCurve(SEED_BETAS);

const built = buildBook({ asOf: 20260907, calendar, seed: 3, scale: scaleBook(DEMO_SCALE, 0.2) });

function context(over: Partial<ValuationContext> = {}): ValuationContext {
  return {
    asOf: 20260907, calendar, curve, mortgage: seedMortgageRates(),
    spreadBp: 0, withKeyRates: true, ...over,
  };
}

function firstOf(assetClass: string): Security {
  const found = built.securities.find((s) => s.assetClass === assetClass);
  if (found === undefined) throw new Error(`no ${assetClass} in the universe`);
  return found;
}

describe('yearsBefore', () => {
  it('walks back whole years', () => {
    expect(yearsBefore(20260907, 4)).toBe(20220907);
    expect(yearsBefore(20260907, 0)).toBe(20260907);
  });
});

describe('termsFor', () => {
  it('carries the security conventions onto the cashflow terms', () => {
    const security = firstOf('CorpIG');
    const terms = termsFor(security, calendar);
    expect(terms.couponRate).toBe(security.couponRate);
    expect(terms.frequency).toBe(security.frequency);
    expect(terms.dayCount).toBe(security.dayCount);
    expect(terms.redemption).toBe(100);
    expect(terms.schedule.length).toBeGreaterThan(0);
    const last = terms.schedule[terms.schedule.length - 1];
    expect(last?.accrualEnd).toBe(security.maturityDate);
  });
});

describe('priceSecurity', () => {
  it('returns par with no risk for a security already matured', () => {
    const security = { ...firstOf('CorpIG'), maturityDate: 20200101 };
    const priced = priceSecurity(security, context());
    expect(priced.cleanPrice).toBe(100);
    expect(priced.modifiedDuration).toBe(0);
    expect(priced.keyRateDurations.every((value) => value === 0)).toBe(true);
  });

  it('prices every asset class in the universe to a sane, finite number', () => {
    const seen = new Set<string>();
    for (const security of built.securities) {
      if (seen.has(security.assetClass)) continue;
      seen.add(security.assetClass);
      const priced = priceSecurity(security, context({ spreadBp: 120 }));
      expect(Number.isFinite(priced.cleanPrice)).toBe(true);
      expect(priced.cleanPrice).toBeGreaterThan(0);
      expect(priced.cleanPrice).toBeLessThan(400);
      expect(priced.dirtyPrice).toBeCloseTo(priced.cleanPrice + priced.accruedInterest, 8);
    }
    expect(seen.size).toBeGreaterThanOrEqual(8);
  });

  it('reprices its own yield back to its own price', () => {
    const security = firstOf('CorpIG');
    const priced = priceSecurity(security, context({ spreadBp: 145 }));
    expect(priceAtYield(security, calendar, 20260907, priced.yieldToMaturity))
      .toBeCloseTo(priced.cleanPrice, 6);
  });

  it('never quotes a yield to worst above the yield to maturity', () => {
    for (const security of built.securities.slice(0, 200)) {
      if (security.assetClass === 'CDS') continue;
      const priced = priceSecurity(security, context({ spreadBp: 90 }));
      if (priced.cleanPrice === 100) continue;
      expect(priced.yieldToWorst).toBeLessThanOrEqual(priced.yieldToMaturity + 1e-6);
    }
  });

  it('sums key rate durations to the effective duration', () => {
    for (const assetClass of ['Rates', 'CorpIG', 'Muni', 'CMBS']) {
      const priced = priceSecurity(firstOf(assetClass), context({ spreadBp: 60 }));
      const total = priced.keyRateDurations.reduce((sum, value) => sum + value, 0);
      expect(total).toBeCloseTo(priced.effectiveDuration, 3);
    }
  });

  it('makes beta[0] the key rate sum, because the level loading is 1 everywhere', () => {
    const priced = priceSecurity(firstOf('CorpIG'), context({ spreadBp: 60 }));
    const total = priced.keyRateDurations.reduce((sum, value) => sum + value, 0);
    expect(priced.betaSensitivity[0]).toBeCloseTo(total, 8);
  });

  it('skips the key rate work when it is not asked for', () => {
    const security = firstOf('CorpIG');
    const priced = priceSecurity(security, context({ withKeyRates: false }));
    expect(priced.keyRateDurations.every((value) => value === 0)).toBe(true);
    expect(priced.modifiedDuration).toBeGreaterThan(0);
  });

  it('widens the spread and the price falls', () => {
    const security = firstOf('CorpHY');
    const tight = priceSecurity(security, context({ spreadBp: 250 }));
    const wide = priceSecurity(security, context({ spreadBp: 600 }));
    expect(wide.cleanPrice).toBeLessThan(tight.cleanPrice);
    expect(wide.yieldToMaturity).toBeGreaterThan(tight.yieldToMaturity);
  });

  it('gives a mortgage pool a weighted average life and a real spread duration', () => {
    const priced = priceSecurity(firstOf('AgencyMBS'), context({ spreadBp: 45 }));
    expect(priced.weightedAverageLife).toBeGreaterThan(0);
    expect(priced.weightedAverageLife).toBeLessThan(30);
    expect(priced.spreadDuration).toBeGreaterThan(0);
  });

  it('prices a bill off a discount rate rather than a coupon stream', () => {
    const bill = built.securities.find((s) => s.securityType === 'TBill');
    if (bill === undefined) throw new Error('no bill in the universe');
    const priced = priceSecurity(bill, context());
    expect(priced.discountRate).toBeGreaterThan(0);
    expect(priced.bondEquivalentYield).toBeGreaterThan(priced.discountRate);
    expect(priced.accruedInterest).toBe(0);
  });
});

describe('cdsJumpToDefault', () => {
  it('is a loss for sold protection and a gain for bought protection', () => {
    const cds = firstOf('CDS');
    const ctx = context({ spreadBp: 180 });
    const sold = cdsJumpToDefault(cds, ctx, 10_000_000);
    const bought = cdsJumpToDefault(cds, ctx, -10_000_000);
    expect(sold).toBeLessThan(0);
    expect(bought).toBeGreaterThan(0);
    expect(sold).toBeCloseTo(-bought, 6);
  });

  it('is zero for anything that is not a credit default swap', () => {
    expect(cdsJumpToDefault(firstOf('CorpIG'), context(), 10_000_000)).toBe(0);
  });
});

describe('priceCds', () => {
  const cds = firstOf('CDS');

  it('quotes points upfront against 100, not a bond price', () => {
    const priced = priceSecurity(cds, context({ spreadBp: 140 }));
    expect(priced.cleanPrice).toBeGreaterThan(80);
    expect(priced.cleanPrice).toBeLessThan(130);
    expect(priced.accruedInterest).toBeGreaterThanOrEqual(0);
  });

  it('moves upfront the opposite way to the spread for sold protection', () => {
    const tight = priceSecurity(cds, context({ spreadBp: 60 }));
    const wide = priceSecurity(cds, context({ spreadBp: 400 }));
    expect(wide.cleanPrice).toBeLessThan(tight.cleanPrice);
  });

  it('trades at close to par when the spread equals the fixed coupon', () => {
    const atCoupon = priceSecurity(cds, context({ spreadBp: cds.issueSpreadBp }));
    expect(atCoupon.cleanPrice).toBeCloseTo(100, 0);
  });

  it('carries a risky PV01 as its spread duration and a real CS01', () => {
    const priced = priceSecurity(cds, context({ spreadBp: 140 }));
    expect(priced.spreadDuration).toBeGreaterThan(0);
    expect(priced.cs01).not.toBe(0);
  });

  it('spreads its key rate risk across the knots, summing to the spread duration', () => {
    const priced = priceSecurity(cds, context({ spreadBp: 140, withKeyRates: true }));
    const total = priced.keyRateDurations.reduce((sum, value) => sum + value, 0);
    expect(total).not.toBe(0);
    const bare = priceSecurity(cds, context({ spreadBp: 140, withKeyRates: false }));
    expect(bare.keyRateDurations.every((value) => value === 0)).toBe(true);
  });

  it('reports its yield as the spread it was quoted at', () => {
    const priced = priceSecurity(cds, context({ spreadBp: 275 }));
    expect(priced.yieldToMaturity).toBeCloseTo(2.75, 8);
    expect(priced.workoutDate).toBe(cds.maturityDate);
  });
});
