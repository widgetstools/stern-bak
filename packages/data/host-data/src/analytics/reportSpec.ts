/**
 * A trader report, as a spec the model composes rather than code it writes.
 *
 * A live report is composition, not drawing: a title and a period, a few
 * headline numbers, a table or two, a chart or two, some narrative, and a
 * cadence to re-run it on. Every one of those is a block whose renderer
 * already exists, so the model's job is to choose blocks and point them at
 * queries — never to supply markup, script, or drawing instructions.
 *
 * That boundary is deliberate and matches the rest of the codebase: the
 * expression engine is eval-free by construction, and the single `new
 * Function` site is labelled CSP-unsafe and gated behind a policy. A report
 * that could carry executable content would quietly undo both.
 *
 * Pure: no React, no recharts, no I/O. `validateReportSpec` is the gate; the
 * renderer runs each block's query and draws it.
 */
import type { ChartKind } from './chartSpec.js';
import type { ChartStyle } from './chartStyle.js';
import type { AggFn, DataQuery } from './dataQuery.js';

export const REPORT_BLOCK_KINDS = ['kpis', 'chart', 'table', 'pivot', 'lanes', 'commentary'] as const;
export type ReportBlockKind = (typeof REPORT_BLOCK_KINDS)[number];

/**
 * Where a block sits in the composition.
 *
 * A holistic view is not a column of cards. It reads like a broadsheet: a
 * dense standing block of context down one side, the thing that moves across
 * the middle, totals down the other. `main` is the default and the only
 * region that has to exist.
 */
export const REPORT_REGIONS = ['left', 'main', 'right'] as const;
export type ReportRegion = (typeof REPORT_REGIONS)[number];

/** How one lane draws its measure against the shared axis. */
export const LANE_MARKS = ['line', 'area', 'bars', 'state'] as const;
export type LaneMark = (typeof LANE_MARKS)[number];

/**
 * A lane's colour, named by ROLE rather than given as a hex.
 *
 * The reference this is modelled on is a dark-only print piece on one fixed
 * palette. Here every surface has to render under both `[data-theme]` values
 * and pass `check:ds-tokens`, so a lane names an intent and the renderer
 * resolves it to `--ds-*`. That also stops a report drifting into looking
 * garish one lane at a time.
 */
export const LANE_TONES = ['ramp-1', 'ramp-2', 'ramp-3', 'ramp-4', 'ramp-5', 'positive', 'negative'] as const;
export type LaneTone = (typeof LANE_TONES)[number];

/**
 * One headline number. `label` is the human name; the value is computed by
 * running `query` and reading `column` off the single row it returns, so a KPI
 * is never a number the model typed — it is a number the engine produced.
 */
export interface KpiTile {
  label: string;
  /** Aggregate to read from the query's result row. */
  column: string;
  fn?: AggFn;
  /**
   * Colour the tile by sign — for a P&L or a change, where red and green mean
   * something. Off by default: a notional is not "bad" for being large.
   */
  signed?: boolean;
  /**
   * Draw a proportional bar behind the number, filled to show the value's
   * position within a range. Useful for utilization, capacity, or allocation
   * percentages where the absolute number is less meaningful than its
   * relationship to a ceiling.
   */
  bar?: {
    /** The maximum value for the bar scale. Can be a literal number or a sibling column name. */
    max: number | string;
    /** Optional minimum value; defaults to 0. */
    min?: number;
  };
}

interface BlockBase {
  kind: ReportBlockKind;
  /** Optional heading above the block. */
  title?: string;
  /** Which region of the composition. Default `main`. */
  region?: ReportRegion;
  /**
   * Rotated label set in the gutter beside this block, grouping consecutive
   * blocks that share it into a named band. This is what lets a reader take
   * in "everything below here is risk" without reading a single number.
   */
  band?: string;
  /**
   * Rendered height in px, set by dragging the block's bottom edge. Clamped on
   * read: below the floor a block shows nothing, above the ceiling it is
   * taller than any screen and pushes the rest of the dashboard out of view.
   */
  height?: number;
}

export interface KpiBlock extends BlockBase {
  kind: 'kpis';
  query: DataQuery;
  tiles: KpiTile[];
}

