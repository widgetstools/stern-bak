/**
 * Solve for a package of trades that meets a set of risk targets.
 *
 * A strategy is declared as constraints over the ACTUAL book — "neutralise my
 * credit exposure without changing duration" — and the solver finds the legs.
 * The analytics to do this exactly already exist, so this is a small
 * least-squares problem rather than a heuristic:
 *
 *     minimise  || W (A x - b) ||^2  +  lambda ||x||^2  +  mu ||x||_cost
 *
 * `A` is the candidates' sensitivities in the five-factor basis, `x` the
 * notionals in millions, `b` the residual risk to remove. Two penalties matter
 * more than they look:
 *
 * **Ridge (`lambda`).** Candidates on the same curve are nearly collinear — a
 * five-year and a seven-year note do almost the same thing — so an unpenalised
 * solve produces enormous offsetting legs that net to the right risk and would
 * cost a fortune to execute. The ridge term is what keeps the package small.
 *
 * **Cost (`mu`).** Weighting each candidate by its own bid-ask makes the solver
 * prefer the liquid leg when two would do, which is what a trader does.
 *
 * The result reports its RESIDUAL. A solve that cannot meet its targets says
 * how far short it fell rather than returning a package that looks complete —
 * a hedge that silently missed by 30% is worse than no hedge, because it is
 * believed.
 */

import { solveLinear } from '../domain/core/linalg.js';
import type { HedgeCandidate } from './hedgeUniverse.js';
import { executionCost } from './hedgeUniverse.js';

const FACTORS = 5;
/**
 * Weight on a factor the caller did not constrain.
 *
 * Small enough that a real target dominates it, large enough that the solver
 * will not destroy an exposure it was not asked to touch.
 */
const UNCONSTRAINED_WEIGHT = 0.15;
export const FACTOR_LABELS = ['level', 'slope', 'curvature', 'hump', 'credit'] as const;

export interface HedgeTarget {
  /**
   * Desired book gradient AFTER hedging, per factor. `0` means neutral;
   * `null` means unconstrained — leave that exposure alone.
   */
  gradient: (number | null)[];
  /** Relative importance per factor. Defaults to 1. */
  weights?: number[];
}

export interface SolveRequest {
  /** The book's current sensitivity, from `factorExposure`. */
  bookGradient: readonly number[];
  candidates: readonly HedgeCandidate[];
  target: HedgeTarget;
  /**
   * Ridge weight, in the unit-norm column basis. The fit terms there are order
   * one, so this is order 0.1 — not the order-10 value a raw-column basis
   * would want.
   */
  ridge?: number;
  /** Execution-cost weight, in the same units as the ridge. */
  costAversion?: number;
  /** Legs smaller than this are dropped as noise, in millions. */
  minLegMm?: number;
  /**
   * Most legs the package may contain. A solve over dozens of near-collinear
   * candidates spreads itself across all of them, which is optimal on paper and
   * unexecutable in practice — nobody works seventy-nine lines to hedge one
   * book. Defaults to eight.
   */
  maxLegs?: number;
  /**
   * Cap on any one leg, in millions. Defaults are per instrument kind, because
   * two billion of an on-the-run ten-year is an ordinary hedge, five billion of
   * CDX is a normal index line, and two billion of protection on one name is
   * not a trade anybody prints.
   */
  maxLegMm?: number;
}

export interface HedgeLeg {
  candidate: HedgeCandidate;
  /** Signed notional in millions. Negative is a sale or bought protection. */
  notionalMm: number;
  /** What this leg contributes to each factor. */
  gradient: number[];
  executionCost: number;
  carry: number;
}

export interface SolveResult {
  legs: HedgeLeg[];
  /** Book gradient after the package is applied. */
  hedgedGradient: number[];
  /** `hedged - target`, per constrained factor. Zero means fully met. */
  residual: (number | null)[];
  /** Fraction of the targeted exposure actually removed, per factor. */
  coverage: (number | null)[];
  totalExecutionCost: number;
  /** Annual carry given up (negative) or picked up (positive). */
  carryChange: number;
  grossNotionalMm: number;
  /** Plain-language account of what the solve could and could not do. */
  narrative: string;
}

