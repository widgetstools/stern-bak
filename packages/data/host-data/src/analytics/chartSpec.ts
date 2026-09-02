/**
 * Picks the chart that fits a result, and the colours to draw it with.
 *
 * The shape of the answer decides the chart, not the model: a share-of-whole
 * wants a pie, an ordered key wants a line, two numeric columns want a scatter,
 * and ten long category names want horizontal bars because vertical ones
 * truncate into nonsense. Asking the model to choose would add a decision it
 * has no better information to make than this does.
 *
 * The caller can still override — "show that as a pie" is a real request — but
 * `auto` is the default and is what runs unless the user says otherwise.
 *
 * The richer kinds (treemap, combo, waterfall, sankey, funnel, radar,
 * candlestick) are only ever reached by NAME. `auto` never resolves to one:
 * each answers a specific question a trader asks out loud ("where is the
 * concentration", "what moved P&L"), and guessing at that from column shapes
 * alone would be wrong more often than it was right.
 *
 * Pure: no React, no recharts. The renderer reads the spec.
 */
import type { ChartPalette } from './chartStyle.js';
import type { PivotMeta } from './dataQuery.js';

/**
 * `'heatmap'` is a table-rendering MODE (per-cell background shading), not a
 * recharts chart kind — the renderer handles it directly and it never reaches
 * `buildChartSpec`. It lives in this const anyway because it's still a
 * `chart` argument choice from the model's point of view, and
 * `query_grid_data`'s schema enum is built from `CHART_KINDS`.
 */
export const CHART_KINDS = [
  'auto',
  'bar',
  'hbar',
  'line',
  'area',
  'pie',
  'scatter',
  'stackedBar',
  'groupedBar',
  'stackedArea',
  'multiLine',
  'treemap',
  'combo',
  'waterfall',
  'sankey',
  'funnel',
  'radar',
  'candlestick',
  'heatmap',
  'none',
] as const;
export type ChartKind = (typeof CHART_KINDS)[number];
/** What a spec can carry — `auto` and `heatmap` are never a rendered chart
 *  kind (`heatmap` is a table mode; see above). */
export type ResolvedChartKind = Exclude<ChartKind, 'auto' | 'heatmap'>;

/**
 * `summarize_grid_data`'s result is a digest — stat cards and at most a
 * one-dimensional `groups` breakdown, never a 2D table — so there is nothing
 * for `'heatmap'` to shade, no second measure for `'combo'`, no from/to pair
 * for `'sankey'` and no OHLC for `'candlestick'`. Its tool schema and runtime
 * validation both use this narrower list, so the question of "what does that
 * even do here" never comes up.
 */
const DIGEST_IMPOSSIBLE: readonly ChartKind[] = [
  'heatmap',
  'combo',
  'sankey',
  'candlestick',
  // A digest's `groups` is one dimension deep, so there is no second dimension
  // to split a stack or a family of lines by.
  'stackedBar',
  'groupedBar',
  'stackedArea',
  'multiLine',
];
export const SUMMARY_CHART_KINDS: readonly ChartKind[] = CHART_KINDS.filter(
  (k) => !DIGEST_IMPOSSIBLE.includes(k),
);

/**
 * The design system's chart ramp, in order. Deliberately NOT `--primary` or
 * `--accent`: primary is the app's interactive blue and accent is a surface
 * tint, so data drawn in either reads as chrome — and a slice the same colour
 * as a button is a slice people try to click.
 *
 * `--ds-*` is the wrapped form; the bare `--chart-N` tokens are unwrapped oklch
 * triplets ("0.52 0.105 192") and would render as an invalid fill.
 */
export const CHART_COLORS = [
  'var(--ds-chart-1)',
  'var(--ds-chart-2)',
  'var(--ds-chart-3)',
  'var(--ds-chart-4)',
  'var(--ds-chart-5)',
] as const;

export function chartColor(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length];
}

/**
 * The single hue a one-series chart is drawn in.
 *
 * Colour has to MEAN something. Walking the categorical ramp per data point —
 * which is what this used to do — paints every bar of one series a different
 * hue, implying five categories where there is one measure. It reads as
 * decoration, and decoration is what makes a chart look garish.
 */
