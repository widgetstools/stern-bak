import { describe, expect, it } from 'vitest';
import { buildChartSpec, chartColor, CHART_COLORS, type ChartInput } from './chartSpec.js';

function grouped(rows: Array<Record<string, unknown>>, columns: string[], requested?: ChartInput['requested']) {
  return buildChartSpec({ columns, rows, grouped: true, requested });
}
function raw(rows: Array<Record<string, unknown>>, columns: string[], requested?: ChartInput['requested']) {
  return buildChartSpec({ columns, rows, grouped: false, requested });
}

const SECTORS = [
  { sector: 'Tech', total: 300 },
  { sector: 'Energy', total: 200 },
  { sector: 'Utils', total: 100 },
];

describe('the palette', () => {
  /** primary is the app's interactive blue and accent is a surface tint —
   *  data drawn in either reads as chrome rather than as data. */
  it('is the chart ramp, never primary or accent', () => {
    expect(CHART_COLORS).toHaveLength(5);
    for (const color of CHART_COLORS) {
      expect(color).toMatch(/^var\(--ds-chart-[1-5]\)$/);
      expect(color).not.toContain('primary');
      expect(color).not.toContain('accent');
    }
  });

  /** The bare `--chart-N` tokens are unwrapped oklch triplets and render as an
   *  invalid fill; `--ds-*` is the wrapped, usable form. */
  it('uses the wrapped ds- form', () => {
    expect(CHART_COLORS[0]).toBe('var(--ds-chart-1)');
  });

  it('cycles rather than running out', () => {
    expect(chartColor(0)).toBe(CHART_COLORS[0]);
    expect(chartColor(4)).toBe(CHART_COLORS[4]);
    expect(chartColor(5)).toBe(CHART_COLORS[0]);
    expect(chartColor(12)).toBe(CHART_COLORS[2]);
  });

  it('gives every point its own colour', () => {
    const spec = grouped(SECTORS, ['sector', 'total']);
    expect(spec?.points.map((p) => p.fill)).toEqual([CHART_COLORS[0], CHART_COLORS[1], CHART_COLORS[2]]);
  });
});

describe('auto-selection', () => {
  /** A handful of positive buckets is a share-of-whole question. */
  it('picks a pie for a few positive categories', () => {
    expect(grouped(SECTORS, ['sector', 'total'])?.kind).toBe('pie');
  });

  /** Slices cannot have negative area. */
  it('never picks a pie when a value is negative', () => {
    const withLoss = [...SECTORS, { sector: 'Credit', total: -50 }];
    expect(grouped(withLoss, ['sector', 'total'])?.kind).not.toBe('pie');
  });

  it('picks a line for a dated key', () => {
    const byMonth = ['2030-01', '2030-02', '2030-03', '2030-04'].map((m, i) => ({ month: m, total: i * 10 + 5 }));
    expect(grouped(byMonth, ['month', 'total'])?.kind).toBe('line');
  });

  /** Ordering can come from the column's name as well as its values. */
  it('picks a line for a maturity-style key', () => {
    const buckets = [
      { maturityBucket: '0-2y', total: 10 }, { maturityBucket: '2-5y', total: 20 },
      { maturityBucket: '5-10y', total: 30 }, { maturityBucket: '10y+', total: 40 },
    ];
    expect(grouped(buckets, ['maturityBucket', 'total'])?.kind).toBe('line');
  });

  /** Vertical bars truncate long labels into nonsense. */
  it('goes horizontal when labels are long', () => {
    const issuers = [
      { issuer: 'International Business Machines', total: 10 },
      { issuer: 'Wells Fargo & Company', total: 20 },
      { issuer: 'Johnson & Johnson Services', total: 30 },
    ];
    expect(grouped(issuers, ['issuer', 'total'])?.kind).toBe('hbar');
  });

  it('goes horizontal when there are many categories', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ desk: `D${i}`, total: i + 1 }));
    expect(grouped(many, ['desk', 'total'])?.kind).toBe('hbar');
  });

  it('picks vertical bars for a middling set of short labels', () => {
    const mid = Array.from({ length: 7 }, (_, i) => ({ desk: `D${i}`, total: i + 1 }));
    expect(grouped(mid, ['desk', 'total'])?.kind).toBe('bar');
  });

  /** Two numeric columns over raw rows is the one case a table really can't
   *  show — coupon against yield, say. */
  it('picks a scatter for two numeric columns over raw rows', () => {
    const rows = Array.from({ length: 8 }, (_, i) => ({ ticker: `T${i}`, coupon: i, ytm: i * 1.5 }));
    const spec = raw(rows, ['ticker', 'coupon', 'ytm']);
    expect(spec?.kind).toBe('scatter');
    expect(spec?.yKey).toBe('ytm');
    expect(spec?.points[0]).toMatchObject({ value: 0, y: 0 });
  });

  it('does not scatter a grouped result', () => {
    const rows = Array.from({ length: 8 }, (_, i) => ({ sector: `S${i}`, a: i, b: i * 2 }));
    expect(grouped(rows, ['sector', 'a', 'b'])?.kind).not.toBe('scatter');
  });
});

