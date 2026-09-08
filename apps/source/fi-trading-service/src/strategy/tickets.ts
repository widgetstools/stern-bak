/**
 * Product-native trade tickets.
 *
 * One generic ticket shape across every asset class is among the plainest
 * tells that a system was not built by a desk. The differences are not
 * cosmetic: a Treasury is quoted in 32nds and traded by price, a CDS is
 * traded by notional and DIRECTION with the market difference settled in
 * points upfront, an index carries a series and a version, a credit bond is
 * negotiated in spread. A blotter that shows "quantity" and "price" for all
 * four is asking a trader to translate in their head.
 *
 * Each ticket therefore carries the fields its own product needs, and the
 * common fields only where they genuinely mean the same thing.
 */

import { formatPrice } from '../domain/core/tickPrice.js';
import type { HedgeLeg } from './hedgeSolver.js';

export type TicketSide = 'BUY' | 'SELL' | 'BUY_PROTECTION' | 'SELL_PROTECTION';

interface TicketBase {
  ticketId: string;
  securityId: number;
  description: string;
  side: TicketSide;
  /** Face for a bond, notional for a swap. Always positive; `side` carries direction. */
  notionalUsd: number;
  /** What crossing the spread costs, in currency. */
  executionCost: number;
  /** Annual carry this leg adds (positive) or gives up (negative). */
  carryUsd: number;
}

/** Quoted in 32nds, with the on-the-run rank that decides the repo rate. */
export interface TreasuryTicket extends TicketBase {
  kind: 'Treasury';
  cusip: string;
  /** The price a trader reads: `99-16+`, not 99.515625. */
  quotedPrice: string;
  decimalPrice: number;
  maturityDate: number;
}

/**
 * Traded by notional and direction, not face and price.
 *
 * The coupon is one of two fixed values under SNAC and the market difference
 * settles in points upfront, so "price" here is 100 minus the upfront rather
 * than anything resembling a bond price.
 */
export interface CdsTicket extends TicketBase {
  kind: 'CDS';
  redPair9: string;
  fixedCouponBp: 100 | 500;
  pointsUpfront: number;
  /** Standard IMM maturity, always the 20th of Mar/Jun/Sep/Dec. */
  immMaturity: number;
  clearingHouse: 'ICE Clear Credit';
  executionVenue: 'SEF';
}

/** An index adds the series and version that identify the constituent set. */
export interface CdsIndexTicket extends TicketBase {
  kind: 'CDX';
  family: string;
  fixedCouponBp: 100 | 500;
  pointsUpfront: number;
  immMaturity: number;
  clearingHouse: 'ICE Clear Credit';
  executionVenue: 'SEF';
}

export type Ticket = TreasuryTicket | CdsTicket | CdsIndexTicket;

export interface TicketPackage {
  packageId: string;
  name: string;
  tickets: Ticket[];
  grossNotionalUsd: number;
  totalExecutionCost: number;
  carryChangeUsd: number;
  /** Unstaged until someone sends it. Proposing is not trading. */
  status: 'proposed' | 'staged';
}

function idFor(prefix: string, index: number, seed: number): string {
  return `${prefix}-${seed.toString(36).toUpperCase()}-${String(index + 1).padStart(2, '0')}`;
}

/**
 * A CDS side is not a buy or a sell.
 *
 * Selling risk means BUYING protection, and a blotter that shows "SELL" on a
 * protection purchase will eventually have someone book it the wrong way
 * round. The negative notional the solver produces means "reduce credit
 * exposure", which is buying protection.
 */
function cdsSideFor(notionalMm: number): TicketSide {
  return notionalMm < 0 ? 'BUY_PROTECTION' : 'SELL_PROTECTION';
}

export function ticketsFromLegs(legs: readonly HedgeLeg[], name: string, seed: number): TicketPackage {
  const tickets: Ticket[] = [];

  for (const [index, leg] of legs.entries()) {
    const notionalUsd = Math.abs(leg.notionalMm) * 1e6;
    const base = {
      ticketId: idFor('TKT', index, seed),
      securityId: leg.candidate.securityId,
      description: leg.candidate.description,
      notionalUsd,
      executionCost: leg.executionCost,
      carryUsd: leg.carry,
    };

    if (leg.candidate.instrumentKind === 'CDX') {
      tickets.push({
        ...base,
        kind: 'CDX',
        side: cdsSideFor(leg.notionalMm),
        family: leg.candidate.description.split(' ')[0] ?? leg.candidate.description,
        fixedCouponBp: leg.candidate.carryPerMm >= 4e4 ? 500 : 100,
        pointsUpfront: Number((100 - leg.candidate.price).toFixed(4)),
        immMaturity: leg.candidate.maturityDate,
        clearingHouse: 'ICE Clear Credit',
        executionVenue: 'SEF',
      });
      continue;
    }
    if (leg.candidate.instrumentKind === 'CDS') {
      tickets.push({
        ...base,
        kind: 'CDS',
        side: cdsSideFor(leg.notionalMm),
        redPair9: leg.candidate.cusip,
        fixedCouponBp: leg.candidate.carryPerMm >= 4e4 ? 500 : 100,
        pointsUpfront: Number((100 - leg.candidate.price).toFixed(4)),
        immMaturity: leg.candidate.maturityDate,
        clearingHouse: 'ICE Clear Credit',
        executionVenue: 'SEF',
      });
      continue;
    }
    tickets.push({
      ...base,
      kind: 'Treasury',
      side: leg.notionalMm < 0 ? 'SELL' : 'BUY',
      cusip: leg.candidate.cusip,
      quotedPrice: formatPrice(leg.candidate.price, 'Thirty2nds'),
      decimalPrice: Number(leg.candidate.price.toFixed(6)),
      maturityDate: leg.candidate.maturityDate,
    });
  }

  return {
    packageId: idFor('PKG', 0, seed),
    name,
    tickets,
    grossNotionalUsd: tickets.reduce((sum, ticket) => sum + ticket.notionalUsd, 0),
    totalExecutionCost: tickets.reduce((sum, ticket) => sum + ticket.executionCost, 0),
    carryChangeUsd: tickets.reduce((sum, ticket) => sum + ticket.carryUsd, 0),
    status: 'proposed',
  };
}