export const SERIES_COLOR = 'var(--ds-chart-1)';

/** The second measure of a combo chart — the line drawn over the bars. */
export const SERIES_COLOR_ALT = 'var(--ds-chart-3)';

/**
 * Signed measures get the desk's own semantics instead: a trader reads red and
 * green as loss and gain, so drawing P&L in the categorical ramp throws away
 * the one thing the colour could have told them.
 */
export const POSITIVE_COLOR = 'var(--ds-accent-positive)';
export const NEGATIVE_COLOR = 'var(--ds-accent-negative)';

/**
 * The kinds where colour genuinely encodes the category rather than decorating
 * it — every segment is a different thing, and telling them apart IS the chart.
 * Everything else gets one hue per series (or red/green when signed).
 */
const CATEGORICAL_KINDS: readonly ResolvedChartKind[] = ['pie', 'treemap', 'funnel', 'sankey'];

/**
 * The kinds that draw N measures at once rather than one.
 *
 * For these, colour is per-SERIES rather than per-point: the ramp genuinely
 * encodes which series a mark belongs to, exactly as it encodes the category
 * for a pie. That also makes a legend non-optional — a stack of five anonymous
 * colours says nothing.
 */
export const MULTI_SERIES_KINDS: readonly ResolvedChartKind[] = [
  'stackedBar',
  'groupedBar',
  'stackedArea',
  'multiLine',
];

export function isMultiSeries(kind: ResolvedChartKind): boolean {
  return MULTI_SERIES_KINDS.includes(kind);
}

/** What each multi-series kind becomes when the data holds only one measure. */
const SINGLE_SERIES_EQUIVALENT: Record<string, 'bar' | 'area' | 'line'> = {
  stackedBar: 'bar',
  groupedBar: 'bar',
  stackedArea: 'area',
  multiLine: 'line',
};

/**
 * Colour for one point.
 *
 * - pie / treemap / funnel / sankey: colour identifies the category.
 * - signed data: colour encodes the sign.
 * - everything else: one hue for the whole series.
 */
export function fillFor(kind: ResolvedChartKind, value: number, index: number, signed: boolean): string {
  if (CATEGORICAL_KINDS.includes(kind)) return chartColor(index);
  if (signed) return value < 0 ? NEGATIVE_COLOR : POSITIVE_COLOR;
  return SERIES_COLOR;
}

/**
 * The same decision with the user's explicit override applied.
 *
 * `ChartStyle.palette` was accepted and validated but never consulted, so
 * "colour these by sign" wrote cleanly and changed nothing. Resolving it at
 * RENDER time rather than in `buildChartSpec` keeps the spec a statement about
 * the data and the style a statement about its presentation — restyling a
 * chart doesn't mean re-running the query behind it.
 */
export function fillForStyle(
  kind: ResolvedChartKind,
  value: number,
  index: number,
  signed: boolean,
  palette: ChartPalette | undefined,
): string {
  switch (palette) {
    case 'single':
      return SERIES_COLOR;
    case 'categorical':
      return chartColor(index);
    case 'sign':
      return value < 0 ? NEGATIVE_COLOR : POSITIVE_COLOR;
    default:
      return fillFor(kind, value, index, signed);
  }
}

/** One measure of a multi-series chart. */
export interface ChartSeries {
  /** Key into `ChartPoint.values`. */
  key: string;
  /** Legend label — the pivot value ("Commercial"), or the column name. */
  label: string;
  fill: string;
}

export interface ChartPoint {
  label: string;
  /**
   * The point's headline number. For a single-series chart it IS the measure;
   * for a multi-series one it is the STACK TOTAL, so anything reading a point
   * generically — tooltips, "is this all zero", sign detection — still gets a
   * meaningful figure. Per-series numbers live in `values`.
   *
   * Kept deliberately: every existing consumer reads `value`, and the
   * multi-series work is additive rather than a migration.
   */
  value: number;
  /** Per-series numbers, keyed by `ChartSeries.key`. Multi-series only. */
  values?: Record<string, number>;
  /** Second numeric axis — scatter's y, and combo's line series. */
  y?: number;
  /**
   * Waterfall only: the transparent floor this step's bar is stacked on, and
   * the bar's own magnitude. Computed here so the renderer stays a renderer —
   * a running cumulative is arithmetic, not drawing.
   */
  base?: number;
  span?: number;
  /** Candlestick only. */
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  fill: string;
}

