
import { describe, expect, it } from 'vitest';

import { nssDiscountCurve } from '../../curves/discount.js';
import { primaryMortgageRate, seedMortgageRates } from '../../curves/mortgageRates.js';
import { effectiveDurationConvexity, isNegativelyConvex } from '../effective.js';
import { GENERIC_COLLATERAL } from './poolMultipliers.js';
import {
  mbsOasFromPrice, mbsPriceUnderShift, mortgagePayment, poolMoneyness, projectCpr,
  projectMbsCashflows, weightedAverageLife, type PoolState,
} from './cprModel.js';

const curve = nssDiscountCurve({ b0: 4.95, b1: -0.85, b2: -1.6, b3: 1.4 });
const mortgage = seedMortgageRates();
const PMR = primaryMortgageRate(curve, mortgage);

function pool(netCoupon: number, overrides: Partial<PoolState> = {}): PoolState {
  return {
    weightedAverageCoupon: netCoupon + 0.71,
    netCoupon,
    weightedAverageMaturity: 340,
    weightedAverageLoanAge: 20,
    factor: 0.95,
    originalFaceUsd: 1_000_000,
    collateral: GENERIC_COLLATERAL,
    cumulativeInTheMoneyMonths: 0,
    ...overrides,
  };
}

function inputs(netCoupon: number, overrides: Partial<PoolState> = {}) {
  return { pool: pool(netCoupon, overrides), curve, mortgage, oasPct: 0.4, startMonth: 3, paymentDelayDays: 24 };
}

describe('projectCpr', () => {
  it('speeds up as the pool moves into the money', () => {
    const speeds = [3, 4.5, 5.5, 6.5, 7.5].map((c) => projectCpr(pool(c), { primaryRate: PMR, month: 6 }));
    for (let i = 1; i < speeds.length; i++) {
      expect(speeds[i] as number).toBeGreaterThan(speeds[i - 1] as number);
    }
  });

  it('leaves a deeply locked-in pool prepaying at only a few CPR', () => {
    expect(projectCpr(pool(2.5), { primaryRate: PMR, month: 6 })).toBeLessThan(6);
  });

  it('never exceeds the ceiling', () => {
    expect(projectCpr(pool(12), { primaryRate: PMR, month: 6 })).toBeLessThanOrEqual(60);
  });

  it('slows a burnt-out pool at the same incentive', () => {
    const fresh = projectCpr(pool(7), { primaryRate: PMR, month: 6 });
    const burnt = projectCpr(pool(7, { cumulativeInTheMoneyMonths: 48 }), { primaryRate: PMR, month: 6 });
    expect(burnt).toBeLessThan(fresh * 0.75);
  });

  it('slows a low-loan-balance pool at the same incentive', () => {
    const generic = projectCpr(pool(7), { primaryRate: PMR, month: 6 });
    const llb = projectCpr(
      pool(7, { collateral: { ...GENERIC_COLLATERAL, averageLoanSize: 85_000 } }),
      { primaryRate: PMR, month: 6 },
    );
    expect(llb).toBeLessThan(generic * 0.6);
  });

  it('varies with the season', () => {
    const july = projectCpr(pool(6), { primaryRate: PMR, month: 7 });
    const january = projectCpr(pool(6), { primaryRate: PMR, month: 1 });
    expect(july).toBeGreaterThan(january);
  });
});

describe('cashflows', () => {
  it('returns exactly the current face of principal', () => {
    const flows = projectMbsCashflows(pool(5.5), { primaryRateAt: () => PMR, startMonth: 3 });
    const principal = flows.reduce((a, f) => a + f.scheduledPrincipal + f.prepaidPrincipal, 0);
    expect(principal).toBeCloseTo(1_000_000 * 0.95, 0);
  });

  it('pays the investor the NET coupon, not the borrower rate', () => {
    const flows = projectMbsCashflows(pool(5.5), { primaryRateAt: () => PMR, startMonth: 3 });
    const first = flows[0];
    expect(first?.interest).toBeCloseTo((950_000 * 5.5) / 100 / 12, 4);
  });

  it('amortises the balance monotonically to nothing', () => {
    const flows = projectMbsCashflows(pool(5.5), { primaryRateAt: () => PMR, startMonth: 3 });
    for (let i = 1; i < flows.length; i++) {
      expect(flows[i]?.balanceStart as number).toBeLessThan(flows[i - 1]?.balanceStart as number);
    }
    expect(flows[flows.length - 1]?.balanceStart as number).toBeLessThan(950_000 * 0.01);
  });

  it('shortens the average life as the coupon rises through the money', () => {
    const wal = (c: number): number =>
      weightedAverageLife(projectMbsCashflows(pool(c), { primaryRateAt: () => PMR, startMonth: 3 }));
    expect(wal(3)).toBeGreaterThan(wal(5.5));
    expect(wal(5.5)).toBeGreaterThan(wal(7));
    expect(wal(3)).toBeGreaterThan(10);
    expect(wal(7)).toBeLessThan(7);
  });

  it('applies the payment delay, which is real money', () => {
    const withDelay = mbsPriceUnderShift(inputs(5.5), 0);
    const withoutDelay = mbsPriceUnderShift({ ...inputs(5.5), paymentDelayDays: 0 }, 0);
    expect(withoutDelay).toBeGreaterThan(withDelay);
    // A 24-day lag on a premium pass-through is worth roughly a fifth of a point.
    expect(withoutDelay - withDelay).toBeGreaterThan(0.05);
    expect(withoutDelay - withDelay).toBeLessThan(0.6);
  });

  it('amortises a level payment correctly', () => {
    expect(mortgagePayment(100_000, 6, 360)).toBeCloseTo(599.55, 1);
    expect(mortgagePayment(100_000, 0, 12)).toBeCloseTo(100_000 / 12, 6);
    expect(mortgagePayment(100_000, 6, 0)).toBe(100_000);
  });
});

