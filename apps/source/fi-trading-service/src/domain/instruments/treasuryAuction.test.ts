
import { describe, expect, it } from 'vitest';

import { isValidCusip, isValidIsin } from '../core/identifiers.js';
import { nssDiscountCurve } from '../curves/discount.js';
import {
  buildTreasuries, couponFromAuctionYield, ladderFor, onTheRunFor, TREASURY_PREFIX,
  TREASURY_TENORS,
} from './treasuryAuction.js';
import { isOnTheRun } from './types.js';

const curve = nssDiscountCurve({ b0: 4.95, b1: -0.85, b2: -1.6, b3: 1.4 });
const historicalYield = (_date: number, tenor: number): number => curve.parYield(tenor, 2);

function universe(historyPerTenor = 6) {
  return buildTreasuries({ asOf: 20260115, seed: 401, historyPerTenor, historicalYield, includeStrips: true });
}

describe('couponFromAuctionYield', () => {
  it('rounds DOWN to the nearest eighth, so a new issue prices at or under par', () => {
    expect(couponFromAuctionYield(4.32)).toBe(4.25);
    expect(couponFromAuctionYield(4.125)).toBe(4.125);
    expect(couponFromAuctionYield(4.124)).toBe(4);
    expect(couponFromAuctionYield(5.99)).toBe(5.875);
  });

  it('never rounds up, which would put the coupon above the auction yield', () => {
    for (let y = 0.2; y < 9; y += 0.017) {
      const coupon = couponFromAuctionYield(y);
      expect(coupon).toBeLessThanOrEqual(y);
      expect(Number.isInteger(coupon * 8)).toBe(true);
    }
  });

  it('floors at an eighth', () => {
    expect(couponFromAuctionYield(0.05)).toBe(0.125);
    expect(couponFromAuctionYield(0)).toBe(0.125);
  });
});

describe('the auction ladder', () => {
  const securities = universe();

  it('builds every tenor in the cycle', () => {
    for (const tenor of TREASURY_TENORS) {
      const ladder = ladderFor(securities, tenor.termYears);
      expect(ladder.length).toBeGreaterThan(0);
    }
  });

  it('has exactly one on-the-run issue per tenor', () => {
    for (const tenor of TREASURY_TENORS) {
      const onTheRun = securities.filter(
        (s) => s.originalTermYears === tenor.termYears && s.securityType === tenor.securityType && isOnTheRun(s),
      );
      expect(onTheRun).toHaveLength(1);
    }
  });

  it('ranks the ladder by recency, newest first', () => {
    const tens = ladderFor(securities, 10).filter((s) => s.securityType === 'TNote');
    expect(tens.length).toBeGreaterThan(3);
    expect(tens[0]?.onTheRunRank).toBe(0);
    for (let i = 1; i < tens.length; i++) {
      expect(tens[i]?.issueDate as number).toBeLessThan(tens[i - 1]?.issueDate as number);
      expect(tens[i]?.maturityDate as number).toBeLessThan(tens[i - 1]?.maturityDate as number);
    }
  });

  it('gives the on-the-run issue the top liquidity tier', () => {
    const tenYear = onTheRunFor(securities, 10);
    expect(tenYear?.liquidityTier).toBe('T1');
    const ladder = ladderFor(securities, 10).filter((s) => s.securityType === 'TNote');
    expect(ladder[ladder.length - 1]?.liquidityTier).not.toBe('T1');
  });

  it('rolls the 10-year quarterly and the 2-year monthly', () => {
    const tens = ladderFor(securities, 10).filter((s) => s.securityType === 'TNote');
    const twos = ladderFor(securities, 2).filter((s) => s.securityType === 'TNote');
    const gap = (list: typeof tens): number =>
      Math.abs((list[0]?.issueDate as number) - (list[1]?.issueDate as number));
    // Three months of date arithmetic is a bigger jump than one month.
    expect(gap(tens)).toBeGreaterThan(gap(twos));
  });

  it('scales the ladder depth with the requested history', () => {
    expect(ladderFor(universe(3), 5).filter((s) => s.securityType === 'TNote')).toHaveLength(3);
    expect(ladderFor(universe(10), 5).filter((s) => s.securityType === 'TNote')).toHaveLength(10);
  });
});

