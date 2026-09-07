/**
 * Discounting off a fitted curve.
 *
 * Zero rates are continuously compounded and quoted in percent, which is the
 * one convention the whole model agrees on. A z-spread is carried alongside
 * rather than folded in, so the same curve object serves every security and
 * only the spread changes per name.
 */

import { nssZero, type NssParams } from './nss.js';

export interface DiscountCurve {
  /** Continuously compounded zero rate at `tau` years, in percent. */
  zeroRate(tau: number): number;
  /** Discount factor to `tau` years. */
  df(tau: number): number;
  /** Continuously compounded forward rate between two tenors, in percent. */
  forwardRate(from: number, to: number): number;
  /** Par coupon for a bond of `tau` years paying `frequency` times a year. */
  parYield(tau: number, frequency: number): number;
}

/**
 * A curve from NSS parameters, optionally shifted by a constant spread.
 *
 * `spreadPct` is a z-spread in percent — the parallel shift to the zero curve
 * that reprices a security to its market price.
 */
export function nssDiscountCurve(params: NssParams, spreadPct = 0): DiscountCurve {
  const zeroRate = (tau: number): number => nssZero(params, tau) + spreadPct;
  const df = (tau: number): number => {
    if (tau <= 0) return 1;
    return Math.exp((-zeroRate(tau) / 100) * tau);
  };
  return {
    zeroRate,
    df,
    forwardRate: (from: number, to: number): number => {
      if (to <= from) return zeroRate(to);
      return (zeroRate(to) * to - zeroRate(from) * from) / (to - from);
    },
    parYield: (tau: number, frequency: number): number => {
      if (tau <= 0 || frequency <= 0) return zeroRate(Math.max(tau, 1e-8));
      const periods = Math.max(1, Math.round(tau * frequency));
      let annuity = 0;
      for (let i = 1; i <= periods; i++) annuity += df(i / frequency);
      if (annuity <= 0) return zeroRate(tau);
      return (frequency * (1 - df(periods / frequency)) * 100) / annuity;
    },
  };
}

/** A flat curve, for goldens and for the CDS hazard bootstrap. */
export function flatDiscountCurve(ratePct: number): DiscountCurve {
  return nssDiscountCurve({ b0: ratePct, b1: 0, b2: 0, b3: 0 }, 0);
}
