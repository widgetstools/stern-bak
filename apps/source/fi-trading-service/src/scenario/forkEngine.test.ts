import { describe, expect, it } from 'vitest';
import { SifmaCalendar } from '../domain/core/sifmaCalendar.js';
import { buildBook, DEMO_SCALE, scaleBook } from '../domain/book/bookBuilder.js';
import { nextBusinessDay, replayDates, replayWorld, type ForkOptions } from './forkEngine.js';

const calendar = new SifmaCalendar();
const book = buildBook({
  asOf: 20260907, calendar, seed: 20260907, scale: scaleBook(DEMO_SCALE, 0.15),
});

function options(over: Partial<ForkOptions> = {}): ForkOptions {
  return {
    engine: book.engine, calendar, from: book.state, horizonDays: 10, seed: 20260907, ...over,
  };
}

describe('nextBusinessDay', () => {
  it('steps over a weekend', () => {
    expect(nextBusinessDay(calendar, 20260911)).toBe(20260914);
  });

  it('steps over Thanksgiving', () => {
    // Thanksgiving 2026 is Thursday 26 November; the market reopens Friday.
    expect(nextBusinessDay(calendar, 20261125)).toBe(20261127);
  });
});

describe('replayDates', () => {
  it('returns exactly the requested number of business days, ascending', () => {
    const dates = replayDates(calendar, 20260907, 15);
    expect(dates).toHaveLength(15);
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i] as number).toBeGreaterThan(dates[i - 1] as number);
    }
    for (const date of dates) expect(calendar.isBusinessDay(date)).toBe(true);
  });

  it('returns nothing for a zero horizon', () => {
    expect(replayDates(calendar, 20260907, 0)).toEqual([]);
  });
});

describe('replayWorld', () => {
  const dates = replayDates(calendar, 20260907, 10);

  /**
   * The calibration test. If a replayed world 0 diverged from the history the
   * engine actually produced, every scenario built on the fork would be
   * quietly wrong and nothing downstream would notice.
   */
  it('reproduces the actual path EXACTLY when nothing is shocked', () => {
    const world = replayWorld(options(), 0, dates);
    let actual = book.state;
    for (const [index, date] of dates.entries()) {
      actual = book.engine.step(actual, date).state;
      const replayed = world.states[index];
      expect(replayed?.betas).toEqual(actual.betas);
      expect(replayed?.credit.systematic).toBe(actual.credit.systematic);
      expect(replayed?.asOf).toBe(actual.asOf);
    }
  });

  it('gives every other world a different history', () => {
    const zero = replayWorld(options(), 0, dates);
    const one = replayWorld(options(), 1, dates);
    const two = replayWorld(options(), 2, dates);
    const last = (path: typeof zero): number => (path.states[path.states.length - 1]?.betas.b0 ?? 0);
    expect(last(one)).not.toBe(last(zero));
    expect(last(two)).not.toBe(last(one));
  });

  it('makes a world depend on its index alone, not on how many were run', () => {
    const alone = replayWorld(options(), 7, dates);
    for (let i = 0; i < 7; i++) replayWorld(options(), i, dates);
    const afterOthers = replayWorld(options(), 7, dates);
    expect(afterOthers.states.map((s) => s.betas.b0)).toEqual(alone.states.map((s) => s.betas.b0));
  });

  it('produces one state per replayed day, dated in order', () => {
    const world = replayWorld(options(), 3, dates);
    expect(world.states).toHaveLength(dates.length);
    expect(world.states.map((state) => state.asOf)).toEqual(dates);
    expect(world.worldIndex).toBe(3);
  });

  it('applies a level shock and keeps it — a world changed, not a bump', () => {
    const shocked = replayWorld(options({ shock: { level: 1, onDay: 0 } }), 0, dates);
    const plain = replayWorld(options(), 0, dates);
    const gap = (day: number): number =>
      (shocked.states[day]?.betas.b0 ?? 0) - (plain.states[day]?.betas.b0 ?? 0);
    expect(gap(0)).toBeCloseTo(1, 10);
    // It persists rather than washing out on the next step.
    expect(gap(dates.length - 1)).toBeGreaterThan(0.5);
  });

  it('lands the shock on the day it is aimed at, and not before', () => {
    const shocked = replayWorld(options({ shock: { level: 1, onDay: 4 } }), 0, dates);
    const plain = replayWorld(options(), 0, dates);
    expect(shocked.states[3]?.betas.b0).toBe(plain.states[3]?.betas.b0);
    expect((shocked.states[4]?.betas.b0 ?? 0) - (plain.states[4]?.betas.b0 ?? 0)).toBeCloseTo(1, 10);
  });

  it('widens the credit factor when the shock says so', () => {
    const shocked = replayWorld(options({ shock: { credit: 0.4, onDay: 0 } }), 0, dates);
    const plain = replayWorld(options(), 0, dates);
    expect(shocked.states[0]?.credit.systematic)
      .toBeCloseTo((plain.states[0]?.credit.systematic ?? 0) + 0.4, 10);
  });

  it('shocks slope and curvature independently of level', () => {
    const plain = replayWorld(options(), 0, dates);
    const tilted = replayWorld(options({ shock: { slope: -0.5, curvature: 0.3 } }), 0, dates);
    expect(tilted.states[0]?.betas.b0).toBe(plain.states[0]?.betas.b0);
    expect((tilted.states[0]?.betas.b1 ?? 0) - (plain.states[0]?.betas.b1 ?? 0)).toBeCloseTo(-0.5, 10);
    expect((tilted.states[0]?.betas.b2 ?? 0) - (plain.states[0]?.betas.b2 ?? 0)).toBeCloseTo(0.3, 10);
  });

  it('spreads the factors further under a raised volatility multiplier', () => {
    const spread = (multiplier: number | undefined): number => {
      const values: number[] = [];
      for (let world = 1; world <= 40; world++) {
        const shock = multiplier === undefined ? undefined : { volMultiplier: multiplier };
        const path = replayWorld(options(shock === undefined ? {} : { shock }), world, dates);
        values.push(path.states[path.states.length - 1]?.betas.b0 ?? 0);
      }
      const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
      return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
    };
    expect(spread(3)).toBeGreaterThan(spread(undefined) * 1.5);
  });

  it('counts the downgrades and single-name jumps along a path', () => {
    // Jumps and downgrades are rare per issuer per day, so a single 40-day
    // world can legitimately see none. The property is that the processes are
    // live across worlds, not that any one world fires.
    const dates40 = replayDates(calendar, 20260907, 40);
    let jumps = 0;
    let downgrades = 0;
    for (let world = 1; world <= 12; world++) {
      const path = replayWorld(options({ horizonDays: 40 }), world, dates40);
      jumps += path.creditJumps;
      downgrades += path.downgrades;
      expect(path.creditJumps).toBeGreaterThanOrEqual(0);
    }
    expect(jumps).toBeGreaterThan(0);
    expect(downgrades).toBeGreaterThan(0);
  });
});
