import { describe, expect, it } from 'vitest';
import { SifmaCalendar } from '../core/sifmaCalendar.js';
import { buildBook, DEMO_SCALE, scaleBook, type BuiltBook } from './bookBuilder.js';
import type { PositionRow } from './positions.js';

const calendar = new SifmaCalendar();
const SMALL = scaleBook(DEMO_SCALE, 0.2);

let cached: BuiltBook | null = null;
/** One build shared across the suite — it is deterministic and not cheap. */
function book(): BuiltBook {
  cached ??= buildBook({ asOf: 20260907, calendar, seed: 20260907, scale: SMALL });
  return cached;
}

const sum = (rows: readonly PositionRow[], field: string): number =>
  rows.reduce((total, row) => total + (row[field] as number), 0);

describe('scaleBook', () => {
  it('moves every dimension together and never scales a bucket to nothing', () => {
    const tiny = scaleBook(DEMO_SCALE, 0.001);
    expect(tiny.investmentGradeIssuers).toBe(1);
    expect(tiny.cloDeals).toBe(1);
    expect(tiny.heldFraction).toBe(DEMO_SCALE.heldFraction);
    const big = scaleBook(DEMO_SCALE, 3);
    expect(big.investmentGradeIssuers).toBe(DEMO_SCALE.investmentGradeIssuers * 3);
    expect(big.muniDeals).toBe(DEMO_SCALE.muniDeals * 3);
  });
});

