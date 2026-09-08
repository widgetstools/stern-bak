/**
 * The scenario surface, over HTTP.
 *
 * No rows cross this boundary. The service already IS the source of the book —
 * the grid on screen is fed by it — so a caller names a horizon and a world
 * count and the service scans its own copy. Every response carries the book's
 * fingerprint, so a caller can prove the numbers came from the book it is
 * looking at rather than from some other build.
 *
 * Requests are validated here rather than trusted, because the caller is a
 * language model: a horizon of a million days is a plausible thing for one to
 * ask for, and the answer should be a clamped scan rather than a hung service.
 */

import type { DateInt } from '../domain/core/dateInt.js';
import type { Calendar } from '../domain/core/sifmaCalendar.js';
import type { LiveBook } from '../datasets/LiveBook.js';
import { snapshotBook, type BookSnapshot } from '../scenario/bookSnapshot.js';
import { histogram, scanScenarios } from '../scenario/scanScenarios.js';
import type { FactorShock } from '../scenario/forkEngine.js';
import { factorExposure, reverseStress } from '../scenario/reverseStress.js';
import { nssDiscountCurve } from '../domain/curves/discount.js';
import { buildHedgeUniverse } from '../strategy/hedgeUniverse.js';
import { solveHedge, FACTOR_LABELS } from '../strategy/hedgeSolver.js';
import { overlayFromLegs } from '../strategy/hedgeOverlay.js';
import { ticketsFromLegs } from '../strategy/tickets.js';
import type { Route } from './router.js';

/** Caps. A scan is interactive or it is a background job; these keep it the first. */
const MAX_WORLDS = 1000;
const MAX_HORIZON_DAYS = 252;
const MAX_REPORT_WORST = 10;

