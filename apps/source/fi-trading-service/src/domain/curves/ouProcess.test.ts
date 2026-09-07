
import { describe, expect, it } from 'vitest';

import { createNormalDraw, createRng } from '../core/rng.js';
import { bridge, halfLife, ouMean, ouStep, stationarySd, stepSd, type OuSpec } from './ouProcess.js';

const SPEC: OuSpec = { kappa: 1.2, theta: 4, sigma: 0.9 };

describe('parameters', () => {
  it('reports the half-life implied by the reversion speed', () => {
    expect(halfLife(SPEC)).toBeCloseTo(Math.LN2 / 1.2, 12);
    expect(halfLife({ ...SPEC, kappa: 0.15 })).toBeCloseTo(4.621, 3);
    expect(halfLife({ ...SPEC, kappa: 0 })).toBe(Infinity);
  });

  it('reports the stationary spread of the process', () => {
    expect(stationarySd(SPEC)).toBeCloseTo(0.9 / Math.sqrt(2.4), 12);
    expect(stationarySd({ ...SPEC, kappa: 0 })).toBe(Infinity);
  });

  it('grows the step spread towards the stationary one as the step lengthens', () => {
    expect(stepSd(SPEC, 1 / 252)).toBeLessThan(stepSd(SPEC, 1));
    expect(stepSd(SPEC, 1000)).toBeCloseTo(stationarySd(SPEC), 8);
  });

  it('falls back to a random walk when there is no reversion', () => {
    expect(stepSd({ ...SPEC, kappa: 0 }, 4)).toBeCloseTo(0.9 * 2, 12);
  });
});

describe('ouStep', () => {
  it('pulls towards theta in the absence of a shock', () => {
    expect(ouStep(10, SPEC, 1, 0)).toBeLessThan(10);
    expect(ouStep(10, SPEC, 1, 0)).toBeGreaterThan(SPEC.theta);
    expect(ouStep(0, SPEC, 1, 0)).toBeGreaterThan(0);
  });

  it('leaves a process already at theta alone', () => {
    expect(ouStep(SPEC.theta, SPEC, 1, 0)).toBeCloseTo(SPEC.theta, 12);
  });

  it('agrees with the closed-form conditional mean', () => {
    expect(ouStep(9, SPEC, 0.5, 0)).toBeCloseTo(ouMean(9, SPEC, 0.5), 12);
    expect(ouMean(9, SPEC, 0)).toBeCloseTo(9, 12);
  });

  it('reproduces the stationary distribution over a long run', () => {
    const draw = createNormalDraw(createRng(31));
    let x = 20;
    const samples: number[] = [];
    for (let i = 0; i < 400_000; i++) {
      x = ouStep(x, SPEC, 1 / 252, draw());
      if (i > 5000) samples.push(x);
    }
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    const variance = samples.reduce((a, b) => a + (b - mean) ** 2, 0) / samples.length;
    expect(mean).toBeCloseTo(SPEC.theta, 1);
    expect(Math.sqrt(variance)).toBeCloseTo(stationarySd(SPEC), 1);
  });

  it('uses the exact transition, which differs from Euler over a long step', () => {
    // Over a year with kappa 1.2, Euler would move 1.2x the gap and overshoot
    // past theta; the exact form decays by exp(-1.2) and cannot overshoot.
    const exact = ouStep(10, SPEC, 1, 0);
    const euler = 10 + SPEC.kappa * (SPEC.theta - 10) * 1;
    expect(exact).toBeGreaterThan(SPEC.theta);
    expect(euler).toBeLessThan(SPEC.theta);
    expect(exact).toBeCloseTo(SPEC.theta + 6 * Math.exp(-1.2), 12);
  });
});

describe('bridge', () => {
  it('pins both endpoints exactly, so a replayed day lands on its close', () => {
    expect(bridge(4, 5, 0, 0.9, 1 / 252, 3)).toBe(4);
    expect(bridge(4, 5, 1, 0.9, 1 / 252, 3)).toBe(5);
    expect(bridge(4, 5, -0.5, 0.9, 1 / 252, 3)).toBe(4);
    expect(bridge(4, 5, 2, 0.9, 1 / 252, 3)).toBe(5);
  });

  it('interpolates linearly with no shock', () => {
    expect(bridge(4, 6, 0.25, 0.9, 1 / 252, 0)).toBeCloseTo(4.5, 12);
  });

  it('has the most dispersion in the middle of the day', () => {
    const spread = (fraction: number) =>
      Math.abs(bridge(4, 4, fraction, 0.9, 1 / 252, 1) - 4);
    expect(spread(0.5)).toBeGreaterThan(spread(0.1));
    expect(spread(0.5)).toBeGreaterThan(spread(0.9));
  });

  it('keeps the intraday path near its endpoints, not wandering off', () => {
    const draw = createNormalDraw(createRng(32));
    for (let i = 0; i < 2000; i++) {
      const value = bridge(4, 4.02, 0.5, 0.9, 1 / 252, draw());
      expect(Math.abs(value - 4.01)).toBeLessThan(0.25);
    }
  });
});