export interface ChartBlock extends BlockBase {
  kind: 'chart';
  query: DataQuery;
  chart?: ChartKind;
  style?: ChartStyle;
  /**
   * For a multi-series chart, make each stack sum to 100 — share of total per
   * category rather than absolute size.
   */
  normalize?: boolean;
  /**
   * Logarithmic value axis. Use it when the measures span orders of magnitude
   * and the small ones vanish against the large. Impossible for a measure that
   * reaches zero or goes negative (P&L), and downgraded to linear with the
   * reason in the caption rather than drawn empty.
   */
  scale?: 'linear' | 'log';
  /**
   * Where the value axis starts. `auto` zooms to the data's own range, which
   * is what makes tightly clustered values readable — prices between 98 and
   * 103 are eight identical bars when anchored at zero. On a bar chart this
   * also exaggerates differences, so the caption says when it is in effect.
   */
  baseline?: 'zero' | 'auto';
}

export interface TableBlock extends BlockBase {
  kind: 'table';
  query: DataQuery;
  /**
   * Visible height in px before the rows scroll inside the block. Defaults to
   * a bounded height: a table that grows to its row count pushes everything
   * below it off the page and stretches its whole region, taking the charts
   * beside it with it.
   */
  maxHeight?: number;
  /** Shade cells by magnitude, the way the summary panel's heatmap widget does. */
  heatmap?: boolean;
  /**
   * Colour numeric cells by sign: positive numbers in green, negative in red.
   * Useful for P&L, changes, and other signed measures where the direction
   * of the value conveys meaning. Cannot be combined with `heatmap`.
   */
  signed?: boolean;
}

export interface PivotBlock extends BlockBase {
  kind: 'pivot';
  query: DataQuery;
  /** Visible height in px before the rows scroll inside the block. */
  maxHeight?: number;
  heatmap?: boolean;
  /**
   * Colour numeric cells by sign: positive numbers in green, negative in red.
   * Useful for P&L, changes, and other signed measures where the direction
   * of the value conveys meaning. Cannot be combined with `heatmap`.
   */
  signed?: boolean;
}

/** One horizontal track of the lanes block. */
export interface LaneDef {
  /** Set in the left margin of the lane, in the reference's small-caps style. */
  label: string;
  /** The measure this lane draws. */
  column: string;
  mark?: LaneMark;
  tone?: LaneTone;
  /**
   * Relative height. A heart-rate trace earns more room than an on/off state
   * band, and giving every lane the same slice is what makes a stack of them
   * read as a list rather than as one picture.
   */
  weight?: number;
}

/**
 * The centrepiece: several measures stacked as separate tracks over ONE
 * shared axis.
 *
 * The alignment is the whole point. Any of these lanes on its own is a chart
 * you could already draw; drawn against a common axis, a spike in one lane
 * lines up with a gap in another and the reader sees the connection without
 * being told about it. That is what "holistic" means here, and it is the one
 * thing a column of independent charts cannot do.
 */
export interface LanesBlock extends BlockBase {
  kind: 'lanes';
  query: DataQuery;
  /** The column every lane is plotted against — usually time. */
  axis: string;
  lanes: LaneDef[];
}

/**
 * Narrative written by the model.
 *
 * It is the ONE block whose content the model authors, and it is plain text
 * for that reason — rendered as text, never as markup. The numbers inside a
 * report come from the query blocks above; commentary interprets them.
 */
export interface CommentaryBlock extends BlockBase {
  kind: 'commentary';
  text: string;
}

export type ReportBlock = KpiBlock | ChartBlock | TableBlock | PivotBlock | LanesBlock | CommentaryBlock;

export interface ReportSpec {
  title: string;
  /** Free text — "as of the 30 Aug close", "intraday". Shown under the title. */
  period?: string;
  /**
   * When this report's data is current as of. Supplied by the model, not the
   * browser, so the timestamp is honest (model-chosen time) rather than
   * "whenever the window happened to open". Example: "2026-09-01T14:32:00Z".
   * Shown alongside other metadata (period, refresh cadence) in the report header.
   */
  asOf?: string;
  /**
   * Re-run cadence in milliseconds. Omitted means a static report the reader
   * refreshes by hand. Clamped to `[MIN_REFRESH_MS, MAX_REFRESH_MS]` — a
   * one-second report would re-query faster than anyone can read it, and
   * re-running the whole grid's rows that often is what made the blotter
   * sluggish in the first place.
   */
  refreshMs?: number;
  blocks: ReportBlock[];
}

