import { describe, expect, it } from 'vitest';
import { ticketsFromLegs, type CdsTicket, type CdsIndexTicket, type TreasuryTicket } from './tickets.js';
import type { HedgeLeg } from './hedgeSolver.js';
import type { HedgeCandidate } from './hedgeUniverse.js';

function candidate(over: Partial<HedgeCandidate> = {}): HedgeCandidate {
  return {
    securityId: 1, cusip: '912828YZ7', description: 'US TREASURY NOTE 4.750% 2036-09-07',
    assetClass: 'Rates', instrumentKind: 'Treasury', gradient: [-1.7e5, 0, 0, 0, 0],
    carryPerMm: 47_500, halfSpreadPoints: 0.02, price: 99.515625,
    maturityDate: 20360907, benchmarkTenor: 10, liquidityTier: 'T1', ...over,
  };
}

function leg(notionalMm: number, over: Partial<HedgeCandidate> = {}): HedgeLeg {
  const c = candidate(over);
  return {
    candidate: c, notionalMm, gradient: c.gradient.map((v) => v * notionalMm),
    executionCost: Math.abs(notionalMm) * 1e6 * c.halfSpreadPoints / 100,
    carry: c.carryPerMm * notionalMm,
  };
}

describe('ticketsFromLegs', () => {
  it('quotes a Treasury in 32nds, the way a trader reads it', () => {
    const [ticket] = ticketsFromLegs([leg(-1000)], 'p', 1).tickets as TreasuryTicket[];
    expect(ticket?.kind).toBe('Treasury');
    expect(ticket?.quotedPrice).toBe('99-16+');
    expect(ticket?.decimalPrice).toBe(99.515625);
    expect(ticket?.cusip).toBe('912828YZ7');
    expect(ticket?.side).toBe('SELL');
  });

  it('books reducing credit risk as BUYING protection, not selling', () => {
    // A CDS side is not a buy or a sell, and a blotter that says "SELL" on a
    // protection purchase will eventually have someone book it backwards.
    const [ticket] = ticketsFromLegs(
      [leg(-500, { instrumentKind: 'CDS', assetClass: 'CDS', cusip: '2H6677AAN' })], 'p', 1,
    ).tickets as CdsTicket[];
    expect(ticket?.side).toBe('BUY_PROTECTION');
    expect(ticket?.kind).toBe('CDS');
    expect(ticket?.redPair9).toBe('2H6677AAN');
  });

  it('books adding credit risk as selling protection', () => {
    const [ticket] = ticketsFromLegs(
      [leg(500, { instrumentKind: 'CDS', assetClass: 'CDS' })], 'p', 1,
    ).tickets as CdsTicket[];
    expect(ticket?.side).toBe('SELL_PROTECTION');
  });

  it('gives a swap the fields a swap needs and no price', () => {
    const [ticket] = ticketsFromLegs(
      [leg(-500, { instrumentKind: 'CDS', assetClass: 'CDS', price: 101.9533, maturityDate: 20360620 })],
      'p', 1,
    ).tickets as CdsTicket[];
    expect(ticket?.pointsUpfront).toBeCloseTo(-1.9533, 4);
    expect(ticket?.immMaturity).toBe(20360620);
    expect(ticket?.clearingHouse).toBe('ICE Clear Credit');
    expect(ticket?.executionVenue).toBe('SEF');
    expect(ticket).not.toHaveProperty('quotedPrice');
  });

  it('reads the SNAC coupon off the carry — 500 for high yield, 100 for the rest', () => {
    const hy = ticketsFromLegs(
      [leg(-500, { instrumentKind: 'CDX', assetClass: 'CDS', carryPerMm: 50_000 })], 'p', 1,
    ).tickets[0] as CdsIndexTicket;
    const ig = ticketsFromLegs(
      [leg(-500, { instrumentKind: 'CDX', assetClass: 'CDS', carryPerMm: 10_000 })], 'p', 1,
    ).tickets[0] as CdsIndexTicket;
    expect(hy.fixedCouponBp).toBe(500);
    expect(ig.fixedCouponBp).toBe(100);
  });

  it('names the index family, which is what identifies the constituent set', () => {
    const [ticket] = ticketsFromLegs(
      [leg(-2000, { instrumentKind: 'CDX', assetClass: 'CDS', description: 'CDX.NA.HY S46 V1 5%' })],
      'p', 1,
    ).tickets as CdsIndexTicket[];
    expect(ticket?.kind).toBe('CDX');
    expect(ticket?.family).toBe('CDX.NA.HY');
  });

  it('makes every notional positive, with direction carried by the side', () => {
    const pkg = ticketsFromLegs([leg(-1000), leg(500, { securityId: 2 })], 'p', 1);
    for (const ticket of pkg.tickets) expect(ticket.notionalUsd).toBeGreaterThan(0);
    expect(pkg.tickets.map((t) => t.side)).toEqual(['SELL', 'BUY']);
  });

  it('totals the package and starts it unstaged, because proposing is not trading', () => {
    const pkg = ticketsFromLegs([leg(-1000), leg(-500, { securityId: 2 })], 'Flatten', 7);
    expect(pkg.name).toBe('Flatten');
    expect(pkg.status).toBe('proposed');
    expect(pkg.grossNotionalUsd).toBe(1.5e9);
    expect(pkg.totalExecutionCost).toBeCloseTo(
      pkg.tickets.reduce((sum, t) => sum + t.executionCost, 0), 6,
    );
    expect(pkg.carryChangeUsd).toBeCloseTo(
      pkg.tickets.reduce((sum, t) => sum + t.carryUsd, 0), 6,
    );
  });

  it('gives every ticket a distinct id under one package id', () => {
    const pkg = ticketsFromLegs([leg(-1000), leg(-500, { securityId: 2 })], 'p', 42);
    expect(new Set(pkg.tickets.map((t) => t.ticketId)).size).toBe(2);
    expect(pkg.packageId).toMatch(/^PKG-/);
    for (const ticket of pkg.tickets) expect(ticket.ticketId).toMatch(/^TKT-/);
  });

  it('returns an empty package rather than nothing for an empty solve', () => {
    const pkg = ticketsFromLegs([], 'nothing to do', 1);
    expect(pkg.tickets).toEqual([]);
    expect(pkg.grossNotionalUsd).toBe(0);
    expect(pkg.status).toBe('proposed');
  });
});
