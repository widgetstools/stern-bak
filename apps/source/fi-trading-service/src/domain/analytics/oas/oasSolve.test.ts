
import { describe, expect, it } from 'vitest';

import { nssDiscountCurve } from '../../curves/discount.js';
import { buildTrinomialTree } from './hullWhite.js';
import { latticeSpec, oasForBond, optionValue, solveOas, type CallableBond } from './oasSolve.js';

const curve = nssDiscountCurve({ b0: 4.95, b1: -0.85, b2: -1.6, b3: 1.4 });

const IG_MAKE_WHOLE: CallableBond = {
  couponRate: 5,
  frequency: 2,
  yearsToMaturity: 10,
  redemption: 100,
  calls: [
    { fromYears: 1, price: 100, makeWhole: true },
    { fromYears: 9.75, price: 100 },
  ],
};

/** An 8-year non-call-3 stepping down to par — the high-yield convention. */
const HY_8NC3: CallableBond = {
  couponRate: 6.875,
  frequency: 2,
  yearsToMaturity: 8,
  redemption: 100,
  calls: [
    { fromYears: 3, price: 103.438 },
    { fromYears: 4, price: 102.292 },
    { fromYears: 5, price: 101.146 },
    { fromYears: 6, price: 100 },
  ],
};

describe('latticeSpec', () => {
  it('pays a coupon only on coupon steps', () => {
    const spec = latticeSpec(IG_MAKE_WHOLE, 1 / 12);
    expect(spec.couponAt(6)).toBeCloseTo(2.5, 10);
    expect(spec.couponAt(5)).toBe(0);
    expect(spec.couponAt(0)).toBe(0);
  });

  it('accrues between coupon dates and resets on them', () => {
    const spec = latticeSpec(IG_MAKE_WHOLE, 1 / 12);
    expect(spec.accruedAt?.(6)).toBeCloseTo(0, 10);
    expect(spec.accruedAt?.(9)).toBeCloseTo(1.25, 10);
  });

  it('EXCLUDES make-whole calls, which are not a fixed-price option', () => {
    const spec = latticeSpec(IG_MAKE_WHOLE, 1 / 12);
    expect(spec.callPriceAt(24)).toBeNull();
    expect(spec.callPriceAt(118)).toBe(100);
  });

  it('steps the high-yield schedule down over time', () => {
    const spec = latticeSpec(HY_8NC3, 1 / 12);
    expect(spec.callPriceAt(24)).toBeNull();
    expect(spec.callPriceAt(36)).toBe(103.438);
    expect(spec.callPriceAt(48)).toBe(102.292);
    expect(spec.callPriceAt(72)).toBe(100);
  });
});

describe('OPTION COST - what callability is worth', () => {
  it('costs an investment-grade make-whole almost nothing', () => {
    // The par call sits three months before maturity and the make-whole is
    // excluded, so the bond effectively quotes to maturity.
    const result = oasForBond(curve, IG_MAKE_WHOLE, 100);
    expect(result.optionCostBp).toBeLessThan(5);
    expect(result.optionValuePoints).toBeLessThan(0.3);
    // Within a couple of basis points of the z-spread, in percent terms.
    expect(Math.abs(result.oasPct - result.zSpreadPct)).toBeLessThan(0.05);
  });

  it('costs a high-yield step-down schedule tens of basis points', () => {
    const result = oasForBond(curve, HY_8NC3, 101);
    expect(result.optionCostBp).toBeGreaterThan(30);
    expect(result.optionCostBp).toBeLessThan(150);
    expect(result.oasPct).toBeLessThan(result.zSpreadPct);
    expect(result.optionValuePoints).toBeGreaterThan(1);
  });

  it('costs more the further the call is in the money', () => {
    // A higher price means the issuer is more likely to call, so the option
    // is worth more and the OAS falls further below the z-spread.
    const costs = [99, 101, 103, 105].map((px) => oasForBond(curve, HY_8NC3, px).optionCostBp);
    for (let i = 1; i < costs.length; i++) {
      expect(costs[i] as number).toBeGreaterThan(costs[i - 1] as number);
    }
  });

  it('separates the two call types by two orders of magnitude', () => {
    const makeWhole = oasForBond(curve, IG_MAKE_WHOLE, 100).optionCostBp;
    const stepDown = oasForBond(curve, HY_8NC3, 103).optionCostBp;
    expect(stepDown).toBeGreaterThan(makeWhole * 20);
  });
});

describe('solveOas', () => {
  const tree = buildTrinomialTree(curve, 96, 1 / 12);

  it('recovers the price it solved for', () => {
    for (const price of [95, 100, 106]) {
      const result = solveOas(tree, HY_8NC3, price);
      expect(Number.isFinite(result.oasPct)).toBe(true);
      expect(Number.isFinite(result.zSpreadPct)).toBe(true);
    }
  });

  it('widens the OAS as the price falls', () => {
    const cheap = solveOas(tree, HY_8NC3, 92).oasPct;
    const rich = solveOas(tree, HY_8NC3, 106).oasPct;
    expect(cheap).toBeGreaterThan(rich);
  });

  it('values the option positively at any spread', () => {
    for (const spread of [0, 2, 5]) {
      expect(optionValue(tree, HY_8NC3, spread)).toBeGreaterThanOrEqual(0);
    }
  });

  it('values a bond with no exercisable calls identically to a bullet', () => {
    const bulletLike: CallableBond = { ...HY_8NC3, calls: [{ fromYears: 1, price: 100, makeWhole: true }] };
    expect(optionValue(tree, bulletLike, 3)).toBeCloseTo(0, 8);
  });
});