/**
 * Candidate sensitivities, each scaled to unit norm.
 *
 * A ridge penalises `x` in whatever units the columns happen to be in, and
 * these columns differ by four orders of magnitude — a million of thirty-year
 * duration moves vastly more dollars than a million of spread. A single shared
 * penalty therefore either lets the small columns explode (scaled per
 * candidate) or crushes them to nothing (scaled globally); the first attempt
 * did each in turn. Normalising the columns and unscaling the solution
 * afterwards makes the penalty mean the same thing for every instrument.
 */
function scaledColumns(candidates: readonly HedgeCandidate[]): { columns: number[][]; norms: number[] } {
  const norms = candidates.map((candidate) =>
    Math.max(1e-9, Math.sqrt(candidate.gradient.reduce((sum, value) => sum + value * value, 0))),
  );
  return {
    columns: candidates.map((candidate, i) =>
      candidate.gradient.map((value) => value / (norms[i] as number)),
    ),
    norms,
  };
}

/**
 * Weighted ridge least squares, solved through the normal equations.
 *
 * Five factors and a few dozen candidates make `A'WA + lambda I` a small dense
 * matrix, so the normal equations are fine here and a QR would be ceremony.
 * The ridge guarantees the system is non-singular even when two candidates are
 * exactly collinear, which is the case that would otherwise blow up.
 */
