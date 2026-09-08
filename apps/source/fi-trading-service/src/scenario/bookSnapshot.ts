/**
 * The book, flattened into typed arrays for scanning.
 *
 * A scan asks one question per world-day — what is this book worth — and it
 * asks it tens of thousands of times. Answering it by rebuilding 88-field rows
 * costs about 230 us per pass; answering it out of parallel `Float64Array`s
 * costs a fraction of that, because the loop touches only the eleven numbers a
 * revaluation actually reads and allocates nothing.
 *
 * The rows are still the product. This is the same arithmetic in the layout a
 * scan wants, derived from the same `RiskVector`s the live path uses, so the
 * two cannot disagree about what a position is worth.
 *
 * Every snapshot carries a `fingerprint`. A scenario result that cannot say
 * which book it ran against is a claim rather than a measurement, and when the
 * assistant reports a number the user is entitled to check that it came from
 * the book on their screen.
 */

import type { DateInt } from '../domain/core/dateInt.js';
import type { FactorState } from '../domain/curves/factorEngine.js';
import type { RiskVector } from '../domain/book/bookBuilder.js';
import type { PositionRow } from '../domain/book/positions.js';

export interface BookSnapshot {
  asOf: DateInt;
  positionCount: number;
  /** Identifies the book a result was computed against. */
  fingerprint: string;
  /** The state every revaluation measures from. */
  base: FactorState;

  positionId: string[];
  description: string[];
  /** Index into `buckets`. */
  bucketOf: Uint8Array;
  buckets: string[];
  issuerId: Int32Array;

  /** Curve factor sensitivities, one array per factor. */
  beta0: Float64Array;
  beta1: Float64Array;
  beta2: Float64Array;
  beta3: Float64Array;
  convexity: Float64Array;
  spreadDuration: Float64Array;
  creditBeta: Float64Array;
  spreadLevelPct: Float64Array;
  currentFace: Float64Array;
  basePrice: Float64Array;
  /** 1 when the position marks to upfront rather than to notional. */
  swap: Uint8Array;
  /** Market value at `base`, so a scan reports a difference. */
  baseValue: Float64Array;
}

/** A cheap order-independent digest of what the book contains. */
function fingerprintOf(vectors: readonly RiskVector[], asOf: DateInt): string {
  let hash = 2166136261 ^ asOf;
  let total = 0;
  for (const vector of vectors) {
    hash = Math.imul(hash ^ vector.securityId, 16777619) >>> 0;
    total += vector.currentFace;
  }
  const size = Math.round(total).toString(36);
  return `bk-${(hash >>> 0).toString(36)}-${vectors.length.toString(36)}-${size}`;
}

export function snapshotBook(
  rows: readonly PositionRow[],
  vectors: readonly RiskVector[],
  base: FactorState,
  asOf: DateInt,
): BookSnapshot {
  const n = vectors.length;
  const buckets: string[] = [];
  const bucketIndex = new Map<string, number>();

  const snapshot: BookSnapshot = {
    asOf,
    positionCount: n,
    fingerprint: fingerprintOf(vectors, asOf),
    base,
    positionId: new Array<string>(n),
    description: new Array<string>(n),
    bucketOf: new Uint8Array(n),
    buckets,
    issuerId: new Int32Array(n),
    beta0: new Float64Array(n),
    beta1: new Float64Array(n),
    beta2: new Float64Array(n),
    beta3: new Float64Array(n),
    convexity: new Float64Array(n),
    spreadDuration: new Float64Array(n),
    creditBeta: new Float64Array(n),
    spreadLevelPct: new Float64Array(n),
    currentFace: new Float64Array(n),
    basePrice: new Float64Array(n),
    swap: new Uint8Array(n),
    baseValue: new Float64Array(n),
  };

  for (let i = 0; i < n; i++) {
    const vector = vectors[i] as RiskVector;
    const row = rows[i] as PositionRow;
    const bucket = row.assetClass as string;
    let index = bucketIndex.get(bucket);
    if (index === undefined) {
      index = buckets.length;
      buckets.push(bucket);
      bucketIndex.set(bucket, index);
    }
    snapshot.positionId[i] = vector.positionId;
    snapshot.description[i] = row.description as string;
    snapshot.bucketOf[i] = index;
    snapshot.issuerId[i] = vector.issuerId;
    snapshot.beta0[i] = vector.beta[0];
    snapshot.beta1[i] = vector.beta[1];
    snapshot.beta2[i] = vector.beta[2];
    snapshot.beta3[i] = vector.beta[3];
    snapshot.convexity[i] = vector.convexity;
    snapshot.spreadDuration[i] = vector.spreadDuration;
    snapshot.creditBeta[i] = vector.creditBeta;
    snapshot.spreadLevelPct[i] = vector.spreadLevelPct;
    snapshot.currentFace[i] = vector.currentFace;
    snapshot.basePrice[i] = vector.basePrice;
    snapshot.swap[i] = vector.isSwap ? 1 : 0;
    snapshot.baseValue[i] =
      ((vector.isSwap ? vector.basePrice - 100 : vector.basePrice) / 100) * vector.currentFace;
  }
  return snapshot;
}

/** Total market value at the base state — the denominator for a return. */
export function baseMarketValue(snapshot: BookSnapshot): number {
  let total = 0;
  for (const value of snapshot.baseValue) total += value;
  return total;
}
