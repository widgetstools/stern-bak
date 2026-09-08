import { describe, expect, it } from 'vitest';
import { diffDays, type DateInt } from '../core/dateInt.js';
import { SifmaCalendar } from '../core/sifmaCalendar.js';
import { cleanPriceFromYield, type BondTerms } from '../analytics/pricing.js';
import { buildSchedule } from '../analytics/schedule.js';
import {
  amortizedCost, paydownPnl, relieveLots, rollupLots, unamortizedPremium, type Lot,
} from './lots.js';

const calendar = new SifmaCalendar();

/** A 5% ten-year bond, the vehicle for every amortisation assertion below. */
function terms(maturity: DateInt = 20360615): BondTerms {
  return {
    schedule: buildSchedule({
      effective: 20260615, maturity, frequency: 2, endOfMonth: false, calendar,
    }),
    couponRate: 5, frequency: 2, redemption: 100, dayCount: '30/360',
  };
}

function lot(over: Partial<Lot> = {}): Lot {
  return {
    lotId: 'L1', positionId: 'P1', securityId: 1, openTradeId: 'T1',
    openDate: 20260615, settleDate: 20260617, side: 'LONG',
    originalFace: 1_000_000, remainingFace: 1_000_000,
    purchasePriceClean: 104, purchaseYield: 4.4, accruedAtPurchase: 0,
    closedDate: null, realizedPnl: 0, ...over,
  };
}

describe('amortizedCost', () => {
  it('is the bond repriced at the yield it was bought at', () => {
    const t = terms();
    const l = lot({ purchaseYield: 4.4 });
    expect(amortizedCost(l, t, 20300615)).toBeCloseTo(
      cleanPriceFromYield(t, 20300615, 4.4), 10,
    );
  });

  it('pulls a premium down to par as maturity approaches, monotonically', () => {
    const t = terms();
    const l = lot({ purchaseYield: 4.4 });
    const path = [20260615, 20290615, 20320615, 20350615].map((d) => amortizedCost(l, t, d));
    for (let i = 1; i < path.length; i++) {
      expect(path[i] as number).toBeLessThan(path[i - 1] as number);
    }
    // A year from maturity the 60 bp of yield pickup is still worth 58 cents;
    // the pull to par is complete only AT maturity, which the next test pins.
    expect(path[0] as number).toBeGreaterThan(103);
    expect(path[path.length - 1] as number).toBeLessThan(100.6);
  });

  it('accretes a discount UP to par — the mirror of the premium case', () => {
    const t = terms();
    const l = lot({ purchasePriceClean: 92, purchaseYield: 6.1 });
    expect(amortizedCost(l, t, 20270615)).toBeLessThan(100);
    expect(amortizedCost(l, t, 20270615)).toBeLessThan(amortizedCost(l, t, 20340615));
    expect(amortizedCost(l, t, 20340615)).toBeLessThan(100);
  });

  it('is exactly par at and after maturity, so a held bond books no capital loss', () => {
    const t = terms();
    const l = lot({ purchaseYield: 4.4 });
    expect(amortizedCost(l, t, 20360615)).toBe(100);
    expect(amortizedCost(l, t, 20400101)).toBe(100);
  });

  it('reports the premium still to run off', () => {
    const t = terms();
    const l = lot({ purchaseYield: 4.4 });
    expect(unamortizedPremium(l, t, 20300615)).toBeCloseTo(
      amortizedCost(l, t, 20300615) - 100, 10,
    );
    expect(unamortizedPremium(l, t, 20360615)).toBe(0);
  });
});

