/**
 * Option-adjusted spread for bonds with embedded calls.
 *
 * OAS is the constant spread over the fitted curve that reprices the bond ON
 * THE LATTICE — that is, after the issuer's call option has been valued. The
 * difference between the z-spread (which ignores the option) and the OAS is
 * the OPTION COST, and it is the number that tells you what the callability is
 * worth.
 *
 * The distinction matters because the two kinds of call in this universe
 * behave completely differently. An investment-grade make-whole is priced at a
 * spread over Treasuries and is essentially never exercised, so its option
 * cost is close to zero and its OAS is its z-spread. A high-yield NC-3
 * step-down schedule is a real option the issuer will use, and it costs
 * tens of basis points.
 */

import type { DiscountCurve } from '../../curves/discount.js';
import {
  buildTrinomialTree, priceBulletOnTree, priceOnTree, type LatticeBondSpec, type TrinomialTree,
} from './hullWhite.js';

export interface CallOnTree {
  /** Years from settlement at which this call price takes effect. */
  fromYears: number;
  /** Redemption price per 100. */
  price: number;
  /** Make-whole calls are excluded: they are not a fixed-price option. */
  makeWhole?: boolean;
}

export interface CallableBond {
  /** Annual coupon in percent. */
  couponRate: number;
  frequency: number;
  yearsToMaturity: number;
  redemption: number;
  calls: readonly CallOnTree[];
}

/** Turn a bond into the step-indexed shape the lattice consumes. */
export function latticeSpec(bond: CallableBond, dt: number): LatticeBondSpec {
  const stepsPerCoupon = Math.max(1, Math.round(1 / bond.frequency / dt));
  const couponAmount = bond.couponRate / bond.frequency;
  const exercisable = bond.calls
    .filter((call) => call.makeWhole !== true)
    .slice()
    .sort((a, b) => a.fromYears - b.fromYears);

  return {
    redemption: bond.redemption,
    couponAt: (step: number): number => (step > 0 && step % stepsPerCoupon === 0 ? couponAmount : 0),
    accruedAt: (step: number): number => (couponAmount * (step % stepsPerCoupon)) / stepsPerCoupon,
    callPriceAt: (step: number): number | null => {
      const years = step * dt;
      let price: number | null = null;
      for (const call of exercisable) {
        if (years >= call.fromYears) price = call.price;
      }
      return price;
    },
  };
}

export interface OasResult {
  /** Spread that reprices the bond on the lattice, in percent. */
  oasPct: number;
  /** Spread that reprices it ignoring the option, in percent. */
  zSpreadPct: number;
  /** zSpread minus OAS, in basis points. What the call costs the holder. */
  optionCostBp: number;
  /** Value of the embedded option, in points of price. */
  optionValuePoints: number;
}

function solveSpread(
  price: (spreadPct: number) => number,
  target: number,
  tolerance: number,
): number {
  let low = -10;
  let high = 60;
  if (price(low) < target) return low;
  if (price(high) > target) return high;
  for (let i = 0; i < 200; i++) {
    const mid = (low + high) / 2;
    const value = price(mid);
    if (Math.abs(value - target) < tolerance) return mid;
    // Price falls as the spread widens.
    if (value > target) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

/** OAS, z-spread and the option cost between them. */
export function solveOas(
  tree: TrinomialTree,
  bond: CallableBond,
  dirtyPrice: number,
  tolerance = 1e-7,
): OasResult {
  const spec = latticeSpec(bond, tree.dt);
  const { callPriceAt: _ignored, ...bullet } = spec;

  const oasPct = solveSpread((s) => priceOnTree(tree, spec, s), dirtyPrice, tolerance);
  const zSpreadPct = solveSpread((s) => priceBulletOnTree(tree, bullet, s), dirtyPrice, tolerance);

  return {
    oasPct,
    zSpreadPct,
    optionCostBp: Math.round((zSpreadPct - oasPct) * 10000) / 100,
    optionValuePoints:
      priceBulletOnTree(tree, bullet, oasPct) - priceOnTree(tree, spec, oasPct),
  };
}

/** Build a tree sized for a bond and solve its OAS in one call. */
export function oasForBond(
  curve: DiscountCurve,
  bond: CallableBond,
  dirtyPrice: number,
  dt = 1 / 12,
): OasResult {
  const steps = Math.max(1, Math.round(bond.yearsToMaturity / dt));
  return solveOas(buildTrinomialTree(curve, steps, dt), bond, dirtyPrice);
}

/**
 * Value of the embedded call at a given spread, in points.
 *
 * Positive for a real option, essentially zero for a make-whole. Cheaper than
 * a full OAS solve when only the option matters.
 */
export function optionValue(tree: TrinomialTree, bond: CallableBond, spreadPct: number): number {
  const spec = latticeSpec(bond, tree.dt);
  const { callPriceAt: _ignored, ...bullet } = spec;
  return priceBulletOnTree(tree, bullet, spreadPct) - priceOnTree(tree, spec, spreadPct);
}