describe('when there is nothing worth drawing', () => {
  it('returns nothing for a single row', () => {
    expect(grouped([{ sector: 'Tech', total: 300 }], ['sector', 'total'])).toBeUndefined();
  });

  it('returns nothing when every value is zero', () => {
    expect(grouped([{ s: 'a', v: 0 }, { s: 'b', v: 0 }], ['s', 'v'])).toBeUndefined();
  });

  it('returns nothing without a numeric column', () => {
    expect(grouped([{ a: 'x', b: 'y' }, { a: 'p', b: 'q' }], ['a', 'b'])).toBeUndefined();
  });

  it('honours an explicit "none"', () => {
    expect(grouped(SECTORS, ['sector', 'total'], 'none')).toBeUndefined();
  });

  /**
   * `'heatmap'` is a table-shading MODE, not a recharts kind. Without this
   * bail, `resolveKind`'s unconditional passthrough for an explicit request
   * would hand the renderer a `kind: 'heatmap'` it has no branch for, and it
   * would silently fall through to a nonsense bar chart instead of nothing
   * being drawn.
   */
  it('honours an explicit "heatmap" — draws nothing, the caller renders a shaded table instead', () => {
    expect(grouped(SECTORS, ['sector', 'total'], 'heatmap')).toBeUndefined();
  });
});

describe('explicit overrides', () => {
  it('draws what was asked for', () => {
    expect(grouped(SECTORS, ['sector', 'total'], 'hbar')?.kind).toBe('hbar');
    expect(grouped(SECTORS, ['sector', 'total'], 'area')?.kind).toBe('area');
    expect(grouped(SECTORS, ['sector', 'total'], 'line')?.kind).toBe('line');
  });

  /** Honour the intent, not the impossible instruction. */
  it('downgrades a requested pie that has negative values', () => {
    const withLoss = [...SECTORS, { sector: 'Credit', total: -50 }];
    expect(grouped(withLoss, ['sector', 'total'], 'pie')?.kind).toBe('bar');
  });

  it('refuses a scatter with only one numeric column', () => {
    expect(raw(SECTORS, ['sector', 'total'], 'scatter')).toBeUndefined();
  });

  it('allows a small scatter when explicitly asked', () => {
    const rows = [{ t: 'a', x: 1, y: 2 }, { t: 'b', x: 2, y: 4 }];
    expect(raw(rows, ['t', 'x', 'y'], 'scatter')?.kind).toBe('scatter');
  });
});

describe('the caption', () => {
  it('names both columns and the reading', () => {
    expect(grouped(SECTORS, ['sector', 'total'])?.caption).toContain('total by sector');
    expect(grouped(SECTORS, ['sector', 'total'])?.caption).toContain('share of total');
  });

  it('describes a scatter as one column against the other', () => {
    const rows = Array.from({ length: 8 }, (_, i) => ({ t: `T${i}`, coupon: i, ytm: i }));
    expect(raw(rows, ['t', 'coupon', 'ytm'])?.caption).toBe('ytm against coupon, 8 points');
  });
});

describe('point limits', () => {
  /** A chart of 500 bars is a smear; the table underneath carries the detail. */
  it('caps the categories it plots', () => {
    const many = Array.from({ length: 90 }, (_, i) => ({ desk: `D${i}`, total: i + 1 }));
    expect(grouped(many, ['desk', 'total'])!.points.length).toBe(24);
  });
});