export const MIN_REFRESH_MS = 5_000;
export const MAX_REFRESH_MS = 3_600_000;
/** More blocks than this is a wall nobody reads, and a lot of queries. */
export const MAX_BLOCKS = 16;
export const MAX_TILES = 6;
/** Past about this many stacked tracks each one is too thin to read. */
export const MAX_LANES = 8;

export type ReportOutcome = { ok: true; value: ReportSpec } | { ok: false; error: string };

/**
 * Normalises AND validates in one pass, so the renderer can assume a
 * well-formed spec. Errors name the offending block by index — the model gets
 * one message it can act on rather than a silently half-drawn report.
 */
export function validateReportSpec(raw: unknown): ReportOutcome {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Report must be an object.' };
  const spec = raw as Partial<ReportSpec>;

  const title = typeof spec.title === 'string' ? spec.title.trim() : '';
  if (!title) return { ok: false, error: 'Report needs a title.' };

  if (!Array.isArray(spec.blocks) || spec.blocks.length === 0) {
    return { ok: false, error: 'Report needs at least one block.' };
  }
  if (spec.blocks.length > MAX_BLOCKS) {
    return { ok: false, error: `Report has ${spec.blocks.length} blocks — the limit is ${MAX_BLOCKS}.` };
  }

  const blocks: ReportBlock[] = [];
  for (const [i, block] of spec.blocks.entries()) {
    const checked = validateBlock(block, i);
    if (!checked.ok) return checked;
    blocks.push(checked.value);
  }

  return {
    ok: true,
    value: {
      title,
      period: typeof spec.period === 'string' && spec.period.trim() ? spec.period.trim() : undefined,
      refreshMs: clampRefresh(spec.refreshMs),
      blocks,
    },
  };
}

/** `undefined` (static) unless a usable number was given. */
export function clampRefresh(ms: unknown): number | undefined {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return undefined;
  return Math.min(MAX_REFRESH_MS, Math.max(MIN_REFRESH_MS, Math.round(ms)));
}

type BlockOutcome = { ok: true; value: ReportBlock } | { ok: false; error: string };

