
import { describe, expect, it } from 'vitest';

import {
  betaArray, betaParams, betaSensitivity, fitError, fitNss, KNOT_LOADINGS, KRD_KNOTS,
  LAMBDA_1, LAMBDA_2, nssLoadings, nssZero,
} from './nss.js';

describe('loadings', () => {
  it('matches the model table at every key-rate knot', () => {
    // Independently computed from the closed form at lambda1=1.80,
    // lambda2=11.00. These feed the beta-sensitivity shortcut, so an error
    // here would silently mis-price the entire book on every tick.
    const expected: Record<number, [number, number, number]> = {
      0.25: [0.933662, 0.063337, 0.011193],
      1: [0.767244, 0.19349, 0.042791],
      2: [0.603726, 0.274533, 0.080606],
      5: [0.337616, 0.27544, 0.168843],
      10: [0.179304, 0.175438, 0.25393],
      30: [0.06, 0.06, 0.27729],
    };
    for (const [tau, [l1, l2, l3]] of Object.entries(expected)) {
      const loadings = nssLoadings(Number(tau));
      expect(loadings[0]).toBe(1);
      expect(loadings[1]).toBeCloseTo(l1, 6);
      expect(loadings[2]).toBeCloseTo(l2, 6);
      expect(loadings[3]).toBeCloseTo(l3, 6);
    }
  });

  it('has the level loading flat and the slope loading decaying to zero', () => {
    expect(nssLoadings(1e-6)[1]).toBeCloseTo(1, 5);
    expect(nssLoadings(200)[1]).toBeLessThan(0.02);
  });

  it('gives the curvature loadings an interior hump', () => {
    const at = (tau: number) => nssLoadings(tau);
    expect((at(2)[2] as number)).toBeGreaterThan(at(0.25)[2] as number);
    expect((at(2)[2] as number)).toBeGreaterThan(at(30)[2] as number);
    expect((at(20)[3] as number)).toBeGreaterThan(at(1)[3] as number);
  });

  it('handles a non-positive tenor without dividing by zero', () => {
    expect(Number.isFinite(nssLoadings(0)[1] as number)).toBe(true);
    expect(Number.isFinite(nssLoadings(-1)[3] as number)).toBe(true);
  });

  it('precomputes the knot loadings consistently', () => {
    expect(KNOT_LOADINGS).toHaveLength(KRD_KNOTS.length);
    KRD_KNOTS.forEach((tau, i) => {
      expect(KNOT_LOADINGS[i]).toEqual(nssLoadings(tau));
    });
  });

  it('pins the decay parameters, which the fast path depends on', () => {
    expect(LAMBDA_1).toBe(1.8);
    expect(LAMBDA_2).toBe(11);
  });
});

describe('nssZero', () => {
  const seed = { b0: 4.95, b1: -0.85, b2: -1.6, b3: 1.4 };

  it('reproduces the seed curve', () => {
    const expected: Record<number, number> = {
      0.25: 4.0707, 1: 4.0482, 2: 4.1104, 3: 4.2194,
      5: 4.4587, 7: 4.6605, 10: 4.8724, 20: 5.1473, 30: 5.1912,
    };
    for (const [tau, rate] of Object.entries(expected)) {
      expect(nssZero(seed, Number(tau))).toBeCloseTo(rate, 4);
    }
  });

  it('produces a dipped front end and an upward slope, a defensible regime', () => {
    expect(nssZero(seed, 1)).toBeLessThan(nssZero(seed, 0.25));
    expect(nssZero(seed, 10)).toBeGreaterThan(nssZero(seed, 2));
    expect(nssZero(seed, 30)).toBeGreaterThan(nssZero(seed, 10));
  });

  it('moves every tenor when the level moves', () => {
    const shifted = { ...seed, b0: seed.b0 + 0.5 };
    for (const tau of KRD_KNOTS) {
      expect(nssZero(shifted, tau) - nssZero(seed, tau)).toBeCloseTo(0.5, 12);
    }
  });

  it('steepens when the slope factor rises, without moving the long end much', () => {
    const steeper = { ...seed, b1: seed.b1 - 0.5 };
    const shortMove = nssZero(steeper, 0.25) - nssZero(seed, 0.25);
    const longMove = nssZero(steeper, 30) - nssZero(seed, 30);
    expect(shortMove).toBeLessThan(-0.4);
    expect(Math.abs(longMove)).toBeLessThan(0.05);
  });

  it('round-trips betas through the array form', () => {
    expect(betaParams(betaArray(seed))).toEqual(seed);
  });
});

