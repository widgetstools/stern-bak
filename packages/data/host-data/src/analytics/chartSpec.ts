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
 * Pure: no React, no recharts. The renderer reads the spec.
 */

/**
 * `'heatmap'` is a table-rendering MODE (per-cell background shading), not a
 * recharts chart kind — the renderer handles it directly and it never reaches
 * `buildChartSpec`. It lives in this const anyway because it's still a
 * `chart` argument choice from the model's point of view, and
 * `query_grid_data`'s schema enum is built from `CHART_KINDS`.
 */
export const CHART_KINDS = ['auto', 'bar', 'hbar', 'line', 'area', 'pie', 'scatter', 'heatmap', 'none'] as const;
export type ChartKind = (typeof CHART_KINDS)[number];
/** What `auto` can resolve to — `auto` and `heatmap` are never a rendered
 *  chart kind (`heatmap` is a table mode; see above). */
export type ResolvedChartKind = Exclude<ChartKind, 'auto' | 'heatmap'>;

/**
 * `summarize_grid_data`'s result is a digest — stat cards and at most a
 * one-dimensional `groups` breakdown, never a 2D table — so there is nothing
 * for `'heatmap'` to shade. Its tool schema and runtime validation both use
 * this narrower list instead of spreading all of `CHART_KINDS`, so the
 * question of "what does heatmap even do here" never comes up.
 */
export const SUMMARY_CHART_KINDS: readonly ChartKind[] = CHART_KINDS.filter((k) => k !== 'heatmap');

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

/**
 * Signed measures get the desk's own semantics instead: a trader reads red and
 * green as loss and gain, so drawing P&L in the categorical ramp throws away
 * the one thing the colour could have told them.
 */
export const POSITIVE_COLOR = 'var(--ds-accent-positive)';
export const NEGATIVE_COLOR = 'var(--ds-accent-negative)';

/**
 * Colour for one point.
 *
 * - pie: colour genuinely encodes the category, so the ramp is right.
 * - signed data: colour encodes the sign.
 * - everything else: one hue for the whole series.
 */
export function fillFor(kind: ResolvedChartKind, value: number, index: number, signed: boolean): string {
  if (kind === 'pie') return chartColor(index);
  if (signed) return value < 0 ? NEGATIVE_COLOR : POSITIVE_COLOR;
  return SERIES_COLOR;
}

export interface ChartPoint {
  label: string;
  value: number;
  /** Second numeric axis, for scatter. */
  y?: number;
  fill: string;
}

export interface ChartSpec {
  kind: ResolvedChartKind;
  points: ChartPoint[];
  labelKey: string;
  valueKey: string;
  /** Set for scatter: the column on the y axis. */
  yKey?: string;
  /**
   * The measure crosses zero, so points are coloured by sign rather than in
   * one series hue. The renderer uses it to draw a zero reference line —
   * without one, a bar chart of P&L gives no visual anchor for where zero is.
   */
  signed: boolean;
  /** Why this chart — shown as the cell's chart caption. */
  caption: string;
}

export interface ChartInput {
  columns: string[];
  rows: Array<Record<string, unknown>>;
  /** True when the rows are already rolled up, which rules a scatter out. */
  grouped: boolean;
  requested?: ChartKind;
}

const MAX_POINTS = 24;
const PIE_MAX_SLICES = 6;
const VERTICAL_BAR_MAX = 8;
const LONG_LABEL = 12;

function isNumeric(rows: Array<Record<string, unknown>>, col: string): boolean {
  const present = rows.map((r) => r[col]).filter((v) => v !== null && v !== undefined && v !== '');
  return present.length > 0 && present.every((v) => typeof v === 'number' && Number.isFinite(v));
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

  // Scatter needs two numeric columns and raw (ungrouped) rows.
  const wantsScatter = input.requested === 'scatter';
  if ((wantsScatter || input.requested === 'auto' || !input.requested) && !input.grouped && numerics.length >= 2) {
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
      value: typeof row[valueKey] === 'number' ? (row[valueKey] as number) : 0,
    }))
    .filter((p) => p.label);

  if (bare.length < 2) return undefined;
  if (bare.every((p) => p.value === 0)) return undefined;

  const kind = resolveKind(input.requested, bare as ChartPoint[], labelKey);
  if (!kind) return undefined;

  const signed = bare.some((p) => p.value < 0);
  const points: ChartPoint[] = bare.map((p, i) => ({ ...p, fill: fillFor(kind, p.value, i, signed) }));

  return {
    kind,
    points,
    labelKey,
    valueKey,
    signed,
    caption: captionFor(kind, labelKey, valueKey, points.length),
  };
}

function scatterSpec(input: ChartInput, numerics: string[]): ChartSpec {
  const [xKey, yKey] = numerics;
  const labelKey = input.columns.find((c) => !numerics.includes(c)) ?? xKey;
  // Every dot is the same series — one hue. Colouring them by row index
  // implies a grouping that isn't there.
  const points = input.rows.slice(0, MAX_POINTS * 4).map((row) => ({
    label: String(row[labelKey] ?? ''),
    value: typeof row[xKey] === 'number' ? (row[xKey] as number) : 0,
    y: typeof row[yKey] === 'number' ? (row[yKey] as number) : 0,
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

function resolveKind(
  requested: ChartKind | undefined,
  points: ChartPoint[],
  labelKey: string,
): ResolvedChartKind | undefined {
  if (requested && requested !== 'auto') {
    // A pie of negatives is meaningless — slices can't be negative area.
    if (requested === 'pie' && points.some((p) => p.value < 0)) return 'bar';
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
    case 'line':
    case 'area':
      return `${by}, in order`;
    case 'hbar':
    case 'bar':
    default:
      return `${by}, ${count} shown`;
  }
}
