import { describe, expect, it } from 'vitest';

import { isValidCusip } from '../core/identifiers.js';
import { buildCmbsDeals, buildConduitStack, CMBS_CPY, stackProblems } from './spgDealCmbs.js';
import { buildAbsDeals, absToSmm, structureFor } from './spgDealAbs.js';
import {
  adjustedCollateralPar, buildCloDeals, CAA_LIMIT, caaBucketShare, coverageTests, equityLeverage,
  equityNav, RATING_FACTOR, subordinatedShare, weightedAverageRatingFactor, type CloLoan,
} from './spgDealClo.js';

describe('THE CONDUIT CAPITAL STACK', () => {
  const dealSize = 900_000_000;
  const stack = buildConduitStack(dealSize);

  it('has no arithmetic problems at all', () => {
    expect(stackProblems(stack, dealSize)).toEqual([]);
  });

  it('sums the funded classes to the deal size EXACTLY', () => {
    const total = stack
      .filter((t) => t.kind !== 'io')
      .reduce((sum, t) => sum + t.originalBalanceUsd, 0);
    expect(total).toBe(dealSize);
  });

  it('reproduces the published credit-support grid', () => {
    const support = new Map(stack.map((t) => [t.trancheId, Number((t.creditSupportPct * 100).toFixed(3))]));
    expect(support.get('A-4')).toBe(30);
    expect(support.get('A-S')).toBe(22.5);
    expect(support.get('B')).toBe(17.5);
    expect(support.get('C')).toBe(13.875);
    expect(support.get('D')).toBe(10.5);
    expect(support.get('E')).toBe(8.25);
    expect(support.get('F')).toBe(6.25);
    expect(support.get('G')).toBe(4.5);
    expect(support.get('HRR')).toBe(0);
  });

  it('gives the whole senior block ONE attachment point', () => {
    const seniors = stack.filter((t) => t.kind === 'senior');
    expect(seniors).toHaveLength(5);
    for (const tranche of seniors) expect(tranche.creditSupportPct).toBeCloseTo(0.3, 9);
  });

  it('steps support down monotonically below the seniors', () => {
    const subs = stack.filter((t) => t.kind === 'subordinate' || t.kind === 'retention');
    for (let i = 1; i < subs.length; i++) {
      expect(subs[i]?.creditSupportPct as number).toBeLessThan(subs[i - 1]?.creditSupportPct as number);
    }
  });

  it('makes attachment and detachment contiguous', () => {
    const funded = stack.filter((t) => t.kind !== 'io').slice().reverse();
    for (let i = 1; i < funded.length; i++) {
      if ((funded[i]?.kind as string) === 'senior') continue;
      expect(funded[i]?.attachmentPct as number).toBeCloseTo(funded[i - 1]?.detachmentPct as number, 9);
    }
  });

  it('sets each IO notional to the sum of the classes it references', () => {
    const byId = new Map(stack.map((t) => [t.trancheId, t]));
    for (const io of stack.filter((t) => t.kind === 'io')) {
      const expected = (io.notionalOf ?? []).reduce(
        (sum, id) => sum + (byId.get(id)?.originalBalanceUsd ?? 0), 0,
      );
      expect(io.originalBalanceUsd).toBe(expected);
    }
  });

  it('retains a first-loss piece of at least 4.5% of par', () => {
    const hrr = stack.find((t) => t.kind === 'retention');
    expect((hrr?.originalBalanceUsd as number) / dealSize).toBeGreaterThanOrEqual(0.045);
  });

  it('holds for any deal size, rounding absorbed by the retention class', () => {
    for (const size of [412_345_678, 700_000_000, 1_337_000_000]) {
      expect(stackProblems(buildConduitStack(size), size)).toEqual([]);
    }
  });

  it('detects a broken stack rather than passing it', () => {
    const broken = buildConduitStack(dealSize).map((t) =>
      t.trancheId === 'B' ? { ...t, creditSupportPct: 0.9 } : t,
    );
    expect(stackProblems(broken, dealSize).length).toBeGreaterThan(0);
  });
});

