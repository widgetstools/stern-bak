/**
 * The Nelson-Siegel-Svensson term-structure model.
 *
 *   y(tau) = b0
 *          + b1 * (1 - exp(-tau/l1)) / (tau/l1)
 *          + b2 * [(1 - exp(-tau/l1)) / (tau/l1) - exp(-tau/l1)]
 *          + b3 * [(1 - exp(-tau/l2)) / (tau/l2) - exp(-tau/l2)]
 *
 * b0 is the level, b1 the slope, b2 and b3 two humps. That decomposition is
 * the whole point: ticking four numbers produces recognisable curve moves —
 * bull steepeners, bear flatteners, twists — instead of the incoherent noise
 * you get from moving each tenor independently.
 *
 * **The decay parameters are frozen** at 1.80 and 11.00 years. Fitting them
 * alongside the betas is the standard approach and it is a mistake here, for
 * three reasons: the model becomes linear in beta, so a fit is one 4x4 solve
 * rather than a nonlinear optimisation; the loading matrix at the key-rate
 * knots can be precomputed once; and the intraday fast path can reduce a whole
 * revaluation to a 4-element dot product against dBeta, which is exact only
 * while the loadings are constant. Svensson is also badly conditioned when the
 * two decays are free and drift together.
 */

import { solveLinear } from '../core/linalg.js';

/** Years. Frozen — see the note above before changing either. */
export const LAMBDA_1 = 1.8;
export const LAMBDA_2 = 11.0;

export interface NssParams {
  /** Level. */
  b0: number;
  /** Slope. */
  b1: number;
  /** First curvature. */
  b2: number;
  /** Second curvature. */
  b3: number;
}

/** The four factor loadings at a tenor. Loading 0 is always 1 (the level). */
export function nssLoadings(tau: number, lambda1 = LAMBDA_1, lambda2 = LAMBDA_2): [number, number, number, number] {
  const t = tau <= 0 ? 1e-8 : tau;
  const a = t / lambda1;
  const b = t / lambda2;
  const ea = Math.exp(-a);
  const eb = Math.exp(-b);
  const l1 = (1 - ea) / a;
  const l2 = l1 - ea;
  const l3 = (1 - eb) / b - eb;
  return [1, l1, l2, l3];
}

/** Continuously compounded zero rate at `tau`, in percent. */
export function nssZero(params: NssParams, tau: number): number {
  const [, l1, l2, l3] = nssLoadings(tau);
  return params.b0 + params.b1 * l1 + params.b2 * l2 + params.b3 * l3;
}

export function betaArray(params: NssParams): [number, number, number, number] {
  return [params.b0, params.b1, params.b2, params.b3];
}

export function betaParams(beta: readonly number[]): NssParams {
  return {
    b0: beta[0] as number,
    b1: beta[1] as number,
    b2: beta[2] as number,
    b3: beta[3] as number,
  };
}

/**
 * The tenors key-rate durations are bucketed to. Precomputing loadings here
 * is what lets a security carry a 4-element rate sensitivity vector instead of
 * a 10-element KRD vector on the hot path.
 */
export const KRD_KNOTS = [0.25, 0.5, 1, 2, 3, 5, 7, 10, 20, 30] as const;

/** Loadings at every knot, computed once. */
export const KNOT_LOADINGS: readonly (readonly [number, number, number, number])[] =
  KRD_KNOTS.map((tau) => nssLoadings(tau));

/**
 * Collapse a key-rate duration vector into its sensitivity to each beta.
 *
 * `B[j] = sum over knots of KRD[knot] * L[j](knot)`, by the chain rule through
 * the frozen loadings. With these four numbers a whole-book revaluation is
 * `dy = B . dBeta` — four multiplies per security, and exact rather than an
 * approximation, because the loadings do not move.
 */
export function betaSensitivity(keyRateDurations: readonly number[]): [number, number, number, number] {
  let s0 = 0;
  let s1 = 0;
  let s2 = 0;
  let s3 = 0;
  for (let k = 0; k < KRD_KNOTS.length; k++) {
    const krd = keyRateDurations[k] ?? 0;
    if (krd === 0) continue;
    const loadings = KNOT_LOADINGS[k] as readonly [number, number, number, number];
    s0 += krd * loadings[0];
    s1 += krd * loadings[1];
    s2 += krd * loadings[2];
    s3 += krd * loadings[3];
  }
  return [s0, s1, s2, s3];
}

export interface CurveTarget {
  tau: number;
  /** Zero rate in percent. */
  rate: number;
  /** Relative importance in the fit. Defaults to 1. */
  weight?: number;
}

/**
 * Least-squares fit of the betas to observed zero rates.
 *
 * Linear, because the decays are fixed — this is one 4x4 normal-equations
 * solve. The ridge term keeps b2 and b3 from trading off against each other
 * when the target set is sparse, which is the classic Svensson pathology.
 */
export function fitNss(targets: readonly CurveTarget[], ridge = 1e-4): NssParams {
  if (targets.length < 4) {
    throw new Error(`NSS fit needs at least 4 targets, got ${targets.length}`);
  }
  const ata: number[][] = Array.from({ length: 4 }, () => new Array<number>(4).fill(0));
  const atb: number[] = new Array<number>(4).fill(0);

  for (const target of targets) {
    const loadings = nssLoadings(target.tau);
    const weight = target.weight ?? 1;
    for (let i = 0; i < 4; i++) {
      const row = ata[i] as number[];
      const li = loadings[i] as number;
      for (let j = 0; j < 4; j++) {
        row[j] = (row[j] as number) + weight * li * (loadings[j] as number);
      }
      atb[i] = (atb[i] as number) + weight * li * target.rate;
    }
  }
  // Penalise only the curvature terms; the level and slope are well identified.
  const row2 = ata[2] as number[];
  const row3 = ata[3] as number[];
  row2[2] = (row2[2] as number) + ridge;
  row3[3] = (row3[3] as number) + ridge;
  return betaParams(solveLinear(ata, atb));
}

/** Root-mean-square fit error, in percent. */
export function fitError(params: NssParams, targets: readonly CurveTarget[]): number {
  if (targets.length === 0) return 0;
  let sum = 0;
  for (const target of targets) {
    const diff = nssZero(params, target.tau) - target.rate;
    sum += diff * diff;
  }
  return Math.sqrt(sum / targets.length);
}
