/**
 * Revalue a whole book against a factor state, in one pass, allocating nothing.
 *
 * This is the same arithmetic as `repriceFast` in `bookBuilder` — the identical
 * expansion, measured from the identical base — with the row writes removed. A
 * scan calls it tens of thousands of times, so the loop reads eleven typed
 * arrays and writes one number per asset-class bucket.
 *
 *     dP/P  =  -(B . dBeta)/100  +  C.dy^2/2  -  SD . creditBeta . spread . dCredit / 100
 *
 * `B . dBeta` is EXACT for the curve leg, not an approximation: the NSS decay
 * parameters are frozen, so the curve is linear in beta and a whole-book
 * revaluation really is a four-element dot product. That is the property the
 * whole scenario engine is built on, and `bookBuilder`'s parallel-bump test
 * pins it against the analytics.
 */

import type { FactorState } from '../domain/curves/factorEngine.js';
import type { BookSnapshot } from './bookSnapshot.js';

export interface RevalResult {
  /** Change in market value against the snapshot's base, in currency. */
  totalPnl: number;
  /** The same, split by asset class — indexed like `snapshot.buckets`. */
  byBucket: Float64Array;
}

/** Somewhere to accumulate into, reused across a scan. */
export function createRevalResult(snapshot: BookSnapshot): RevalResult {
  return { totalPnl: 0, byBucket: new Float64Array(snapshot.buckets.length) };
}

/**
 * Revalue into `out`, overwriting it.
 *
 * `hedge` is an optional overlay: extra positions carried alongside the book,
 * revalued by the same expansion, so a hedged and an unhedged run differ only
 * in what is in the portfolio and never in how it was valued. That identity is
 * the point — a verification computed by a different code path would not be
 * verifying anything.
 */
export function revalue(
  snapshot: BookSnapshot,
  next: FactorState,
  out: RevalResult,
  hedge?: BookSnapshot,
): RevalResult {
  const base = snapshot.base;
  const d0 = next.betas.b0 - base.betas.b0;
  const d1 = next.betas.b1 - base.betas.b1;
  const d2 = next.betas.b2 - base.betas.b2;
  const d3 = next.betas.b3 - base.betas.b3;
  const dCredit = next.credit.systematic - base.credit.systematic;

  out.byBucket.fill(0);
  out.totalPnl = accumulate(snapshot, d0, d1, d2, d3, dCredit, out.byBucket);
  if (hedge !== undefined && hedge.positionCount > 0) {
    out.totalPnl += accumulate(hedge, d0, d1, d2, d3, dCredit, out.byBucket);
  }
  return out;
}

function accumulate(
  snapshot: BookSnapshot,
  d0: number, d1: number, d2: number, d3: number, dCredit: number,
  byBucket: Float64Array,
): number {
  const {
    beta0, beta1, beta2, beta3, convexity, spreadDuration, creditBeta,
    spreadLevelPct, currentFace, basePrice, swap, baseValue, bucketOf,
  } = snapshot;

  let total = 0;
  for (let i = 0; i < snapshot.positionCount; i++) {
    const b0 = beta0[i] as number;
    const dy = b0 * d0 + (beta1[i] as number) * d1 + (beta2[i] as number) * d2 + (beta3[i] as number) * d3;
    // Divide the duration weighting back out before squaring — see the note in
    // `bookBuilder.repriceInPlace`. Magnitude, so a negative-duration position
    // takes the same branch.
    const own = (Math.abs(b0) > 0.05 ? dy / b0 : dy) / 100;
    const spread =
      (spreadDuration[i] as number) * (creditBeta[i] as number) * (spreadLevelPct[i] as number) * dCredit;
    const relative = -dy / 100 + 0.5 * (convexity[i] as number) * own * own - spread / 100;

    const price = Math.max(0.01, (basePrice[i] as number) * (1 + relative));
    const value = ((swap[i] === 1 ? price - 100 : price) / 100) * (currentFace[i] as number);
    const pnl = value - (baseValue[i] as number);

    total += pnl;
    const bucket = bucketOf[i] as number;
    byBucket[bucket] = (byBucket[bucket] as number) + pnl;
  }
  return total;
}

/** Per-position P&L, for attribution. Allocates, so not for the inner loop. */
export function revaluePositions(snapshot: BookSnapshot, next: FactorState): Float64Array {
  const base = snapshot.base;
  const d0 = next.betas.b0 - base.betas.b0;
  const d1 = next.betas.b1 - base.betas.b1;
  const d2 = next.betas.b2 - base.betas.b2;
  const d3 = next.betas.b3 - base.betas.b3;
  const dCredit = next.credit.systematic - base.credit.systematic;
  const out = new Float64Array(snapshot.positionCount);

  for (let i = 0; i < snapshot.positionCount; i++) {
    const b0 = snapshot.beta0[i] as number;
    const dy =
      b0 * d0 + (snapshot.beta1[i] as number) * d1 +
      (snapshot.beta2[i] as number) * d2 + (snapshot.beta3[i] as number) * d3;
    const own = (Math.abs(b0) > 0.05 ? dy / b0 : dy) / 100;
    const spread =
      (snapshot.spreadDuration[i] as number) * (snapshot.creditBeta[i] as number) *
      (snapshot.spreadLevelPct[i] as number) * dCredit;
    const relative = -dy / 100 + 0.5 * (snapshot.convexity[i] as number) * own * own - spread / 100;
    const price = Math.max(0.01, (snapshot.basePrice[i] as number) * (1 + relative));
    const value =
      ((snapshot.swap[i] === 1 ? price - 100 : price) / 100) * (snapshot.currentFace[i] as number);
    out[i] = value - (snapshot.baseValue[i] as number);
  }
  return out;
}
