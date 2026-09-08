/**
 * The rate factors: four mean-reverting betas driving the whole Treasury curve.
 *
 * The calibration below is chosen so the model reproduces observed key-rate
 * volatilities and the correlation between the 2-year and the 10-year, because
 * those are what a rates trader would notice first if they were wrong.
 *
 * On `rho(b0, b1) = -0.25`. It trades curve correlation against long-end
 * volatility, and the measured sensitivity is:
 *
 *   rho(b0,b1)   sd 2Y   sd 10Y   sd 30Y   corr(2Y,10Y)
 *       -0.45    6.65     5.86     6.20        0.763
 *       -0.35    7.00     5.98     6.24        0.784
 *       -0.25    7.33     6.09     6.28        0.803
 *       -0.15    7.64     6.21     6.32        0.821
 *
 * Empirically 2Y runs 6-8 bp/day, 10Y 5-7, 30Y 5-6, and corr(2Y,10Y) sits at
 * 0.80-0.90. -0.25 is the first value that puts the correlation inside its
 * band while keeping 2Y and 10Y inside theirs; the 30Y comes out a shade rich.
 * Every value in the table is positive definite, so this is a calibration
 * choice, not a constraint.
 */

import { createNormalDraw, type Rng } from '../core/rng.js';
import { applyCholesky, cholesky } from '../core/linalg.js';
import { nssLoadings, type NssParams } from './nss.js';
import { ouStep, type OuSpec } from './ouProcess.js';

export const TRADING_DAYS_PER_YEAR = 252;
export const DAILY_DT = 1 / TRADING_DAYS_PER_YEAR;

/**
 * Level, slope, and two curvatures.
 *
 * Reversion gets faster as the factor gets less fundamental: the level has a
 * 4.6-year half-life (rate regimes persist), the slope 1.2 years, and the
 * curvature terms a few months. That ordering is what stops the curve from
 * holding an implausible shape for months at a time.
 */
/**
 * Fitted to the real Treasury curve, not chosen.
 *
 * `scripts/calibrateCurve.mjs` fits NSS betas to 2,669 daily H.15 curves
 * (2016-2026, from `reference/curveHistory.json`) and estimates each factor's
 * Ornstein-Uhlenbeck parameters by regressing on the EXACT transition rather
 * than the Euler approximation, which biases kappa upward at daily frequency.
 *
 * Because the decay parameters are frozen, fitting beta is ordinary least
 * squares; the fit reproduces the published curve to 9.4 bp RMS across eleven
 * tenors.
 *
 * Re-run the script to check these; it prints and does not overwrite, because
 * a calibration that silently rewrote the model would make every scenario
 * number already reported irreproducible.
 */
export const BETA_SPECS: readonly OuSpec[] = [
  { kappa: 1.31, theta: 4.13, sigma: 1.60 },
  { kappa: 0.55, theta: -1.21, sigma: 1.72 },
  { kappa: 1.40, theta: -1.77, sigma: 2.71 },
  { kappa: 1.40, theta: -2.00, sigma: 4.84 },
];

/**
 * The measured correlation of the daily beta innovations.
 *
 * Level and slope come out at -0.96 because with the decay parameters frozen
 * they are not separately identifiable from eleven tenors — but that near
 * collinearity is exactly what makes the front end behave. A hand-set -0.25
 * left the three-month correlating 0.77 with the ten-year where the real
 * figure is 0.25, because nothing cancelled the level factor at the short end.
 *
 * It stays comfortably decomposable: the Cholesky's smallest diagonal is 0.28.
 */
export const BETA_CORRELATION: readonly (readonly number[])[] = [
  [1.0, -0.96, -0.035, -0.857],
  [-0.96, 1.0, -0.066, 0.837],
  [-0.035, -0.066, 1.0, 0.051],
  [-0.857, 0.837, 0.051, 1.0],
];

/** Cholesky factor, computed once. Throws at load if the matrix is invalid. */
export const BETA_CHOLESKY: readonly (readonly number[])[] = cholesky(BETA_CORRELATION);

/** Starting curve: a mildly dipped front end and a normal upward slope. */
/**
 * Where the model starts: the mean of the last sixty sessions' fitted betas,
 * so the book opens on the curve the market is actually on rather than on one
 * day's noise. At these values the ten-year prices near 4.9%.
 */
