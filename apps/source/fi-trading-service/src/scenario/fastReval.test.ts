import { describe, expect, it } from 'vitest';
import { SifmaCalendar } from '../domain/core/sifmaCalendar.js';
import { buildBook, DEMO_SCALE, scaleBook } from '../domain/book/bookBuilder.js';
import { baseMarketValue, snapshotBook } from './bookSnapshot.js';
import { createRevalResult, revalue, revaluePositions } from './fastReval.js';

const calendar = new SifmaCalendar();
const SMALL = scaleBook(DEMO_SCALE, 0.2);

function fixture(seed = 31) {
  const book = buildBook({ asOf: 20260907, calendar, seed, scale: SMALL });
  return { book, snapshot: snapshotBook(book.positions, book.riskVectors, book.state, 20260907) };
}

describe('snapshotBook', () => {
  it('carries every position across, in order', () => {
    const { book, snapshot } = fixture();
    expect(snapshot.positionCount).toBe(book.positions.length);
    expect(snapshot.positionId[0]).toBe(book.positions[0]?.positionId);
    expect(snapshot.buckets.length).toBeGreaterThan(5);
  });

  it('agrees with the rows about what the book is worth', () => {
    const { book, snapshot } = fixture();
    const fromRows = book.positions.reduce((sum, row) => sum + (row.marketValue as number), 0);
    expect(baseMarketValue(snapshot)).toBeCloseTo(fromRows, 0);
  });

  it('fingerprints the book, and two different books differently', () => {
    expect(fixture(31).snapshot.fingerprint).toBe(fixture(31).snapshot.fingerprint);
    expect(fixture(31).snapshot.fingerprint).not.toBe(fixture(32).snapshot.fingerprint);
    expect(fixture(31).snapshot.fingerprint).toMatch(/^bk-/);
  });
});

describe('revalue', () => {
  /**
   * The scan kernel and the live row path must never disagree about a price.
   * They are deliberately two implementations of one expansion — one writes 88
   * fields, one writes a running total — so this pins them together.
   */
  it('reproduces the row path exactly, position for position', () => {
    const { book, snapshot } = fixture();
    const next = {
      ...book.state,
      betas: { ...book.state.betas, b0: book.state.betas.b0 + 0.35, b1: book.state.betas.b1 - 0.2 },
      credit: { ...book.state.credit, systematic: book.state.credit.systematic + 0.18 },
    };
    const scanned = revaluePositions(snapshot, next);
    const before = book.positions.map((row) => row.marketValue as number);
    book.repriceFast(next);

    for (const [index, row] of book.positions.entries()) {
      const fromRows = (row.marketValue as number) - (before[index] as number);
      expect(scanned[index] as number).toBeCloseTo(fromRows, 2);
    }
  });

  it('splits P&L by asset class, and the parts sum to the whole', () => {
    const { book, snapshot } = fixture();
    const out = createRevalResult(snapshot);
    revalue(snapshot, {
      ...book.state, betas: { ...book.state.betas, b0: book.state.betas.b0 + 0.5 },
    }, out);
    let sum = 0;
    for (const value of out.byBucket) sum += value;
    expect(sum).toBeCloseTo(out.totalPnl, 4);
    expect(out.byBucket).toHaveLength(snapshot.buckets.length);
  });

  it('is zero at the base state, and exactly reversible', () => {
    const { book, snapshot } = fixture();
    const out = createRevalResult(snapshot);
    revalue(snapshot, book.state, out);
    expect(out.totalPnl).toBeCloseTo(0, 6);

    revalue(snapshot, {
      ...book.state, betas: { ...book.state.betas, b0: book.state.betas.b0 + 0.4 },
    }, out);
    const moved = out.totalPnl;
    expect(moved).toBeLessThan(0);
    revalue(snapshot, book.state, out);
    expect(out.totalPnl).toBeCloseTo(0, 6);
  });

  it('reuses its output buffer rather than allocating per call', () => {
    const { book, snapshot } = fixture();
    const out = createRevalResult(snapshot);
    const buffer = out.byBucket;
    revalue(snapshot, book.state, out);
    revalue(snapshot, { ...book.state, betas: { ...book.state.betas, b0: 6 } }, out);
    expect(out.byBucket).toBe(buffer);
  });

  it('adds a hedge overlay into the same total', () => {
    const { book, snapshot } = fixture();
    const hedge = snapshotBook(
      book.positions.slice(0, 20), book.riskVectors.slice(0, 20), book.state, 20260907,
    );
    const next = { ...book.state, betas: { ...book.state.betas, b0: book.state.betas.b0 + 0.3 } };

    const bare = revalue(snapshot, next, createRevalResult(snapshot)).totalPnl;
    const withHedge = revalue(snapshot, next, createRevalResult(snapshot), hedge).totalPnl;
    const hedgeAlone = revalue(hedge, next, createRevalResult(hedge)).totalPnl;
    expect(withHedge).toBeCloseTo(bare + hedgeAlone, 4);
  });

  it('ignores an empty overlay', () => {
    const { book, snapshot } = fixture();
    const empty = snapshotBook([], [], book.state, 20260907);
    const next = { ...book.state, betas: { ...book.state.betas, b0: book.state.betas.b0 + 0.3 } };
    expect(revalue(snapshot, next, createRevalResult(snapshot), empty).totalPnl)
      .toBeCloseTo(revalue(snapshot, next, createRevalResult(snapshot)).totalPnl, 6);
  });
});