function clamp(value: unknown, fallback: number, lo: number, hi: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(hi, Math.max(lo, Math.round(parsed)));
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function readShock(value: unknown): FactorShock | undefined {
  const raw = asRecord(value);
  if (Object.keys(raw).length === 0) return undefined;
  const shock: FactorShock = {};
  const num = (key: string): number | undefined => {
    const parsed = Number(raw[key]);
    return Number.isFinite(parsed) ? parsed : undefined;
  };
  const level = num('level');
  const slope = num('slope');
  const curvature = num('curvature');
  const credit = num('credit');
  const volMultiplier = num('volMultiplier');
  const onDay = num('onDay');
  if (level !== undefined) shock.level = level;
  if (slope !== undefined) shock.slope = slope;
  if (curvature !== undefined) shock.curvature = curvature;
  if (credit !== undefined) shock.credit = credit;
  if (volMultiplier !== undefined) shock.volMultiplier = Math.min(10, Math.max(0.1, volMultiplier));
  if (onDay !== undefined) shock.onDay = Math.max(0, Math.round(onDay));
  return Object.keys(shock).length === 0 ? undefined : shock;
}

export interface ScenarioDeps {
  book: LiveBook;
  calendar: Calendar;
  asOf: DateInt;
  seed: number;
}

/**
 * Snapshot the book as it stands right now.
 *
 * Taken per request rather than cached: the live feed moves prices every tick,
 * and a scenario run against a stale snapshot would answer a question about a
 * book the user is no longer looking at.
 */
function currentSnapshot(deps: ScenarioDeps): BookSnapshot {
  return snapshotBook(
    deps.book.positions(), deps.book.riskVectors(), deps.book.factorState(), deps.asOf,
  );
}

/**
 * Read a hedge target from a request.
 *
 * `null` and a missing entry mean different things and both are legitimate:
 * an omitted factor is unconstrained (hold it roughly where it is), and an
 * explicit number is a target to hit. A caller asking to "neutralise credit"
 * sends `{ credit: 0 }` and says nothing about the curve.
 */
function readTarget(value: unknown, bookGradient: readonly number[]): (number | null)[] {
  const raw = asRecord(value);
  return FACTOR_LABELS.map((label, index) => {
    const entry = raw[label];
    if (entry === undefined || entry === null) return null;
    if (typeof entry === 'string' && entry.toLowerCase() === 'hold') {
      return bookGradient[index] as number;
    }
    const parsed = Number(entry);
    return Number.isFinite(parsed) ? parsed : null;
  });
}

export function scenarioRoutes(deps: ScenarioDeps): Route[] {
  return [
    {
      method: 'GET',
      path: '/api/book/summary',
      handler: async () => {
        const snapshot = currentSnapshot(deps);
        const byBucket = new Map<string, { positions: number; marketValue: number }>();
        for (let i = 0; i < snapshot.positionCount; i++) {
          const bucket = snapshot.buckets[snapshot.bucketOf[i] as number] as string;
          const entry = byBucket.get(bucket) ?? { positions: 0, marketValue: 0 };
          entry.positions += 1;
          entry.marketValue += snapshot.baseValue[i] as number;
          byBucket.set(bucket, entry);
        }
        return {
          fingerprint: snapshot.fingerprint,
          asOf: snapshot.asOf,
          positionCount: snapshot.positionCount,
          marketValue: [...byBucket.values()].reduce((sum, e) => sum + e.marketValue, 0),
          byAssetClass: [...byBucket.entries()]
            .map(([bucket, entry]) => ({ assetClass: bucket, ...entry }))
            .sort((a, b) => b.marketValue - a.marketValue),
        };
      },
    },
    {
      method: 'POST',
      path: '/api/scenario/scan',
      handler: async (request) => {
        const body = asRecord(request.body);
        const snapshot = currentSnapshot(deps);
        const shock = readShock(body.shock);
        const result = await scanScenarios({
          fork: {
            engine: deps.book.engine(),
            calendar: deps.calendar,
            from: deps.book.factorState(),
            horizonDays: clamp(body.horizonDays, 20, 1, MAX_HORIZON_DAYS),
            seed: deps.seed,
          },
          book: snapshot,
          worlds: clamp(body.worlds, 200, 1, MAX_WORLDS),
          reportWorst: clamp(body.reportWorst, 3, 1, MAX_REPORT_WORST),
          ...(shock === undefined ? {} : { shock }),
        });
        return { ...result, distribution: histogram(result.terminalPnl) };
      },
    },
    {
      method: 'POST',
      path: '/api/scenario/worst',
      handler: async (request) => {
        // Reverse stress: not "apply a stored scenario" but "search for the
        // move that hurts THIS book most", which is a different answer for a
        // muni book than for a high yield one.
        const body = asRecord(request.body);
        const radius = Number(body.radius);
        return reverseStress({
          book: currentSnapshot(deps),
          horizonDays: clamp(body.horizonDays, 20, 1, MAX_HORIZON_DAYS),
          radius: Number.isFinite(radius) ? Math.min(6, Math.max(0.5, radius)) : 2.5,
        });
      },
    },
    {
      method: 'POST',
      path: '/api/strategy/solve',
      handler: async (request) => {
        // The closed loop in one call: solve a package against the live book,
        // then re-run the SAME worlds with it on. Solving and verifying in one
        // request is what guarantees both halves saw the same book — a second
        // call could land after a tick and quietly compare two different ones.
        const body = asRecord(request.body);
        const snapshot = currentSnapshot(deps);
        const exposure = factorExposure(snapshot);
        const state = deps.book.factorState();

        const universe = buildHedgeUniverse({
          securities: deps.book.securities(),
          spreadBpFor: deps.book.spreadFor,
          valuation: {
            asOf: deps.asOf, calendar: deps.calendar,
            curve: nssDiscountCurve(state.betas), mortgage: state.mortgage,
          },
        });

        const solved = solveHedge({
          bookGradient: exposure.gradient,
          candidates: universe,
          target: { gradient: readTarget(body.target, exposure.gradient) },
          ...(body.maxLegs === undefined ? {} : { maxLegs: clamp(body.maxLegs, 8, 1, 20) }),
        });
        const overlay = overlayFromLegs(solved.legs, state, deps.asOf);
        const name = typeof body.name === 'string' ? body.name : 'hedge package';
        const packaged = ticketsFromLegs(solved.legs, name, deps.seed);

        const shared = {
          fork: {
            engine: deps.book.engine(), calendar: deps.calendar, from: state,
            horizonDays: clamp(body.horizonDays, 20, 1, MAX_HORIZON_DAYS), seed: deps.seed,
          },
          book: snapshot,
          worlds: clamp(body.worlds, 200, 1, MAX_WORLDS),
          reportWorst: 1,
        };
        const before = await scanScenarios(shared);
        const after = await scanScenarios({ ...shared, hedge: overlay });
        const worstBefore = reverseStress({ book: snapshot, horizonDays: shared.fork.horizonDays });
        const worstAfter = reverseStress({
          book: snapshot, horizonDays: shared.fork.horizonDays, hedge: overlay,
        });

        return {
          name,
          bookFingerprint: snapshot.fingerprint,
          package: packaged,
          exposureBefore: Object.fromEntries(
            FACTOR_LABELS.map((label, i) => [label, exposure.gradient[i]]),
          ),
          exposureAfter: Object.fromEntries(
            FACTOR_LABELS.map((label, i) => [label, solved.hedgedGradient[i]]),
          ),
          coverage: Object.fromEntries(FACTOR_LABELS.map((label, i) => [label, solved.coverage[i]])),
          residual: Object.fromEntries(FACTOR_LABELS.map((label, i) => [label, solved.residual[i]])),
          narrative: solved.narrative,
          candidateCount: universe.length,
          // Measured on the SAME worlds, by the same code, with the package as
          // an overlay. Not a modelled hedge ratio — a controlled experiment.
          verification: {
            worlds: shared.worlds,
            horizonDays: shared.fork.horizonDays,
            before: { worst: before.worst, var95: before.var95, cvar95: before.cvar95, median: before.median, best: before.best },
            after: { worst: after.worst, var95: after.var95, cvar95: after.cvar95, median: after.median, best: after.best },
            worstCaseBefore: worstBefore.actualPnl,
            worstCaseAfter: worstAfter.actualPnl,
            distributionBefore: histogram(before.terminalPnl),
            distributionAfter: histogram(after.terminalPnl),
          },
          plausibility: before.plausibility,
        };
      },
    },
    {
      method: 'POST',
      path: '/api/scenario/fork',
      handler: async (request) => {
        // One named counterfactual rather than a distribution: replay the same
        // world with and without the shock and report the difference, which is
        // the shock's effect with every other draw held identical.
        const body = asRecord(request.body);
        const snapshot = currentSnapshot(deps);
        const shock = readShock(body.shock);
        if (shock === undefined) throw new Error('A fork needs a shock: level, slope, curvature, credit or volMultiplier');

        const shared = {
          fork: {
            engine: deps.book.engine(),
            calendar: deps.calendar,
            from: deps.book.factorState(),
            horizonDays: clamp(body.horizonDays, 20, 1, MAX_HORIZON_DAYS),
            seed: deps.seed,
          },
          book: snapshot,
          worlds: clamp(body.worlds, 1, 1, MAX_WORLDS),
          reportWorst: 1,
        };
        const actual = await scanScenarios(shared);
        const counterfactual = await scanScenarios({ ...shared, shock });
        return {
          name: typeof body.name === 'string' ? body.name : 'counterfactual',
          bookFingerprint: snapshot.fingerprint,
          actual: { median: actual.median, worst: actual.worst, worstWorlds: actual.worstWorlds },
          counterfactual: {
            median: counterfactual.median, worst: counterfactual.worst,
            worstWorlds: counterfactual.worstWorlds,
          },
          difference: {
            median: counterfactual.median - actual.median,
            worst: counterfactual.worst - actual.worst,
          },
          plausibility: counterfactual.plausibility,
        };
      },
    },
  ];
}
