/**
 * Search the factor space for the move that hurts THIS book most.
 *
 * Not "apply the 2008 scenario". A stored scenario asks what happens to your
 * book under someone else's history; this asks what your book is actually
 * exposed to, and the answer is different for a long-duration muni book than
 * for a high-yield one. That is the part a trader does not already know.
 *
 * The search has a closed form, because the book's P&L is linear in the factor
 * moves to first order:
 *
 *     pnl(d)  ~  g . d          g is the book's aggregate sensitivity
 *     plausible(d)  <=>  d' S^-1 d  <=  r^2
 *
 * Minimising a linear function over an ellipsoid puts the answer on the
 * boundary, opposite the gradient in the metric of the covariance:
 *
 *     d*  =  -r . S g / sqrt(g' S g)        worst  =  -r . sqrt(g' S g)
 *
 * `S` is the real factor covariance over the horizon — the OU transition
 * variances of the four curve betas under their fitted correlation, plus the
 * systematic credit factor — so "plausible" means "a move this model actually
 * produces at r standard deviations", not a number someone chose.
 *
 * The linear solution is a PROPOSAL. It is then priced through the full
 * revaluation, convexity and all, so what gets reported is measured rather than
 * modelled. Where the two disagree, the convexity term is the difference, and
 * for a book of mortgages that is the interesting part rather than an error.
 */

import { BETA_CORRELATION, BETA_SPECS, DAILY_DT } from '../domain/curves/rateFactors.js';
import { SYSTEMATIC_SPEC } from '../domain/curves/creditFactors.js';
import { stepSd } from '../domain/curves/ouProcess.js';
import type { FactorState } from '../domain/curves/factorEngine.js';
import type { BookSnapshot } from './bookSnapshot.js';
import { createRevalResult, revalue, revaluePositions } from './fastReval.js';

/** Curve factors plus the systematic credit factor. */
const DIMENSION = 5;

export interface FactorExposure {
  /** d(P&L) per unit move in each factor: b0, b1, b2, b3, credit. */
  gradient: number[];
  /** The same, as the loss from a one-standard-deviation move in each alone. */
  standaloneLoss: number[];
  labels: string[];
}

/**
 * The book's aggregate sensitivity to each factor, in currency per unit.
 *
 * This is the first-order part of the same expansion `fastReval` applies, summed
 * over positions: a position worth `basePrice x face / 100` loses
 * `dy / 100` of itself for a duration-weighted yield move of `dy`.
 */
export function factorExposure(book: BookSnapshot): FactorExposure {
  const gradient = new Array<number>(DIMENSION).fill(0);
  for (let i = 0; i < book.positionCount; i++) {
    const weight = ((book.basePrice[i] as number) * (book.currentFace[i] as number)) / 10_000;
    gradient[0] = (gradient[0] as number) - weight * (book.beta0[i] as number);
    gradient[1] = (gradient[1] as number) - weight * (book.beta1[i] as number);
    gradient[2] = (gradient[2] as number) - weight * (book.beta2[i] as number);
    gradient[3] = (gradient[3] as number) - weight * (book.beta3[i] as number);
    gradient[4] =
      (gradient[4] as number) -
      weight * (book.spreadDuration[i] as number) * (book.creditBeta[i] as number) *
        (book.spreadLevelPct[i] as number);
  }
  const sd = factorStandardDeviations(1);
  return {
    gradient,
    standaloneLoss: gradient.map((value, index) => value * (sd[index] as number)),
    labels: ['level', 'slope', 'curvature', 'hump', 'credit'],
  };
}

/** One-standard-deviation move in each factor over `horizonDays` business days. */
export function factorStandardDeviations(horizonDays: number): number[] {
  const dt = horizonDays * DAILY_DT;
  const out = BETA_SPECS.map((spec) => stepSd(spec, dt));
  out.push(stepSd(SYSTEMATIC_SPEC, dt));
  return out;
}

/**
 * Factor covariance over the horizon.
 *
 * The curve betas carry their fitted correlation; the credit factor is taken as
 * independent of them. That independence is a simplification and a conservative
 * one for this purpose — a rates-credit correlation would make the joint move
 * more likely, not less, so treating them as independent understates rather
 * than inflates how plausible the worst case is.
 */
export function factorCovariance(horizonDays: number): number[][] {
  const sd = factorStandardDeviations(horizonDays);
  const covariance: number[][] = [];
  for (let i = 0; i < DIMENSION; i++) {
    const row: number[] = [];
    for (let j = 0; j < DIMENSION; j++) {
      const correlation =
        i === j ? 1 : i === 4 || j === 4 ? 0 : ((BETA_CORRELATION[i] as number[])[j] as number);
      row.push(correlation * (sd[i] as number) * (sd[j] as number));
    }
    covariance.push(row);
  }
  return covariance;
}

export interface ReverseStressRequest {
  book: BookSnapshot;
  horizonDays: number;
  /**
   * How far into the tail to look, in joint standard deviations. 2.5 is about
   * a one-in-a-hundred move for a five-factor normal; 3.5 is a crisis.
   */
  radius?: number;
  hedge?: BookSnapshot;
}

