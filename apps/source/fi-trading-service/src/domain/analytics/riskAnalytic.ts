/**
 * Analytic risk measures, computed from the same cashflows as the price.
 *
 * That shared derivation is the point. In the generator this replaces, price,
 * yield, duration, convexity and DV01 were independent random numbers, so they
 * contradicted each other: `dv01` never predicted what a 1 bp move would
 * actually do to the price. Here DV01 IS the derivative of the price function,
 * and a test asserts it predicts the reprice.
 *
 * Spread duration is computed separately by bumping the spread rather than the
 * yield. For a fixed bullet the two nearly coincide; for a floater they
 * diverge violently — rate duration near 0.1, spread duration near its WAL —
 * and that divergence is the floater's signature in a risk column.
 */

import type { DateInt } from '../core/dateInt.js';
import type { DiscountCurve } from '../curves/discount.js';
import {
  accruedFor, dirtyPriceFromFlows, projectCashflows, pvFromCurve,
  type BondTerms, type Cashflow, type YieldConvention,
} from './pricing.js';

/** Macaulay duration in YEARS, from cashflows timed in coupon periods. */
export function macaulayDuration(
  flows: readonly Cashflow[],
  yieldPct: number,
  frequency: number,
  dirtyPrice: number,
): number {
  if (dirtyPrice <= 0 || flows.length === 0) return 0;
  const periodic = yieldPct / 100 / frequency;
  let weighted = 0;
  for (const flow of flows) {
    weighted += flow.periods * flow.amount * (1 + periodic) ** -flow.periods;
  }
  return weighted / dirtyPrice / frequency;
}

export function modifiedFromMacaulay(
  macaulay: number,
  yieldPct: number,
  frequency: number,
): number {
  return macaulay / (1 + yieldPct / 100 / frequency);
}

/** Convexity in years squared. */
export function convexity(
  flows: readonly Cashflow[],
  yieldPct: number,
  frequency: number,
  dirtyPrice: number,
): number {
  if (dirtyPrice <= 0 || flows.length === 0) return 0;
  const periodic = yieldPct / 100 / frequency;
  let weighted = 0;
  for (const flow of flows) {
    weighted += flow.periods * (flow.periods + 1) * flow.amount * (1 + periodic) ** -(flow.periods + 2);
  }
  return weighted / dirtyPrice / (frequency * frequency);
}

/**
 * Value of one basis point, in currency for the given face.
 *
 * Sign convention: positive, i.e. the money a 1 bp RISE in yield costs.
 */
export function dv01(modifiedDuration: number, dirtyPrice: number, face = 100): number {
  return (modifiedDuration * dirtyPrice * (face / 100)) / 10000;
}

export interface RiskMeasures {
  dirtyPrice: number;
  cleanPrice: number;
  accrued: number;
  macaulayDuration: number;
  modifiedDuration: number;
  convexity: number;
  dv01: number;
  /** Whole years to the final cashflow. */
  timeToMaturity: number;
}

/** Every analytic measure for a bond, from one cashflow projection. */
export function bondRisk(
  terms: BondTerms,
  settle: DateInt,
  yieldPct: number,
  options: { convention?: YieldConvention } = {},
): RiskMeasures {
  const flows = projectCashflows(terms, settle);
  const convention = options.convention ?? 'Street';
  const dirty = dirtyPriceFromFlows(flows, yieldPct, terms.frequency, convention);
  const accrued = accruedFor(terms, settle);
  const macaulay = macaulayDuration(flows, yieldPct, terms.frequency, dirty);
  const modified = modifiedFromMacaulay(macaulay, yieldPct, terms.frequency);
  const last = flows[flows.length - 1];
  return {
    dirtyPrice: dirty,
    cleanPrice: dirty - accrued,
    accrued,
    macaulayDuration: macaulay,
    modifiedDuration: modified,
    convexity: convexity(flows, yieldPct, terms.frequency, dirty),
    dv01: dv01(modified, dirty, terms.face ?? 100),
    timeToMaturity: last === undefined ? 0 : last.years,
  };
}

/**
 * Sensitivity to the spread rather than to the yield.
 *
 * Bumped both ways around the current spread, so it is a central difference
 * and second-order accurate.
 */
export function spreadDuration(
  terms: BondTerms,
  settle: DateInt,
  curve: DiscountCurve,
  spreadPct: number,
  bumpBp = 1,
): number {
  const bump = bumpBp / 10000;
  const up = pvFromCurve(terms, settle, curve, spreadPct + bump * 100);
  const down = pvFromCurve(terms, settle, curve, spreadPct - bump * 100);
  const base = pvFromCurve(terms, settle, curve, spreadPct);
  if (base <= 0) return 0;
  return -(up - down) / (2 * base * bump);
}

/** Spread-basis-point value, the credit twin of DV01. */
export function cs01(
  terms: BondTerms,
  settle: DateInt,
  curve: DiscountCurve,
  spreadPct: number,
  face = 100,
): number {
  const base = pvFromCurve(terms, settle, curve, spreadPct);
  const up = pvFromCurve(terms, settle, curve, spreadPct + 0.01);
  return ((base - up) * face) / 100;
}