/** Sankey's flow shape: indices into `ChartSpec.nodes`. */
export interface SankeyLink {
  source: number;
  target: number;
  value: number;
}

export interface ChartSpec {
  kind: ResolvedChartKind;
  points: ChartPoint[];
  labelKey: string;
  valueKey: string;
  /** Set for scatter (y axis) and combo (the line's measure). */
  yKey?: string;
  /**
   * The measure crosses zero, so points are coloured by sign rather than in
   * one series hue. The renderer uses it to draw a zero reference line —
   * without one, a bar chart of P&L gives no visual anchor for where zero is.
   */
  signed: boolean;
  /** Multi-series only: the measures drawn, in draw order. */
  series?: ChartSeries[];
  /**
   * Each stack sums to 100 — share-of-total per category rather than absolute
   * size. Recharts has no percent-stack mode, so `values` are already
   * normalised here: that is arithmetic, and arithmetic belongs in the spec
   * (same reasoning as the waterfall's running base).
   */
  normalize?: boolean;
  /** Sankey only: the node list `links` indexes into. */
  nodes?: Array<{ name: string }>;
  links?: SankeyLink[];
  /** Why this chart — shown as the cell's chart caption. */
  caption: string;
}

export interface ChartInput {
  columns: string[];
  rows: Array<Record<string, unknown>>;
  /** True when the rows are already rolled up, which rules a scatter out. */
  grouped: boolean;
  requested?: ChartKind;
  /**
   * `QueryResult.pivot`, when the rows came from a pivoted query.
   *
   * A pivot IS multi-series data — `rowDims` are the category axis and the
   * remaining columns are one series each. Without this, the builder saw a
   * flat column list, took the last numeric and silently discarded the rest:
   * "sales by day and channel" drew one channel. Passing it through is what
   * makes a cross-tab chart as the cross-tab it is.
   */
  pivot?: PivotMeta;
  /** Each stack sums to 100 instead of its absolute total. */
  normalize?: boolean;
}

const MAX_POINTS = 24;
const PIE_MAX_SLICES = 6;
const VERTICAL_BAR_MAX = 8;
const LONG_LABEL = 12;
/** A sankey with more flows than this is a hairball, not a diagram. */
const MAX_LINKS = 24;
/**
 * `MAX_PIVOT_COLUMNS` is 30, and thirty stacked segments is a smear rather than
 * a chart. Past this the largest series are kept and the caption says so —
 * showing the eight that matter beats refusing to draw, and beats drawing
 * thirty nobody can tell apart.
 */
const MAX_SERIES = 8;

function isNumeric(rows: Array<Record<string, unknown>>, col: string): boolean {
  const present = rows.map((r) => r[col]).filter((v) => v !== null && v !== undefined && v !== '');
  return present.length > 0 && present.every((v) => typeof v === 'number' && Number.isFinite(v));
}