describe('identifiers and terms', () => {
  const securities = universe();

  it('mints valid, unique CUSIPs and matching ISINs', () => {
    const seen = new Set<string>();
    for (const security of securities) {
      expect(isValidCusip(security.cusip)).toBe(true);
      expect(isValidIsin(security.isin)).toBe(true);
      expect(security.isin).toContain(security.cusip);
      expect(seen.has(security.cusip)).toBe(false);
      seen.add(security.cusip);
    }
  });

  it('uses the real issuer prefixes for each family', () => {
    const bill = securities.find((s) => s.securityType === 'TBill');
    const note = securities.find((s) => s.securityType === 'TNote');
    const bond = securities.find((s) => s.securityType === 'TBond');
    const strip = securities.find((s) => s.securityType === 'Strip');
    expect(bill?.cusip.startsWith(TREASURY_PREFIX.bill)).toBe(true);
    expect(note?.cusip.startsWith(TREASURY_PREFIX.note)).toBe(true);
    expect(bond?.cusip.startsWith(TREASURY_PREFIX.bond)).toBe(true);
    expect(strip?.cusip.startsWith(TREASURY_PREFIX.strip)).toBe(true);
  });

  it('makes bills zero-coupon and quoted on yield, not in 32nds', () => {
    for (const bill of securities.filter((s) => s.securityType === 'TBill')) {
      expect(bill.couponRate).toBe(0);
      expect(bill.couponType).toBe('Zero');
      expect(bill.dayCount).toBe('ACT/360');
      expect(bill.quotationBasis).toBe('Yield');
      expect(bill.originalTermYears).toBeLessThanOrEqual(1);
    }
  });

  it('quotes coupon Treasuries in 32nds on ACT/ACT', () => {
    for (const note of securities.filter((s) => s.securityType === 'TNote')) {
      expect(note.quotationBasis).toBe('Thirty2nds');
      expect(note.dayCount).toBe('ACT/ACT');
      expect(note.frequency).toBe(2);
      expect(note.couponRate).toBeGreaterThan(0);
    }
  });

  it('sets every coupon on the eighth grid', () => {
    for (const security of securities) {
      if (security.couponRate === 0) continue;
      expect(Number.isInteger(security.couponRate * 8)).toBe(true);
    }
  });

  it('rates everything AAA and marks it as Treasury seniority', () => {
    for (const security of securities) {
      expect(security.ratingIndex).toBe(0);
      expect(security.issueSpreadBp).toBe(0);
      expect(security.assetClass).toBe('Rates');
      expect(security.issuerName).toBe('United States Treasury');
    }
  });

  it('matures after it was issued, always', () => {
    for (const security of securities) {
      expect(security.maturityDate).toBeGreaterThan(security.issueDate);
      expect(security.datedDate).toBe(security.issueDate);
    }
  });

  it('sizes auctions in round billions near the announced size', () => {
    const tenYear = onTheRunFor(securities, 10);
    expect((tenYear?.amountOutstandingUsd as number) % 1_000_000_000).toBe(0);
    expect(tenYear?.amountOutstandingUsd).toBeGreaterThan(30_000_000_000);
    expect(tenYear?.amountOutstandingUsd).toBeLessThan(60_000_000_000);
  });

  it('strips only the on-the-run long bonds, and they carry no coupon', () => {
    const strips = securities.filter((s) => s.securityType === 'Strip');
    expect(strips.length).toBeGreaterThan(0);
    for (const strip of strips) {
      expect(strip.couponRate).toBe(0);
      expect(strip.couponType).toBe('Zero');
      expect(strip.originalTermYears).toBeGreaterThanOrEqual(20);
      expect(strip.onTheRunRank).toBeNull();
    }
  });

  it('omits strips unless asked', () => {
    const withoutStrips = buildTreasuries({ asOf: 20260115, seed: 401, historicalYield });
    expect(withoutStrips.some((s) => s.securityType === 'Strip')).toBe(false);
  });
});

describe('determinism', () => {
  it('produces identical universes for the same seed', () => {
    const a = universe();
    const b = universe();
    expect(a.map((s) => s.cusip)).toEqual(b.map((s) => s.cusip));
    expect(a.map((s) => s.couponRate)).toEqual(b.map((s) => s.couponRate));
  });

  it('produces different CUSIPs for a different seed', () => {
    const other = buildTreasuries({ asOf: 20260115, seed: 999, historicalYield, historyPerTenor: 6 });
    expect(other.map((s) => s.cusip)).not.toEqual(universe().map((s) => s.cusip));
  });

  it('reflects the historical yield it was given', () => {
    const low = buildTreasuries({ asOf: 20260115, seed: 401, historyPerTenor: 2, historicalYield: () => 2.1 });
    const high = buildTreasuries({ asOf: 20260115, seed: 401, historyPerTenor: 2, historicalYield: () => 6.9 });
    const lowNote = low.find((s) => s.securityType === 'TNote');
    const highNote = high.find((s) => s.securityType === 'TNote');
    expect(lowNote?.couponRate).toBe(2);
    expect(highNote?.couponRate).toBe(6.875);
  });
});
