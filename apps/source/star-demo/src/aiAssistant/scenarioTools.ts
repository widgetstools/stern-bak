/**
 * The scenario tools: fork the market, scan the worlds, find the worst move.
 *
 * What makes these different from every other risk tool is that they do not
 * shock a frozen book. The service re-runs its factor model under a different
 * draw, so a scenario is a genuinely different history rather than a
 * first-order bump — prepayments burn out differently, ratings migrate in
 * different weeks, spreads decompose differently. That is the capability, and
 * the summaries say so, because a model told only "the book lost 900mm" will
 * describe it as a stress test.
 *
 * All three return a `SCENARIO_CELL` payload. The assistant cannot render
 * model-authored markup — the block vocabulary IS the vocabulary — so results
 * come back as structured payloads with a trusted renderer, exactly as
 * `DATA_CELL` and `FIELD_CELL` already do.
 */
import {
  fetchBookSummary, findWorstMove, forkMarket, runScan, ScenarioServiceError,
  type BucketContribution, type ForkResponse, type PositionContribution,
  type ScanResponse, type WorstMoveResponse,
} from './scenarioClient';
import type { ToolExecutionResult } from './toolResult';

/** Marker the transcript keys on to render a scenario cell instead of raw JSON. */
export const SCENARIO_CELL = 'scenario-cell' as const;

export type ScenarioCellKind = 'scan' | 'worst-move' | 'fork';

export interface ScenarioCellPayload {
  kind: typeof SCENARIO_CELL;
  view: ScenarioCellKind;
  /** Which book this ran against, so a number can be traced to a book. */
  bookFingerprint: string;
  positionCount: number;
  baseMarketValue: number;
  headline: string;
  plausibility: string;
  /** Present for `scan`. */
  scan?: ScanResponse;
  /** Present for `worst-move`. */
  worstMove?: WorstMoveResponse;
  /** Present for `fork`. */
  fork?: ForkResponse;
  elapsedMs?: number;
}

export interface ScenarioToolDeps {
  /** Where the trading service lives. Editable, like the model's base URL. */
  baseUrl: () => string;
}

const MM = 1_000_000;

/** Currency in millions, the unit a fixed-income desk actually speaks. */
function mm(value: number): string {
  const millions = value / MM;
  const sign = millions < 0 ? '-' : '+';
  return `${sign}$${Math.abs(millions).toFixed(1)}mm`;
}

function bucketLine(buckets: readonly BucketContribution[], limit = 3): string {
  return buckets
    .slice(0, limit)
    .map((bucket) => `${bucket.bucket} ${mm(bucket.pnl)} (${Math.round(bucket.share * 100)}%)`)
    .join(', ');
}

function positionLine(positions: readonly PositionContribution[], limit = 3): string {
  return positions.slice(0, limit).map((p) => `${p.description} ${mm(p.pnl)}`).join('; ');
}

/** Turn a service outage into a repairable failure rather than a thrown stack. */
function failed(error: unknown): ToolExecutionResult {
  if (error instanceof ScenarioServiceError) return { ok: false, summary: error.message };
  return { ok: false, summary: `The scenario run failed: ${String(error)}` };
}

