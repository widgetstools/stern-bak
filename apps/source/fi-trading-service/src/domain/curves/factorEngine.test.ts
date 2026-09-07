
import { describe, expect, it } from 'vitest';

import { businessDaysInRange } from '../core/businessDays.js';
import { createNormalDraw, createRng } from '../core/rng.js';
import { SifmaCalendar } from '../core/sifmaCalendar.js';
import { MMD_KNOTS } from './muniScale.js';
import { nssZero } from './nss.js';
import { bridgeBetas, FactorEngine, type FactorState } from './factorEngine.js';
import { DEFAULT_INDEX } from './ratingMigration.js';

const calendar = new SifmaCalendar();
const ISSUERS = 650;

function engine(seed = 301): FactorEngine {
  const sectorOfIssuer = new Uint8Array(ISSUERS);
  const initialRatings = new Uint8Array(ISSUERS);
  for (let i = 0; i < ISSUERS; i++) {
    sectorOfIssuer[i] = i % 14;
    initialRatings[i] = i < 400 ? ([0, 1, 2, 3, 3, 2][i % 6] as number) : ([4, 5, 4, 5, 6][i % 5] as number);
  }
  return new FactorEngine({ seed, calendar, sectorOfIssuer, initialRatings });
}

const SESSIONS = businessDaysInRange(calendar, 20260101, 20261231);

describe('seeding', () => {
  it('starts at long-run levels', () => {
    const state = engine().seedState(20260102);
    expect(state.betas.b0).toBeCloseTo(4.95, 10);
    expect(state.credit.systematic).toBe(0);
    expect(state.ratings).toHaveLength(ISSUERS);
    expect(state.mmdScale).toHaveLength(MMD_KNOTS.length);
  });

  it('does not alias the ratings it was handed', () => {
    const e = engine();
    const first = e.seedState(20260102);
    first.ratings[0] = DEFAULT_INDEX;
    expect(e.seedState(20260102).ratings[0]).not.toBe(DEFAULT_INDEX);
  });
});

describe('determinism', () => {
  it('gives the same day the same answer, however it was reached', () => {
    const a = engine();
    const b = engine();
    const seedA = a.seedState(20260102);
    const seedB = b.seedState(20260102);
    const stepA = a.step(seedA, 20260105);
    const stepB = b.step(seedB, 20260105);
    expect(stepA.state.betas).toEqual(stepB.state.betas);
    expect([...stepA.state.credit.idiosyncratic]).toEqual([...stepB.state.credit.idiosyncratic]);
  });

  it('derives its stream from the date, so a day can be recomputed alone', () => {
    const e = engine();
    const seed = e.seedState(20260102);
    // The same previous state and date must reproduce exactly, no matter what
    // was computed in between. This is what makes the build parallelisable.
    const first = e.step(seed, 20260105);
    e.step(seed, 20260601);
    const again = e.step(seed, 20260105);
    expect(again.state.betas).toEqual(first.state.betas);
  });

  it('changes with the seed', () => {
    const a = engine(301).step(engine(301).seedState(20260102), 20260105);
    const b = engine(999).step(engine(999).seedState(20260102), 20260105);
    expect(a.state.betas).not.toEqual(b.state.betas);
  });

  it('does not mutate the state it was given', () => {
    const e = engine();
    const seed = e.seedState(20260102);
    const before = [...seed.credit.idiosyncratic];
    const ratingsBefore = [...seed.ratings];
    e.step(seed, 20260105);
    expect([...seed.credit.idiosyncratic]).toEqual(before);
    expect([...seed.ratings]).toEqual(ratingsBefore);
  });
});

describe('a full year', () => {
  const states = engine().run(20260101, 20261231);

  it('produces one state per session', () => {
    expect(states).toHaveLength(SESSIONS.length);
    expect(states).toHaveLength(249);
    expect(states[states.length - 1]?.asOf).toBe(SESSIONS[SESSIONS.length - 1]);
  });

  it('keeps rates in a plausible range all year', () => {
    for (const state of states) {
      const tenYear = nssZero(state.betas, 10);
      expect(tenYear).toBeGreaterThan(0);
      expect(tenYear).toBeLessThan(15);
    }
  });

  it('publishes an MMD scale that tracks below Treasuries', () => {
    const last = states[states.length - 1];
    if (last === undefined) throw new Error('no states');
    const curve = engine().curve(last);
    for (let i = 0; i < MMD_KNOTS.length; i++) {
      const tau = MMD_KNOTS[i] as number;
      expect(last.mmdScale[i] as number).toBeGreaterThan(0);
      expect(last.mmdScale[i] as number).toBeLessThan(curve.parYield(tau, 2));
    }
  });

  it('moves the curve day to day without drifting off', () => {
    const changes: number[] = [];
    for (let i = 1; i < states.length; i++) {
      const previous = nssZero((states[i - 1] as FactorState).betas, 10);
      const current = nssZero((states[i] as FactorState).betas, 10);
      changes.push(Math.abs(current - previous) * 100);
    }
    const mean = changes.reduce((a, b) => a + b, 0) / changes.length;
    // Mean absolute daily change for a ~6 bp/day sigma is about 4.8 bp.
    expect(mean).toBeGreaterThan(2);
    expect(mean).toBeLessThan(9);
  });
});

