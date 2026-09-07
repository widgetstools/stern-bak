/**
 * SNAC conversions: quoted spread to upfront, and back.
 *
 * Since the 2009 standardisation a single-name CDS trades on a FIXED coupon —
 * 100 bp for investment grade, 500 bp for high yield — with an upfront payment
 * settling the difference between that coupon and where the credit actually
 * trades. So a name quoted at 78 bp against a 100 bp coupon means the
 * protection BUYER receives about 0.96 points up front, because they are
 * agreeing to overpay on the running coupon.
 *
 * Quoting conventions then differ by market: investment grade quotes in par
 * spread, high yield in points upfront, and CDX.HY in price (100 minus the
 * upfront). Carrying all three is cheap and is the sort of detail that
 * separates a dataset built from conventions from one built from a formula.
 */

import {
  parSpreadFromHazard, riskyPv01, solveHazardFromSpread, RECOVERY_SENIOR_UNSECURED,
} from './hazard.js';

/** The two standard coupons, in basis points. */
export const STANDARD_COUPON_IG = 100;
export const STANDARD_COUPON_HY = 500;

/** Which coupon a name trades on. */
export function standardCoupon(isHighYield: boolean): number {
  return isHighYield ? STANDARD_COUPON_HY : STANDARD_COUPON_IG;
}

export interface SnacQuote {
  /** Par spread in basis points. */
  spreadBp: number;
  /** Fixed coupon in basis points, 100 or 500. */
  couponBp: number;
  recovery: number;
  /** Flat discount rate as a decimal. */
  discountRate: number;
  years: number;
}

export interface SnacConversion {
  hazard: number;
  /** PV of one unit of spread. Equals CS01 per unit of notional. */
  riskyPv01: number;
  /** Upfront as a percentage of notional. Negative when the buyer receives. */
  pointsUpfront: number;
  /** 100 minus points upfront — how CDX.HY is quoted. */
  price: number;
  /** Upfront in currency for a given notional. */
  upfrontCash(notional: number): number;
}

/**
 * Convert a quoted spread into an upfront.
 *
 * `Upfront = (S_par - C_fixed) * RiskyPV01`, which is exactly the present
 * value of the coupon mismatch over the life of the trade.
 */
export function upfrontFromSpread(quote: SnacQuote): SnacConversion {
  const spread = quote.spreadBp / 10000;
  const coupon = quote.couponBp / 10000;
  const hazard = solveHazardFromSpread(spread, quote.discountRate, quote.recovery, quote.years);
  const annuity = riskyPv01(hazard, quote.discountRate, quote.years);
  const pointsUpfront = (spread - coupon) * annuity * 100;
  return {
    hazard,
    riskyPv01: annuity,
    pointsUpfront,
    price: 100 - pointsUpfront,
    upfrontCash: (notional: number): number => (pointsUpfront / 100) * notional,
  };
}

/** Invert the conversion: recover the par spread from points upfront. */
export function spreadFromUpfront(
  pointsUpfront: number,
  couponBp: number,
  recovery: number,
  discountRate: number,
  years: number,
  tolerance = 1e-10,
): number {
  let low = 0;
  let high = 5;
  for (let i = 0; i < 200; i++) {
    const mid = (low + high) / 2;
    const puf = upfrontFromSpread({
      spreadBp: mid * 10000, couponBp, recovery, discountRate, years,
    }).pointsUpfront;
    if (Math.abs(puf - pointsUpfront) < tolerance) return mid * 10000;
    if (puf > pointsUpfront) high = mid;
    else low = mid;
  }
  return ((low + high) / 2) * 10000;
}

/**
 * Cash actually exchanged at settlement.
 *
 * The upfront less the coupon accrued since the previous IMM date — the
 * protection buyer is credited with it, which is why a standard contract has
 * a full first coupon.
 */
export function cashSettlement(
  pointsUpfront: number,
  couponBp: number,
  notional: number,
  daysSincePreviousImm: number,
): number {
  const upfront = (pointsUpfront / 100) * notional;
  const accrued = (couponBp / 10000) * (daysSincePreviousImm / 360) * notional;
  return upfront - accrued;
}

/** Par spread implied by a hazard rate, in basis points. */
export function parSpreadBp(
  hazard: number,
  discountRate: number,
  recovery: number,
  years: number,
): number {
  return parSpreadFromHazard(hazard, discountRate, recovery, years) * 10000;
}

/** A conversion at the standard conventions, for callers that just want one. */
export function quoteAtStandard(
  spreadBp: number,
  isHighYield: boolean,
  discountRate: number,
  years = 5,
  recovery = RECOVERY_SENIOR_UNSECURED,
): SnacConversion {
  return upfrontFromSpread({
    spreadBp,
    couponBp: standardCoupon(isHighYield),
    recovery,
    discountRate,
    years,
  });
}
