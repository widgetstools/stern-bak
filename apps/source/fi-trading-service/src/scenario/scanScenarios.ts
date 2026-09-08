/**
 * Run many forked worlds against one book and describe what came back.
 *
 * The output is a distribution, not a number. A single stress figure says what
 * happens under one guess; a distribution over hundreds of internally
 * consistent worlds says how bad things plausibly get and how often, and
 * carries the worst ones back with enough detail to explain WHY this book was
 * exposed to them.
 *
 * **Plausibility is the whole claim.** These worlds are not arbitrary corners
 * of factor space — each is a genuine draw from the model's own dynamics, so a
 * tail here is a tail the model actually produces rather than one an operator
 * dialled in. `plausibility` reports the bound so a reader can judge it.
 *
 * **It yields.** The service publishes live rows every 40 ms against an 8 ms
 * budget and holds a 10 s heartbeat, so a multi-second scan that never gave the
 * event loop a turn would stall the feed and trip client watchdogs. The loop
 * hands control back between worlds, the same way `pumpSnapshot` does.
 */

import type { Calendar } from '../domain/core/sifmaCalendar.js';
import type { FactorState } from '../domain/curves/factorEngine.js';
import { nssZero } from '../domain/curves/nss.js';
import { baseMarketValue, type BookSnapshot } from './bookSnapshot.js';
import { createRevalResult, revalue, revaluePositions } from './fastReval.js';
import { replayDates, replayWorld, type ForkOptions, type FactorShock } from './forkEngine.js';

/** Worlds between event-loop yields. Small enough to keep the feed alive. */
const YIELD_EVERY_WORLDS = 8;

export interface ScanRequest {
  fork: Omit<ForkOptions, 'from'> & { from: FactorState };
  book: BookSnapshot;
  worlds: number;
  /** An overlay revalued alongside the book, for a verified hedge. */
  hedge?: BookSnapshot;
  /** How many worst worlds to describe in full. */
  reportWorst?: number;
  shock?: FactorShock;
}

export interface WorldOutcome {
  worldIndex: number;
  /** P&L at the end of the horizon, in currency. */
  terminalPnl: number;
  /** The worst mark-to-market along the path, not just at the end. */
  worstPnl: number;
  worstOnDay: number;
  downgrades: number;
  creditJumps: number;
  /** Ten-year zero rate at the start and end of the path, in percent. */
  tenYearFrom: number;
  tenYearTo: number;
  creditFrom: number;
  creditTo: number;
}

export interface BucketContribution {
  bucket: string;
  pnl: number;
  /** Share of the world's loss, as a fraction. Negative when it offset. */
  share: number;
}

export interface PositionContribution {
  positionId: string;
  description: string;
  bucket: string;
  pnl: number;
}

export interface WorstWorld extends WorldOutcome {
  byBucket: BucketContribution[];
  worstPositions: PositionContribution[];
}

export interface ScanResult {
  bookFingerprint: string;
  positionCount: number;
  baseMarketValue: number;
  worlds: number;
  horizonDays: number;
  /** Terminal P&L per world, ordered by world index. */
  terminalPnl: number[];
  mean: number;
  median: number;
  /** Fifth percentile of terminal P&L — the conventional loss threshold. */
  var95: number;
  /** Mean of the worst 5% — expected shortfall. */
  cvar95: number;
  best: number;
  worst: number;
  worstWorlds: WorstWorld[];
  plausibility: string;
  elapsedMs: number;
  /** Stated, because a fast-path number and an exact one are not the same claim. */
  revaluation: 'fast-path';
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(fraction * (sorted.length - 1))));
  return sorted[index] as number;
}

/** Yield to the event loop so the live feed keeps publishing during a scan. */
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

