import { describe, expect, it } from 'vitest';
import { SifmaCalendar } from '../domain/core/sifmaCalendar.js';
import { buildBook, DEMO_SCALE, scaleBook } from '../domain/book/bookBuilder.js';
import { snapshotBook, type BookSnapshot } from './bookSnapshot.js';
import { createRevalResult, revalue } from './fastReval.js';
import {
  factorCovariance, factorExposure, factorStandardDeviations, reverseStress,
} from './reverseStress.js';

const calendar = new SifmaCalendar();
const book = buildBook({
  asOf: 20260907, calendar, seed: 20260907, scale: scaleBook(DEMO_SCALE, 0.25),
});
const whole = snapshotBook(book.positions, book.riskVectors, book.state, 20260907);

/** A sub-book, so the search can be shown to depend on what is in it. */
function subset(classes: readonly string[]): BookSnapshot {
  const kept = book.positions
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => classes.includes(row.assetClass as string));
  return snapshotBook(
    kept.map(({ row }) => row),
    kept.map(({ index }) => book.riskVectors[index] as (typeof book.riskVectors)[number]),
    book.state, 20260907,
  );
}

describe('factorStandardDeviations', () => {
  it('grows with the horizon, sublinearly because the factors mean-revert', () => {
    const oneDay = factorStandardDeviations(1);
    const twenty = factorStandardDeviations(20);
    for (const [index, value] of oneDay.entries()) {
      expect(twenty[index] as number).toBeGreaterThan(value);
      expect(twenty[index] as number).toBeLessThan(value * Math.sqrt(20) * 1.01);
    }
  });

  it('covers the four curve factors and credit', () => {
    expect(factorStandardDeviations(5)).toHaveLength(5);
  });
});

describe('factorCovariance', () => {
  it('is symmetric with variances on the diagonal', () => {
    const sd = factorStandardDeviations(10);
    const covariance = factorCovariance(10);
    for (let i = 0; i < 5; i++) {
      expect((covariance[i] as number[])[i]).toBeCloseTo((sd[i] as number) ** 2, 12);
      for (let j = 0; j < 5; j++) {
        expect((covariance[i] as number[])[j]).toBeCloseTo((covariance[j] as number[])[i] as number, 12);
      }
    }
  });

  it('treats credit as independent of the curve', () => {
    const covariance = factorCovariance(10);
    for (let i = 0; i < 4; i++) {
      expect((covariance[i] as number[])[4]).toBe(0);
      expect((covariance[4] as number[])[i]).toBe(0);
    }
  });

  it('carries the fitted level/slope correlation, which is negative', () => {
    const covariance = factorCovariance(10);
    expect((covariance[0] as number[])[1] as number).toBeLessThan(0);
  });
});

describe('factorExposure', () => {
  it('makes a long book lose money when yields rise', () => {
    const exposure = factorExposure(whole);
    expect(exposure.gradient[0] as number).toBeLessThan(0);
    expect(exposure.standaloneLoss[0] as number).toBeLessThan(0);
    expect(exposure.labels).toEqual(['level', 'slope', 'curvature', 'hump', 'credit']);
  });

  it('gives a Treasury-only book no credit exposure at all', () => {
    const exposure = factorExposure(subset(['Rates']));
    expect(exposure.gradient[4] as number).toBeCloseTo(0, 6);
    expect(exposure.gradient[0] as number).toBeLessThan(0);
  });

  it('predicts the first-order P&L the revaluation produces', () => {
    const exposure = factorExposure(whole);
    const move = 0.05;
    const out = revalue(
      whole,
      { ...book.state, betas: { ...book.state.betas, b0: book.state.betas.b0 + move } },
      createRevalResult(whole),
    );
    const predicted = (exposure.gradient[0] as number) * move;
    expect(out.totalPnl / predicted).toBeCloseTo(1, 2);
  });
});