function validateBlock(raw: unknown, index: number): BlockOutcome {
  const at = `Block ${index + 1}`;
  if (!raw || typeof raw !== 'object') return { ok: false, error: `${at} must be an object.` };
  const block = raw as Partial<ReportBlock> & Record<string, unknown>;

  const kind = block.kind;
  if (!kind || !(REPORT_BLOCK_KINDS as readonly string[]).includes(kind)) {
    return { ok: false, error: `${at} has kind "${String(kind)}" — must be one of: ${REPORT_BLOCK_KINDS.join(', ')}.` };
  }
  const title = typeof block.title === 'string' && block.title.trim() ? block.title.trim() : undefined;
  const band = typeof block.band === 'string' && block.band.trim() ? block.band.trim() : undefined;
  const region = (REPORT_REGIONS as readonly string[]).includes(block.region as string)
    ? (block.region as ReportRegion)
    : 'main';
  // Clamped on the way in, so a saved layout can never carry a height that
  // hides the block or pushes the rest of the dashboard off the screen.
  const height =
    typeof block.height === 'number' && Number.isFinite(block.height)
      ? Math.max(120, Math.min(900, Math.round(block.height)))
      : undefined;
  const common = { title, band, region, ...(height !== undefined ? { height } : {}) } as const;

  if (kind === 'commentary') {
    const text = typeof block.text === 'string' ? block.text.trim() : '';
    if (!text) return { ok: false, error: `${at} is commentary with no text.` };
    return { ok: true, value: { kind, ...common, text } };
  }

  // Every other block runs a query. Column names inside it are resolved by the
  // caller against the real catalogue, the same as any other data tool — this
  // only checks the shape.
  const query = block.query;
  if (!query || typeof query !== 'object') {
    return { ok: false, error: `${at} (${kind}) needs a query.` };
  }

  if (kind === 'kpis') {
    const tiles = block.tiles;
    if (!Array.isArray(tiles) || tiles.length === 0) {
      return { ok: false, error: `${at} (kpis) needs at least one tile.` };
    }
    if (tiles.length > MAX_TILES) {
      return { ok: false, error: `${at} (kpis) has ${tiles.length} tiles — the limit is ${MAX_TILES}.` };
    }
    const checked: KpiTile[] = [];
    for (const [t, tile] of tiles.entries()) {
      if (!tile || typeof tile !== 'object') return { ok: false, error: `${at} tile ${t + 1} must be an object.` };
      const { label, column } = tile as Partial<KpiTile>;
      if (typeof label !== 'string' || !label.trim()) {
        return { ok: false, error: `${at} tile ${t + 1} needs a label.` };
      }
      if (typeof column !== 'string' || !column.trim()) {
        return { ok: false, error: `${at} tile ${t + 1} needs a column.` };
      }
      checked.push({
        label: label.trim(),
        column: column.trim(),
        fn: (tile as KpiTile).fn,
        signed: (tile as KpiTile).signed === true,
      });
    }
    return { ok: true, value: { kind, ...common, query: query as DataQuery, tiles: checked } };
  }

  if (kind === 'chart') {
    return {
      ok: true,
      value: {
        kind,
        ...common,
        query: query as DataQuery,
        chart: block.chart as ChartKind | undefined,
        style: block.style as ChartStyle | undefined,
        normalize: block.normalize === true,
        scale: block.scale === 'log' ? 'log' : 'linear',
        baseline: block.baseline === 'auto' ? 'auto' : 'zero',
      },
    };
  }

  if (kind === 'lanes') {
    const axis = typeof block.axis === 'string' ? block.axis.trim() : '';
    // Without a shared axis this is a pile of unrelated charts, which is the
    // one thing the block exists NOT to be.
    if (!axis) return { ok: false, error: `${at} (lanes) needs an axis column for every lane to share.` };

    const lanes = block.lanes;
    if (!Array.isArray(lanes) || lanes.length === 0) {
      return { ok: false, error: `${at} (lanes) needs at least one lane.` };
    }
    if (lanes.length > MAX_LANES) {
      return { ok: false, error: `${at} (lanes) has ${lanes.length} lanes — the limit is ${MAX_LANES}.` };
    }

    const checked: LaneDef[] = [];
    for (const [l, lane] of lanes.entries()) {
      if (!lane || typeof lane !== 'object') return { ok: false, error: `${at} lane ${l + 1} must be an object.` };
      const { label, column } = lane as Partial<LaneDef>;
      if (typeof label !== 'string' || !label.trim()) {
        return { ok: false, error: `${at} lane ${l + 1} needs a label.` };
      }
      if (typeof column !== 'string' || !column.trim()) {
        return { ok: false, error: `${at} lane ${l + 1} needs a column.` };
      }
      const mark = (lane as LaneDef).mark;
      const tone = (lane as LaneDef).tone;
      const weight = (lane as LaneDef).weight;
      checked.push({
        label: label.trim(),
        column: column.trim(),
        mark: (LANE_MARKS as readonly string[]).includes(mark as string) ? mark : 'line',
        // Unset walks the ramp, so a reader gets distinguishable lanes without
        // the model having to choose colours it has no basis for choosing.
        tone: (LANE_TONES as readonly string[]).includes(tone as string)
          ? tone
          : (`ramp-${(l % 5) + 1}` as LaneTone),
        weight: typeof weight === 'number' && Number.isFinite(weight) && weight > 0 ? Math.min(4, weight) : 1,
      });
    }
    return { ok: true, value: { kind, ...common, query: query as DataQuery, axis, lanes: checked } };
  }

  return {
    ok: true,
    value: {
      kind,
      ...common,
      query: query as DataQuery,
      heatmap: block.heatmap === true,
      // Clamped: a table tall enough to push the rest of the dashboard off the
      // page is the thing this exists to prevent, and a 40px one shows nothing.
      ...(typeof block.maxHeight === 'number' && Number.isFinite(block.maxHeight)
        ? { maxHeight: Math.max(120, Math.min(900, Math.round(block.maxHeight))) }
        : {}),
    },
  };
}

/** The queries a report runs, in order — what a refresh has to re-execute. */
export function reportQueries(spec: ReportSpec): DataQuery[] {
  return spec.blocks
    .filter((b): b is Exclude<ReportBlock, CommentaryBlock> => b.kind !== 'commentary')
    .map((b) => b.query);
}