export async function scanScenarios(request: ScanRequest): Promise<ScanResult> {
  const started = Date.now();
  const { book, fork } = request;
  const dates = replayDates(fork.calendar, fork.from.asOf, fork.horizonDays);
  const worldCount = Math.max(1, request.worlds);
  const reportWorst = Math.max(1, request.reportWorst ?? 3);

  const scratch = createRevalResult(book);
  const outcomes: WorldOutcome[] = [];
  // Paths for the worlds that end up reported; the rest are discarded as we go,
  // because holding 500 x 63 states would cost more memory than the scan does.
  const keptPaths = new Map<number, FactorState[]>();

  for (let world = 0; world < worldCount; world++) {
    const path = replayWorld({ ...fork, ...(request.shock === undefined ? {} : { shock: request.shock }) }, world, dates);

    let worstPnl = Number.POSITIVE_INFINITY;
    let worstOnDay = 0;
    let terminal = 0;
    for (const [day, state] of path.states.entries()) {
      revalue(book, state, scratch, request.hedge);
      terminal = scratch.totalPnl;
      if (scratch.totalPnl < worstPnl) {
        worstPnl = scratch.totalPnl;
        worstOnDay = day;
      }
    }

    const first = path.states[0] as FactorState;
    const last = path.states[path.states.length - 1] as FactorState;
    outcomes.push({
      worldIndex: world,
      terminalPnl: terminal,
      worstPnl: worstPnl === Number.POSITIVE_INFINITY ? 0 : worstPnl,
      worstOnDay,
      downgrades: path.downgrades,
      creditJumps: path.creditJumps,
      tenYearFrom: nssZero(first.betas, 10),
      tenYearTo: nssZero(last.betas, 10),
      creditFrom: first.credit.systematic,
      creditTo: last.credit.systematic,
    });
    keptPaths.set(world, path.states);
    // Keep only enough paths to describe the worst few.
    if (keptPaths.size > reportWorst * 4) {
      const ranked = [...outcomes].sort((a, b) => a.terminalPnl - b.terminalPnl)
        .slice(0, reportWorst * 2).map((outcome) => outcome.worldIndex);
      const keep = new Set(ranked);
      for (const index of keptPaths.keys()) if (!keep.has(index)) keptPaths.delete(index);
    }

    if (world % YIELD_EVERY_WORLDS === YIELD_EVERY_WORLDS - 1) await yieldToEventLoop();
  }

  const terminalPnl = outcomes.map((outcome) => outcome.terminalPnl);
  const sorted = [...terminalPnl].sort((a, b) => a - b);
  const tailSize = Math.max(1, Math.round(sorted.length * 0.05));
  const cvar = sorted.slice(0, tailSize).reduce((sum, value) => sum + value, 0) / tailSize;

  const worstWorlds = [...outcomes]
    .sort((a, b) => a.terminalPnl - b.terminalPnl)
    .slice(0, reportWorst)
    .map((outcome) => describeWorld(outcome, keptPaths.get(outcome.worldIndex), book, request.hedge));

  return {
    bookFingerprint: book.fingerprint,
    positionCount: book.positionCount,
    baseMarketValue: baseMarketValue(book),
    worlds: worldCount,
    horizonDays: fork.horizonDays,
    terminalPnl,
    mean: terminalPnl.reduce((sum, value) => sum + value, 0) / Math.max(1, terminalPnl.length),
    median: percentile(sorted, 0.5),
    var95: percentile(sorted, 0.05),
    cvar95: cvar,
    best: sorted[sorted.length - 1] ?? 0,
    worst: sorted[0] ?? 0,
    worstWorlds,
    plausibility: describePlausibility(request),
    elapsedMs: Date.now() - started,
    revaluation: 'fast-path',
  };
}

function describeWorld(
  outcome: WorldOutcome,
  states: FactorState[] | undefined,
  book: BookSnapshot,
  hedge?: BookSnapshot,
): WorstWorld {
  const terminal = states?.[states.length - 1];
  if (terminal === undefined) return { ...outcome, byBucket: [], worstPositions: [] };

  const scratch = createRevalResult(book);
  revalue(book, terminal, scratch, hedge);
  const total = scratch.totalPnl;
  const byBucket: BucketContribution[] = book.buckets
    .map((bucket, index) => ({
      bucket,
      pnl: scratch.byBucket[index] as number,
      share: total === 0 ? 0 : (scratch.byBucket[index] as number) / total,
    }))
    .sort((a, b) => a.pnl - b.pnl);

  const perPosition = revaluePositions(book, terminal);
  const ranked = [...perPosition.keys()]
    .sort((a, b) => (perPosition[a] as number) - (perPosition[b] as number))
    .slice(0, 8)
    .map((index) => ({
      positionId: book.positionId[index] as string,
      description: book.description[index] as string,
      bucket: book.buckets[book.bucketOf[index] as number] as string,
      pnl: perPosition[index] as number,
    }));

  return { ...outcome, byBucket, worstPositions: ranked };
}

function describePlausibility(request: ScanRequest): string {
  const shock = request.shock;
  const base =
    `${request.worlds} worlds drawn from the model's own dynamics over ` +
    `${request.fork.horizonDays} business days; each factor path is a draw from its ` +
    `stationary distribution, not a hand-set corner of factor space`;
  if (shock === undefined) return base;
  const parts: string[] = [];
  if (shock.level !== undefined) parts.push(`level ${(shock.level * 100).toFixed(0)}bp`);
  if (shock.slope !== undefined) parts.push(`slope ${(shock.slope * 100).toFixed(0)}bp`);
  if (shock.curvature !== undefined) parts.push(`curvature ${(shock.curvature * 100).toFixed(0)}bp`);
  if (shock.credit !== undefined) parts.push(`credit ${(shock.credit * 100).toFixed(0)}% relative`);
  if (shock.volMultiplier !== undefined) parts.push(`volatility x${shock.volMultiplier}`);
  return `${base}, with an imposed shock (${parts.join(', ')}) on day ${shock.onDay ?? 0}`;
}

/** Bucket a P&L distribution for a histogram. */
export function histogram(values: readonly number[], bins = 24): { from: number; to: number; count: number }[] {
  if (values.length === 0) return [];
  const low = Math.min(...values);
  const high = Math.max(...values);
  if (high === low) return [{ from: low, to: high, count: values.length }];
  const width = (high - low) / bins;
  const counts = new Array<number>(bins).fill(0);
  for (const value of values) {
    const index = Math.min(bins - 1, Math.floor((value - low) / width));
    counts[index] = (counts[index] as number) + 1;
  }
  return counts.map((count, index) => ({
    from: low + index * width, to: low + (index + 1) * width, count,
  }));
}
