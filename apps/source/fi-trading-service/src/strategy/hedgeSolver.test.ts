import { describe, expect, it } from 'vitest';
import { FACTOR_LABELS, solveHedge, type SolveRequest } from './hedgeSolver.js';
import type { HedgeCandidate } from './hedgeUniverse.js';

/**
 * A candidate that moves exactly one factor — the clearest thing to reason
 * about. Sizes are realistic: a real on-the-run long bond carries about 1.7e5
 * of level gradient per million of notional against a book gradient measured in
 * billions, so hedging it takes thousands of millions. Shrink the instruments
 * and every leg falls below the noise floor for reasons that have nothing to do
 * with what is being tested.
 */
function pure(
  id: number, factor: number, size: number, over: Partial<HedgeCandidate> = {},
): HedgeCandidate {
  const gradient: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  gradient[factor] = size;
  return {
    securityId: id, cusip: `C${id}`, description: `Instrument ${id}`, assetClass: 'Rates',
    instrumentKind: 'Treasury', gradient, carryPerMm: 40_000, halfSpreadPoints: 0.02,
    price: 99, maturityDate: 20360907, benchmarkTenor: 10, liquidityTier: 'T1', ...over,
  };
}

const BOOK = [-1.3e9, -3.4e8, -2.6e8, -2.8e8, -1.1e9];
const LEVEL_PER_MM = -1.7e5;
const CREDIT_PER_MM = -1.4e5;

/**
 * Several instruments per factor, because one is not enough to hedge with.
 *
 * Per-leg caps are real — two billion of an on-the-run note, five hundred
 * million of one name — so covering a billion of exposure genuinely takes
 * several lines. A fixture with one instrument per factor measures the cap,
 * not the solver.
 */
const CANDIDATES: HedgeCandidate[] = [
  ...Array.from({ length: 6 }, (_, i) => pure(i + 1, 0, LEVEL_PER_MM - i * 100)),
  ...Array.from({ length: 6 }, (_, i) =>
    pure(i + 10, 4, CREDIT_PER_MM - i * 100, { instrumentKind: 'CDX', assetClass: 'CDS' })),
];

function request(over: Partial<SolveRequest> = {}): SolveRequest {
  return {
    bookGradient: [...BOOK],
    candidates: CANDIDATES,
    target: { gradient: [0, null, null, null, null] },
    ...over,
  };
}

