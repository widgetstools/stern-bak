/**
 * Credit spreads: systematic, sector, and idiosyncratic.
 *
 *   ln S_i(t) = ln Sbar_i + b_C * C(t) + b_G * G_s(t) + I_i(t)
 *
 * Two decisions carry most of the realism.
 *
 * **Logs, not levels.** Spread volatility is proportional to level — a 500 bp
 * high-yield name moves 15 bp on a quiet day, a 20 bp AAA moves one. Modelling
 * the log gets that for free and makes a negative spread impossible.
 *
 * **A shared systematic factor.** Every issuer loads on one `C(t)`, so credit
 * widens together, which is what it actually does. Independent per-name walks
 * produce a book where half the names widen while half tighten every day, and
 * no risk-off day ever happens.
 *
 * On top sit idiosyncratic jumps, because a credit blotter is full of names
 * that gapped 400 bp overnight on news, and a diffusion alone never does that.
 */

import { uniformInt, type Rng } from '../core/rng.js';
import { ouStep, type OuSpec } from './ouProcess.js';

/** The sector taxonomy a credit desk actually groups by. */
export const CREDIT_SECTORS = [
  'Banking',
  'Basic Industry',
  'Capital Goods',
  'Communications',
  'Consumer Cyclical',
  'Consumer Non-Cyclical',
  'Electric',
  'Energy',
  'Insurance',
  'Natural Gas',
  'REITs',
  'Technology',
  'Transportation',
  'Sovereign',
] as const;

export type CreditSector = (typeof CREDIT_SECTORS)[number];

/** Risk appetite. Slow, and the widest of the three. */
export const SYSTEMATIC_SPEC: OuSpec = { kappa: 1.2, theta: 0, sigma: 0.55 };
/** Sector rotation. Faster and smaller than the systematic factor. */
export const SECTOR_SPEC: OuSpec = { kappa: 2.5, theta: 0, sigma: 0.3 };
/** Name-specific noise. High yield is twice as jumpy as investment grade. */
export const IDIO_IG_SPEC: OuSpec = { kappa: 4.0, theta: 0, sigma: 0.22 };
export const IDIO_HY_SPEC: OuSpec = { kappa: 4.0, theta: 0, sigma: 0.45 };

/** High yield loads more heavily on risk appetite than investment grade. */
export const SYSTEMATIC_LOADING_IG = 1.0;
export const SYSTEMATIC_LOADING_HY = 1.35;
export const SECTOR_LOADING = 0.9;

/** Single-name jump intensity, per year. */
export const JUMP_INTENSITY_IG = 0.08;
export const JUMP_INTENSITY_HY = 0.35;
/** Jumps widen three times out of four; the rest are relief rallies. */
export const JUMP_WIDEN_PROBABILITY = 0.75;
const JUMP_WIDEN_MEAN = 0.3;
const JUMP_WIDEN_SD = 0.25;
const JUMP_TIGHTEN_MEAN = -0.18;
const JUMP_TIGHTEN_SD = 0.15;

export interface CreditFactorState {
  /** Systematic risk appetite, in log space. */
  systematic: number;
  /** One per sector, in log space. */
  sector: Float64Array;
  /** One per issuer, in log space. */
  idiosyncratic: Float64Array;
}

export function createCreditFactorState(issuerCount: number): CreditFactorState {
  return {
    systematic: 0,
    sector: new Float64Array(CREDIT_SECTORS.length),
    idiosyncratic: new Float64Array(issuerCount),
  };
}

export interface CreditEvolveOptions {
  dt: number;
  rng: Rng;
  normalDraw: () => number;
  /** True for each issuer that is high yield. */
  isHighYield: Uint8Array;
  /** Scales the systematic shock on release days. */
  eventMultiplier?: number;
}

/** Advance every credit factor one step, jumps included. */
export function evolveCreditFactors(
  state: CreditFactorState,
  options: CreditEvolveOptions,
): { jumpCount: number } {
  const { dt, rng, normalDraw, isHighYield } = options;
  const eventScale = Math.sqrt(options.eventMultiplier ?? 1);

  state.systematic = ouStep(state.systematic, SYSTEMATIC_SPEC, dt, normalDraw() * eventScale);

  for (let s = 0; s < state.sector.length; s++) {
    state.sector[s] = ouStep(state.sector[s] as number, SECTOR_SPEC, dt, normalDraw());
  }

  let jumpCount = 0;
  for (let i = 0; i < state.idiosyncratic.length; i++) {
    const hy = isHighYield[i] === 1;
    const spec = hy ? IDIO_HY_SPEC : IDIO_IG_SPEC;
    let value = ouStep(state.idiosyncratic[i] as number, spec, dt, normalDraw());

    const intensity = hy ? JUMP_INTENSITY_HY : JUMP_INTENSITY_IG;
    if (rng() < intensity * dt) {
      jumpCount += 1;
      const widen = rng() < JUMP_WIDEN_PROBABILITY;
      const mean = widen ? JUMP_WIDEN_MEAN : JUMP_TIGHTEN_MEAN;
      const sd = widen ? JUMP_WIDEN_SD : JUMP_TIGHTEN_SD;
      value += mean + sd * normalDraw();
    }
    state.idiosyncratic[i] = value;
  }
  return { jumpCount };
}

/** The spread an issuer quotes at its 5-year point, in basis points. */
export function issuerSpread5y(
  baseSpreadBp: number,
  sectorIndex: number,
  issuerIndex: number,
  isHighYield: boolean,
  state: CreditFactorState,
): number {
  const systematicLoading = isHighYield ? SYSTEMATIC_LOADING_HY : SYSTEMATIC_LOADING_IG;
  const logSpread =
    Math.log(baseSpreadBp) +
    systematicLoading * state.systematic +
    SECTOR_LOADING * (state.sector[sectorIndex] ?? 0) +
    (state.idiosyncratic[issuerIndex] ?? 0);
  return Math.exp(logSpread);
}

/**
 * Slope of an issuer's credit curve.
 *
 * Healthy names slope upward — more time, more risk. Distressed names INVERT,
 * because the market is pricing a near-term default rather than a term
 * premium. Making the slope a function of the level gets that for free: at
 * 400 bp the slope is still +0.22, and it crosses zero and keeps falling as
 * the name deteriorates. No special case, no distressed flag.
 */
export function creditCurveSlope(spread5yBp: number): number {
  const excess = Math.max(0, (Math.log(spread5yBp) - Math.log(400)) / Math.log(3));
  return 0.22 - 0.55 * excess;
}

/** The issuer's spread at an arbitrary tenor, in basis points. */
export function issuerSpreadAtTenor(spread5yBp: number, tau: number): number {
  if (tau <= 0) return spread5yBp;
  const slope = creditCurveSlope(spread5yBp);
  return spread5yBp * Math.exp(slope * (Math.log(tau) - Math.log(5)));
}

/** Spread multiplier by seniority. Subordination costs a lot in stress. */
export const SENIORITY_MULTIPLIER = {
  SeniorSecured: 0.8,
  SeniorUnsecured: 1.0,
  Subordinated: 1.45,
  JuniorSubordinated: 2.1,
} as const;

/** Pick a sector index deterministically for an issuer. */
export function sectorIndexFor(rng: Rng): number {
  return uniformInt(rng, 0, CREDIT_SECTORS.length - 1);
}
