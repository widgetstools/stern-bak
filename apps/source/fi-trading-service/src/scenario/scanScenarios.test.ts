import { describe, expect, it } from 'vitest';
import { SifmaCalendar } from '../domain/core/sifmaCalendar.js';
import { buildBook, DEMO_SCALE, scaleBook } from '../domain/book/bookBuilder.js';
import { snapshotBook } from './bookSnapshot.js';
import { histogram, scanScenarios, type ScanRequest } from './scanScenarios.js';

const calendar = new SifmaCalendar();
const book = buildBook({
  asOf: 20260907, calendar, seed: 20260907, scale: scaleBook(DEMO_SCALE, 0.15),
});
const snapshot = snapshotBook(book.positions, book.riskVectors, book.state, 20260907);

function request(over: Partial<ScanRequest> = {}): ScanRequest {
  return {
    fork: { engine: book.engine, calendar, from: book.state, horizonDays: 8, seed: 20260907 },
    book: snapshot,
    worlds: 40,
    ...over,
  };
}

describe('scanScenarios', () => {
  it('returns one terminal P&L per world and orders the summary consistently', async () => {
    const result = await scanScenarios(request());
    expect(result.terminalPnl).toHaveLength(40);
    expect(result.worst).toBeLessThanOrEqual(result.var95);
    expect(result.var95).toBeLessThanOrEqual(result.median);
    expect(result.median).toBeLessThanOrEqual(result.best);
    expect(result.cvar95).toBeLessThanOrEqual(result.var95);
  });

  it('states the book it ran against, so a result can be checked', async () => {
    const result = await scanScenarios(request());
    expect(result.bookFingerprint).toBe(snapshot.fingerprint);
    expect(result.positionCount).toBe(snapshot.positionCount);
    expect(result.revaluation).toBe('fast-path');
    expect(result.horizonDays).toBe(8);
  });

  it('is deterministic — the same request gives the same distribution', async () => {
    const a = await scanScenarios(request());
    const b = await scanScenarios(request());
    expect(a.terminalPnl).toEqual(b.terminalPnl);
  });

  it('finds the same worlds whether it runs 40 of them or 120', async () => {
    const small = await scanScenarios(request({ worlds: 40 }));
    const large = await scanScenarios(request({ worlds: 120 }));
    expect(large.terminalPnl.slice(0, 40)).toEqual(small.terminalPnl);
  });

  it('describes the worst worlds with attribution that sums to the world', async () => {
    const result = await scanScenarios(request({ reportWorst: 3 }));
    expect(result.worstWorlds).toHaveLength(3);
    for (const world of result.worstWorlds) {
      const total = world.byBucket.reduce((sum, bucket) => sum + bucket.pnl, 0);
      expect(total).toBeCloseTo(world.terminalPnl, 2);
      expect(world.worstPositions.length).toBeGreaterThan(0);
      // The trough along the path is never better than where it ended.
      expect(world.worstPnl).toBeLessThanOrEqual(world.terminalPnl + 1e-6);
      expect(world.worstOnDay).toBeGreaterThanOrEqual(0);
      expect(world.worstOnDay).toBeLessThan(8);
    }
  });

  it('ranks the worst worlds worst-first', async () => {
    const result = await scanScenarios(request({ reportWorst: 4 }));
    const pnl = result.worstWorlds.map((world) => world.terminalPnl);
    expect(pnl).toEqual([...pnl].sort((a, b) => a - b));
    expect(pnl[0]).toBe(result.worst);
  });

  it('carries each worst world its own factor path, not the book average', async () => {
    const result = await scanScenarios(request({ worlds: 60, reportWorst: 2 }));
    const [first, second] = result.worstWorlds;
    expect(first?.tenYearTo).not.toBe(second?.tenYearTo);
    expect(first?.tenYearFrom).toBeGreaterThan(0);
  });

  it('loses more under an imposed selloff than under the model alone', async () => {
    const plain = await scanScenarios(request());
    const shocked = await scanScenarios(request({ shock: { level: 1.5, onDay: 0 } }));
    expect(shocked.median).toBeLessThan(plain.median);
    expect(shocked.plausibility).toContain('150bp');
  });

  it('states its plausibility bound in both the plain and shocked cases', async () => {
    const plain = await scanScenarios(request());
    expect(plain.plausibility).toContain('stationary distribution');
    expect(plain.plausibility).toContain('40 worlds');

    const shocked = await scanScenarios(request({
      shock: { credit: 0.3, slope: -0.2, curvature: 0.1, volMultiplier: 2, onDay: 2 },
    }));
    expect(shocked.plausibility).toMatch(/credit 30% relative/);
    expect(shocked.plausibility).toMatch(/volatility x2/);
    expect(shocked.plausibility).toMatch(/day 2/);
  });

  it('improves the distribution when a hedge is carried alongside', async () => {
    // A short overlay: the same positions with the sign of their face flipped,
    // which must offset the book it was built from.
    const flipped = snapshotBook(book.positions, book.riskVectors, book.state, 20260907);
    for (let i = 0; i < flipped.positionCount; i++) {
      flipped.currentFace[i] = -(flipped.currentFace[i] as number) * 0.5;
      flipped.baseValue[i] = -(flipped.baseValue[i] as number) * 0.5;
    }
    const bare = await scanScenarios(request({ worlds: 30 }));
    const hedged = await scanScenarios(request({ worlds: 30, hedge: flipped }));
    expect(Math.abs(hedged.worst)).toBeLessThan(Math.abs(bare.worst));
  });

  it('reports how long it took and yields while it runs', async () => {
    let ticked = 0;
    const timer = setInterval(() => { ticked += 1; }, 1);
    const result = await scanScenarios(request({ worlds: 120, fork: {
      engine: book.engine, calendar, from: book.state, horizonDays: 20, seed: 20260907,
    } }));
    clearInterval(timer);
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
    // A scan that never gave the event loop a turn would starve the publisher.
    expect(ticked).toBeGreaterThan(0);
  });

  it('handles a single world and a single day without dividing by zero', async () => {
    const result = await scanScenarios(request({
      worlds: 1,
      fork: { engine: book.engine, calendar, from: book.state, horizonDays: 1, seed: 7 },
    }));
    expect(result.terminalPnl).toHaveLength(1);
    expect(Number.isFinite(result.mean)).toBe(true);
    expect(Number.isFinite(result.cvar95)).toBe(true);
  });
});

describe('histogram', () => {
  it('buckets values without losing any', () => {
    const bins = histogram([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5);
    expect(bins).toHaveLength(5);
    expect(bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(10);
  });

  it('puts the maximum in the last bin rather than off the end', () => {
    const bins = histogram([0, 5, 10], 2);
    expect(bins[bins.length - 1]?.count).toBeGreaterThan(0);
    expect(bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(3);
  });

  it('collapses to a single bin when every value is the same', () => {
    expect(histogram([3, 3, 3])).toEqual([{ from: 3, to: 3, count: 3 }]);
  });

  it('returns nothing for no values', () => {
    expect(histogram([])).toEqual([]);
  });
});