describe('reverseStress', () => {
  it('lands exactly on the plausibility boundary it was given', () => {
    const result = reverseStress({ book: whole, horizonDays: 20, radius: 2.5 });
    const covariance = factorCovariance(20);
    const move = [
      result.move.level, result.move.slope, result.move.curvature, result.move.hump, result.move.credit,
    ];
    // Mahalanobis distance of the answer must be the radius asked for.
    const inverse = invert5(covariance);
    let distance = 0;
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 5; j++) {
        distance += (move[i] as number) * ((inverse[i] as number[])[j] as number) * (move[j] as number);
      }
    }
    expect(Math.sqrt(distance)).toBeCloseTo(2.5, 6);
  });

  it('hurts more at a wider radius, and scales linearly in the linear part', () => {
    const near = reverseStress({ book: whole, horizonDays: 20, radius: 2 });
    const far = reverseStress({ book: whole, horizonDays: 20, radius: 4 });
    expect(far.actualPnl).toBeLessThan(near.actualPnl);
    expect(far.predictedPnl / near.predictedPnl).toBeCloseTo(2, 6);
  });

  it('is worse than any random draw of the same size, because it is the worst direction', () => {
    const result = reverseStress({ book: whole, horizonDays: 20, radius: 2.5 });
    const sd = factorStandardDeviations(20);
    // A pure level move of the same standalone size cannot beat the joint optimum.
    const alternative = revalue(
      whole,
      {
        ...book.state,
        betas: { ...book.state.betas, b0: book.state.betas.b0 + 2.5 * (sd[0] as number) },
      },
      createRevalResult(whole),
    );
    expect(result.actualPnl).toBeLessThan(alternative.totalPnl);
  });

  it('finds a DIFFERENT corner for a different book — the whole point', () => {
    const rates = reverseStress({ book: subset(['Rates', 'Muni']), horizonDays: 20 });
    const credit = reverseStress({ book: subset(['CorpHY']), horizonDays: 20 });
    // A book with no credit is not searched along the credit axis.
    expect(Math.abs(rates.creditWideningPct)).toBeLessThan(0.01);
    // A high yield book is searched mostly along it.
    expect(credit.creditWideningPct).toBeGreaterThan(20);
    expect(credit.tenYearMoveBp).toBeLessThan(rates.tenYearMoveBp);
  });

  it('reports the convexity gap between what it predicted and what it measured', () => {
    const result = reverseStress({ book: whole, horizonDays: 20, radius: 3 });
    expect(result.convexityEffect).toBeCloseTo(result.actualPnl - result.predictedPnl, 6);
    // Second order against first: real, and small next to the move itself.
    expect(Math.abs(result.convexityEffect)).toBeLessThan(Math.abs(result.predictedPnl) * 0.2);
  });

  it('attributes the loss by asset class and down to positions', () => {
    const result = reverseStress({ book: whole, horizonDays: 20 });
    expect(result.byBucket.reduce((sum, bucket) => sum + bucket.pnl, 0))
      .toBeCloseTo(result.actualPnl, 2);
    expect(result.byBucket[0]?.pnl).toBeLessThanOrEqual(result.byBucket[1]?.pnl as number);
    expect(result.worstPositions).toHaveLength(8);
    expect(result.worstPositions[0]?.pnl).toBeLessThanOrEqual(result.worstPositions[1]?.pnl as number);
  });

  it('explains why THIS book, naming the concentration that drove it', () => {
    const credit = reverseStress({ book: subset(['CorpHY']), horizonDays: 20 });
    expect(credit.explanation).toContain('CorpHY');
    expect(credit.explanation).toContain('credit');
    expect(credit.plausibility).toContain('standard-deviation boundary');
  });

  it('states the book it ran against', () => {
    const result = reverseStress({ book: whole, horizonDays: 20 });
    expect(result.bookFingerprint).toBe(whole.fingerprint);
    expect(result.horizonDays).toBe(20);
    expect(result.radius).toBe(2.5);
  });

  it('offsets the loss when a hedge is carried alongside', () => {
    const half = snapshotBook(book.positions, book.riskVectors, book.state, 20260907);
    for (let i = 0; i < half.positionCount; i++) {
      half.currentFace[i] = -(half.currentFace[i] as number) * 0.6;
      half.baseValue[i] = -(half.baseValue[i] as number) * 0.6;
    }
    const bare = reverseStress({ book: whole, horizonDays: 20 });
    const hedged = reverseStress({ book: whole, horizonDays: 20, hedge: half });
    expect(Math.abs(hedged.actualPnl)).toBeLessThan(Math.abs(bare.actualPnl));
  });

  it('returns a null move for a book with no risk rather than dividing by zero', () => {
    const empty = snapshotBook([], [], book.state, 20260907);
    const result = reverseStress({ book: empty, horizonDays: 20 });
    expect(result.move.level).toBe(0);
    expect(result.actualPnl).toBe(0);
    expect(result.explanation).toContain('no factor risk');
  });
});

/** Gauss-Jordan inverse, for checking the Mahalanobis distance in the test. */
function invert5(matrix: readonly (readonly number[])[]): number[][] {
  const n = matrix.length;
  const a = matrix.map((row, i) => [
    ...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  ]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs((a[row] as number[])[col] as number) > Math.abs((a[pivot] as number[])[col] as number)) {
        pivot = row;
      }
    }
    [a[col], a[pivot]] = [a[pivot] as number[], a[col] as number[]];
    const scale = (a[col] as number[])[col] as number;
    for (let j = 0; j < 2 * n; j++) (a[col] as number[])[j] = ((a[col] as number[])[j] as number) / scale;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = (a[row] as number[])[col] as number;
      for (let j = 0; j < 2 * n; j++) {
        (a[row] as number[])[j] =
          ((a[row] as number[])[j] as number) - factor * ((a[col] as number[])[j] as number);
      }
    }
  }
  return a.map((row) => row.slice(n));
}
