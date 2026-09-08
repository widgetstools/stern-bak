/**
 * Fork the market and replay it.
 *
 * A real trading system has exactly one history. It can shock today's frozen
 * book by `DV01 x dy` and nothing more, because it has no model of why anything
 * moved. This service does: `FactorEngine.step` is a pure function of
 * `(state, date, seed)`, so a state can be forked and run forward again under a
 * different draw, and what comes back is not a shocked book — it is a different
 * but internally consistent history. Prepayments burn out differently, ratings
 * migrate in different weeks, spreads decompose differently.
 *
 * Two properties make the results trustworthy, and both are tested:
 *
 * **A null fork reproduces the actual path exactly.** Same seed, no shock, same
 * numbers to the last bit. If replay diverged from the recorded history, every
 * scenario built on it would be quietly wrong and nothing would say so.
 *
 * **Worlds are independent of each other and of their order.** Each derives its
 * own seed from `(baseSeed, worldIndex)`, so running one world or a thousand
 * gives the same answer for that world, and a scan can be cut short without
 * biasing what it has already found.
 */

import { addDays, type DateInt } from '../domain/core/dateInt.js';
import { deriveSeed } from '../domain/core/rng.js';
import type { Calendar } from '../domain/core/sifmaCalendar.js';
import { FactorEngine, type FactorState } from '../domain/curves/factorEngine.js';

/** A deliberate push applied to a world, on top of its own randomness. */
export interface FactorShock {
  /** Business day the shock lands on, relative to the fork. 0 is the first. */
  onDay?: number;
  /** Absolute moves on the curve factors, in percent. */
  level?: number;
  slope?: number;
  curvature?: number;
  /** Relative move in the systematic credit factor, in log space. */
  credit?: number;
  /** Scale applied to every random draw. 2 doubles the volatility. */
  volMultiplier?: number;
}

export interface ForkOptions {
  engine: FactorEngine;
  calendar: Calendar;
  /** The state to fork from — normally the live book's. */
  from: FactorState;
  /** Business days to replay. */
  horizonDays: number;
  /** Seed the worlds derive from. */
  seed: number;
  shock?: FactorShock;
}

export interface WorldPath {
  worldIndex: number;
  /** One state per replayed business day, in order. */
  states: FactorState[];
  /** Rating downgrades that fired along this path. */
  downgrades: number;
  /** Single-name credit jumps that fired. */
  creditJumps: number;
}

/** Advance a calendar date to the next business day. */
export function nextBusinessDay(calendar: Calendar, from: DateInt): DateInt {
  let cursor = addDays(from, 1);
  while (!calendar.isBusinessDay(cursor)) cursor = addDays(cursor, 1);
  return cursor;
}

/** The business days a replay will visit, computed once and shared. */
export function replayDates(calendar: Calendar, from: DateInt, horizonDays: number): DateInt[] {
  const dates: DateInt[] = [];
  let cursor = from;
  for (let i = 0; i < horizonDays; i++) {
    cursor = nextBusinessDay(calendar, cursor);
    dates.push(cursor);
  }
  return dates;
}

function applyShock(state: FactorState, shock: FactorShock): FactorState {
  const betas = {
    b0: state.betas.b0 + (shock.level ?? 0),
    b1: state.betas.b1 + (shock.slope ?? 0),
    b2: state.betas.b2 + (shock.curvature ?? 0),
    b3: state.betas.b3,
  };
  return {
    ...state,
    betas,
    credit: { ...state.credit, systematic: state.credit.systematic + (shock.credit ?? 0) },
  };
}

/**
 * Replay one world forward.
 *
 * The engine's seed is what makes a world a world: `deriveSeed(seed, 'world',
 * index)` gives each its own draw sequence while leaving the model, the
 * calendar and the starting state identical. World 0 with no shock is the
 * actual path, which is what the calibration test checks.
 */
export function replayWorld(options: ForkOptions, worldIndex: number, dates: readonly DateInt[]): WorldPath {
  const engine =
    worldIndex === 0
      ? options.engine
      : options.engine.withSeed(deriveSeed(options.seed, 'world', worldIndex));

  const shock = options.shock;
  let state = options.from;
  const states: FactorState[] = [];
  let downgrades = 0;
  let creditJumps = 0;

  for (const [day, date] of dates.entries()) {
    const stepped = engine.step(state, date, shock?.volMultiplier);
    state = stepped.state;
    downgrades += stepped.migrations.length;
    creditJumps += stepped.creditJumps;
    // The shock lands ON a day and persists, because it is a change to the
    // world and not a one-off bump that the next step would wash out.
    if (shock !== undefined && day === (shock.onDay ?? 0)) state = applyShock(state, shock);
    states.push(state);
  }
  return { worldIndex, states, downgrades, creditJumps };
}
