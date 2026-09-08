import { describe, expect, it } from 'vitest';
import { SifmaCalendar } from '../core/sifmaCalendar.js';
import { buildBook, DEMO_SCALE, scaleBook } from './bookBuilder.js';
import { DESKS, deskFor, halfSpreadPoints } from './positions.js';
import type { Security } from '../instruments/types.js';

const built = buildBook({
  asOf: 20260907, calendar: new SifmaCalendar(), seed: 5, scale: scaleBook(DEMO_SCALE, 0.2),
});

function securityOf(assetClass: string): Security {
  const found = built.securities.find((s) => s.assetClass === assetClass);
  if (found === undefined) throw new Error(`no ${assetClass}`);
  return found;
}

describe('halfSpreadPoints', () => {
  it('quotes Treasuries tighter than investment grade, and IG tighter than high yield', () => {
    const rates = halfSpreadPoints(securityOf('Rates'), 6);
    const ig = halfSpreadPoints(securityOf('CorpIG'), 6);
    const hy = halfSpreadPoints(securityOf('CorpHY'), 6);
    expect(rates).toBeLessThan(ig);
    expect(ig).toBeLessThan(hy);
  });

  it('widens with duration — a long bond costs more to cross', () => {
    const security = securityOf('CorpIG');
    expect(halfSpreadPoints(security, 20)).toBeGreaterThan(halfSpreadPoints(security, 2));
  });

  it('is always positive, so a bid never crosses an ask', () => {
    for (const security of built.securities.slice(0, 400)) {
      expect(halfSpreadPoints(security, 8)).toBeGreaterThan(0);
    }
  });
});

describe('deskFor', () => {
  it('routes every security in the universe to a declared desk', () => {
    const names = new Set(DESKS.map((desk) => desk.desk));
    for (const security of built.securities) {
      const desk = deskFor(security);
      expect(names).toContain(desk.desk);
      expect(desk.trader.length).toBeGreaterThan(0);
      expect(desk.book.length).toBeGreaterThan(0);
    }
  });

  it('sends rates and credit to different desks', () => {
    expect(deskFor(securityOf('Rates')).desk).not.toBe(deskFor(securityOf('CorpHY')).desk);
  });

  it('is stable for the same security', () => {
    const security = securityOf('Muni');
    expect(deskFor(security)).toEqual(deskFor(security));
  });
});

describe('buildPositionRow', () => {
  const rows = built.positions;

  it('emits the full analytics surface on every row', () => {
    const first = rows[0] as Record<string, unknown>;
    expect(Object.keys(first).length).toBeGreaterThanOrEqual(80);
    for (const field of [
      'positionId', 'cusip', 'description', 'assetClass', 'desk', 'trader',
      'midPrice', 'bidPrice', 'askPrice', 'quotedPrice', 'accruedInterest',
      'yieldToMaturity', 'yieldToWorst', 'zSpread', 'oas',
      'modifiedDuration', 'effectiveDuration', 'convexity', 'dv01', 'cs01',
      'marketValue', 'unrealizedPnL', 'realizedPnL', 'avgCost', 'currentFace',
    ]) {
      expect(first).toHaveProperty(field);
    }
  });

  it('keeps bid below mid below ask on every position', () => {
    for (const row of rows) {
      expect(row.bidPrice as number).toBeLessThan(row.midPrice as number);
      expect(row.midPrice as number).toBeLessThan(row.askPrice as number);
    }
  });

  it('makes the dirty price the clean price plus accrued', () => {
    for (const row of rows) {
      const perHundred = ((row.accruedInterest as number) / Math.max(1, row.currentFace as number)) * 100;
      expect(row.dirtyPrice as number).toBeCloseTo((row.cleanPrice as number) + perHundred, 3);
    }
  });

  it('sums the ten dollar key rate durations to the dollar duration', () => {
    const buckets = ['krd3M', 'krd6M', 'krd1Y', 'krd2Y', 'krd3Y', 'krd5Y', 'krd7Y', 'krd10Y', 'krd20Y', 'krd30Y'];
    for (const row of rows.slice(0, 300)) {
      if ((row.assetClass as string) === 'CDS') continue;
      const total = buckets.reduce((sum, field) => sum + (row[field] as number), 0);
      const effectiveDv01 = row.effectiveDv01 as number;
      if (Math.abs(effectiveDv01) < 10) continue;
      expect(total / effectiveDv01).toBeCloseTo(1, 3);
    }
  });

  it('quotes Treasuries in 32nds and credit in decimals', () => {
    // Notes and bonds trade in 32nds; strips and bills are quoted decimally,
    // so target the coupon issues rather than the whole rates bucket.
    const treasury = rows.find((row) => row.securityType === 'TNote' || row.securityType === 'TBond');
    const credit = rows.find((row) => row.assetClass === 'CorpIG');
    expect(treasury?.quotedPrice as string).toMatch(/^\d+-\d+/);
    expect(credit?.quotedPrice as string).not.toMatch(/-/);
  });

  it('reports market value as price times face, and P&L against the basis', () => {
    for (const row of rows) {
      if (row.assetClass === 'CDS') continue;
      const face = row.currentFace as number;
      expect((row.marketValue as number) / (((row.midPrice as number) / 100) * face))
        .toBeCloseTo(1, 4);
      expect(
        (row.marketValue as number) - ((row.avgCost as number) / 100) * face
        - (row.unrealizedPnL as number),
      ).toBeLessThan(Math.abs(face) * 1e-5);
    }
  });

  it('marks a swap to its upfront, not to its notional', () => {
    const swaps = rows.filter((row) => row.assetClass === 'CDS');
    expect(swaps.length).toBeGreaterThan(0);
    for (const row of swaps) {
      const notional = row.currentFace as number;
      const upfront = (((row.midPrice as number) - 100) / 100) * notional;
      expect(Math.abs((row.marketValue as number) - upfront)).toBeLessThan(
        Math.abs(notional) * 1e-5,
      );
      // The mark is a few points of notional, never a multiple of it.
      expect(Math.abs(row.marketValue as number)).toBeLessThan(Math.abs(notional) * 0.5);
    }
  });

  it('dates every position from a lot that was actually opened', () => {
    for (const row of rows) {
      const openDate = row.openDate as string;
      expect(openDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // ISO dates sort lexicographically, so a string compare is a date compare.
      expect(openDate <= '2026-09-07').toBe(true);
      expect(row.daysHeld as number).toBeGreaterThanOrEqual(0);
    }
  });
});