export function solveHedge(request: SolveRequest, restricted = false): SolveResult {
  const { candidates, target } = request;
  const ridge = request.ridge ?? 0.08;
  const costAversion = request.costAversion ?? 1.5;
  const minLeg = request.minLegMm ?? 0.25;
  const capFor = (candidate: HedgeCandidate): number =>
    request.maxLegMm ??
    (candidate.instrumentKind === 'CDS'
      ? 500
      : candidate.instrumentKind === 'CDX'
        ? 5000
        : 2000);
  const { columns, norms } = scaledColumns(candidates);
  const n = candidates.length;

  // Residual to remove, per constrained factor.
  //
  // An UNCONSTRAINED factor is not a free one. Dropping its weight to zero lets
  // the solver wreck it for a fractional gain elsewhere — asked to halve curve
  // risk and left free on credit, an unweighted solve sold sixty-three CDS
  // lines and flipped the book from 1.1bn short credit to 1.6bn long. "Leave it
  // alone" means hold it where it is, at a low weight, not ignore it.
  const weights = FACTOR_LABELS.map((_, f) =>
    target.gradient[f] === null || target.gradient[f] === undefined
      ? UNCONSTRAINED_WEIGHT
      : target.weights?.[f] ?? 1,
  );
  const b = FACTOR_LABELS.map((_, f) =>
    target.gradient[f] === null || target.gradient[f] === undefined
      ? 0
      : (target.gradient[f] as number) - (request.bookGradient[f] as number),
  );

  if (n === 0) {
    return empty(request, 'No tradeable hedge instruments were available.');
  }

  // Normal equations with a ridge and a per-candidate execution-cost penalty.
  const matrix: number[][] = [];
  const rhs: number[] = [];
  const diagonal: number[] = [];
  for (let i = 0; i < n; i++) {
    const row = new Array<number>(n).fill(0);
    for (let j = 0; j < n; j++) {
      let value = 0;
      for (let f = 0; f < FACTORS; f++) {
        value += (weights[f] as number) * ((columns[i] as number[])[f] as number) *
          ((columns[j] as number[])[f] as number);
      }
      row[j] = value;
    }
    diagonal.push(row[i] as number);
    matrix.push(row);

    let value = 0;
    for (let f = 0; f < FACTORS; f++) {
      value += (weights[f] as number) * ((columns[i] as number[])[f] as number) * (b[f] as number);
    }
    rhs.push(value);
  }

  // The ridge is scaled by a GLOBAL measure of the fit terms, not by each
  // candidate's own diagonal. Scaling per candidate leaves a low-risk
  // instrument almost unregularised while its off-diagonal couplings stay
  // large, so the solve blows up on exactly the instruments that cannot hedge
  // anything — which is how a first attempt came to sell two billion of
  // four-week bills to shorten duration.
  // Columns are unit-norm, so the fit terms are order one and a fixed penalty
  // means the same thing for every instrument. The reference is kept for the
  // degenerate case where every weight is zero.
  const reference = Math.max(1e-6, diagonal.reduce((sum, value) => sum + value, 0) / n);
  for (let i = 0; i < n; i++) {
    const row = matrix[i] as number[];
    row[i] = (row[i] as number) + reference *
      (ridge + costAversion * (candidates[i] as HedgeCandidate).halfSpreadPoints);
  }

  let solution: number[];
  try {
    solution = solveLinear(matrix, rhs);
  } catch {
    return empty(request, 'The constraint system could not be solved.');
  }

  const legs: HedgeLeg[] = [];
  for (const [index, scaled] of solution.entries()) {
    // Back out of the unit-norm basis the solve ran in.
    const raw = scaled / (norms[index] as number);
    if (!Number.isFinite(raw)) continue;
    const candidate = candidates[index] as HedgeCandidate;
    const cap = capFor(candidate);
    const clamped = Math.max(-cap, Math.min(cap, raw));
    const notionalMm = Math.round(clamped * 4) / 4;
    if (Math.abs(notionalMm) < minLeg) continue;
    legs.push({
      candidate,
      notionalMm,
      gradient: candidate.gradient.map((value) => value * notionalMm),
      executionCost: executionCost(candidate, notionalMm),
      carry: candidate.carryPerMm * notionalMm,
    });
  }

  // Second stage: keep the largest legs and re-solve restricted to them.
  //
  // Pruning without re-solving would leave the package under-hedged by whatever
  // the dropped legs were carrying. Re-solving lets the survivors take it up,
  // and because they are the ones the first pass leaned on hardest, they
  // usually can.
  const maxLegs = request.maxLegs ?? 8;
  if (legs.length > maxLegs && !restricted) {
    // Rank by the share of each factor's NEED a leg fills, not by its notional.
    // Notional favours whichever factor has the largest gradient: asked to
    // neutralise everything, a size ranking kept six Treasuries and left credit
    // entirely unhedged, because a billion of duration dwarfs a billion of
    // spread in absolute terms while being no more useful.
    const need = b.map((value) => Math.max(Math.abs(value), 1));
    const score = (leg: HedgeLeg): number =>
      leg.gradient.reduce(
        (sum, value, f) => sum + (weights[f] as number) * Math.abs(value) / (need[f] as number),
        0,
      );

    // Round-robin across the CONSTRAINED factors before filling by overall
    // score. A pure score ranking starves whichever factor has the smallest
    // per-million sensitivity: asked to neutralise everything, it kept six
    // Treasuries and hedged no credit at all, because a million of duration
    // moves more dollars than a million of spread and always outranks it.
    const constrained = weights
      .map((weight, f) => ({ weight, f }))
      .filter((entry) => entry.weight >= 1 && Math.abs(b[entry.f] as number) > 0)
      .map((entry) => entry.f);
    const pool = [...legs];
    const chosen: HedgeLeg[] = [];
    let round = 0;
    while (chosen.length < maxLegs && pool.length > 0) {
      const factor = constrained.length === 0 ? null : constrained[round % constrained.length] as number;
      const rank = (leg: HedgeLeg): number =>
        factor === null
          ? score(leg)
          : Math.abs(leg.gradient[factor] as number) / (need[factor] as number);
      let bestIndex = 0;
      for (let i = 1; i < pool.length; i++) {
        if (rank(pool[i] as HedgeLeg) > rank(pool[bestIndex] as HedgeLeg)) bestIndex = i;
      }
      chosen.push(...pool.splice(bestIndex, 1));
      round += 1;
    }
    const keep = chosen.map((leg) => leg.candidate);
    // Relax the ridge on the restricted solve. It exists to tame collinearity
    // among dozens of near-identical candidates; six instruments barely have
    // any, and carrying the full penalty through leaves the package
    // deliberately under-hedged.
    return solveHedge(
      { ...request, candidates: keep, ridge: ridge / 8, costAversion: costAversion / 4 },
      true,
    );
  }

  return summarise(request, legs);
}

