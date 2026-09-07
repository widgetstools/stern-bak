/**
 * Rating migration, correlated across issuers.
 *
 * Two pieces, and the second is what makes it look real.
 *
 * **A generator, not the annual matrix.** Published transition matrices are
 * annual, and the build steps daily. Applying 1/252 of the annual
 * probabilities is wrong — transitions compound, they do not add. The correct
 * object is the generator `Q = log(P)`, from which `P(dt) = exp(Q*dt)` for any
 * horizon. The matrix logarithm can produce small negative off-diagonals,
 * which are not valid transition intensities; the Israel-Rosenthal-Wei fix
 * clamps them to zero and rebalances the diagonal so rows still sum to zero.
 *
 * **A Merton threshold model, not independent draws.** Independent chains
 * scatter downgrades uniformly across the year. Real downgrades CLUSTER: they
 * arrive in the same weeks that credit widens, because both are driven by the
 * same deterioration. Each issuer gets a latent asset value
 *
 *     A_i = sqrt(rho) * M + sqrt(1 - rho) * Z_i
 *
 * where `M` is driven by the systematic credit factor. A downgrade happens
 * when `A_i` falls through a threshold derived from that issuer's own row of
 * the transition matrix. Same marginal probabilities, utterly different
 * timing.
 */

import { inverseNormalCdf } from '../core/linalg.js';
import type { Rng } from '../core/rng.js';

/** Best to worst. `D` is absorbing. */
export const RATING_BUCKETS = ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC', 'D'] as const;
export type RatingBucket = (typeof RATING_BUCKETS)[number];

export const DEFAULT_INDEX = RATING_BUCKETS.length - 1;
export const INVESTMENT_GRADE_MAX_INDEX = 3;

export function isInvestmentGrade(index: number): boolean {
  return index <= INVESTMENT_GRADE_MAX_INDEX;
}

/**
 * One-year transition probabilities, shaped like a published corporate matrix:
 * strongly diagonal, downgrades more likely than upgrades below investment
 * grade, and default concentrated in the lowest buckets.
 */
export const ANNUAL_TRANSITION: readonly (readonly number[])[] = [
  [0.873, 0.115, 0.01, 0.001, 0.0005, 0.0003, 0.0002, 0.0],
  [0.006, 0.889, 0.098, 0.005, 0.001, 0.0005, 0.0003, 0.0002],
  [0.0004, 0.02, 0.915, 0.058, 0.0045, 0.0012, 0.0004, 0.0005],
  [0.0001, 0.0015, 0.039, 0.902, 0.048, 0.007, 0.0009, 0.0015],
  [0.0001, 0.0005, 0.002, 0.057, 0.834, 0.09, 0.009, 0.0074],
  [0.0, 0.0003, 0.001, 0.0025, 0.056, 0.842, 0.0632, 0.035],
  [0.0, 0.0, 0.0015, 0.0035, 0.011, 0.135, 0.629, 0.22],
  [0, 0, 0, 0, 0, 0, 0, 1],
];

/** Asset correlation. Drives how tightly downgrades cluster. */
export const MERTON_ASSET_CORRELATION = 0.15;

type Matrix = number[][];

function identity(n: number): Matrix {
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  );
}

export function matMul(a: readonly (readonly number[])[], b: readonly (readonly number[])[]): Matrix {
  const n = a.length;
  const out: Matrix = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    const rowA = a[i] as readonly number[];
    const rowOut = out[i] as number[];
    for (let k = 0; k < n; k++) {
      const factor = rowA[k] as number;
      if (factor === 0) continue;
      const rowB = b[k] as readonly number[];
      for (let j = 0; j < n; j++) {
        rowOut[j] = (rowOut[j] as number) + factor * (rowB[j] as number);
      }
    }
  }
  return out;
}

function addScaled(a: readonly (readonly number[])[], b: readonly (readonly number[])[], scale: number): Matrix {
  return a.map((row, i) =>
    row.map((value, j) => value + scale * (((b[i] as readonly number[])[j] as number) ?? 0)),
  );
}

function scaleMatrix(a: readonly (readonly number[])[], scale: number): Matrix {
  return a.map((row) => row.map((value) => value * scale));
}

/**
 * Matrix logarithm by the Mercator series.
 *
 * Valid because a one-year transition matrix is close to the identity — the
 * widest row here has `||P - I|| = 0.74`, comfortably inside the radius of
 * convergence. A general matrix logarithm would need an eigendecomposition;
 * this does not.
 */
export function matrixLog(p: readonly (readonly number[])[], terms = 60): Matrix {
  const n = p.length;
  const x = addScaled(p, identity(n), -1);
  let result: Matrix = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  let power: Matrix = x.map((row) => [...row]);
  for (let k = 1; k <= terms; k++) {
    result = addScaled(result, power, (k % 2 === 1 ? 1 : -1) / k);
    power = matMul(power, x);
  }
  return result;
}