describe('CMBS deals', () => {
  const { deals, securities } = buildCmbsDeals({ asOf: 20260115, seed: 1001, startSecurityId: 400_000, dealCount: 12 });

  it('builds a full stack per deal with valid identifiers', () => {
    expect(deals).toHaveLength(12);
    expect(securities.length).toBeGreaterThan(deals.length * 10);
    const seen = new Set<string>();
    for (const security of securities) {
      expect(isValidCusip(security.cusip)).toBe(true);
      expect(seen.has(security.cusip)).toBe(false);
      seen.add(security.cusip);
    }
  });

  it('sums the property mix to one', () => {
    for (const deal of deals) {
      const total = Object.values(deal.propertyMix).reduce((a, b) => a + b, 0);
      expect(total).toBeCloseTo(1, 2);
    }
  });

  it('correlates office concentration and seasoning with distress', () => {
    // A seasoned office-heavy deal SHOULD have a stressed mezzanine. That
    // correlation is worth more than a hundred independently random fields.
    const worst = [...deals].sort((a, b) => b.delinquent60PlusPct - a.delinquent60PlusPct)[0];
    const best = [...deals].sort((a, b) => a.delinquent60PlusPct - b.delinquent60PlusPct)[0];
    expect(worst?.propertyMix.Office as number).toBeGreaterThan(best?.propertyMix.Office as number);
  });

  it('widens spreads steeply down the stack', () => {
    const deal = deals[0];
    const tranches = securities.filter((s) => s.issuerName === deal?.dealId);
    const senior = tranches.find((t) => t.description.endsWith('A-4'));
    const junior = tranches.find((t) => t.description.endsWith('G'));
    expect(junior?.issueSpreadBp as number).toBeGreaterThan((senior?.issueSpreadBp as number) * 5);
  });

  it('does NOT prepay, so conduit CMBS is positively convex', () => {
    // Defeasance and yield maintenance lock the loans, unlike an agency
    // pass-through. The contrast shows up in a single convexity column.
    expect(CMBS_CPY).toBe(0);
  });

  it('is deterministic', () => {
    const again = buildCmbsDeals({ asOf: 20260115, seed: 1001, startSecurityId: 400_000, dealCount: 12 });
    expect(again.securities.map((s) => s.cusip)).toEqual(securities.map((s) => s.cusip));
  });
});

describe('CLO mechanics', () => {
  const { deals, securities } = buildCloDeals({ asOf: 20260115, seed: 1101, startSecurityId: 500_000, dealCount: 8 });

  it('uses rating factors that are exponential, not linear', () => {
    // A Caa is worth many B-equivalents, which is why a small CCC bucket
    // dominates a deal's stated quality.
    expect((RATING_FACTOR[6] as number) / (RATING_FACTOR[5] as number)).toBeGreaterThan(2);
    expect((RATING_FACTOR[5] as number) / (RATING_FACTOR[4] as number)).toBeGreaterThan(1.9);
  });

  it('COMPUTES WARF from the pool, landing a BSL deal in the 2500-3200 band', () => {
    for (const deal of deals.filter((d) => d.dealType === 'BSL')) {
      expect(deal.warf).toBeGreaterThan(2400);
      expect(deal.warf).toBeLessThan(3300);
      expect(deal.warf).toBe(Math.round(weightedAverageRatingFactor(deal.loans)));
    }
  });

  it('LEVERS THE EQUITY about nine and a half times', () => {
    expect(equityLeverage()).toBeGreaterThan(9);
    expect(equityLeverage()).toBeLessThan(10);
    expect(subordinatedShare()).toBeCloseTo(1 / equityLeverage(), 10);
    for (const deal of deals) expect(deal.equityLeverage).toBeCloseTo(equityLeverage(), 1);
  });

  it('turns a two-point collateral move into nineteen points of equity NAV', () => {
    const par = 500_000_000;
    const debt = par * (1 + 0.01 - subordinatedShare());
    const sub = par * subordinatedShare();
    const high = equityNav(par, 98.5, debt, sub);
    const low = equityNav(par, 96.5, debt, sub);
    expect(high - low).toBeGreaterThan(17);
    expect(high - low).toBeLessThan(21);
  });

  it('computes overcollateralisation tests with real cushions', () => {
    for (const deal of deals) {
      expect(deal.coverageTests.length).toBeGreaterThan(3);
      for (const test of deal.coverageTests) {
        expect(test.ratio).toBeGreaterThan(1);
        expect(test.cushionBp).toBe(Math.round((test.ratio - test.trigger) * 10000));
      }
      // Senior tests have more cushion than junior ones.
      const first = deal.coverageTests[0];
      const last = deal.coverageTests[deal.coverageTests.length - 1];
      expect(first?.ratio as number).toBeGreaterThan(last?.ratio as number);
    }
  });

  it('HAIRCUTS the excess Caa bucket at market value', () => {
    // The mechanic that transmits a credit selloff into the structure.
    const loans = (caaShare: number, caaPrice: number): CloLoan[] => {
      const out: CloLoan[] = [];
      for (let i = 0; i < 100; i++) {
        const isCaa = i < caaShare * 100;
        out.push({
          obligorName: `O${i}`, ratingIndex: isCaa ? 6 : 5, parUsd: 1_000_000,
          spreadBp: 400, price: isCaa ? caaPrice : 98,
        });
      }
      return out;
    };
    const within = adjustedCollateralPar(loans(0.05, 70));
    const over = adjustedCollateralPar(loans(0.2, 70));
    expect(within).toBe(100_000_000);
    expect(over).toBeLessThan(100_000_000);
    // Falling Caa prices cut the numerator further still.
    expect(adjustedCollateralPar(loans(0.2, 50))).toBeLessThan(over);
  });

  it('leaves the numerator at par while the bucket is inside its limit', () => {
    expect(CAA_LIMIT).toBeCloseTo(0.075, 6);
    const clean: CloLoan[] = Array.from({ length: 50 }, (_, i) => ({
      obligorName: `O${i}`, ratingIndex: 5, parUsd: 2_000_000, spreadBp: 400, price: 98,
    }));
    expect(caaBucketShare(clean)).toBe(0);
    expect(adjustedCollateralPar(clean)).toBe(100_000_000);
  });

  it('subtracts defaulted par outright', () => {
    const loans: CloLoan[] = Array.from({ length: 50 }, (_, i) => ({
      obligorName: `O${i}`, ratingIndex: 5, parUsd: 2_000_000, spreadBp: 400, price: 98,
    }));
    expect(adjustedCollateralPar(loans, 5_000_000)).toBe(95_000_000);
  });

  it('handles an empty pool without dividing by zero', () => {
    expect(weightedAverageRatingFactor([])).toBe(0);
    expect(caaBucketShare([])).toBe(0);
    expect(coverageTests([], 0)).toHaveLength(5);
    expect(equityNav(100, 98, 90, 0)).toBe(0);
  });

  it('issues a subordinated class that is quoted as an equity, not a bond', () => {
    const subs = securities.filter((s) => s.description.endsWith('SUB'));
    expect(subs.length).toBe(8);
    for (const sub of subs) {
      expect(sub.seniority).toBe('Equity');
      expect(sub.quotationBasis).toBe('Decimal');
    }
  });
});