describe('relieveLots', () => {
  const t = terms();
  const basisAt = (l: Lot): number => amortizedCost(l, t, 20300615);
  const lots = [
    lot({ lotId: 'A', openDate: 20260615, purchasePriceClean: 104, purchaseYield: 4.4, remainingFace: 1_000_000 }),
    lot({ lotId: 'B', openDate: 20280615, purchasePriceClean: 97, purchaseYield: 5.6, remainingFace: 1_000_000 }),
    lot({ lotId: 'C', openDate: 20290615, purchasePriceClean: 101, purchaseYield: 4.85, remainingFace: 1_000_000 }),
  ];

  it('FIFO takes the oldest lot, LIFO the newest, HICO the dearest', () => {
    const pick = (method: 'FIFO' | 'LIFO' | 'HICO'): string =>
      relieveLots(lots, 500_000, 100, method, 20300615, basisAt).closed[0]?.lotId as string;
    expect(pick('FIFO')).toBe('A');
    expect(pick('LIFO')).toBe('C');
    expect(pick('HICO')).toBe('A');
  });

  it('HICO realises the smallest gain of the three — the reason to choose it', () => {
    const gain = (method: 'FIFO' | 'LIFO' | 'HICO'): number =>
      relieveLots(lots, 1_000_000, 103, method, 20300615, basisAt).realizedPnl;
    expect(gain('HICO')).toBeLessThan(gain('LIFO'));
    expect(gain('HICO')).toBeLessThanOrEqual(gain('FIFO'));
  });

  it('walks into a second lot when the first cannot cover the sale', () => {
    const result = relieveLots(lots, 1_500_000, 100, 'FIFO', 20300615, basisAt);
    expect(result.closed.map((c) => c.lotId)).toEqual(['A', 'B']);
    expect(result.closed[0]?.faceRelieved).toBe(1_000_000);
    expect(result.closed[1]?.faceRelieved).toBe(500_000);
    expect(result.faceRelieved).toBe(1_500_000);
    expect(result.unmatchedFace).toBe(0);
  });

  it('reports face it could not match rather than inventing inventory', () => {
    const result = relieveLots(lots, 5_000_000, 100, 'FIFO', 20300615, basisAt);
    expect(result.faceRelieved).toBe(3_000_000);
    expect(result.unmatchedFace).toBe(2_000_000);
    expect(result.remaining.every((l) => l.remainingFace === 0)).toBe(true);
  });

  it('books P&L against the AMORTISED basis, not the price paid', () => {
    const single = [lots[0] as Lot];
    const basis = basisAt(single[0] as Lot);
    // Sell between the amortised basis and the price paid: a gain on the
    // books, a loss if you naively differenced against the purchase price.
    expect(basis).toBeCloseTo(103.134, 3);
    const sale = 103.5;
    const result = relieveLots(single, 1_000_000, sale, 'FIFO', 20300615, basisAt);
    expect(result.realizedPnl).toBeCloseTo(1_000_000 * (sale - basis) / 100, 6);
    expect(sale - (lots[0] as Lot).purchasePriceClean).toBeLessThan(0);
    expect(result.realizedPnl).toBeGreaterThan(0);
  });

  it('leaves the input untouched and returns new lots', () => {
    const before = lots.map((l) => l.remainingFace);
    relieveLots(lots, 1_500_000, 100, 'FIFO', 20300615, basisAt);
    expect(lots.map((l) => l.remainingFace)).toEqual(before);
  });

  it('does nothing for a non-positive sale', () => {
    const result = relieveLots(lots, 0, 100, 'FIFO', 20300615, basisAt);
    expect(result.closed).toHaveLength(0);
    expect(result.realizedPnl).toBe(0);
  });
});

describe('rollupLots', () => {
  const t = terms();
  const basisAt = (l: Lot): number => amortizedCost(l, t, 20300615);

  it('sums signed face, so a short reduces the position', () => {
    const rollup = rollupLots(
      [lot({ lotId: 'A', remainingFace: 3_000_000 }),
       lot({ lotId: 'B', remainingFace: 1_000_000, side: 'SHORT' })],
      20300615, basisAt,
    );
    expect(rollup.quantityFace).toBe(2_000_000);
    expect(rollup.openLotCount).toBe(2);
  });

  it('weights average cost by face, not by lot count', () => {
    const rollup = rollupLots(
      [lot({ lotId: 'A', remainingFace: 9_000_000, purchasePriceClean: 104 }),
       lot({ lotId: 'B', remainingFace: 1_000_000, purchasePriceClean: 94 })],
      20300615, basisAt,
    );
    expect(rollup.averagePurchasePrice).toBeCloseTo((9 * 104 + 1 * 94) / 10, 10);
  });

  it('measures holding period in real days, not in date arithmetic', () => {
    const rollup = rollupLots([lot({ openDate: 20260615 })], 20300615, basisAt);
    expect(rollup.averageHoldingDays).toBe(diffDays(20260615, 20300615));
    expect(rollup.averageHoldingDays).toBe(1461);
    expect(rollup.earliestOpenDate).toBe(20260615);
  });

  it('carries realised P&L from closed lots but excludes their face', () => {
    const rollup = rollupLots(
      [lot({ lotId: 'A', remainingFace: 0, realizedPnl: 45_000 }),
       lot({ lotId: 'B', remainingFace: 2_000_000 })],
      20300615, basisAt,
    );
    expect(rollup.realizedPnl).toBe(45_000);
    expect(rollup.quantityFace).toBe(2_000_000);
    expect(rollup.openLotCount).toBe(1);
  });

  it('returns zeros rather than NaN for a fully closed position', () => {
    const rollup = rollupLots([lot({ remainingFace: 0 })], 20300615, basisAt);
    expect(rollup.averageCost).toBe(0);
    expect(rollup.averageHoldingDays).toBe(0);
    expect(rollup.earliestOpenDate).toBeNull();
  });
});

describe('paydownPnl', () => {
  it('books a loss on a premium pool and a gain on a discount one', () => {
    expect(paydownPnl(1_000_000, 103)).toBeCloseTo(-30_000, 6);
    expect(paydownPnl(1_000_000, 97)).toBeCloseTo(30_000, 6);
    expect(paydownPnl(1_000_000, 100)).toBe(0);
  });
});
