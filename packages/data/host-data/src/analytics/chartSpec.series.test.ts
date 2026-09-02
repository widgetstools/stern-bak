import { describe, expect, it } from 'vitest';
import {
  buildChartSpec,
  chartColor,
  isMultiSeries,
  CHART_KINDS,
  SUMMARY_CHART_KINDS,
  type ChartInput,
  type ChartSpec,
} from './chartSpec.js';
import { runQuery } from './dataQuery.js';

/**
 * A pivot IS multi-series data. Before this existed, `buildChartSpec` received
 * only `columns`/`rows`/`grouped` — `QueryResult.pivot` was dropped by every
 * caller — so it took the LAST numeric column and silently discarded the rest.
 * "Sales by day and channel as a bar chart" drew one channel, with a caption
 * that was honest about what it drew and wrong about what was asked.
 */
const SALES = [
  { day: 'Sun', channel: 'Commercial', sales: 400 },
  { day: 'Sun', channel: 'Consumer', sales: 550 },
  { day: 'Sun', channel: 'Education', sales: 620 },
  { day: 'Mon', channel: 'Commercial', sales: 300 },
  { day: 'Mon', channel: 'Consumer', sales: 450 },
  { day: 'Mon', channel: 'Education', sales: 500 },
];

function pivoted(rows = SALES) {
  const outcome = runQuery(rows, {
    groupBy: ['day'],
    pivotBy: ['channel'],
    aggregate: [{ column: 'sales', fn: 'sum' }],
  });
  if (!outcome.ok) throw new Error(outcome.error);
  return outcome.value;
}

function fromPivot(requested?: ChartInput['requested'], normalize?: boolean): ChartSpec {
  const result = pivoted();
  const spec = buildChartSpec({
    columns: result.columns,
    rows: result.rows,
    grouped: result.grouped,
    pivot: result.pivot,
    requested,
    normalize,
  });
  if (!spec) throw new Error('expected a spec');
  return spec;
}

describe('the regression: a pivot charts every series', () => {
  it('keeps all three channels instead of only the last column', () => {
    const spec = fromPivot('stackedBar');
    expect(spec.series?.map((s) => s.label)).toEqual(['Commercial', 'Consumer', 'Education']);
    expect(spec.points[0].values).toEqual({ Commercial: 400, Consumer: 550, Education: 620 });
  });

  /** The fix has to land for callers that never asked for anything — that is
   *  what makes it a bug fix rather than an opt-in feature. */
  it('resolves `auto` on a pivot to a stacked bar', () => {
    expect(fromPivot('auto').kind).toBe('stackedBar');
    expect(fromPivot(undefined).kind).toBe('stackedBar');
  });

  it('captions what it actually drew', () => {
    const caption = fromPivot('auto').caption;
    expect(caption).toContain('split by channel');
    expect(caption).toContain('3 series');
  });
});

describe('back-compatibility', () => {
  /** Every existing consumer reads `ChartPoint.value`. The multi-series work is
   *  additive, not a migration — a single-series result must be untouched. */
  it('leaves a single-series result exactly as it was', () => {
    const spec = buildChartSpec({
      columns: ['sector', 'mv'],
      rows: [{ sector: 'Tech', mv: 5 }, { sector: 'Energy', mv: 3 }],
      grouped: true,
      requested: 'bar',
    })!;
    expect(spec.kind).toBe('bar');
    expect(spec.series).toBeUndefined();
    expect(spec.points[0].values).toBeUndefined();
    expect(spec.points.map((p) => p.value)).toEqual([5, 3]);
  });

  /** So a tooltip, a "is this all zero" check or sign detection still gets a
   *  meaningful number without knowing about series. */
  it('sets `value` to the stack total on a multi-series point', () => {
    const spec = fromPivot('stackedBar');
    expect(spec.points[0].value).toBe(400 + 550 + 620);
  });

  it('is not reached by a plain grouped result that has one measure', () => {
    const spec = buildChartSpec({
      columns: ['sector', 'mv'],
      rows: [{ sector: 'Tech', mv: 5 }, { sector: 'Energy', mv: 3 }],
      grouped: true,
    })!;
    expect(isMultiSeries(spec.kind)).toBe(false);
  });
});