function num(row: Record<string, unknown>, col: string | undefined): number {
  if (!col) return 0;
  const v = row[col];
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** ISO dates sort and read chronologically, so an ordered key gets a line. */
function looksOrdered(values: string[]): boolean {
  if (values.length < 3) return false;
  const allDates = values.every((v) => /^\d{4}(-\d{2})?(-\d{2})?$/.test(v));
  if (allDates) return true;
  const nums = values.map((v) => Number(v));
  return nums.every((n) => Number.isFinite(n));
}

function numericColumns(input: ChartInput): string[] {
  return input.columns.filter((c) => isNumeric(input.rows, c));
}

/**
 * `undefined` when nothing sensible can be drawn — a single row, no numeric
 * column, every value zero. A chart of one bar is noise, not insight.
 *
 * A named kind whose data shape the result doesn't have returns `undefined`
 * too, rather than degrading into a chart that answers a different question
 * than the one asked.
 */
export function buildChartSpec(input: ChartInput): ChartSpec | undefined {
  if (input.requested === 'none') return undefined;
  // A table-shading mode, not a recharts kind — the caller renders the table
  // directly instead of calling this at all once it sees the request. Bailing
  // here too means a caller that forgets that check gets nothing drawn rather
  // than `resolveKind`'s unconditional passthrough handing back a `'heatmap'`
  // kind the renderer has no branch for and silently rendering a bar chart.
  if (input.requested === 'heatmap') return undefined;

  const numerics = numericColumns(input);
  const categorical = input.columns.filter((c) => !numerics.includes(c));

  // Kinds whose data shape is nothing like label+value get their own builder.
  if (input.requested === 'candlestick') return candlestickSpec(input, numerics, categorical);
  if (input.requested === 'sankey') return sankeySpec(input, numerics, categorical);
  if (input.requested === 'combo') return comboSpec(input, numerics, categorical);

  // Multi-series: asked for by name, or inferred because the rows ARE a
  // cross-tab. The `auto` case is the important one — it turns a pivot that
  // used to lose every series but the last into the stacked chart it always
  // should have been, for every existing caller, without anyone asking.
  const wantsSeries = Boolean(input.requested && isMultiSeries(input.requested as ResolvedChartKind));
  const pivoted = Boolean(input.pivot?.colDims.length);
  let requested = input.requested;

  if (wantsSeries || ((requested === 'auto' || !requested) && pivoted)) {
    const kind = (wantsSeries ? requested : 'stackedBar') as ResolvedChartKind;
    const spec = seriesSpec(input, numerics, categorical, kind);
    if (spec) return spec;
    // Only one measure to draw, so there is no stack to make. Degrade to the
    // single-series chart of the same family rather than refusing: the user
    // asked for bars-over-time and one series of bars is still that.
    requested = wantsSeries ? SINGLE_SERIES_EQUIVALENT[kind] : 'auto';
  }

  // Scatter needs two numeric columns and raw (ungrouped) rows.
  const wantsScatter = requested === 'scatter';
  if ((wantsScatter || requested === 'auto' || !requested) && !input.grouped && numerics.length >= 2) {
    if (wantsScatter || input.rows.length >= 6) {
      return scatterSpec(input, numerics);
    }
  }
  if (wantsScatter) return undefined;

  const valueKey = numerics[numerics.length - 1];
  const labelKey = categorical[0] ?? input.columns[0];
  if (!valueKey || valueKey === labelKey) return undefined;

  // Built without a fill first: the right colour depends on the chart kind,
  // and the kind is resolved FROM the points.
  const bare = input.rows
    .slice(0, MAX_POINTS)
    .map((row) => ({
      label: String(row[labelKey] ?? ''),
      value: num(row, valueKey),
    }))
    .filter((p) => p.label);

  if (bare.length < 2) return undefined;
  if (bare.every((p) => p.value === 0)) return undefined;

  const kind = resolveKind(requested, bare as ChartPoint[], labelKey);
  if (!kind) return undefined;

  const signed = bare.some((p) => p.value < 0);
  let points: ChartPoint[] = bare.map((p, i) => ({ ...p, fill: fillFor(kind, p.value, i, signed) }));

  // A funnel reads top-to-bottom as a narrowing sequence; unsorted input draws
  // one that widens again, which says something untrue about the data.
  if (kind === 'funnel') points = [...points].sort((a, b) => b.value - a.value);
  if (kind === 'waterfall') points = withWaterfallBase(points);

  return {
    kind,
    points,
    labelKey,
    valueKey,
    signed,
    caption: captionFor(kind, labelKey, valueKey, points.length),
  };
}

/**
 * Each step's bar floats between the running total before it and after it, so
 * the eye follows the balance down the chart. The floor is the LOWER of the
 * two and the bar's height the absolute delta — that way a negative step draws
 * downward from the previous total instead of upward from zero.
 */
function withWaterfallBase(points: ChartPoint[]): ChartPoint[] {
  let running = 0;
  return points.map((p) => {
    const before = running;
    const after = before + p.value;
    running = after;
    return { ...p, base: Math.min(before, after), span: Math.abs(p.value) };
  });
}

/**
 * N measures against one category axis — the cross-tab shape.
 *
 * Series come from the pivot's own columns when `pivot` is present, and
 * otherwise from every numeric column that isn't the label. Both paths matter:
 * a pivoted result carries `PivotMeta`, but a plain query that happens to
 * select `day, commercial, consumer, education` is the same picture and should
 * draw the same way.
 */
function seriesSpec(
  input: ChartInput,
  numerics: string[],
  categorical: string[],
  kind: ResolvedChartKind,
): ChartSpec | undefined {
  const labelKey = input.pivot?.rowDims[0] ?? categorical[0] ?? input.columns[0];
  const keys = numerics.filter((c) => c !== labelKey);
  // One measure is not a stack. The caller degrades to the single-series
  // equivalent rather than drawing a "stack" of one.
  if (keys.length < 2) return undefined;

  const rows = input.rows.slice(0, MAX_POINTS);
  const totalFor = (key: string) => rows.reduce((sum, row) => sum + Math.abs(num(row, key)), 0);
  // Keep the series that carry the weight; thirty indistinguishable segments
  // is worse than eight legible ones plus a caption that admits the trim.
  const ranked = [...keys].sort((a, b) => totalFor(b) - totalFor(a));
  const chosen = ranked.slice(0, MAX_SERIES);
  const trimmed = ranked.length - chosen.length;
  // Back to the caller's column order — ranking picks WHICH series, it should
  // not reorder the stack under them.
  const shown = keys.filter((k) => chosen.includes(k));

  const series: ChartSeries[] = shown.map((key, i) => ({
    key,
    label: key,
    // Colour identifies the series here, exactly as it identifies the slice of
    // a pie — so the ramp is right, and per-point colour would be meaningless.
    fill: chartColor(i),
  }));

  const points: ChartPoint[] = rows
    .map((row) => {
      const values: Record<string, number> = {};
      for (const key of shown) values[key] = num(row, key);
      const total = shown.reduce((sum, key) => sum + values[key], 0);
      return { label: String(row[labelKey] ?? ''), value: total, values, fill: series[0].fill };
    })
    .filter((p) => p.label);

  if (points.length < 1) return undefined;
  if (points.every((p) => p.value === 0)) return undefined;

  const normalize = input.normalize === true;
  if (normalize) {
    for (const point of points) {
      // A stack of zero has no shares to show; leaving it at zero draws an
      // empty slot, which is the truth, rather than dividing by zero.
      const total = shown.reduce((sum, key) => sum + Math.abs(point.values![key]), 0);
      if (total === 0) continue;
      for (const key of shown) point.values![key] = (point.values![key] / total) * 100;
      point.value = 100;
    }
  }

  const signed = points.some((p) => shown.some((key) => p.values![key] < 0));
  const measure = input.pivot?.measures[0] ?? 'value';
  const dimension = input.pivot?.colDims.join(', ') ?? 'series';

  return {
    kind,
    points,
    series,
    normalize,
    labelKey,
    valueKey: measure,
    signed,
    caption:
      `${measure} by ${labelKey}, split by ${dimension} — ${series.length} series` +
      (trimmed > 0 ? ` (largest ${series.length} of ${ranked.length})` : '') +
      (normalize ? ', as share of total' : ''),
  };
}

function scatterSpec(input: ChartInput, numerics: string[]): ChartSpec {
  const [xKey, yKey] = numerics;
  const labelKey = input.columns.find((c) => !numerics.includes(c)) ?? xKey;
  // Every dot is the same series — one hue. Colouring them by row index
  // implies a grouping that isn't there.
  const points = input.rows.slice(0, MAX_POINTS * 4).map((row) => ({
    label: String(row[labelKey] ?? ''),
    value: num(row, xKey),
    y: num(row, yKey),
    fill: SERIES_COLOR,
  }));
  return {
    kind: 'scatter',
    points,
    labelKey: xKey,
    valueKey: xKey,
    yKey,
    signed: false,
    caption: `${yKey} against ${xKey}, ${points.length} points`,
  };
}

/**
 * Bars plus a line on a shared category axis — the "exposure against yield"
 * shape, where the two measures are on wildly different scales and a second
 * bar series would just make one of them invisible.
 */
function comboSpec(input: ChartInput, numerics: string[], categorical: string[]): ChartSpec | undefined {
  if (numerics.length < 2) return undefined;
  const labelKey = categorical[0] ?? input.columns[0];
  const [valueKey, yKey] = numerics;
  if (!valueKey || !yKey || valueKey === labelKey) return undefined;

  const bare = input.rows
    .slice(0, MAX_POINTS)
    .map((row) => ({
      label: String(row[labelKey] ?? ''),
      value: num(row, valueKey),
      y: num(row, yKey),
    }))
    .filter((p) => p.label);
  if (bare.length < 2) return undefined;

  const signed = bare.some((p) => p.value < 0);
  return {
    kind: 'combo',
    points: bare.map((p, i) => ({ ...p, fill: fillFor('combo', p.value, i, signed) })),
    labelKey,
    valueKey,
    yKey,
    signed,
    caption: `${valueKey} (bars) with ${yKey} (line) by ${labelKey}, ${bare.length} shown`,
  };
}

/**
 * Two categorical columns become a two-layer flow: every distinct source is a
 * node on the left, every distinct target a node on the right.
 *
 * Source and target nodes are kept separate even when they share a name.
 * Recharts' sankey layout requires an acyclic graph, and a value appearing on
 * both sides (the Rates desk trading with the Rates desk) would otherwise close
 * a loop the layout cannot resolve.
 */
function sankeySpec(input: ChartInput, numerics: string[], categorical: string[]): ChartSpec | undefined {
  if (categorical.length < 2 || numerics.length < 1) return undefined;
  const [sourceKey, targetKey] = categorical;
  const valueKey = numerics[numerics.length - 1];

  // Repeated source/target pairs are summed rather than drawn as parallel
  // ribbons between the same two nodes.
  const totals = new Map<string, { source: string; target: string; value: number }>();
  for (const row of input.rows) {
    const source = String(row[sourceKey] ?? '');
    const target = String(row[targetKey] ?? '');
    const value = num(row, valueKey);
    // A ribbon's width IS the value; a negative one cannot be drawn.
    if (!source || !target || value <= 0) continue;
    const key = `${source} ${target}`;
    const seen = totals.get(key);
    if (seen) seen.value += value;
    else totals.set(key, { source, target, value });
  }

  const flows = [...totals.values()].sort((a, b) => b.value - a.value).slice(0, MAX_LINKS);
  if (flows.length < 2) return undefined;

  const nodes: Array<{ name: string }> = [];
  const indexOf = new Map<string, number>();
  const nodeFor = (side: 'in' | 'out', name: string): number => {
    const key = `${side} ${name}`;
    const seen = indexOf.get(key);
    if (seen !== undefined) return seen;
    const index = nodes.length;
    nodes.push({ name });
    indexOf.set(key, index);
    return index;
  };

  const links: SankeyLink[] = flows.map((f) => ({
    source: nodeFor('in', f.source),
    target: nodeFor('out', f.target),
    value: f.value,
  }));

  return {
    kind: 'sankey',
    // Points carry the same flows in label/value form so the tooltip, the
    // caption and every generic "how big is this chart" check keep working.
    points: flows.map((f, i) => ({
      label: `${f.source} → ${f.target}`,
      value: f.value,
      fill: chartColor(i),
    })),
    labelKey: sourceKey,
    valueKey,
    signed: false,
    nodes,
    links,
    caption: `${valueKey} flowing from ${sourceKey} to ${targetKey}, ${links.length} flows`,
  };
}

/** Matches `open`/`high`/`low`/`close`, plus the aggregated forms a grouped
 *  query produces (`first_open`, `max_high`, `min_low`, `last_close`). */
function ohlcColumn(numerics: string[], role: string): string | undefined {
  const exact = numerics.find((c) => c.toLowerCase() === role);
  if (exact) return exact;
  return numerics.find((c) => new RegExp(`(^|_)${role}$`, 'i').test(c));
}

/**
 * Open/high/low/close per period. The four columns are found by NAME because
 * there is no other way to tell them apart — four numerics in a row carry no
 * signal about which one is the high.
 */
function candlestickSpec(input: ChartInput, numerics: string[], categorical: string[]): ChartSpec | undefined {
  const openKey = ohlcColumn(numerics, 'open');
  const highKey = ohlcColumn(numerics, 'high');
  const lowKey = ohlcColumn(numerics, 'low');
  const closeKey = ohlcColumn(numerics, 'close');
  if (!openKey || !highKey || !lowKey || !closeKey) return undefined;

  const labelKey = categorical[0] ?? input.columns[0];
  const points: ChartPoint[] = input.rows
    .slice(0, MAX_POINTS * 2)
    .map((row) => {
      const open = num(row, openKey);
      const close = num(row, closeKey);
      return {
        label: String(row[labelKey] ?? ''),
        // `value` is the close, so the tooltip, the axis domain and anything
        // reading a point generically still get the number that matters.
        value: close,
        open,
        high: num(row, highKey),
        low: num(row, lowKey),
        close,
        // Up and down candles: the one convention every trader already reads.
        fill: close < open ? NEGATIVE_COLOR : POSITIVE_COLOR,
      };
    })
    .filter((p) => p.label);

  if (points.length < 2) return undefined;
  return {
    kind: 'candlestick',
    points,
    labelKey,
    valueKey: closeKey,
    signed: false,
    caption: `${labelKey} OHLC, ${points.length} periods`,
  };
}

/** Encodings that can only draw a non-negative magnitude — a slice, a segment
 *  or a rectangle of negative area does not exist. */
const POSITIVE_ONLY: readonly ChartKind[] = ['pie', 'treemap', 'funnel', 'radar'];

function resolveKind(
  requested: ChartKind | undefined,
  points: ChartPoint[],
  labelKey: string,
): ResolvedChartKind | undefined {
  if (requested && requested !== 'auto') {
    // Area, segment and slice encodings have no way to show a negative, so a
    // request for one over signed data becomes the chart that can.
    if (POSITIVE_ONLY.includes(requested) && points.some((p) => p.value < 0)) return 'bar';
    return requested as ResolvedChartKind;
  }

  const labels = points.map((p) => p.label);
  if (looksOrdered(labels) || /date|month|year|maturity|tenor|bucket/i.test(labelKey)) return 'line';

  // Long labels rule the pie out before anything else. A pie identifies slices
  // by legend, and a legend of full issuer names costs more room than the chart
  // — horizontal bars put the name and the value on the same line instead.
  const longest = Math.max(...labels.map((l) => l.length));
  if (longest > LONG_LABEL) return 'hbar';

  const allPositive = points.every((p) => p.value >= 0);
  if (allPositive && points.length <= PIE_MAX_SLICES) return 'pie';

  if (points.length > VERTICAL_BAR_MAX) return 'hbar';
  return 'bar';
}

function captionFor(kind: ResolvedChartKind, labelKey: string, valueKey: string, count: number): string {
  const by = `${valueKey} by ${labelKey}`;
  switch (kind) {
    case 'pie':
      return `${by} — share of total across ${count}`;
    case 'treemap':
      return `${by} — area is share of total, ${count} shown`;
    case 'funnel':
      return `${by} — largest to smallest, ${count} stages`;
    case 'radar':
      return `${by} across ${count} axes`;
    case 'waterfall':
      return `${by} — running total across ${count} steps`;
    case 'line':
    case 'area':
      return `${by}, in order`;
    case 'hbar':
    case 'bar':
    default:
      return `${by}, ${count} shown`;
  }
}