describe('NEGATIVE CONVEXITY - the asset class signature', () => {
  it('makes a premium pool negatively convex', () => {
    // Only appears because the bump flows all the way through:
    // rate -> primary rate -> incentive -> CPR -> cashflows -> price.
    // Shifting the discount rate alone leaves an MBS positively convex, which
    // is the commonest way synthetic mortgage data gives itself away.
    for (const coupon of [5.5, 6, 6.5, 7]) {
      const measures = effectiveDurationConvexity((s) => mbsPriceUnderShift(inputs(coupon), s), 25);
      expect(measures.basePrice).toBeGreaterThan(100);
      expect(isNegativelyConvex(measures)).toBe(true);
    }
  });

  it('reproduces the UMBS 5.5 golden', () => {
    const measures = effectiveDurationConvexity((s) => mbsPriceUnderShift(inputs(5.5), s), 25);
    expect(measures.basePrice).toBeCloseTo(101.4, 0);
    // Quoted the way a screen does, scaled by 100.
    expect(measures.effectiveConvexity / 100).toBeLessThan(-1);
    expect(measures.effectiveConvexity / 100).toBeGreaterThan(-3);
    expect(measures.effectiveDuration).toBeGreaterThan(4);
    expect(measures.effectiveDuration).toBeLessThan(9);
  });

  it('leaves a deeply out-of-the-money pool POSITIVELY convex and long', () => {
    // Locked-in borrowers do not prepay, so the bond behaves like a long
    // amortiser - the extension half of the same story.
    for (const coupon of [2.5, 3, 4]) {
      const measures = effectiveDurationConvexity((s) => mbsPriceUnderShift(inputs(coupon), s), 25);
      expect(measures.basePrice).toBeLessThan(100);
      expect(measures.effectiveConvexity).toBeGreaterThan(0);
      expect(measures.effectiveDuration).toBeGreaterThan(7);
    }
  });

  it('produces a HUMPED duration profile, peaking below the current coupon', () => {
    // Duration does not fall monotonically with coupon. It rises across the
    // discounts - where lock-in keeps everything slow and the lower price puts
    // more weight on the back end - peaks below the current coupon, then falls
    // away sharply as prepayment takes over. The hump is a real and
    // well-documented feature of the mortgage duration profile.
    const durations = [3, 4.5, 5.5, 6.5, 7].map(
      (c) => effectiveDurationConvexity((s) => mbsPriceUnderShift(inputs(c), s), 25).effectiveDuration,
    );
    const peak = Math.max(...durations);
    const peakIndex = durations.indexOf(peak);
    expect(peakIndex).toBeGreaterThan(0);
    expect(peakIndex).toBeLessThan(durations.length - 1);
    for (let i = peakIndex + 1; i < durations.length; i++) {
      expect(durations[i] as number).toBeLessThan(durations[i - 1] as number);
    }
    // And the premium end is dramatically shorter than the discount end.
    expect(durations[durations.length - 1] as number).toBeLessThan(peak / 2);
  });

  it('would NOT be negatively convex if the bump skipped the prepayment model', () => {
    // The control: hold CPR fixed by pinning the primary rate, and the same
    // pool prices as an ordinary amortising bond.
    const fixedRateReprice = (shiftPct: number): number => {
      const flows = projectMbsCashflows(pool(6.5), { primaryRateAt: () => PMR, startMonth: 3 });
      let value = 0;
      for (const flow of flows) {
        const rate = curve.zeroRate(flow.years) + shiftPct + 0.4;
        value += flow.amount * Math.exp((-rate / 100) * flow.years);
      }
      return (value / (1_000_000 * 0.95)) * 100;
    };
    const control = effectiveDurationConvexity(fixedRateReprice, 25);
    const live = effectiveDurationConvexity((s) => mbsPriceUnderShift(inputs(6.5), s), 25);
    expect(control.effectiveConvexity).toBeGreaterThan(0);
    expect(live.effectiveConvexity).toBeLessThan(0);
  });
});

describe('OAS', () => {
  it('recovers the spread that produced a price', () => {
    for (const oas of [0, 0.4, 1.2]) {
      const price = mbsPriceUnderShift({ ...inputs(5.5), oasPct: oas }, 0);
      const { oasPct: _ignored, ...rest } = inputs(5.5);
      expect(mbsOasFromPrice(rest, price)).toBeCloseTo(oas, 4);
    }
  });

  it('prices lower at a wider spread', () => {
    expect(mbsPriceUnderShift({ ...inputs(5.5), oasPct: 1.5 }, 0)).toBeLessThan(
      mbsPriceUnderShift({ ...inputs(5.5), oasPct: 0.2 }, 0),
    );
  });

  it('reports moneyness against the current coupon', () => {
    expect(poolMoneyness(pool(7), curve, mortgage)).toBeGreaterThan(0);
    expect(poolMoneyness(pool(3), curve, mortgage)).toBeLessThan(0);
  });

  it('returns zero for a fully paid-down pool', () => {
    expect(mbsPriceUnderShift(inputs(5.5, { factor: 0 }), 0)).toBe(0);
  });
});