export function createScenarioTools(deps: ScenarioToolDeps) {
  return {
    /** What is in the book right now — the thing every scenario runs against. */
    async describeBook(): Promise<ToolExecutionResult> {
      try {
        const summary = await fetchBookSummary(deps.baseUrl());
        const top = summary.byAssetClass
          .slice(0, 4)
          .map((bucket) => `${bucket.assetClass} ${mm(bucket.marketValue)}`)
          .join(', ');
        return {
          ok: true,
          summary:
            `${summary.positionCount} positions, ${mm(summary.marketValue)} of market value ` +
            `across ${summary.byAssetClass.length} asset classes. Largest: ${top}.`,
          data: summary,
        };
      } catch (error) {
        return failed(error);
      }
    },

    /**
     * Fork N worlds off the live factor state and replay them.
     *
     * The distribution is the answer, not the mean. `worstWorlds` carries the
     * factor path that produced each tail outcome, which is what lets the model
     * say WHY rather than only how much.
     */
    async runScenarios(args: {
      worlds?: number;
      horizonDays?: number;
      reportWorst?: number;
      shock?: ScenarioShockArgs;
    }): Promise<ToolExecutionResult> {
      try {
        const scan = await runScan(deps.baseUrl(), {
          ...(args.worlds === undefined ? {} : { worlds: args.worlds }),
          ...(args.horizonDays === undefined ? {} : { horizonDays: args.horizonDays }),
          ...(args.reportWorst === undefined ? {} : { reportWorst: args.reportWorst }),
          ...(args.shock === undefined ? {} : { shock: args.shock }),
        });
        const worst = scan.worstWorlds[0];
        const headline =
          `${scan.worlds} forked worlds over ${scan.horizonDays} business days: ` +
          `median ${mm(scan.median)}, 5th percentile ${mm(scan.var95)}, ` +
          `expected shortfall ${mm(scan.cvar95)}, worst ${mm(scan.worst)}.`;
        const why = worst === undefined
          ? ''
          : ` The worst world had the ten-year at ${worst.tenYearFrom.toFixed(2)}% going to ` +
            `${worst.tenYearTo.toFixed(2)}% with ${worst.downgrades} downgrades, led by ` +
            `${bucketLine(worst.byBucket, 2)}.`;
        return {
          ok: true,
          summary: `${headline}${why} These are re-simulated histories, not bumps to today's book.`,
          data: {
            kind: SCENARIO_CELL,
            view: 'scan',
            bookFingerprint: scan.bookFingerprint,
            positionCount: scan.positionCount,
            baseMarketValue: scan.baseMarketValue,
            headline,
            plausibility: scan.plausibility,
            scan,
            elapsedMs: scan.elapsedMs,
          } satisfies ScenarioCellPayload,
        };
      } catch (error) {
        return failed(error);
      }
    },

    /**
     * Search the factor space for the move that hurts THIS book most.
     *
     * The distinction worth preserving in the summary: a stored scenario asks
     * what a past crisis does to your book; this asks what your book is
     * exposed to, and the answer is different for a muni book than a
     * high-yield one.
     */
    async findWorstCase(args: { horizonDays?: number; radius?: number }): Promise<ToolExecutionResult> {
      try {
        const worst = await findWorstMove(deps.baseUrl(), {
          ...(args.horizonDays === undefined ? {} : { horizonDays: args.horizonDays }),
          ...(args.radius === undefined ? {} : { radius: args.radius }),
        });
        const headline =
          `Worst plausible move over ${worst.horizonDays} business days at ` +
          `${worst.radius} standard deviations: the ten-year ` +
          `${worst.tenYearMoveBp >= 0 ? '+' : ''}${worst.tenYearMoveBp.toFixed(0)}bp with credit ` +
          `${worst.creditWideningPct >= 0 ? 'widening' : 'tightening'} ` +
          `${Math.abs(worst.creditWideningPct).toFixed(0)}%, costing ${mm(worst.actualPnl)}.`;
        return {
          ok: true,
          summary:
            `${headline} ${worst.explanation} Led by ${bucketLine(worst.byBucket)}. ` +
            `Worst positions: ${positionLine(worst.worstPositions)}. ` +
            `Convexity moved it ${mm(worst.convexityEffect)} against the linear estimate.`,
          data: {
            kind: SCENARIO_CELL,
            view: 'worst-move',
            bookFingerprint: worst.bookFingerprint,
            positionCount: 0,
            baseMarketValue: 0,
            headline,
            plausibility: worst.plausibility,
            worstMove: worst,
          } satisfies ScenarioCellPayload,
        };
      } catch (error) {
        return failed(error);
      }
    },

    /**
     * One named counterfactual, replayed with every other draw held identical.
     *
     * This is the tool that answers "re-run March with the CPI print 30bp
     * hotter". Because the same world is replayed with and without the shock,
     * the difference IS the shock's effect — not a shock plus whatever else
     * the random draw happened to do.
     */
    async forkMarket(args: {
      name?: string;
      horizonDays?: number;
      worlds?: number;
      shock: ScenarioShockArgs;
    }): Promise<ToolExecutionResult> {
      try {
        const fork = await forkMarket(deps.baseUrl(), {
          ...(args.name === undefined ? {} : { name: args.name }),
          ...(args.horizonDays === undefined ? {} : { horizonDays: args.horizonDays }),
          ...(args.worlds === undefined ? {} : { worlds: args.worlds }),
          shock: args.shock,
        });
        const headline =
          `"${fork.name}": the same world ends at ${mm(fork.counterfactual.median)} instead of ` +
          `${mm(fork.actual.median)} — the counterfactual costs ${mm(fork.difference.median)}.`;
        const worst = fork.counterfactual.worstWorlds[0];
        const why = worst === undefined
          ? ''
          : ` In it the ten-year went ${worst.tenYearFrom.toFixed(2)}% to ${worst.tenYearTo.toFixed(2)}%` +
            ` and ${worst.downgrades} issuers were downgraded; ${bucketLine(worst.byBucket, 2)}.`;
        return {
          ok: true,
          summary:
            `${headline}${why} Every other random draw is held identical, so the difference is ` +
            'the shock and nothing else.',
          data: {
            kind: SCENARIO_CELL,
            view: 'fork',
            bookFingerprint: fork.bookFingerprint,
            positionCount: 0,
            baseMarketValue: 0,
            headline,
            plausibility: fork.plausibility,
            fork,
          } satisfies ScenarioCellPayload,
        };
      } catch (error) {
        return failed(error);
      }
    },
  };
}

export interface ScenarioShockArgs {
  level?: number;
  slope?: number;
  curvature?: number;
  credit?: number;
  volMultiplier?: number;
  onDay?: number;
}