function empty(request: SolveRequest, reason: string): SolveResult {
  return {
    legs: [],
    hedgedGradient: [...request.bookGradient],
    residual: request.target.gradient.map((value, f) =>
      value === null ? null : (request.bookGradient[f] as number) - value,
    ),
    coverage: request.target.gradient.map((value) => (value === null ? null : 0)),
    totalExecutionCost: 0,
    carryChange: 0,
    grossNotionalMm: 0,
    narrative: reason,
  };
}

function summarise(request: SolveRequest, legs: readonly HedgeLeg[]): SolveResult {
  const hedgedGradient = FACTOR_LABELS.map((_, f) =>
    legs.reduce((sum, leg) => sum + (leg.gradient[f] as number), request.bookGradient[f] as number),
  );
  const residual = request.target.gradient.map((value, f) =>
    value === null || value === undefined ? null : (hedgedGradient[f] as number) - value,
  );
  const coverage = request.target.gradient.map((value, f) => {
    if (value === null || value === undefined) return null;
    const before = Math.abs((request.bookGradient[f] as number) - value);
    if (before === 0) return 1;
    return 1 - Math.abs(residual[f] as number) / before;
  });

  const totalExecutionCost = legs.reduce((sum, leg) => sum + leg.executionCost, 0);
  const carryChange = legs.reduce((sum, leg) => sum + leg.carry, 0);
  const grossNotionalMm = legs.reduce((sum, leg) => sum + Math.abs(leg.notionalMm), 0);

  return {
    legs: [...legs].sort((a, b) => Math.abs(b.notionalMm) - Math.abs(a.notionalMm)),
    hedgedGradient,
    residual,
    coverage,
    totalExecutionCost,
    carryChange,
    grossNotionalMm,
    narrative: narrate(legs, coverage, totalExecutionCost, carryChange),
  };
}

function narrate(
  legs: readonly HedgeLeg[],
  coverage: readonly (number | null)[],
  cost: number,
  carry: number,
): string {
  const shortfall = coverage
    .map((value, f) => ({ value, label: FACTOR_LABELS[f] as string }))
    .filter((entry): entry is { value: number; label: string } =>
      entry.value !== null && entry.value < 0.95);

  if (legs.length === 0) {
    // Zero legs because nothing was needed and zero legs because nothing on
    // offer could help are completely different answers, and reporting the
    // second as the first is how a book goes unhedged while looking fine.
    if (shortfall.length === 0) return 'No package was needed: the book already meets the targets.';
    return (
      `No package could be built: nothing in the tradeable universe moves ` +
      `${shortfall.map((entry) => entry.label).join(', ')}. The exposure is unchanged.`
    );
  }
  const short = shortfall;
  const parts = [
    `${legs.length} leg${legs.length === 1 ? '' : 's'}, ` +
    `${legs.reduce((sum, leg) => sum + Math.abs(leg.notionalMm), 0).toFixed(0)}mm gross.`,
  ];
  if (short.length === 0) {
    parts.push('Every target was met to within 5%.');
  } else {
    parts.push(
      `Short on ${short.map((entry) => `${entry.label} (${Math.round(entry.value * 100)}% covered)`).join(', ')}` +
      ' — the tradeable universe cannot fully express that exposure.',
    );
  }
  parts.push(
    `Costs ${(cost / 1000).toFixed(0)}k to execute and ` +
    `${carry >= 0 ? 'picks up' : 'gives up'} ${Math.abs(carry / 1e6).toFixed(2)}mm of annual carry.`,
  );
  return parts.join(' ');
}
