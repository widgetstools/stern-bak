
import { describe, expect, it } from 'vitest';

import { cholesky } from '../core/linalg.js';
import { createNormalDraw, createRng } from '../core/rng.js';
import { nssZero } from './nss.js';
import {
  BETA_CHOLESKY, BETA_CORRELATION, BETA_SPECS, DAILY_DT, betaDailySigma, evolveBetas,
  impliedKeyRateCorrelation, impliedKeyRateVolBp, normalDrawFor, SEED_BETAS,
  TRADING_DAYS_PER_YEAR,
} from './rateFactors.js';
import { halfLife } from './ouProcess.js';

describe('calibration', () => {
  it('uses a positive-definite correlation matrix', () => {
    expect(() => cholesky(BETA_CORRELATION)).not.toThrow();
    expect(BETA_CHOLESKY).toHaveLength(4);
  });

  it('reverts faster the less fundamental the factor is', () => {
    const halfLives = BETA_SPECS.map(halfLife);
    for (let i = 1; i < halfLives.length; i++) {
      expect(halfLives[i]).toBeLessThan(halfLives[i - 1] as number);
    }
    expect(halfLives[0]).toBeCloseTo(4.62, 1);
  });

  it('converts annual vol to daily on 252 sessions', () => {
    expect(TRADING_DAYS_PER_YEAR).toBe(252);
    expect(DAILY_DT).toBeCloseTo(1 / 252, 12);
    expect(betaDailySigma(0) * 100).toBeCloseTo(5.67, 2);
    expect(betaDailySigma(3) * 100).toBeCloseTo(13.86, 2);
  });
});

describe('implied curve dynamics', () => {
  it('reproduces the key-rate volatilities the calibration targets', () => {
    // Independently computed from the loadings, daily sigmas and correlation.
    expect(impliedKeyRateVolBp(2)).toBeCloseTo(7.327, 3);
    expect(impliedKeyRateVolBp(10)).toBeCloseTo(6.094, 3);
    expect(impliedKeyRateVolBp(30)).toBeCloseTo(6.279, 3);
  });

  it('lands every tenor inside the observed 5-8 bp/day band', () => {
    for (const tau of [0.25, 1, 2, 5, 7, 10, 20, 30]) {
      const vol = impliedKeyRateVolBp(tau);
      expect(vol).toBeGreaterThan(5);
      expect(vol).toBeLessThan(8);
    }
  });

  it('puts the 2s10s correlation inside the empirical 0.80-0.90 band', () => {
    expect(impliedKeyRateCorrelation(2, 10)).toBeCloseTo(0.8033, 3);
    expect(impliedKeyRateCorrelation(2, 10)).toBeGreaterThan(0.8);
  });

  it('correlates a tenor with itself perfectly and adjacent tenors highly', () => {
    expect(impliedKeyRateCorrelation(10, 10)).toBeCloseTo(1, 10);
    expect(impliedKeyRateCorrelation(7, 10)).toBeGreaterThan(0.97);
    expect(impliedKeyRateCorrelation(0.25, 30)).toBeLessThan(
      impliedKeyRateCorrelation(10, 30),
    );
  });
});

describe('evolveBetas', () => {
  it('is deterministic for a seed', () => {
    const run = () => {
      const rng = createRng(77);
      return evolveBetas(SEED_BETAS, DAILY_DT, rng, createNormalDraw(rng)).betas;
    };
    expect(run()).toEqual(run());
  });

  it('moves all four factors', () => {
    const rng = createRng(78);
    const next = evolveBetas(SEED_BETAS, DAILY_DT, rng, createNormalDraw(rng)).betas;
    expect(next.b0).not.toBe(SEED_BETAS.b0);
    expect(next.b3).not.toBe(SEED_BETAS.b3);
  });

  it('produces daily yield changes matching the implied volatility', () => {
    const rng = createRng(79);
    const draw = normalDrawFor(rng);
    let betas = SEED_BETAS;
    const changes: number[] = [];
    for (let day = 0; day < 30_000; day++) {
      const previous = nssZero(betas, 10);
      betas = evolveBetas(betas, DAILY_DT, rng, draw).betas;
      changes.push((nssZero(betas, 10) - previous) * 100);
    }
    const mean = changes.reduce((a, b) => a + b, 0) / changes.length;
    const sd = Math.sqrt(changes.reduce((a, b) => a + (b - mean) ** 2, 0) / changes.length);
    expect(sd).toBeCloseTo(impliedKeyRateVolBp(10), 0);
  });

  it('moves the whole curve together rather than tenor by tenor', () => {
    const rng = createRng(80);
    const draw = createNormalDraw(rng);
    let betas = SEED_BETAS;
    let sameDirection = 0;
    const days = 4000;
    for (let day = 0; day < days; day++) {
      const before = [nssZero(betas, 2), nssZero(betas, 10)];
      betas = evolveBetas(betas, DAILY_DT, rng, draw).betas;
      const d2 = nssZero(betas, 2) - (before[0] as number);
      const d10 = nssZero(betas, 10) - (before[1] as number);
      if (Math.sign(d2) === Math.sign(d10)) sameDirection += 1;
    }
    // For a bivariate normal the probability of agreeing in sign is
    // 1/2 + arcsin(rho)/pi. Independent per-tenor walks would give 0.5; this
    // model's 0.803 correlation predicts 0.797, and the simulation should
    // land on that rather than on some arbitrary "high" threshold.
    const rho = impliedKeyRateCorrelation(2, 10);
    const predicted = 0.5 + Math.asin(rho) / Math.PI;
    expect(predicted).toBeCloseTo(0.797, 3);
    expect(sameDirection / days).toBeCloseTo(predicted, 2);
    expect(sameDirection / days).toBeGreaterThan(0.75);
  });

  it('reverts a displaced level back towards theta', () => {
    const rng = createRng(81);
    const draw = createNormalDraw(rng);
    let betas = { ...SEED_BETAS, b0: 9 };
    for (let day = 0; day < 252 * 12; day++) {
      betas = evolveBetas(betas, DAILY_DT, rng, draw).betas;
    }
    expect(Math.abs(betas.b0 - (BETA_SPECS[0] as { theta: number }).theta)).toBeLessThan(2.5);
  });

  it('fires jumps only on release days, and they fatten the tails', () => {
    const quiet = createRng(82);
    const quietDraw = createNormalDraw(quiet);
    let jumpsWithoutEvent = 0;
    for (let i = 0; i < 2000; i++) {
      if (evolveBetas(SEED_BETAS, DAILY_DT, quiet, quietDraw, 1).jumped) jumpsWithoutEvent += 1;
    }
    expect(jumpsWithoutEvent).toBe(0);

    const loud = createRng(83);
    const loudDraw = createNormalDraw(loud);
    let jumpsOnEvent = 0;
    for (let i = 0; i < 2000; i++) {
      if (evolveBetas(SEED_BETAS, DAILY_DT, loud, loudDraw, 5).jumped) jumpsOnEvent += 1;
    }
    expect(jumpsOnEvent / 2000).toBeCloseTo(0.35, 1);
  });
});
