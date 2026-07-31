/**
 * Shape smoke test for the rich mock data provider.
 *
 * Asserts the user-visible contract:
 *   - positions have >=250 fields, with nested structures
 *   - trades have >=200 fields, with nested structures
 *   - trades.cusip joins to positions.cusip
 *   - tick functions return new objects with same id
 *   - lifecycle state machine progresses
 */

import { describe, it, expect } from 'vitest';
import { getUniverse, __resetMockUniverse } from './mockUniverse.js';
import { buildPosition, tickPosition } from './mockPosition.js';
import { buildTrade, tickTrade, pickTradingCusip } from './mockTrade.js';

describe('mock data shape', () => {
  it('position rows expose >=250 fields with nested data', () => {
    __resetMockUniverse();
    const u = getUniverse()[0];
    const row = buildPosition(u, 0);
    const keys = Object.keys(row);
    expect(keys.length).toBeGreaterThanOrEqual(250);

    expect(row.ratings).toMatchObject({
      moodys: expect.objectContaining({ rating: expect.any(String), outlook: expect.any(String) }),
      sp:     expect.objectContaining({ rating: expect.any(String) }),
      fitch:  expect.objectContaining({ rating: expect.any(String) }),
    });
    expect(row.keyRateDurations).toMatchObject({ '1Y': expect.any(Number), '10Y': expect.any(Number) });
    expect(Array.isArray(row.callSchedule)).toBe(true);
    expect(Array.isArray(row.sinkSchedule)).toBe(true);
    expect(row.exposureByMaturity).toMatchObject({ bucket: expect.any(String), weight: expect.any(Number) });
  });

  it('trade rows expose >=200 fields with nested data', () => {
    const u = getUniverse()[10];
    const trade = buildTrade(u);
    expect(Object.keys(trade).length).toBeGreaterThanOrEqual(200);
    expect(trade.ratings).toBeUndefined(); // trade-specific shape, no ratings tree
    expect(trade.fees).toMatchObject({ sec: expect.any(Number), taf: expect.any(Number) });
    expect(trade.mifidFlags).toMatchObject({ lis: expect.any(Boolean) });
    expect(Array.isArray(trade.statusHistory)).toBe(true);
    expect(Array.isArray(trade.allocations)).toBe(true);
    expect(Array.isArray(trade.regReportingJurisdictions)).toBe(true);
    expect(trade.tradeKeyRateDurations).toMatchObject({ '5Y': expect.any(Number) });
  });

  it('trades link to positions by cusip across asset classes', () => {
    const universe = getUniverse();
    const positionCusips = new Set(universe.map((u) => u.cusip));

    const sampled: string[] = [];
    for (let i = 0; i < 50; i++) {
      const t = buildTrade(pickTradingCusip());
      expect(positionCusips.has(t.cusip)).toBe(true);
      sampled.push(t.assetClass as string);
    }
    // Across 50 trades we should see at least 2 distinct asset classes.
    expect(new Set(sampled).size).toBeGreaterThanOrEqual(2);
  });

  it('tickPosition produces a new row, same id, with changed pricing', () => {
    const u = getUniverse()[0];
    const r0 = buildPosition(u, 0);
    const r1 = tickPosition(r0);
    expect(r1.id).toBe(r0.id);
    expect(r1).not.toBe(r0);
    // At least one of price / yield / oas must change in a tick.
    const changed = r1.midPrice !== r0.midPrice || r1.yieldToMaturity !== r0.yieldToMaturity || r1.oas !== r0.oas;
    expect(changed).toBe(true);
    expect(r1.lastUpdate).toBeGreaterThanOrEqual(r0.lastUpdate);
  });

  it('tickTrade walks the lifecycle from New toward Settled', () => {
    const trade = buildTrade(getUniverse()[10]);
    expect(trade.tradeStatus).toBe('New');
    let cur = trade;
    const observed = new Set<string>([cur.tradeStatus]);
    // Up to 20 ticks should generally drive a trade through the flow,
    // unless an amendment loop fires repeatedly. Cap by status set size.
    for (let i = 0; i < 50 && cur.tradeStatus !== 'Settled' && cur.tradeStatus !== 'Cancelled'; i++) {
      cur = tickTrade(cur);
      observed.add(cur.tradeStatus as string);
    }
    // Must have seen at least 3 distinct statuses on the way.
    expect(observed.size).toBeGreaterThanOrEqual(3);
  });

  it('universe spans the user-requested asset classes', () => {
    const classes = new Set(getUniverse().map((u) => u.assetClass));
    for (const want of ['Rates', 'AgencyMBS', 'CMBS', 'RMBS', 'CorpIG', 'CorpHY', 'Muni', 'Convertible'] as const) {
      expect(classes.has(want)).toBe(true);
    }
  });
});
