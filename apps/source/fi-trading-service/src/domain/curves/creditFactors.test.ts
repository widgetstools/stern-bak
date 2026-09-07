
import { describe, expect, it } from 'vitest';

import { createNormalDraw, createRng } from '../core/rng.js';
import {
  createCreditFactorState, CREDIT_SECTORS, creditCurveSlope, evolveCreditFactors,
  IDIO_HY_SPEC, IDIO_IG_SPEC, issuerSpread5y, issuerSpreadAtTenor, sectorIndexFor,
  SECTOR_SPEC, SENIORITY_MULTIPLIER, SYSTEMATIC_SPEC,
} from './creditFactors.js';
import { stationarySd } from './ouProcess.js';

const DT = 1 / 252;

function harness(issuerCount: number, seed = 91, hyFrom = issuerCount) {
  const rng = createRng(seed);
  const normalDraw = createNormalDraw(rng);
  const state = createCreditFactorState(issuerCount);
  const isHighYield = new Uint8Array(issuerCount);
  for (let i = hyFrom; i < issuerCount; i++) isHighYield[i] = 1;
  return { rng, normalDraw, state, isHighYield };
}

describe('calibration', () => {
  it('orders the factors from slow and wide to fast and narrow', () => {
    expect(SYSTEMATIC_SPEC.kappa).toBeLessThan(SECTOR_SPEC.kappa);
    expect(SECTOR_SPEC.kappa).toBeLessThan(IDIO_IG_SPEC.kappa);
    expect(stationarySd(SYSTEMATIC_SPEC)).toBeGreaterThan(stationarySd(SECTOR_SPEC));
  });

  it('makes high yield twice as jumpy as investment grade', () => {
    expect(IDIO_HY_SPEC.sigma / IDIO_IG_SPEC.sigma).toBeGreaterThan(1.9);
  });

  it('covers the sectors a credit desk groups by', () => {
    expect(CREDIT_SECTORS).toContain('Banking');
    expect(CREDIT_SECTORS).toContain('Energy');
    expect(CREDIT_SECTORS.length).toBe(14);
  });
});

describe('evolveCreditFactors', () => {
  it('moves every factor and stays deterministic', () => {
    const run = () => {
      const h = harness(20, 92);
      evolveCreditFactors(h.state, { dt: DT, rng: h.rng, normalDraw: h.normalDraw, isHighYield: h.isHighYield });
      return [h.state.systematic, [...h.state.sector], [...h.state.idiosyncratic]];
    };
    expect(run()).toEqual(run());
    const h = harness(20, 92);
    evolveCreditFactors(h.state, { dt: DT, rng: h.rng, normalDraw: h.normalDraw, isHighYield: h.isHighYield });
    expect(h.state.systematic).not.toBe(0);
    expect(h.state.sector.some((v) => v !== 0)).toBe(true);
  });

  it('fires single-name jumps at roughly the configured intensity', () => {
    const h = harness(1000, 93, 0); // all high yield, 0.35/yr
    let jumps = 0;
    for (let day = 0; day < 252; day++) {
      jumps += evolveCreditFactors(h.state, {
        dt: DT, rng: h.rng, normalDraw: h.normalDraw, isHighYield: h.isHighYield,
      }).jumpCount;
    }
    // 1000 names at 0.35 a year each.
    expect(jumps).toBeGreaterThan(280);
    expect(jumps).toBeLessThan(420);
  });

  it('widens more often than it tightens, as credit news does', () => {
    const h = harness(4000, 94, 0);
    const before = Float64Array.from(h.state.idiosyncratic);
    evolveCreditFactors(h.state, {
      dt: 1, rng: h.rng, normalDraw: h.normalDraw, isHighYield: h.isHighYield,
    });
    let widened = 0;
    let moved = 0;
    for (let i = 0; i < before.length; i++) {
      const delta = (h.state.idiosyncratic[i] as number) - (before[i] as number);
      if (Math.abs(delta) < 0.15) continue;
      moved += 1;
      if (delta > 0) widened += 1;
    }
    expect(moved).toBeGreaterThan(100);
    expect(widened / moved).toBeGreaterThan(0.6);
  });
});

