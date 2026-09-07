/**
 * CDS risk measures.
 *
 * Two of these have no analogue in a cash bond and are what make a credit
 * derivatives book look different from a corporate bond book:
 *
 * **JTD**, jump-to-default, is what the position pays if the name defaults
 * TOMORROW. For a protection buyer it is `(1 - R) * notional` less the current
 * mark, and it is large and discontinuous — a $10mm position on a name trading
 * at 78 bp has a mark near zero and a jump risk of six million.
 *
 * **Recovery01** is sensitivity to the recovery assumption itself, which
 * matters enormously for distressed names where the recovery rate is the
 * dominant uncertainty and barely at all for tight investment grade.
 */

import { riskyPv01, solveHazardFromSpread } from './hazard.js';
import { upfrontFromSpread, type SnacQuote } from './isdaModel.js';

export type CdsDirection = 'BuyProtection' | 'SellProtection';

export interface CdsPosition {
  notional: number;
  direction: CdsDirection;
  quote: SnacQuote;
}

/** Sign convention: protection bought is short credit. */
export function directionSign(direction: CdsDirection): number {
  return direction === 'BuyProtection' ? -1 : 1;
}

/**
 * Value of the position to its holder, in currency.
 *
 * One convention, applied everywhere below: `pointsUpfront` is what the
 * protection BUYER pays, so the buyer's position is worth exactly that and the
 * seller's is worth its negative. Stating it once and deriving the rest avoids
 * the sign errors that make a credit book quietly wrong.
 *
 * A $10mm buyer of five-year protection on a name at 78 bp against a 100 bp
 * coupon has a mark of about minus 96,000: they received cash up front for
 * agreeing to overpay on the running coupon.
 */
export function markToMarket(position: CdsPosition): number {
  const buyerValue = upfrontFromSpread(position.quote).upfrontCash(position.notional);
  return position.direction === 'BuyProtection' ? buyerValue : -buyerValue;
}

/**
 * CS01: the money a one basis point widening makes or costs.
 *
 * Equal to `RiskyPV01 * 0.0001 * notional`. Reported as a positive magnitude,
 * which is how a risk report shows it; the direction tells you the sign.
 */
export function cs01(position: CdsPosition): number {
  const { quote } = position;
  const hazard = solveHazardFromSpread(
    quote.spreadBp / 10000, quote.discountRate, quote.recovery, quote.years,
  );
  const annuity = riskyPv01(hazard, quote.discountRate, quote.years);
  return annuity * 0.0001 * position.notional;
}

/**
 * Jump to default: what the position is worth if the name defaults today, net
 * of the mark already carried.
 *
 * Large and discontinuous. A $10mm protection buyer on a tight investment
 * grade name carries a mark near zero and a jump risk of six million, which is
 * the whole reason the measure exists separately from CS01.
 */
export function jumpToDefault(position: CdsPosition): number {
  const lossGivenDefault = (1 - position.quote.recovery) * position.notional;
  const mark = markToMarket(position);
  return position.direction === 'BuyProtection'
    ? lossGivenDefault - mark
    : -lossGivenDefault - mark;
}

/** Sensitivity to a one percentage point rise in the recovery assumption. */
export function recovery01(position: CdsPosition): number {
  const bumped: CdsPosition = {
    ...position,
    quote: { ...position.quote, recovery: Math.min(0.95, position.quote.recovery + 0.01) },
  };
  return markToMarket(bumped) - markToMarket(position);
}

/** Daily carry: the running coupon, ACT/360. Positive for a seller. */
export function dailyCarry(position: CdsPosition): number {
  const coupon = (position.quote.couponBp / 10000) * position.notional;
  return (directionSign(position.direction) * coupon) / 360;
}

/** IR01: sensitivity to a one basis point parallel move in the curve. */
export function ir01(position: CdsPosition): number {
  const bumped: CdsPosition = {
    ...position,
    quote: { ...position.quote, discountRate: position.quote.discountRate + 0.0001 },
  };
  return markToMarket(bumped) - markToMarket(position);
}

/**
 * Bond-CDS basis, in basis points: the CDS spread less the bond's z-spread.
 *
 * Only meaningful because a reference entity and its bonds share an issuer and
 * therefore a credit factor — which is the whole reason the CDS universe is
 * built from the corporate issuer set rather than independently.
 */
export function bondCdsBasisBp(cdsSpreadBp: number, bondZSpreadBp: number): number {
  return cdsSpreadBp - bondZSpreadBp;
}
