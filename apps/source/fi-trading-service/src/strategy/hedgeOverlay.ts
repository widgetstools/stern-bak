/**
 * Turn a solved package into something the scenario engine can revalue.
 *
 * This is the join that makes verification mean anything. The overlay is a
 * `BookSnapshot` — the same structure the real book uses — so `revalue` prices
 * a hedge leg with the identical expansion it prices a position with, and a
 * hedged run differs from an unhedged one only in what is in the portfolio.
 *
 * The alternative, which is what a risk system would do, is to compute the
 * hedge's effect analytically and subtract it. That would guarantee the hedge
 * "works", because the same first-order model that designed it would be
 * grading it. Running it through the full revaluation lets the convexity term
 * disagree — and on a book of mortgages it does, which is the finding.
 */

import type { DateInt } from '../domain/core/dateInt.js';
import type { FactorState } from '../domain/curves/factorEngine.js';
import type { BookSnapshot } from '../scenario/bookSnapshot.js';
import type { HedgeLeg } from './hedgeSolver.js';

/**
 * A package as a revaluable overlay.
 *
 * A leg's `currentFace` is signed: a sale or bought protection carries negative
 * face, and every downstream formula already handles that, because a book can
 * hold shorts.
 */
export function overlayFromLegs(
  legs: readonly HedgeLeg[], base: FactorState, asOf: DateInt,
): BookSnapshot {
  const n = legs.length;
  const buckets: string[] = [];
  const bucketIndex = new Map<string, number>();

  const overlay: BookSnapshot = {
    asOf,
    positionCount: n,
    fingerprint: `hedge-${n}-${Math.round(legs.reduce((sum, leg) => sum + Math.abs(leg.notionalMm), 0))}mm`,
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

  for (const [i, leg] of legs.entries()) {
    const bucket = `Hedge:${leg.candidate.instrumentKind}`;
    let index = bucketIndex.get(bucket);
    if (index === undefined) {
      index = buckets.length;
      buckets.push(bucket);
      bucketIndex.set(bucket, index);
    }
    const face = leg.notionalMm * 1e6;
    const price = leg.candidate.price;
    const isSwap = leg.candidate.instrumentKind === 'CDS' || leg.candidate.instrumentKind === 'CDX';

    // Recover the leg's own sensitivities from the gradient the solver used.
    // `gradient[f] = -(price x face / 10000) x beta_f`, so dividing back out
    // gives the per-position numbers `revalue` expects. Doing it this way means
    // the overlay cannot describe a different instrument from the one solved.
    const weight = (price * face) / 10_000;
    const perFactor = (f: number): number =>
      weight === 0 ? 0 : -(leg.gradient[f] as number) / weight;

    overlay.positionId[i] = `HEDGE-${leg.candidate.securityId}`;
    overlay.description[i] =
      `${leg.notionalMm >= 0 ? 'BUY' : 'SELL'} ${Math.abs(leg.notionalMm)}mm ${leg.candidate.description}`;
    overlay.bucketOf[i] = index;
    overlay.issuerId[i] = -1;
    overlay.beta0[i] = perFactor(0);
    overlay.beta1[i] = perFactor(1);
    overlay.beta2[i] = perFactor(2);
    overlay.beta3[i] = perFactor(3);
    // A hedge leg's convexity is not solved for — only its first-order risk is
    // — so it is carried as the square of its own duration, which is right for
    // a bullet and is the honest default for a Treasury or a swap.
    overlay.convexity[i] = perFactor(0) ** 2;
    overlay.spreadDuration[i] = isSwap ? Math.abs(perFactor(0)) : 0;
    overlay.creditBeta[i] = isSwap ? 1 : 0;
    overlay.spreadLevelPct[i] = 0;
    overlay.currentFace[i] = face;
    overlay.basePrice[i] = price;
    overlay.swap[i] = isSwap ? 1 : 0;
    overlay.baseValue[i] = ((isSwap ? price - 100 : price) / 100) * face;
  }

  // The credit leg has to come back through `spreadLevelPct`, which the loop
  // above cannot know until the gradient is in hand. Solve it per leg: the
  // fifth gradient component is `-weight x spreadDuration x creditBeta x level`.
  for (const [i, leg] of legs.entries()) {
    const face = overlay.currentFace[i] as number;
    const weight = ((overlay.basePrice[i] as number) * face) / 10_000;
    const spreadDuration = overlay.spreadDuration[i] as number;
    const creditBeta = overlay.creditBeta[i] as number;
    if (weight === 0 || spreadDuration === 0 || creditBeta === 0) continue;
    overlay.spreadLevelPct[i] = -(leg.gradient[4] as number) / (weight * spreadDuration * creditBeta);
  }

  return overlay;
}