describe('issuerSpread5y', () => {
  it('is the base spread when every factor is at rest', () => {
    const state = createCreditFactorState(4);
    expect(issuerSpread5y(120, 0, 0, false, state)).toBeCloseTo(120, 10);
  });

  it('stays positive however far the factors move', () => {
    const state = createCreditFactorState(1);
    state.systematic = -8;
    expect(issuerSpread5y(120, 0, 0, false, state)).toBeGreaterThan(0);
  });

  it('moves proportionally, so a wide name moves more in bp than a tight one', () => {
    const state = createCreditFactorState(1);
    state.systematic = 0.3;
    const tightMove = issuerSpread5y(20, 0, 0, false, state) - 20;
    const wideMove = issuerSpread5y(500, 0, 0, false, state) - 500;
    expect(wideMove).toBeGreaterThan(tightMove * 10);
  });

  it('widens high yield more than investment grade on the same shock', () => {
    const state = createCreditFactorState(2);
    state.systematic = 0.4;
    const ig = issuerSpread5y(300, 0, 0, false, state) / 300;
    const hy = issuerSpread5y(300, 0, 1, true, state) / 300;
    expect(hy).toBeGreaterThan(ig);
  });

  it('moves every issuer the same way on a systematic shock', () => {
    const state = createCreditFactorState(50);
    const before = Array.from({ length: 50 }, (_, i) => issuerSpread5y(150, i % 14, i, false, state));
    state.systematic = 0.25;
    const after = Array.from({ length: 50 }, (_, i) => issuerSpread5y(150, i % 14, i, false, state));
    for (let i = 0; i < 50; i++) expect(after[i]).toBeGreaterThan(before[i] as number);
  });
});

describe('credit curve shape', () => {
  it('slopes upward for a healthy name', () => {
    expect(creditCurveSlope(120)).toBeCloseTo(0.22, 10);
    expect(issuerSpreadAtTenor(120, 2) / 120).toBeCloseTo(0.8175, 3);
    expect(issuerSpreadAtTenor(120, 10) / 120).toBeCloseTo(1.1647, 3);
    expect(issuerSpreadAtTenor(120, 30) / 120).toBeCloseTo(1.4832, 3);
  });

  it('inverts for a distressed name, with no special case', () => {
    // The slope is a function of the level, so inversion emerges rather than
    // being switched on. At 1200 bp the slope has gone through zero.
    expect(creditCurveSlope(1200)).toBeCloseTo(-0.33, 6);
    expect(issuerSpreadAtTenor(1200, 1)).toBeCloseTo(2041, -1);
    expect(issuerSpreadAtTenor(1200, 10)).toBeCloseTo(954, -1);
    expect(issuerSpreadAtTenor(1200, 1)).toBeGreaterThan(issuerSpreadAtTenor(1200, 10));
  });

  it('is still flat-to-upward at the 400 bp hinge', () => {
    expect(creditCurveSlope(400)).toBeCloseTo(0.22, 10);
    expect(creditCurveSlope(700)).toBeLessThan(0.22);
    expect(creditCurveSlope(700)).toBeGreaterThan(-0.33);
  });

  it('returns the 5-year spread at the 5-year point and guards tau <= 0', () => {
    expect(issuerSpreadAtTenor(250, 5)).toBeCloseTo(250, 10);
    expect(issuerSpreadAtTenor(250, 0)).toBe(250);
  });
});

describe('seniority', () => {
  it('prices subordination as a multiple of the senior spread', () => {
    expect(SENIORITY_MULTIPLIER.SeniorSecured).toBeLessThan(1);
    expect(SENIORITY_MULTIPLIER.SeniorUnsecured).toBe(1);
    expect(SENIORITY_MULTIPLIER.Subordinated).toBeGreaterThan(1);
    expect(SENIORITY_MULTIPLIER.JuniorSubordinated).toBeGreaterThan(
      SENIORITY_MULTIPLIER.Subordinated,
    );
  });

  it('assigns sectors within range', () => {
    const rng = createRng(95);
    for (let i = 0; i < 500; i++) {
      const index = sectorIndexFor(rng);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(CREDIT_SECTORS.length);
    }
  });
});