export interface ReverseStressResult {
  bookFingerprint: string;
  horizonDays: number;
  radius: number;
  /** The worst plausible move, in the factors' own units. */
  move: { level: number; slope: number; curvature: number; hump: number; credit: number };
  /** What the linear model predicts it costs. */
  predictedPnl: number;
  /** What the full revaluation says it costs, convexity included. */
  actualPnl: number;
  /** `actual - predicted`. Negative convexity makes this worse than predicted. */
  convexityEffect: number;
  /** Ten-year zero rate before and after, for a human-readable summary. */
  tenYearMoveBp: number;
  creditWideningPct: number;
  exposure: FactorExposure;
  byBucket: { bucket: string; pnl: number; share: number }[];
  worstPositions: { positionId: string; description: string; bucket: string; pnl: number }[];
  /** Why THIS book is exposed to THIS move. */
  explanation: string;
  plausibility: string;
}

function multiply(matrix: readonly (readonly number[])[], vector: readonly number[]): number[] {
  return matrix.map((row) => row.reduce((sum, value, index) => sum + value * (vector[index] as number), 0));
}

function dot(a: readonly number[], b: readonly number[]): number {
  return a.reduce((sum, value, index) => sum + value * (b[index] as number), 0);
}

export function reverseStress(request: ReverseStressRequest): ReverseStressResult {
  const { book, horizonDays } = request;
  const radius = request.radius ?? 2.5;
  const exposure = factorExposure(book);
  const covariance = factorCovariance(horizonDays);

  // d* = -r . S g / sqrt(g' S g). The scale factor is what puts it exactly on
  // the plausibility boundary rather than somewhere inside or beyond it.
  const sg = multiply(covariance, exposure.gradient);
  const quadratic = dot(exposure.gradient, sg);
  const scale = quadratic <= 0 ? 0 : -radius / Math.sqrt(quadratic);
  const move = sg.map((value) => value * scale);
  const predictedPnl = dot(exposure.gradient, move);

  const shocked: FactorState = {
    ...book.base,
    betas: {
      b0: book.base.betas.b0 + (move[0] as number),
      b1: book.base.betas.b1 + (move[1] as number),
      b2: book.base.betas.b2 + (move[2] as number),
      b3: book.base.betas.b3 + (move[3] as number),
    },
    credit: { ...book.base.credit, systematic: book.base.credit.systematic + (move[4] as number) },
  };

  const scratch = createRevalResult(book);
  revalue(book, shocked, scratch, request.hedge);
  const actualPnl = scratch.totalPnl;

  const byBucket = book.buckets
    .map((bucket, index) => ({
      bucket,
      pnl: scratch.byBucket[index] as number,
      share: actualPnl === 0 ? 0 : (scratch.byBucket[index] as number) / actualPnl,
    }))
    .sort((a, b) => a.pnl - b.pnl);

  const perPosition = revaluePositions(book, shocked);
  const worstPositions = [...perPosition.keys()]
    .sort((a, b) => (perPosition[a] as number) - (perPosition[b] as number))
    .slice(0, 8)
    .map((index) => ({
      positionId: book.positionId[index] as string,
      description: book.description[index] as string,
      bucket: book.buckets[book.bucketOf[index] as number] as string,
      pnl: perPosition[index] as number,
    }));

  return {
    bookFingerprint: book.fingerprint,
    horizonDays,
    radius,
    move: {
      level: move[0] as number, slope: move[1] as number, curvature: move[2] as number,
      hump: move[3] as number, credit: move[4] as number,
    },
    predictedPnl,
    actualPnl,
    convexityEffect: actualPnl - predictedPnl,
    // The level factor's NSS loading is 1 at every tenor, so its move IS the
    // ten-year move up to the other factors' loadings there.
    tenYearMoveBp: (move[0] as number) * 100,
    creditWideningPct: (Math.exp(move[4] as number) - 1) * 100,
    exposure,
    byBucket,
    worstPositions,
    explanation: explain(exposure, byBucket, move),
    plausibility:
      `the worst direction on the ${radius}-standard-deviation boundary of the factor ` +
      `covariance over ${horizonDays} business days, using the model's own fitted OU ` +
      `volatilities and beta correlations`,
  };
}

function explain(
  exposure: FactorExposure,
  byBucket: readonly { bucket: string; pnl: number; share: number }[],
  move: readonly number[],
): string {
  const ranked = exposure.standaloneLoss
    .map((loss, index) => ({ label: exposure.labels[index] as string, loss, move: move[index] as number }))
    .filter((entry) => entry.move !== 0)
    .sort((a, b) => Math.abs(b.loss * b.move) - Math.abs(a.loss * a.move));

  const leadFactor = ranked[0];
  const leadBucket = byBucket[0];
  if (leadFactor === undefined || leadBucket === undefined) return 'The book carries no factor risk.';

  const second = ranked[1];
  const direction = (entry: { label: string; move: number }): string =>
    entry.label === 'credit'
      ? `${entry.move > 0 ? 'widening' : 'tightening'} credit`
      : `${entry.move > 0 ? 'higher' : 'lower'} ${entry.label}`;

  const shape =
    second === undefined
      ? direction(leadFactor)
      : `${direction(leadFactor)} together with ${direction(second)}`;
  return (
    `This book's worst plausible move is ${shape}, because its risk is ` +
    `concentrated in ${leadBucket.bucket} (${Math.round(leadBucket.share * 100)}% of the loss). ` +
    `The ${leadFactor.label} factor alone accounts for the largest share of the exposure; ` +
    `a book weighted differently across asset classes would be searched to a different corner.`
  );
}