describe('the vocabulary', () => {
  it('offers the four multi-series kinds', () => {
    for (const kind of ['stackedBar', 'groupedBar', 'stackedArea', 'multiLine']) {
      expect(CHART_KINDS).toContain(kind);
      expect(isMultiSeries(kind as never)).toBe(true);
    }
  });

  /** A digest's `groups` is one dimension deep, so there is no second
   *  dimension to split a stack by — offering these would be offering a choice
   *  that silently does nothing. */
  it('withholds them from a digest', () => {
    for (const kind of ['stackedBar', 'groupedBar', 'stackedArea', 'multiLine']) {
      expect(SUMMARY_CHART_KINDS).not.toContain(kind);
    }
  });

  it('builds series from plain numeric columns when there is no pivot meta', () => {
    // A query that simply selects several measures is the same picture and
    // should draw the same way.
    const spec = buildChartSpec({
      columns: ['day', 'commercial', 'consumer'],
      rows: [{ day: 'Sun', commercial: 4, consumer: 6 }, { day: 'Mon', commercial: 3, consumer: 5 }],
      grouped: true,
      requested: 'groupedBar',
    })!;
    expect(spec.kind).toBe('groupedBar');
    expect(spec.series?.map((s) => s.key)).toEqual(['commercial', 'consumer']);
  });
});

describe('colour', () => {
  /** Colour identifies WHICH MEASURE a mark belongs to, exactly as it
   *  identifies the slice of a pie — so the ramp walks per series, not per
   *  point. Walking it per point would imply a category that isn't there. */
  it('walks the ramp once per series', () => {
    const spec = fromPivot('stackedBar');
    expect(spec.series?.map((s) => s.fill)).toEqual([chartColor(0), chartColor(1), chartColor(2)]);
  });
});

describe('normalize', () => {
  it('makes each stack sum to 100', () => {
    const spec = fromPivot('stackedBar', true);
    for (const point of spec.points) {
      const total = Object.values(point.values!).reduce((a, b) => a + b, 0);
      expect(total).toBeCloseTo(100, 6);
    }
    expect(spec.normalize).toBe(true);
    expect(spec.caption).toContain('share of total');
  });

  /** A stack of zero has no shares to show. Dividing by its total would make
   *  every series NaN and blank the whole category. */
  it('leaves an all-zero category at zero rather than dividing by it', () => {
    const spec = buildChartSpec({
      columns: ['day', 'a', 'b'],
      rows: [{ day: 'Sun', a: 0, b: 0 }, { day: 'Mon', a: 3, b: 1 }],
      grouped: true,
      requested: 'stackedBar',
      normalize: true,
    })!;
    expect(Object.values(spec.points[0].values!)).toEqual([0, 0]);
    expect(JSON.stringify(spec)).not.toContain('null');
    expect(spec.points[1].values!.a).toBeCloseTo(75, 6);
  });
});

describe('too many series', () => {
  const wide = () => {
    const rows: Array<Record<string, unknown>> = [];
    for (const day of ['Sun', 'Mon']) {
      for (let i = 0; i < 20; i++) rows.push({ day, channel: `C${i}`, sales: i + 1 });
    }
    return rows;
  };

  /** Thirty stacked segments is a smear. Showing the eight that carry the
   *  weight beats refusing to draw, and beats drawing thirty nobody can tell
   *  apart — but the caption has to admit the trim. */
  it('keeps the largest series and says that it trimmed', () => {
    const result = pivoted(wide() as typeof SALES);
    const spec = buildChartSpec({
      columns: result.columns,
      rows: result.rows,
      grouped: result.grouped,
      pivot: result.pivot,
      requested: 'stackedBar',
    })!;
    expect(spec.series).toHaveLength(8);
    // C19 is the largest; C0 the smallest, and dropped.
    expect(spec.series!.map((s) => s.label)).toContain('C19');
    expect(spec.series!.map((s) => s.label)).not.toContain('C0');
    expect(spec.caption).toContain('of 20');
  });

  /** Ranking decides WHICH series survive; it must not reorder the stack. */
  it('draws the survivors in the result\'s own column order', () => {
    const result = pivoted(wide() as typeof SALES);
    const spec = buildChartSpec({
      columns: result.columns,
      rows: result.rows,
      grouped: result.grouped,
      pivot: result.pivot,
      requested: 'stackedBar',
    })!;
    const labels = spec.series!.map((s) => s.label);
    const inResultOrder = result.columns.filter((c) => labels.includes(c));
    expect(labels).toEqual(inResultOrder);
  });
});

describe('degrading', () => {
  /** One measure is not a stack. The user asked for bars-over-time and one
   *  series of bars is still that, so refusing to draw would be unhelpful. */
  it('falls back to the single-series equivalent when there is one measure', () => {
    const one = { columns: ['sector', 'mv'], rows: [{ sector: 'Tech', mv: 5 }, { sector: 'Energy', mv: 3 }], grouped: true };
    expect(buildChartSpec({ ...one, requested: 'stackedBar' })!.kind).toBe('bar');
    expect(buildChartSpec({ ...one, requested: 'groupedBar' })!.kind).toBe('bar');
    expect(buildChartSpec({ ...one, requested: 'stackedArea' })!.kind).toBe('area');
    expect(buildChartSpec({ ...one, requested: 'multiLine' })!.kind).toBe('line');
  });
});
