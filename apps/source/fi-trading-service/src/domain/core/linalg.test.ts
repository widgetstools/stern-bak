
import { describe, expect, it } from 'vitest';

import {
  applyCholesky, cholesky, clamp, inverseNormalCdf, normalCdf, normalPdf, round,
} from './linalg.js';
import { createNormalDraw, createRng } from './rng.js';

describe('normalCdf', () => {
  it('matches published values to 12 decimals', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 15);
    expect(normalCdf(1)).toBeCloseTo(0.841344746068543, 12);
    expect(normalCdf(-1)).toBeCloseTo(0.158655253931457, 12);
    expect(normalCdf(1.96)).toBeCloseTo(0.975002104851780, 12);
    expect(normalCdf(3)).toBeCloseTo(0.998650101968370, 12);
    expect(normalCdf(-3)).toBeCloseTo(0.001349898031630, 12);
  });

  it('is symmetric and saturates in the far tails', () => {
    for (const x of [0.3, 1.1, 2.7, 5.5]) {
      expect(normalCdf(x) + normalCdf(-x)).toBeCloseTo(1, 14);
    }
    expect(normalCdf(40)).toBe(1);
    expect(normalCdf(-40)).toBe(0);
  });

  it('is monotone', () => {
    let previous = 0;
    for (let x = -8; x <= 8; x += 0.05) {
      const value = normalCdf(x);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });
});

describe('normalPdf', () => {
  it('peaks at zero with the right height', () => {
    expect(normalPdf(0)).toBeCloseTo(1 / Math.sqrt(2 * Math.PI), 15);
    expect(normalPdf(1)).toBeCloseTo(0.24197072451914337, 14);
  });
});

describe('inverseNormalCdf', () => {
  it('matches published quantiles to 12 decimals', () => {
    expect(inverseNormalCdf(0.5)).toBeCloseTo(0, 15);
    expect(inverseNormalCdf(0.95)).toBeCloseTo(1.644853626951472, 12);
    expect(inverseNormalCdf(0.975)).toBeCloseTo(1.959963984540053, 12);
    expect(inverseNormalCdf(0.99)).toBeCloseTo(2.326347874040841, 12);
    expect(inverseNormalCdf(0.999)).toBeCloseTo(3.090232306167813, 12);
    expect(inverseNormalCdf(0.025)).toBeCloseTo(-1.959963984540054, 12);
  });

  it('round-trips against the CDF across the whole useful range', () => {
    // Relative, not absolute: near x = 6 the CDF is within 1e-9 of 1, so any
    // inverse loses absolute precision there. Relative accuracy is what
    // actually matters and what the algorithm guarantees.
    for (let x = -6; x <= 6; x += 0.1) {
      const recovered = inverseNormalCdf(normalCdf(x));
      expect(Math.abs(recovered - x) / Math.max(1, Math.abs(x))).toBeLessThan(1e-8);
    }
  });

  it('stays accurate deep in the tail, where default probabilities live', () => {
    // The central approximation is easy; the far tail is where a cheaper
    // routine would quietly lose digits and move default rates by percent.
    for (const p of [1e-8, 1e-10, 1e-12, 1e-15]) {
      const recovered = normalCdf(inverseNormalCdf(p));
      expect(Math.abs(recovered - p) / p).toBeLessThan(1e-6);
    }
  });

  it('handles the boundaries and refuses nonsense', () => {
    expect(inverseNormalCdf(0)).toBe(-Infinity);
    expect(inverseNormalCdf(1)).toBe(Infinity);
    expect(Number.isNaN(inverseNormalCdf(-0.1))).toBe(true);
    expect(Number.isNaN(inverseNormalCdf(1.1))).toBe(true);
  });
});

describe('cholesky', () => {
  it('factors a simple correlation matrix', () => {
    const factor = cholesky([
      [1, 0.5],
      [0.5, 1],
    ]);
    expect(factor[0]).toEqual([1, 0]);
    expect(factor[1]?.[0]).toBeCloseTo(0.5, 15);
    expect(factor[1]?.[1]).toBeCloseTo(Math.sqrt(0.75), 15);
  });

  it('accepts the curve-factor correlation matrix from the model', () => {
    // Positive definiteness here is a modelling precondition, not an
    // implementation detail: an invalid matrix would silently produce NaN
    // prices for every security.
    const factor = cholesky([
      [1.0, -0.45, -0.2, -0.1],
      [-0.45, 1.0, 0.55, 0.15],
      [-0.2, 0.55, 1.0, -0.35],
      [-0.1, 0.15, -0.35, 1.0],
    ]);
    const diagonal = factor.map((row, i) => Number((row[i] as number).toFixed(4)));
    expect(diagonal).toEqual([1, 0.893, 0.8335, 0.8422]);
  });

  it('reconstructs the original matrix from L times L transpose', () => {
    const matrix = [
      [4, 2, -2],
      [2, 10, 2],
      [-2, 2, 5],
    ];
    const l = cholesky(matrix);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        let sum = 0;
        for (let k = 0; k < 3; k++) sum += (l[i]?.[k] as number) * (l[j]?.[k] as number);
        expect(sum).toBeCloseTo(matrix[i]?.[j] as number, 12);
      }
    }
  });

  it('throws on a matrix that is not positive definite, naming the pivot', () => {
    expect(() =>
      cholesky([
        [1, 2],
        [2, 1],
      ]),
    ).toThrow(/not positive definite: leading minor 2/);
  });
});

describe('applyCholesky', () => {
  it('induces the requested correlation', () => {
    const factor = cholesky([
      [1, 0.7],
      [0.7, 1],
    ]);
    const draw = createNormalDraw(createRng(1234));
    const xs: number[] = [];
    const ys: number[] = [];
    const out = [0, 0];
    for (let i = 0; i < 200_000; i++) {
      applyCholesky(factor, [draw(), draw()], out);
      xs.push(out[0] as number);
      ys.push(out[1] as number);
    }
    const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
    const mx = mean(xs);
    const my = mean(ys);
    let cov = 0;
    let vx = 0;
    let vy = 0;
    for (let i = 0; i < xs.length; i++) {
      const dx = (xs[i] as number) - mx;
      const dy = (ys[i] as number) - my;
      cov += dx * dy;
      vx += dx * dx;
      vy += dy * dy;
    }
    expect(cov / Math.sqrt(vx * vy)).toBeCloseTo(0.7, 2);
  });

  it('writes into the supplied array rather than allocating', () => {
    const out = [0, 0];
    const result = applyCholesky([[1, 0], [0.5, 0.866]], [1, 1], out);
    expect(result).toBe(out);
    expect(out[0]).toBe(1);
  });
});

describe('small helpers', () => {
  it('clamps', () => {
    expect(clamp(5, 1, 10)).toBe(5);
    expect(clamp(-1, 1, 10)).toBe(1);
    expect(clamp(99, 1, 10)).toBe(10);
  });

  it('rounds without the usual float surprises', () => {
    expect(round(2.675, 2)).toBe(2.68);
    expect(round(1.005, 2)).toBe(1.01);
    expect(round(99.51562, 4)).toBe(99.5156);
    expect(round(-2.675, 2)).toBe(-2.67);
  });
});