describe('fitNss', () => {
  it('recovers the betas it generated, which is the identifiability check', () => {
    const truth = { b0: 4.2, b1: -1.1, b2: 0.8, b3: -0.6 };
    const targets = KRD_KNOTS.map((tau) => ({ tau, rate: nssZero(truth, tau) }));
    const fitted = fitNss(targets, 0);
    expect(fitted.b0).toBeCloseTo(truth.b0, 6);
    expect(fitted.b1).toBeCloseTo(truth.b1, 6);
    expect(fitted.b2).toBeCloseTo(truth.b2, 6);
    expect(fitted.b3).toBeCloseTo(truth.b3, 6);
    expect(fitError(fitted, targets)).toBeLessThan(1e-8);
  });

  it('fits an inverted curve, not just an upward-sloping one', () => {
    const targets = [
      { tau: 0.25, rate: 5.4 }, { tau: 2, rate: 4.6 }, { tau: 5, rate: 4.1 },
      { tau: 10, rate: 4.0 }, { tau: 30, rate: 4.3 },
    ];
    const fitted = fitNss(targets);
    expect(fitError(fitted, targets)).toBeLessThan(0.05);
    expect(nssZero(fitted, 0.25)).toBeGreaterThan(nssZero(fitted, 10));
  });

  it('honours weights', () => {
    const targets = [
      { tau: 1, rate: 4.0, weight: 1000 }, { tau: 2, rate: 4.2 },
      { tau: 5, rate: 4.5 }, { tau: 10, rate: 4.8 }, { tau: 30, rate: 5.0 },
    ];
    expect(nssZero(fitNss(targets), 1)).toBeCloseTo(4.0, 2);
  });

  it('refuses an underdetermined fit rather than returning nonsense', () => {
    expect(() => fitNss([{ tau: 1, rate: 4 }, { tau: 2, rate: 4 }])).toThrow(/at least 4/);
  });

  it('returns zero error for an empty target set', () => {
    expect(fitError({ b0: 1, b1: 0, b2: 0, b3: 0 }, [])).toBe(0);
  });
});

describe('betaSensitivity', () => {
  it('turns a KRD vector into four numbers that reprice exactly', () => {
    // A 10-year zero: all its duration sits at the 10-year knot.
    const krd = KRD_KNOTS.map((tau) => (tau === 10 ? 9.5 : 0));
    const sensitivity = betaSensitivity(krd);
    const loadings = nssLoadings(10);
    for (let j = 0; j < 4; j++) {
      expect(sensitivity[j]).toBeCloseTo(9.5 * (loadings[j] as number), 12);
    }
  });

  it('predicts the yield change from a beta move, to machine precision', () => {
    const krd = KRD_KNOTS.map((tau) => (tau === 5 ? 4.2 : tau === 10 ? 3.1 : 0));
    const sensitivity = betaSensitivity(krd);
    const before = { b0: 4.5, b1: -0.9, b2: -1.2, b3: 1.1 };
    const after = { b0: 4.53, b1: -0.86, b2: -1.25, b3: 1.14 };
    const dBeta = [after.b0 - before.b0, after.b1 - before.b1, after.b2 - before.b2, after.b3 - before.b3];

    const predicted = sensitivity.reduce((sum, s, j) => sum + s * (dBeta[j] as number), 0);
    const actual =
      4.2 * (nssZero(after, 5) - nssZero(before, 5)) +
      3.1 * (nssZero(after, 10) - nssZero(before, 10));
    expect(predicted).toBeCloseTo(actual, 12);
  });

  it('is zero for a security with no rate exposure', () => {
    expect(betaSensitivity(KRD_KNOTS.map(() => 0))).toEqual([0, 0, 0, 0]);
  });
});
