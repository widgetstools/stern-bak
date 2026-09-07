
import { describe, expect, it } from 'vitest';

import { createNormalDraw, createRng } from '../core/rng.js';
import { nssDiscountCurve } from './discount.js';
import {
  currentCoupon, evolveMortgageRates, GUARANTEE_FEE, MINIMUM_SERVICING, primaryMortgageRate,
  refiIncentive, seedMortgageRates,
} from './mortgageRates.js';

const SEED_CURVE = nssDiscountCurve({ b0: 4.95, b1: -0.85, b2: -1.6, b3: 1.4 });

describe('rate chain', () => {
  const state = seedMortgageRates();

  it('blends the 5s and 10s and adds the current-coupon spread', () => {
    const blend = (SEED_CURVE.zeroRate(5) + SEED_CURVE.zeroRate(10)) / 2;
    expect(currentCoupon(SEED_CURVE, state)).toBeCloseTo(blend + 1.35, 10);
    expect(currentCoupon(SEED_CURVE, state)).toBeCloseTo(6.0156, 3);
  });

  it('adds the guarantee fee, servicing and originator margin to reach the borrower', () => {
    expect(primaryMortgageRate(SEED_CURVE, state)).toBeCloseTo(7.0756, 3);
    const gap = primaryMortgageRate(SEED_CURVE, state) - currentCoupon(SEED_CURVE, state);
    // The observed primary/secondary gap is around a point.
    expect(gap).toBeCloseTo(GUARANTEE_FEE + MINIMUM_SERVICING + 0.35, 10);
    expect(gap).toBeGreaterThan(0.9);
    expect(gap).toBeLessThan(1.2);
  });

  it('keeps the borrower rate above the current coupon at all times', () => {
    const draw = createNormalDraw(createRng(111));
    let evolving = seedMortgageRates();
    for (let day = 0; day < 2000; day++) {
      evolving = evolveMortgageRates(evolving, 1 / 252, draw(), draw());
      expect(primaryMortgageRate(SEED_CURVE, evolving)).toBeGreaterThan(
        currentCoupon(SEED_CURVE, evolving),
      );
    }
  });

  it('passes a Treasury rally through to the borrower', () => {
    const rallied = nssDiscountCurve({ b0: 3.95, b1: -0.85, b2: -1.6, b3: 1.4 });
    expect(primaryMortgageRate(rallied, state)).toBeCloseTo(
      primaryMortgageRate(SEED_CURVE, state) - 1,
      6,
    );
  });

  it('reverts the spreads rather than letting them drift', () => {
    const draw = createNormalDraw(createRng(112));
    let evolving = { currentCouponSpread: 4, primarySecondarySpread: 2.5 };
    for (let day = 0; day < 252 * 8; day++) {
      evolving = evolveMortgageRates(evolving, 1 / 252, draw(), draw());
    }
    expect(evolving.currentCouponSpread).toBeLessThan(3);
    expect(evolving.primarySecondarySpread).toBeLessThan(1.5);
  });
});

describe('refiIncentive', () => {
  it('is positive when the pool coupon is above the market rate', () => {
    expect(refiIncentive(7.5, 6.5)).toBeCloseTo(1, 10);
    expect(refiIncentive(3.0, 7.08)).toBeCloseTo(-4.08, 10);
  });

  it('is measured against the borrower rate, not the current coupon', () => {
    const state = seedMortgageRates();
    const viaPrimary = refiIncentive(6.5, primaryMortgageRate(SEED_CURVE, state));
    const viaCurrentCoupon = refiIncentive(6.5, currentCoupon(SEED_CURVE, state));
    // Using the current coupon overstates the incentive by a full point, which
    // is the difference between no refis and heavy refis on the S-curve.
    expect(viaCurrentCoupon - viaPrimary).toBeCloseTo(1.06, 2);
  });
});
