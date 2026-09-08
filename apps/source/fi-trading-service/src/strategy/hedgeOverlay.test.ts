import { describe, expect, it } from 'vitest';
import { SifmaCalendar } from '../domain/core/sifmaCalendar.js';
import { nssDiscountCurve } from '../domain/curves/discount.js';
import { buildBook, DEMO_SCALE, scaleBook } from '../domain/book/bookBuilder.js';
import { snapshotBook } from '../scenario/bookSnapshot.js';
import { createRevalResult, revalue } from '../scenario/fastReval.js';
import { factorExposure } from '../scenario/reverseStress.js';
import { buildHedgeUniverse } from './hedgeUniverse.js';
import { solveHedge } from './hedgeSolver.js';
import { overlayFromLegs } from './hedgeOverlay.js';

const calendar = new SifmaCalendar();
const book = buildBook({
  asOf: 20260907, calendar, seed: 20260907, scale: scaleBook(DEMO_SCALE, 0.3),
});
const snapshot = snapshotBook(book.positions, book.riskVectors, book.state, 20260907);
const universe = buildHedgeUniverse({
  securities: book.securities, spreadBpFor: book.spreadFor,
  valuation: {
    asOf: 20260907, calendar, curve: nssDiscountCurve(book.state.betas), mortgage: book.state.mortgage,
  },
});
const exposure = factorExposure(snapshot);

function solved(target: (number | null)[]) {
  return solveHedge({ bookGradient: exposure.gradient, candidates: universe, target: { gradient: target } });
}

describe('overlayFromLegs', () => {
  it('produces one overlay position per leg', () => {
    const result = solved([0, null, null, null, null]);
    const overlay = overlayFromLegs(result.legs, book.state, 20260907);
    expect(overlay.positionCount).toBe(result.legs.length);
    expect(overlay.buckets.every((bucket) => bucket.startsWith('Hedge:'))).toBe(true);
  });

  it('is empty and harmless for an empty package', () => {
    const overlay = overlayFromLegs([], book.state, 20260907);
    expect(overlay.positionCount).toBe(0);
    const out = revalue(snapshot, book.state, createRevalResult(snapshot), overlay);
    expect(out.totalPnl).toBeCloseTo(0, 6);
  });

  /**
   * The claim the whole product rests on. The overlay must reproduce, under
   * full revaluation, the risk the solver designed it to carry — otherwise the
   * verification is grading a different package from the one proposed.
   */
  it('carries the risk the solver said it would', () => {
    const result = solved([0, null, null, null, null]);
    const overlay = overlayFromLegs(result.legs, book.state, 20260907);

    const bump = 0.02;
    const shocked = {
      ...book.state, betas: { ...book.state.betas, b0: book.state.betas.b0 + bump },
    };
    const measured = revalue(overlay, shocked, createRevalResult(overlay)).totalPnl;
    const designed = result.legs.reduce((sum, leg) => sum + (leg.gradient[0] as number) * bump, 0);
    expect(measured / designed).toBeCloseTo(1, 1);
  });

  it('offsets the book it was solved against, under the same revaluation', () => {
    const result = solved([0, null, null, null, null]);
    const overlay = overlayFromLegs(result.legs, book.state, 20260907);
    const shocked = {
      ...book.state, betas: { ...book.state.betas, b0: book.state.betas.b0 + 0.5 },
    };
    const bare = revalue(snapshot, shocked, createRevalResult(snapshot)).totalPnl;
    const hedged = revalue(snapshot, shocked, createRevalResult(snapshot), overlay).totalPnl;
    expect(bare).toBeLessThan(0);
    expect(Math.abs(hedged)).toBeLessThan(Math.abs(bare));
  });

  it('gives a sold leg negative face, so it profits when the market falls', () => {
    const result = solved([0, null, null, null, null]);
    const overlay = overlayFromLegs(result.legs, book.state, 20260907);
    const sold = [...overlay.currentFace].filter((face) => face < 0);
    expect(sold.length).toBeGreaterThan(0);
    for (const [i, face] of [...overlay.currentFace].entries()) {
      expect(Math.sign(overlay.baseValue[i] as number)).toBe(Math.sign(face));
    }
  });

  it('marks a swap leg to its upfront rather than its notional', () => {
    const result = solved([null, null, null, null, 0]);
    const overlay = overlayFromLegs(result.legs, book.state, 20260907);
    const swaps = [...overlay.swap].map((value, i) => ({ value, i })).filter((e) => e.value === 1);
    expect(swaps.length).toBeGreaterThan(0);
    for (const { i } of swaps) {
      const face = Math.abs(overlay.currentFace[i] as number);
      expect(Math.abs(overlay.baseValue[i] as number)).toBeLessThan(face * 0.5);
    }
  });

  it('describes each leg as the trade it is', () => {
    const result = solved([0, null, null, null, null]);
    const overlay = overlayFromLegs(result.legs, book.state, 20260907);
    for (const description of overlay.description) {
      expect(description).toMatch(/^(BUY|SELL) [\d.]+mm /);
    }
  });

  it('fingerprints itself by size, so two packages are distinguishable', () => {
    const a = overlayFromLegs(solved([0, null, null, null, null]).legs, book.state, 20260907);
    const b = overlayFromLegs(solved([null, null, null, null, 0]).legs, book.state, 20260907);
    expect(a.fingerprint).toMatch(/^hedge-/);
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });
});