/** Matrix exponential by its Taylor series. */
export function matrixExp(a: readonly (readonly number[])[], terms = 30): Matrix {
  const n = a.length;
  let result = identity(n);
  let term = identity(n);
  for (let k = 1; k <= terms; k++) {
    term = scaleMatrix(matMul(term, a), 1 / k);
    result = addScaled(result, term, 1);
  }
  return result;
}

/**
 * Israel-Rosenthal-Wei regularisation: clamp negative off-diagonal
 * intensities to zero and give the mass back to the diagonal, so rows still
 * sum to zero and every off-diagonal is a valid intensity.
 */
export function regularizeGenerator(q: readonly (readonly number[])[]): Matrix {
  return q.map((row, i) => {
    const out = [...row];
    let reclaimed = 0;
    for (let j = 0; j < out.length; j++) {
      if (j === i) continue;
      const value = out[j] as number;
      if (value < 0) {
        reclaimed += value;
        out[j] = 0;
      }
    }
    out[i] = (out[i] as number) + reclaimed;
    return out;
  });
}

/** The generator implied by the annual matrix, regularised. Computed once. */
export const GENERATOR: readonly (readonly number[])[] = regularizeGenerator(
  matrixLog(ANNUAL_TRANSITION),
);

/** Transition probabilities over `years`. */
export function transitionMatrix(years: number): number[][] {
  return matrixExp(scaleMatrix(GENERATOR, years));
}

/**
 * Latent-variable thresholds for each starting rating.
 *
 * `thresholds[from][to]` is the asset value below which the issuer lands in
 * `to` or worse. Built by accumulating probability from the WORST state
 * upwards, which is the standard construction and puts default in the far
 * left tail where it belongs.
 */
export function migrationThresholds(p: readonly (readonly number[])[]): number[][] {
  return p.map((row) => {
    const thresholds = new Array<number>(row.length).fill(0);
    let cumulative = 0;
    for (let to = row.length - 1; to >= 0; to--) {
      cumulative += row[to] as number;
      thresholds[to] = inverseNormalCdf(Math.min(1, cumulative));
    }
    return thresholds;
  });
}

/** Where an issuer lands given its latent asset value. */
export function bucketForAsset(assetValue: number, thresholdsForRating: readonly number[]): number {
  for (let to = thresholdsForRating.length - 1; to > 0; to--) {
    if (assetValue < (thresholdsForRating[to] as number)) return to;
  }
  return 0;
}

export interface MigrationEvent {
  issuerIndex: number;
  from: number;
  to: number;
}

export interface MigrationStepOptions {
  /** Current rating index per issuer. Mutated in place. */
  ratings: Uint8Array;
  /** Thresholds for the step horizon, from `migrationThresholds`. */
  thresholds: readonly (readonly number[])[];
  /**
   * The systematic driver, standardised. Negative means deteriorating credit,
   * so it should be the NEGATED systematic spread factor: spreads widening
   * and assets falling are the same event.
   */
  marketFactor: number;
  normalDraw: () => number;
  rng: Rng;
}

/** Advance every issuer one step. Returns only the issuers that moved. */
export function stepMigrations(options: MigrationStepOptions): MigrationEvent[] {
  const { ratings, thresholds, marketFactor, normalDraw } = options;
  const systematicWeight = Math.sqrt(MERTON_ASSET_CORRELATION);
  const idiosyncraticWeight = Math.sqrt(1 - MERTON_ASSET_CORRELATION);
  const events: MigrationEvent[] = [];

  for (let i = 0; i < ratings.length; i++) {
    const from = ratings[i] as number;
    if (from === DEFAULT_INDEX) continue;
    const asset = systematicWeight * marketFactor + idiosyncraticWeight * normalDraw();
    const to = bucketForAsset(asset, thresholds[from] as readonly number[]);
    if (to === from) continue;
    ratings[i] = to;
    events.push({ issuerIndex: i, from, to });
  }
  return events;
}

/** A downgrade from BBB to BB — a forced seller at the next rebalance. */
export function isFallenAngel(event: MigrationEvent): boolean {
  return event.from <= INVESTMENT_GRADE_MAX_INDEX && event.to > INVESTMENT_GRADE_MAX_INDEX;
}

export function isDefault(event: MigrationEvent): boolean {
  return event.to === DEFAULT_INDEX;
}

/**
 * Transient spread overshoot after a migration, in log space.
 *
 * A downgrade does not just reprice the name to its new bucket's median; it
 * overshoots and grinds back as forced sellers clear. Fallen angels overshoot
 * hardest because index exclusion forces sales into a thin market.
 */
export function migrationSpreadShock(event: MigrationEvent): number {
  if (event.to <= event.from) return -0.1;
  return isFallenAngel(event) ? 0.55 : 0.2;
}