describe('buildBook', () => {
  it('is a pure function of its seed', () => {
    const a = buildBook({ asOf: 20260907, calendar, seed: 41, scale: SMALL });
    const b = buildBook({ asOf: 20260907, calendar, seed: 41, scale: SMALL });
    expect(a.positions).toEqual(b.positions);
    const c = buildBook({ asOf: 20260907, calendar, seed: 42, scale: SMALL });
    expect(c.positions).not.toEqual(a.positions);
  });

  it('covers every asset class the desk trades', () => {
    const classes = new Set(book().positions.map((row) => row.assetClass as string));
    for (const expected of ['Rates', 'CorpIG', 'CorpHY', 'Muni', 'AgencyMBS', 'CMBS', 'ABS', 'CLO']) {
      expect(classes).toContain(expected);
    }
  });

  it('holds a subset of the universe, not all of it', () => {
    const built = book();
    expect(built.positions.length).toBeGreaterThan(0);
    expect(built.positions.length).toBeLessThan(built.securities.length);
    expect(built.riskVectors).toHaveLength(built.positions.length);
  });

  it('holds nothing that has not settled yet, though the master still lists it', () => {
    // Seed 5 draws a California deal that prices in November, which is the
    // case worth pinning: a forward-dated bond is real inventory-wise absent
    // and real master-wise present.
    const built = buildBook({ asOf: 20260907, calendar, seed: 5, scale: SMALL });
    const forwardDated = built.securities.filter((s) => s.issueDate > 20260907);
    expect(forwardDated.length).toBeGreaterThan(0);
    const held = new Set(built.positions.map((row) => row.securityId as number));
    for (const security of forwardDated) expect(held.has(security.securityId)).toBe(false);
  });

  it('opens every lot on or before the as-of date', () => {
    for (const row of book().positions) {
      expect((row.openDate as string) <= '2026-09-07').toBe(true);
    }
  });

  it('gives every position a unique id', () => {
    const ids = book().positions.map((row) => row.positionId as string);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('produces unrealised P&L of BOTH signs, because lots have real history', () => {
    const pnl = book().positions.map((row) => row.unrealizedPnL as number);
    expect(pnl.some((value) => value > 0)).toBe(true);
    expect(pnl.some((value) => value < 0)).toBe(true);
  });

  it('prices mortgages with negative convexity and everything else with positive', () => {
    const rows = book().positions;
    const mbs = rows.filter((row) => row.assetClass === 'AgencyMBS');
    const rates = rows.filter((row) => row.assetClass === 'Rates');
    expect(mbs.some((row) => (row.convexity as number) < 0)).toBe(true);
    expect(rates.every((row) => (row.convexity as number) > 0)).toBe(true);
  });
});

describe('repriceFast', () => {
  /**
   * The load-bearing test for the whole scenario engine.
   *
   * `beta[0]` is the level factor, whose NSS loading is 1 at every tenor, so
   * bumping it alone shifts the curve exactly in parallel. Under a parallel
   * shift the implied price move must reproduce each position's own effective
   * duration, and the residual must be the convexity term and nothing else.
   * If this drifts, every scenario the assistant runs is quietly wrong.
   */
  it('reproduces effective duration under a parallel bump, to the convexity term', () => {
    const built = buildBook({ asOf: 20260907, calendar, seed: 7, scale: SMALL });
    // A full point of bump, not a basis point. The row rounds its price to
    // four decimals, and against a 1 bp move that rounding alone is worth
    // 0.006 of a year — larger than the convexity term being measured. The
    // identity below is exact at any size, so measure it where it is legible.
    const before = built.positions.map((row, index) => ({
      price: (built.riskVectors[index] as (typeof built.riskVectors)[number]).basePrice,
      effective: (built.riskVectors[index] as (typeof built.riskVectors)[number]).beta[0],
      convexity: row.convexity as number,
    }));

    const bump = 0.01;
    built.repriceFast({
      ...built.state,
      betas: { ...built.state.betas, b0: built.state.betas.b0 + bump * 100 },
    });

    for (const [index, row] of built.positions.entries()) {
      const base = before[index] as (typeof before)[number];
      const implied = -((row.midPrice as number) - base.price) / base.price / bump;
      // P/P = -D.dy + C.dy^2/2, so implied duration = D - C.dy/2 exactly.
      expect(implied).toBeCloseTo(base.effective - (base.convexity * bump) / 2, 3);
    }
  });

  it('loses money when yields rise and makes it when they fall', () => {
    const built = buildBook({ asOf: 20260907, calendar, seed: 11, scale: SMALL });
    const start = sum(built.positions, 'marketValue');

    built.repriceFast({ ...built.state, betas: { ...built.state.betas, b0: built.state.betas.b0 + 0.5 } });
    const afterSelloff = sum(built.positions, 'marketValue');
    expect(afterSelloff).toBeLessThan(start);

    built.repriceFast({ ...built.state, betas: { ...built.state.betas, b0: built.state.betas.b0 - 0.5 } });
    expect(sum(built.positions, 'marketValue')).toBeGreaterThan(start);

    // Exactly reversible: revaluing is a function of the state, not the path.
    built.repriceFast(built.state);
    expect(sum(built.positions, 'marketValue') / start).toBeCloseTo(1, 10);
  });

  it('widens spreads on credit and leaves Treasuries alone', () => {
    const built = buildBook({ asOf: 20260907, calendar, seed: 13, scale: SMALL });
    const before = built.positions.map((row) => row.zSpread as number);
    built.repriceFast({
      ...built.state,
      credit: { ...built.state.credit, systematic: built.state.credit.systematic + 0.25 },
    });

    let widened = 0;
    for (const [index, row] of built.positions.entries()) {
      const move = (row.zSpread as number) - (before[index] as number);
      if (row.assetClass === 'Rates') expect(move).toBeCloseTo(0, 8);
      if (move > 0) widened += 1;
    }
    expect(widened).toBeGreaterThan(0);
  });

  it('widens a high-yield name by more basis points than an investment-grade one', () => {
    const built = buildBook({ asOf: 20260907, calendar, seed: 17, scale: SMALL });
    const before = new Map(built.positions.map((row) => [row.positionId, row.zSpread as number]));
    built.repriceFast({
      ...built.state,
      credit: { ...built.state.credit, systematic: built.state.credit.systematic + 0.2 },
    });
    const moveFor = (assetClass: string): number => {
      const rows = built.positions.filter((row) => row.assetClass === assetClass);
      return rows.reduce(
        (total, row) => total + ((row.zSpread as number) - (before.get(row.positionId) as number)),
        0,
      ) / Math.max(1, rows.length);
    };
    expect(moveFor('CorpHY')).toBeGreaterThan(moveFor('CorpIG'));
  });

  it('keeps the row fields consistent with each other after a tick', () => {
    const built = buildBook({ asOf: 20260907, calendar, seed: 19, scale: SMALL });
    built.repriceFast({ ...built.state, betas: { ...built.state.betas, b0: built.state.betas.b0 + 0.15 } });
    for (const [index, row] of built.positions.entries()) {
      expect(row.bidPrice as number).toBeLessThan(row.midPrice as number);
      expect(row.askPrice as number).toBeGreaterThan(row.midPrice as number);
      expect(row.midPrice as number).toBeGreaterThan(0);
      expect(Number.isFinite(row.marketValue as number)).toBe(true);
      const vector = built.riskVectors[index] as (typeof built.riskVectors)[number];
      expect(row.unrealizedPnL as number).toBeCloseTo(
        (row.marketValue as number) - vector.costBasis, 6,
      );
    }
  });
});

describe('step', () => {
  it('advances the factor state without touching prices', () => {
    const built = buildBook({ asOf: 20260907, calendar, seed: 23, scale: SMALL });
    const priced = built.positions.map((row) => row.midPrice as number);
    const next = built.step(20260908);
    expect(next.asOf).toBe(20260908);
    expect(built.positions.map((row) => row.midPrice as number)).toEqual(priced);
    // Stepping is what makes repricing meaningful; the two are separate events.
    built.repriceFast(next);
    expect(built.positions.map((row) => row.midPrice as number)).not.toEqual(priced);
  });
});