describe('solveHedge', () => {
  it('removes the exposure it was asked to remove', () => {
    const result = solveHedge(request({ ridge: 0.001, costAversion: 0 }));
    expect(Math.abs(result.hedgedGradient[0] as number)).toBeLessThan(Math.abs(BOOK[0] as number) * 0.05);
    expect(result.coverage[0] as number).toBeGreaterThan(0.95);
    expect(result.legs.length).toBeGreaterThan(0);
  });

  it('buys when the book is short and sells when it is long', () => {
    const long = solveHedge(request({ bookGradient: [-1.3e9, 0, 0, 0, 0], ridge: 0.001, costAversion: 0 }));
    const short = solveHedge(request({ bookGradient: [1.3e9, 0, 0, 0, 0], ridge: 0.001, costAversion: 0 }));
    expect(long.legs.every((leg) => leg.notionalMm < 0)).toBe(true);
    expect(short.legs.every((leg) => leg.notionalMm > 0)).toBe(true);
  });

  it('leaves an unconstrained factor roughly where it was, rather than free', () => {
    // Asked only to flatten level, the solver must not gut credit for a
    // fractional gain — "unconstrained" is not "fair game".
    const result = solveHedge(request({ target: { gradient: [0, null, null, null, null] } }));
    const creditBefore = BOOK[4] as number;
    const creditAfter = result.hedgedGradient[4] as number;
    expect(Math.abs(creditAfter - creditBefore)).toBeLessThan(Math.abs(creditBefore) * 0.35);
  });

  it('hits two targets at once when instruments exist for both', () => {
    const result = solveHedge(request({
      target: { gradient: [0, null, null, null, 0] }, ridge: 0.001, costAversion: 0,
    }));
    expect(result.coverage[0] as number).toBeGreaterThan(0.9);
    expect(result.coverage[4] as number).toBeGreaterThan(0.9);
  });

  it('reports how far short it fell rather than looking complete', () => {
    // Only a level instrument offered, but credit is the target.
    const result = solveHedge(request({
      candidates: [pure(1, 0, LEVEL_PER_MM)], target: { gradient: [null, null, null, null, 0] },
    }));
    expect(result.coverage[4] as number).toBeLessThan(0.2);
    expect(result.residual[4] as number).not.toBe(0);
    expect(result.narrative).toContain('credit');
    expect(result.narrative).toContain('No package could be built');
    expect(result.narrative).toContain('exposure is unchanged');
  });

  it('says so plainly when nothing is tradeable', () => {
    const result = solveHedge(request({ candidates: [] }));
    expect(result.legs).toEqual([]);
    expect(result.narrative).toContain('No tradeable hedge instruments');
    expect(result.hedgedGradient).toEqual(BOOK);
  });

  it('keeps the package small — a ridge is what stops offsetting monsters', () => {
    // Twenty nearly identical instruments. An unpenalised solve spreads across
    // all of them with enormous cancelling legs.
    const many = Array.from({ length: 20 }, (_, i) => pure(i + 1, 0, LEVEL_PER_MM - i));
    const result = solveHedge(request({
      candidates: many, bookGradient: [-1.7e8, 0, 0, 0, 0],
      target: { gradient: [0, null, null, null, null] },
    }));
    expect(result.legs.length).toBeLessThanOrEqual(8);
    // Roughly what one factor's worth of exposure costs, not twenty times it.
    expect(result.grossNotionalMm).toBeLessThan(3_000);
  });

  it('never returns more legs than it was allowed', () => {
    const many = Array.from({ length: 30 }, (_, i) => pure(i + 1, i % 5, LEVEL_PER_MM - i));
    expect(solveHedge(request({ candidates: many, maxLegs: 3 })).legs.length).toBeLessThanOrEqual(3);
    expect(solveHedge(request({ candidates: many, maxLegs: 12 })).legs.length).toBeLessThanOrEqual(12);
  });

  it('gives every constrained factor a leg, not just the biggest one', () => {
    // A level instrument moves far more dollars per million than a credit one,
    // so a size ranking keeps only Treasuries and hedges no credit at all.
    const candidates = [
      ...Array.from({ length: 10 }, (_, i) => pure(i + 1, 0, LEVEL_PER_MM * 10 - i)),
      ...Array.from({ length: 10 }, (_, i) => pure(i + 20, 4, CREDIT_PER_MM / 10 - i, {
        instrumentKind: 'CDX', assetClass: 'CDS',
      })),
    ];
    const result = solveHedge(request({
      candidates, target: { gradient: [0, null, null, null, 0] }, maxLegs: 6,
    }));
    expect(result.legs.some((leg) => leg.candidate.instrumentKind === 'CDX')).toBe(true);
    expect(result.legs.some((leg) => leg.candidate.instrumentKind === 'Treasury')).toBe(true);
  });

  it('prefers the cheaper of two identical instruments', () => {
    const result = solveHedge(request({
      candidates: [
        pure(1, 0, LEVEL_PER_MM, { halfSpreadPoints: 0.5 }),
        pure(2, 0, LEVEL_PER_MM, { halfSpreadPoints: 0.01 }),
      ],
      target: { gradient: [0, null, null, null, null] },
      maxLegs: 1,
    }));
    expect(result.legs[0]?.candidate.securityId).toBe(2);
  });

  it('caps a single name far below an on-the-run Treasury', () => {
    const huge = solveHedge(request({
      bookGradient: [0, 0, 0, 0, -1e9],
      candidates: [pure(1, 4, CREDIT_PER_MM, { instrumentKind: 'CDS', assetClass: 'CDS' })],
      target: { gradient: [null, null, null, null, 0] },
    }));
    expect(Math.abs(huge.legs[0]?.notionalMm as number)).toBeLessThanOrEqual(500);
  });

  it('prices execution and carry for every leg', () => {
    const result = solveHedge(request({ ridge: 0.001, costAversion: 0 }));
    expect(result.totalExecutionCost).toBeGreaterThan(0);
    expect(result.totalExecutionCost).toBeCloseTo(
      result.legs.reduce((sum, leg) => sum + leg.executionCost, 0), 6,
    );
    expect(result.carryChange).toBeCloseTo(
      result.legs.reduce((sum, leg) => sum + leg.carry, 0), 6,
    );
    expect(result.narrative).toMatch(/gives up|picks up/);
  });

  it('reports the hedged gradient as the book plus every leg', () => {
    const result = solveHedge(request({ ridge: 0.001, costAversion: 0 }));
    for (const [f] of FACTOR_LABELS.entries()) {
      const summed = result.legs.reduce(
        (sum, leg) => sum + (leg.gradient[f] as number), BOOK[f] as number,
      );
      expect(result.hedgedGradient[f] as number).toBeCloseTo(summed, 6);
    }
  });

  it('does nothing when the book already meets the target', () => {
    const result = solveHedge(request({ bookGradient: [0, 0, 0, 0, 0] }));
    expect(result.legs).toEqual([]);
    expect(result.narrative).toContain('already meets the targets');
  });
});