describe('ABS sector structures', () => {
  const { deals, securities } = buildAbsDeals({ asOf: 20260115, seed: 1201, startSecurityId: 600_000, dealsPerSector: 3 });

  it('builds every sector, with valid identifiers', () => {
    expect(new Set(deals.map((d) => d.sector)).size).toBe(6);
    for (const security of securities) expect(isValidCusip(security.cusip)).toBe(true);
  });

  it('sums class shares to one in every structure', () => {
    for (const sector of ['AutoPrime', 'AutoSubprime', 'CreditCard', 'StudentFFELP', 'Equipment', 'Esoteric'] as const) {
      const total = structureFor(sector).reduce((sum, cls) => sum + cls.share, 0);
      expect(total).toBeCloseTo(1, 6);
    }
  });

  it('gives autos a money-market A-1 class and quotes them in ABS speed', () => {
    const auto = deals.find((d) => d.sector === 'AutoPrime');
    expect(auto?.absSpeedPct).not.toBeNull();
    expect(auto?.monthlyPaymentRatePct).toBeNull();
    const a1 = structureFor('AutoPrime')[0];
    expect(a1?.trancheId).toBe('A-1');
    expect(a1?.walYears as number).toBeLessThan(0.6);
  });

  it('makes credit cards SOFT BULLETS - one average life for the whole stack', () => {
    const classes = structureFor('CreditCard');
    const wals = new Set(classes.map((c) => c.walYears));
    expect(wals.size).toBe(1);
    expect(classes[0]?.walYears).toBeCloseTo(2.98, 2);
    const card = deals.find((d) => d.sector === 'CreditCard');
    expect(card?.monthlyPaymentRatePct).not.toBeNull();
  });

  it('gives FFELP a long class with EXTENSION risk, not credit risk', () => {
    const classes = structureFor('StudentFFELP');
    expect(classes[1]?.walYears as number).toBeGreaterThan(10);
    expect(classes[0]?.ratingIndex).toBe(0);
    const ffelp = securities.filter((s) => s.description.startsWith('NAVSL') || s.description.startsWith('SLMA'));
    expect(ffelp.every((s) => s.couponType === 'Floating')).toBe(true);
  });

  it('gives esoterics an anticipated repayment date and a step-up coupon', () => {
    const esoteric = deals.find((d) => d.sector === 'Esoteric');
    expect(esoteric?.anticipatedRepaymentDate).not.toBeNull();
    expect(esoteric?.stepUpCouponBp).toBe(500);
    // Legal final decades after the ARD.
    const bonds = securities.filter((s) => s.issuerName === esoteric?.dealId);
    expect(bonds[0]?.maturityDate as number).toBeGreaterThan(esoteric?.anticipatedRepaymentDate as number);
  });

  it('gives subprime far more loss and excess spread than prime', () => {
    const prime = deals.filter((d) => d.sector === 'AutoPrime');
    const subprime = deals.filter((d) => d.sector === 'AutoSubprime');
    const mean = (list: typeof prime, key: 'cumulativeNetLossPct' | 'excessSpreadPct'): number =>
      list.reduce((a, b) => a + b[key], 0) / list.length;
    expect(mean(subprime, 'cumulativeNetLossPct')).toBeGreaterThan(mean(prime, 'cumulativeNetLossPct') * 4);
    expect(mean(subprime, 'excessSpreadPct')).toBeGreaterThan(mean(prime, 'excessSpreadPct'));
  });

  it('converts ABS speed to a monthly mortality that rises with seasoning', () => {
    expect(absToSmm(1.5, 1)).toBeCloseTo(0.015, 6);
    expect(absToSmm(1.5, 12)).toBeGreaterThan(absToSmm(1.5, 1));
    expect(absToSmm(1.5, 200)).toBe(1);
  });
});