describe('migrations over a year', () => {
  it('produces a plausible number of rating actions', () => {
    const e = engine(302);
    let state = e.seedState(SESSIONS[0] as number);
    let actions = 0;
    for (const date of SESSIONS) {
      const step = e.step(state, date);
      actions += step.migrations.length;
      state = step.state;
    }
    expect(actions).toBeGreaterThan(20);
    expect(actions).toBeLessThan(200);
  });

  it('clusters downgrades into the weeks credit widens', () => {
    const e = engine(303);
    let state = e.seedState(SESSIONS[0] as number);
    const days: { systematic: number; downgrades: number }[] = [];
    for (const date of SESSIONS) {
      const step = e.step(state, date);
      const downgrades = step.migrations.filter((m) => m.to > m.from).length;
      days.push({ systematic: step.state.credit.systematic, downgrades });
      state = step.state;
    }
    const sorted = [...days].sort((a, b) => a.systematic - b.systematic);
    const tenth = Math.floor(sorted.length / 4);
    const tightest = sorted.slice(0, tenth).reduce((a, d) => a + d.downgrades, 0);
    const widest = sorted.slice(-tenth).reduce((a, d) => a + d.downgrades, 0);
    // Independent chains would put these two roughly equal.
    expect(widest).toBeGreaterThan(tightest);
  });

  it('leaves defaults absorbed once they happen', () => {
    const e = engine(304);
    let state = e.seedState(SESSIONS[0] as number);
    let everDefaulted = new Set<number>();
    for (const date of SESSIONS) {
      state = e.step(state, date).state;
      for (const issuer of e.defaultedIssuers(state)) everDefaulted.add(issuer);
      for (const issuer of everDefaulted) {
        expect(state.ratings[issuer]).toBe(DEFAULT_INDEX);
      }
    }
  });

  it('reclassifies a downgraded issuer as high yield', () => {
    const e = engine(305);
    const state = e.seedState(SESSIONS[0] as number);
    const mask = e.highYieldMask(state);
    expect(mask[0]).toBe(0);
    expect(mask[400]).toBe(1);
    state.ratings[0] = 5;
    expect(e.highYieldMask(state)[0]).toBe(1);
  });
});

describe('issuer spreads', () => {
  it('starts at the base spread and moves with the factors', () => {
    const e = engine(306);
    const state = e.seedState(SESSIONS[0] as number);
    expect(e.issuerSpread(state, 3, 140)).toBeCloseTo(140, 8);
    const moved = e.step(state, SESSIONS[10] as number).state;
    expect(e.issuerSpread(moved, 3, 140)).not.toBeCloseTo(140, 8);
  });

  it('moves every issuer the same way on a systematic shock', () => {
    const e = engine(307);
    const state = e.seedState(SESSIONS[0] as number);
    const before = Array.from({ length: 20 }, (_, i) => e.issuerSpread(state, i, 150));
    state.credit.systematic = 0.4;
    const after = Array.from({ length: 20 }, (_, i) => e.issuerSpread(state, i, 150));
    for (let i = 0; i < 20; i++) expect(after[i]).toBeGreaterThan(before[i] as number);
  });
});

describe('bridgeBetas', () => {
  const open = { b0: 4.9, b1: -0.8, b2: -1.5, b3: 1.3 };
  const close = { b0: 5.0, b1: -0.9, b2: -1.6, b3: 1.4 };
  const sigmas = [0.9, 1.1, 1.8, 2.2];

  it('pins the open and the close exactly', () => {
    const draw = createNormalDraw(createRng(308));
    expect(bridgeBetas(open, close, 0, sigmas, draw)).toEqual(open);
    expect(bridgeBetas(open, close, 1, sigmas, draw)).toEqual(close);
  });

  it('stays between the endpoints, within a day of noise', () => {
    const draw = createNormalDraw(createRng(309));
    for (let i = 0; i < 500; i++) {
      const mid = bridgeBetas(open, close, 0.5, sigmas, draw);
      expect(Math.abs(mid.b0 - 4.95)).toBeLessThan(0.35);
    }
  });

  it('replays a day that converges on the persisted close', () => {
    const draw = createNormalDraw(createRng(310));
    let last = open;
    for (let step = 1; step <= 20; step++) {
      last = bridgeBetas(open, close, step / 20, sigmas, draw);
    }
    expect(last).toEqual(close);
  });
});
