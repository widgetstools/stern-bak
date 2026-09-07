/**
 * A Hull-White trinomial lattice, for pricing bonds with embedded options.
 *
 *     dr = (theta(t) - a*r) dt + sigma dW
 *
 * Two stages, both standard. First a symmetric tree in `x = r - theta` with
 * three branching modes — normal in the middle, down-branching at the top,
 * up-branching at the bottom — which is what keeps probabilities positive at
 * the edges. Then forward induction over Arrow-Debreu prices to fit `alpha(t)`
 * so the tree reprices the initial discount curve EXACTLY.
 *
 * That exact fit is the property worth testing, and `curveRepricingError`
 * exists to check it: a lattice that does not return the curve it was built
 * from will misprice every option on it, and the error is invisible in the
 * option value alone.
 *
 * Defaults are a = 0.045 and sigma = 0.0095, a 95 bp normal volatility, which
 * is a defensible level for the current regime.
 */

import type { DiscountCurve } from '../../curves/discount.js';

export interface HullWhiteParams {
  /** Mean-reversion speed. */
  a: number;
  /** Short-rate volatility, absolute (normal), per square-root year. */
  sigma: number;
}

export const DEFAULT_HULL_WHITE: HullWhiteParams = { a: 0.045, sigma: 0.0095 };

export interface BranchProbabilities {
  /** Index of the middle successor node. */
  k: number;
  pu: number;
  pm: number;
  pd: number;
}

/**
 * Branch probabilities for node `j`.
 *
 * At the edges the tree switches branching direction rather than letting a
 * probability go negative, which is the whole reason for the `jmax` cap.
 */
export function branchProbabilities(j: number, jmax: number, M: number): BranchProbabilities {
  const jM = j * M;
  const j2M2 = jM * jM;
  if (j === jmax) {
    return {
      k: j - 1,
      pu: 7 / 6 + (j2M2 + 3 * jM) / 2,
      pm: -1 / 3 - j2M2 - 2 * jM,
      pd: 1 / 6 + (j2M2 + jM) / 2,
    };
  }
  if (j === -jmax) {
    return {
      k: j + 1,
      pu: 1 / 6 + (j2M2 - jM) / 2,
      pm: -1 / 3 - j2M2 + 2 * jM,
      pd: 7 / 6 + (j2M2 - 3 * jM) / 2,
    };
  }
  return {
    k: j,
    pu: 1 / 6 + (j2M2 + jM) / 2,
    pm: 2 / 3 - j2M2,
    pd: 1 / 6 + (j2M2 - jM) / 2,
  };
}

export interface TrinomialTree {
  dt: number;
  dx: number;
  jmax: number;
  steps: number;
  /** Drift fitted to the initial curve, one per step. */
  alpha: Float64Array;
  /** Arrow-Debreu prices, `[step][j + jmax]`. */
  arrowDebreu: Float64Array[];
  params: HullWhiteParams;
  /** Short rate at `(step, j)`. */
  shortRate(step: number, j: number): number;
}