export const SEED_BETAS: NssParams = { b0: 6.05, b1: -2.19, b2: -1.60, b3: -2.60 };

/** Daily volatility of each beta, in percent. */
export function betaDailySigma(index: number): number {
  const spec = BETA_SPECS[index] as OuSpec;
  return spec.sigma / Math.sqrt(TRADING_DAYS_PER_YEAR);
}

/**
 * Daily volatility of the zero rate at a tenor, in basis points.
 *
 * `Var[dy(tau)] = sum_ij L_i(tau) L_j(tau) sigma_i sigma_j rho_ij`. This is
 * the number to check the calibration against, because it is observable.
 */
export function impliedKeyRateVolBp(tau: number): number {
  const loadings = nssLoadings(tau);
  let variance = 0;
  for (let i = 0; i < 4; i++) {
    const ai = (loadings[i] as number) * betaDailySigma(i) * 100;
    for (let j = 0; j < 4; j++) {
      const aj = (loadings[j] as number) * betaDailySigma(j) * 100;
      variance += ai * aj * ((BETA_CORRELATION[i] as readonly number[])[j] as number);
    }
  }
  return Math.sqrt(variance);
}

/** Model correlation between the daily changes at two tenors. */
export function impliedKeyRateCorrelation(tau1: number, tau2: number): number {
  const l1 = nssLoadings(tau1);
  const l2 = nssLoadings(tau2);
  let covariance = 0;
  for (let i = 0; i < 4; i++) {
    const ai = (l1[i] as number) * betaDailySigma(i) * 100;
    for (let j = 0; j < 4; j++) {
      const aj = (l2[j] as number) * betaDailySigma(j) * 100;
      covariance += ai * aj * ((BETA_CORRELATION[i] as readonly number[])[j] as number);
    }
  }
  return covariance / (impliedKeyRateVolBp(tau1) * impliedKeyRateVolBp(tau2));
}

export interface BetaJump {
  /** Probability a scheduled release actually moves the market. */
  probability: number;
  /** Jump standard deviation applied to the level, in percent. */
  levelSigma: number;
  /** Jump standard deviation applied to the slope, in percent. */
  slopeSigma: number;
}

/**
 * Jumps on release days.
 *
 * Gaussian factors alone give daily changes a kurtosis of 3. Real yield
 * changes run above 4 because the distribution is a mixture: quiet days plus
 * a minority of release days with much larger moves. Adding a jump only on
 * scheduled dates reproduces that mixture without inflating everyday vol.
 */
export const BETA_JUMP: BetaJump = { probability: 0.35, levelSigma: 0.08, slopeSigma: 0.06 };

export interface RateFactorStep {
  betas: NssParams;
  /** True when a release-day jump fired. */
  jumped: boolean;
}

/** Advance the betas one step. `eventMultiplier` is 1 on an ordinary day. */
export function evolveBetas(
  betas: NssParams,
  dt: number,
  rng: Rng,
  normalDraw: () => number,
  eventMultiplier = 1,
): RateFactorStep {
  const independent = [normalDraw(), normalDraw(), normalDraw(), normalDraw()];
  const correlated = applyCholesky(BETA_CHOLESKY, independent, [0, 0, 0, 0]);

  const current = [betas.b0, betas.b1, betas.b2, betas.b3];
  const next = new Array<number>(4);
  for (let i = 0; i < 4; i++) {
    next[i] = ouStep(current[i] as number, BETA_SPECS[i] as OuSpec, dt, correlated[i] as number);
  }

  let jumped = false;
  if (eventMultiplier > 1 && rng() < BETA_JUMP.probability) {
    jumped = true;
    const scale = Math.sqrt(eventMultiplier);
    next[0] = (next[0] as number) + BETA_JUMP.levelSigma * scale * normalDraw();
    next[1] = (next[1] as number) + BETA_JUMP.slopeSigma * scale * normalDraw();
  }

  return {
    betas: {
      b0: next[0] as number,
      b1: next[1] as number,
      b2: next[2] as number,
      b3: next[3] as number,
    },
    jumped,
  };
}

/** A normal draw bound to an RNG, for callers that only have a seed. */
export function normalDrawFor(rng: Rng): () => number {
  return createNormalDraw(rng);
}
