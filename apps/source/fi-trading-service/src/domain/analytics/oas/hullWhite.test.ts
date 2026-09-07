
import { describe, expect, it } from 'vitest';

import { flatDiscountCurve, nssDiscountCurve } from '../../curves/discount.js';
import {
  branchProbabilities, buildTrinomialTree, curveRepricingError, DEFAULT_HULL_WHITE,
  priceBulletOnTree, priceOnTree,
} from './hullWhite.js';

const curve = nssDiscountCurve({ b0: 4.95, b1: -0.85, b2: -1.6, b3: 1.4 });

describe('branch probabilities', () => {
  const M = -DEFAULT_HULL_WHITE.a / 12;

  it('sum to one in every branching mode', () => {
    for (const j of [-20, -5, 0, 5, 20]) {
      const p = branchProbabilities(j, 20, M);
      expect(p.pu + p.pm + p.pd).toBeCloseTo(1, 12);
    }
  });

  it('stay non-negative at the edges, when the cap is DERIVED from a*dt', () => {
    // The cap is not free: jmax must come from 0.1835/(a*dt) for the same M.
    // Pairing an arbitrary jmax with an unrelated M produces negative
    // probabilities, which is exactly what the formula exists to prevent.
    for (const [a, dt] of [[0.045, 1 / 12], [0.1, 1 / 12], [0.03, 1 / 4], [0.2, 1 / 24]] as const) {
      const localM = -a * dt;
      const jmax = Math.max(1, Math.ceil(0.1835 / (a * dt)));
      for (const j of [-jmax, -jmax + 1, 0, jmax - 1, jmax]) {
        const p = branchProbabilities(j, jmax, localM);
        expect(p.pu).toBeGreaterThanOrEqual(0);
        expect(p.pm).toBeGreaterThanOrEqual(0);
        expect(p.pd).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('branches down at the top and up at the bottom', () => {
    expect(branchProbabilities(20, 20, M).k).toBe(19);
    expect(branchProbabilities(-20, 20, M).k).toBe(-19);
    expect(branchProbabilities(3, 20, M).k).toBe(3);
  });
});

describe('calibration', () => {
  it('REPRICES THE INITIAL CURVE to machine precision', () => {
    // The property the whole lattice rests on. A tree that does not return
    // the curve it was built from misprices every option on it, and the error
    // is invisible in the option value alone.
    const tree = buildTrinomialTree(curve, 120, 1 / 12);
    expect(curveRepricingError(tree, curve)).toBeLessThan(1e-12);
  });

  it('calibrates against a flat curve too', () => {
    const flat = flatDiscountCurve(4.5);
    expect(curveRepricingError(buildTrinomialTree(flat, 60, 1 / 12), flat)).toBeLessThan(1e-12);
  });

  it('calibrates at other step sizes', () => {
    for (const dt of [1 / 4, 1 / 12, 1 / 24]) {
      const steps = Math.round(10 / dt);
      expect(curveRepricingError(buildTrinomialTree(curve, steps, dt), curve)).toBeLessThan(1e-11);
    }
  });

  it('caps the tree width from the reversion speed and step', () => {
    const tree = buildTrinomialTree(curve, 120, 1 / 12);
    expect(tree.jmax).toBe(Math.ceil(0.1835 / (DEFAULT_HULL_WHITE.a / 12)));
    expect(tree.arrowDebreu).toHaveLength(121);
  });

  it('spreads the short rate around the curve', () => {
    const tree = buildTrinomialTree(curve, 60, 1 / 12);
    expect(tree.shortRate(30, 0)).toBeGreaterThan(0);
    expect(tree.shortRate(30, 5)).toBeGreaterThan(tree.shortRate(30, 0));
    expect(tree.shortRate(30, -5)).toBeLessThan(tree.shortRate(30, 0));
  });
});

describe('pricing on the tree', () => {
  const tree = buildTrinomialTree(curve, 120, 1 / 12);
  const bullet = {
    redemption: 100,
    couponAt: (step: number): number => (step > 0 && step % 6 === 0 ? 2.5 : 0),
  };

  it('prices a bullet close to its discounted cashflows', () => {
    const onTree = priceBulletOnTree(tree, bullet, 0);
    let direct = 0;
    for (let step = 6; step <= 120; step += 6) {
      direct += 2.5 * curve.df(step / 12);
    }
    direct += 100 * curve.df(10);
    expect(onTree).toBeCloseTo(direct, 4);
  });

  it('falls as the spread widens', () => {
    expect(priceBulletOnTree(tree, bullet, 2)).toBeLessThan(priceBulletOnTree(tree, bullet, 0));
  });

  it('makes a callable bond worth no more than the same bullet', () => {
    const callable = { ...bullet, callPriceAt: (): number => 100 };
    expect(priceOnTree(tree, callable, 0)).toBeLessThanOrEqual(priceBulletOnTree(tree, bullet, 0));
  });

  it('caps a deep-in-the-money callable near its call price', () => {
    // A high-coupon bond callable at par every day cannot be worth much more
    // than par, because the issuer will simply call it.
    const rich = {
      redemption: 100,
      couponAt: (step: number): number => (step > 0 && step % 6 === 0 ? 6 : 0),
      callPriceAt: (): number => 100,
    };
    expect(priceOnTree(tree, rich, 0)).toBeLessThan(103);
  });

  it('leaves an out-of-the-money call worth nothing', () => {
    const neverCalled = { ...bullet, callPriceAt: (): number => 200 };
    expect(priceOnTree(tree, neverCalled, 0)).toBeCloseTo(priceBulletOnTree(tree, bullet, 0), 8);
  });
});