/** Build and calibrate the tree. `dt` in years; monthly is the usual choice. */
export function buildTrinomialTree(
  curve: DiscountCurve,
  steps: number,
  dt = 1 / 12,
  params: HullWhiteParams = DEFAULT_HULL_WHITE,
): TrinomialTree {
  const { a, sigma } = params;
  const dx = sigma * Math.sqrt(3 * dt);
  const M = -a * dt;
  const jmax = Math.max(1, Math.ceil(0.1835 / (a * dt)));
  const width = 2 * jmax + 1;

  const alpha = new Float64Array(steps);
  const arrowDebreu: Float64Array[] = [];
  let q = new Float64Array(width);
  q[jmax] = 1;
  arrowDebreu.push(q);

  for (let i = 0; i < steps; i++) {
    // Fit this step's drift so the tree reprices P((i+1)*dt).
    let weighted = 0;
    for (let j = -jmax; j <= jmax; j++) {
      const value = q[j + jmax] as number;
      if (value === 0) continue;
      weighted += value * Math.exp(-j * dx * dt);
    }
    const target = curve.df((i + 1) * dt);
    alpha[i] = (Math.log(weighted) - Math.log(target)) / dt;

    const next = new Float64Array(width);
    for (let j = -jmax; j <= jmax; j++) {
      const value = q[j + jmax] as number;
      if (value === 0) continue;
      const rate = (alpha[i] as number) + j * dx;
      const discount = Math.exp(-rate * dt);
      const { k, pu, pm, pd } = branchProbabilities(j, jmax, M);
      next[k + 1 + jmax] = (next[k + 1 + jmax] as number) + value * pu * discount;
      next[k + jmax] = (next[k + jmax] as number) + value * pm * discount;
      next[k - 1 + jmax] = (next[k - 1 + jmax] as number) + value * pd * discount;
    }
    q = next;
    arrowDebreu.push(q);
  }

  return {
    dt,
    dx,
    jmax,
    steps,
    alpha,
    arrowDebreu,
    params,
    shortRate: (step: number, j: number): number => (alpha[Math.min(step, steps - 1)] as number) + j * dx,
  };
}

/**
 * How far the calibrated tree is from the curve it was built on, at each step.
 *
 * The sum of Arrow-Debreu prices at step `i` IS the discount factor to
 * `i * dt`, so any discrepancy is a calibration failure.
 */
export function curveRepricingError(tree: TrinomialTree, curve: DiscountCurve): number {
  let worst = 0;
  for (let i = 1; i <= tree.steps; i++) {
    const row = tree.arrowDebreu[i] as Float64Array;
    let sum = 0;
    for (const value of row) sum += value;
    worst = Math.max(worst, Math.abs(sum - curve.df(i * tree.dt)));
  }
  return worst;
}

export interface LatticeBondSpec {
  /** Cash paid to the holder at a step, excluding redemption. */
  couponAt(step: number): number;
  /** Redemption value at the final step. */
  redemption: number;
  /**
   * Call price at a step, or null when not callable then. Compared against
   * the continuation value, so the issuer exercises when it is cheaper to.
   */
  callPriceAt(step: number): number | null;
  /** Accrued interest at a step, added to the call price. */
  accruedAt?(step: number): number;
}

/**
 * Price a bond on the lattice at a constant spread over the fitted curve.
 *
 * Backward induction with `min(continuation, call)` at every callable node:
 * the issuer calls when continuing is more expensive, which is what gives a
 * callable bond its negative convexity and its yield-to-worst behaviour.
 */
export function priceOnTree(tree: TrinomialTree, spec: LatticeBondSpec, spreadPct: number): number {
  const { jmax, dt, dx, steps } = tree;
  const M = -tree.params.a * dt;
  const width = 2 * jmax + 1;
  const spread = spreadPct / 100;

  let values = new Float64Array(width);
  values.fill(spec.redemption + spec.couponAt(steps));

  for (let i = steps - 1; i >= 0; i--) {
    const next = new Float64Array(width);
    for (let j = -jmax; j <= jmax; j++) {
      const { k, pu, pm, pd } = branchProbabilities(j, jmax, M);
      const expected =
        pu * (values[k + 1 + jmax] as number) +
        pm * (values[k + jmax] as number) +
        pd * (values[k - 1 + jmax] as number);
      const rate = (tree.alpha[i] as number) + j * dx + spread;
      let value = Math.exp(-rate * dt) * expected + spec.couponAt(i);

      const callPrice = spec.callPriceAt(i);
      if (callPrice !== null && i > 0) {
        const accrued = spec.accruedAt?.(i) ?? 0;
        value = Math.min(value, callPrice + accrued);
      }
      next[j + jmax] = value;
    }
    values = next;
  }
  return values[jmax] as number;
}

/** Price with the option ignored — the bullet value on the same tree. */
export function priceBulletOnTree(
  tree: TrinomialTree,
  spec: Omit<LatticeBondSpec, 'callPriceAt'>,
  spreadPct: number,
): number {
  return priceOnTree(tree, { ...spec, callPriceAt: () => null }, spreadPct);
}
