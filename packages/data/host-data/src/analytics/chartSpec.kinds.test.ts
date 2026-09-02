import { describe, expect, it } from 'vitest';
import {
  buildChartSpec,
  chartColor,
  fillForStyle,
  CHART_KINDS,
  SUMMARY_CHART_KINDS,
  NEGATIVE_COLOR,
  POSITIVE_COLOR,
  SERIES_COLOR,
  type ChartInput,
} from './chartSpec.js';

/**
 * The kinds added so the assistant can answer a trader's question with the
 * chart that question actually wants. Every one of them is TRUSTED code
 * selected by name — the model picks a kind, it never supplies drawing
 * instructions — so what needs testing is that a name it picks either
 * produces the right shape or produces nothing.
 */
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

describe('the widened vocabulary', () => {
  it('offers every kind the renderer has a branch for', () => {
    for (const kind of ['treemap', 'combo', 'waterfall', 'sankey', 'funnel', 'radar', 'candlestick']) {
      expect(CHART_KINDS).toContain(kind);
    }
  });

  /** A digest is stat cards plus a 1-D breakdown. There is no second measure,
   *  no from/to pair and no OHLC in one, so offering these to
   *  `summarize_grid_data` would be offering a choice that silently does
   *  nothing. */
  it('withholds from a digest the kinds a digest cannot supply data for', () => {
    for (const impossible of ['heatmap', 'combo', 'sankey', 'candlestick']) {
      expect(SUMMARY_CHART_KINDS).not.toContain(impossible);
    }
    // The 1-D kinds are still on the menu.
    for (const fine of ['treemap', 'funnel', 'radar', 'waterfall']) {
      expect(SUMMARY_CHART_KINDS).toContain(fine);
    }
  });

  /** `auto` picks from shape alone. These kinds answer a specific spoken
   *  question ("where is the concentration", "what moved P&L") that column
   *  shapes carry no signal about, so guessing would be wrong more often
   *  than right. */
  it('never resolves to one of them on its own', () => {
    const autoKinds = new Set<string>();
    autoKinds.add(grouped(SECTORS, ['sector', 'total'], 'auto')!.kind);
    autoKinds.add(grouped([...SECTORS, { sector: 'Financials', total: -50 }], ['sector', 'total'])!.kind);
    autoKinds.add(
      grouped(
        Array.from({ length: 12 }, (_, i) => ({ sector: `S${i}`, total: i * 10 + 5 })),
        ['sector', 'total'],
      )!.kind,
    );
    for (const kind of autoKinds) {
      expect(['bar', 'hbar', 'line', 'pie', 'area', 'scatter']).toContain(kind);
    }
  });
});

describe('treemap', () => {
  it('encodes the category in colour, because telling tiles apart is the chart', () => {
    const spec = grouped(SECTORS, ['sector', 'total'], 'treemap')!;
    expect(spec.kind).toBe('treemap');
    expect(spec.points.map((p) => p.fill)).toEqual([chartColor(0), chartColor(1), chartColor(2)]);
  });

  /** A rectangle of negative area does not exist. Rather than draw a lie, the
   *  request degrades to the chart that can show a negative. */
  it('degrades to a bar chart when a value is negative', () => {
    const spec = grouped([...SECTORS, { sector: 'FX', total: -80 }], ['sector', 'total'], 'treemap')!;
    expect(spec.kind).toBe('bar');
  });
});

describe('funnel', () => {
  it('orders stages largest to smallest, so it never widens again', () => {
    const spec = grouped(
      [
        { stage: 'Priced', total: 100 },
        { stage: 'Enquiry', total: 400 },
        { stage: 'Quoted', total: 250 },
      ],
      ['stage', 'total'],
      'funnel',
    )!;
    expect(spec.kind).toBe('funnel');
    expect(spec.points.map((p) => p.label)).toEqual(['Enquiry', 'Quoted', 'Priced']);
  });
});

describe('waterfall', () => {
  const STEPS = [
    { desk: 'Rates', pnl: 500 },
    { desk: 'Credit', pnl: -200 },
    { desk: 'FX', pnl: 300 },
  ];

  /** Each bar floats between the running total before it and after it — that
   *  is the whole point of the chart, and it is arithmetic, so the spec owns
   *  it rather than the renderer. */
  it('stacks each step on the running total before it', () => {
    const spec = grouped(STEPS, ['desk', 'pnl'], 'waterfall')!;
    expect(spec.kind).toBe('waterfall');
    expect(spec.points.map((p) => p.base)).toEqual([0, 300, 300]);
    expect(spec.points.map((p) => p.span)).toEqual([500, 200, 300]);
  });

  /** A negative step must draw DOWNWARD from the previous total. Its floor is
   *  therefore where it ends, not where it started. */
  it('floors a negative step at where it ends', () => {
    const spec = grouped(STEPS, ['desk', 'pnl'], 'waterfall')!;
    const credit = spec.points[1];
    expect(credit.base).toBe(300);
    expect(credit.base! + credit.span!).toBe(500);
  });

  it('keeps the signed delta on `value` so the tooltip can show the real number', () => {
    const spec = grouped(STEPS, ['desk', 'pnl'], 'waterfall')!;
    expect(spec.points.map((p) => p.value)).toEqual([500, -200, 300]);
  });

  it('colours steps by sign, which is what a trader reads red and green as', () => {
    const spec = grouped(STEPS, ['desk', 'pnl'], 'waterfall')!;
    expect(spec.points.map((p) => p.fill)).toEqual([POSITIVE_COLOR, NEGATIVE_COLOR, POSITIVE_COLOR]);
  });
});

describe('combo', () => {
  const ROWS = [
    { sector: 'Tech', notional: 4_000_000, yieldPct: 3.2 },
    { sector: 'Energy', notional: 2_500_000, yieldPct: 5.1 },
    { sector: 'Utils', notional: 900_000, yieldPct: 4.4 },
  ];

  it('puts the first measure on the bars and the second on the line', () => {
    const spec = grouped(ROWS, ['sector', 'notional', 'yieldPct'], 'combo')!;
    expect(spec.kind).toBe('combo');
    expect(spec.valueKey).toBe('notional');
    expect(spec.yKey).toBe('yieldPct');
    expect(spec.points.map((p) => p.value)).toEqual([4_000_000, 2_500_000, 900_000]);
    expect(spec.points.map((p) => p.y)).toEqual([3.2, 5.1, 4.4]);
  });

  /** Asking for a two-measure chart of one measure should say so by drawing
   *  nothing, not by quietly rendering a bar chart of a different question. */
  it('returns nothing when there is only one measure to plot', () => {
    expect(grouped(SECTORS, ['sector', 'total'], 'combo')).toBeUndefined();
  });

  it('is one series, so the bars share a hue unless the measure is signed', () => {
    const spec = grouped(ROWS, ['sector', 'notional', 'yieldPct'], 'combo')!;
    expect(new Set(spec.points.map((p) => p.fill))).toEqual(new Set([SERIES_COLOR]));
  });
});

describe('sankey', () => {
  const FLOWS = [
    { fromDesk: 'Rates', toDesk: 'Client A', notional: 100 },
    { fromDesk: 'Rates', toDesk: 'Client B', notional: 60 },
    { fromDesk: 'Credit', toDesk: 'Client A', notional: 40 },
  ];

  it('builds nodes and links from two categoricals and a measure', () => {
    const spec = raw(FLOWS, ['fromDesk', 'toDesk', 'notional'], 'sankey')!;
    expect(spec.kind).toBe('sankey');
    expect(spec.links).toHaveLength(3);
    expect(spec.nodes!.map((n) => n.name).sort()).toEqual(['Client A', 'Client B', 'Credit', 'Rates']);
  });

  it('sums repeated pairs instead of drawing parallel ribbons between them', () => {
    const spec = raw(
      [...FLOWS, { fromDesk: 'Rates', toDesk: 'Client A', notional: 25 }],
      ['fromDesk', 'toDesk', 'notional'],
      'sankey',
    )!;
    expect(spec.links).toHaveLength(3);
    expect(Math.max(...spec.links!.map((l) => l.value))).toBe(125);
  });

  /**
   * Recharts' sankey layout requires an acyclic graph. A name appearing on
   * both sides would otherwise close a loop the layout cannot resolve, so the
   * two sides get separate node entries even when they read the same.
   */
  it('keeps a name that appears on both sides as two separate nodes', () => {
    const spec = raw(
      [
        { fromDesk: 'Rates', toDesk: 'Credit', notional: 100 },
        { fromDesk: 'Credit', toDesk: 'Rates', notional: 60 },
      ],
      ['fromDesk', 'toDesk', 'notional'],
      'sankey',
    )!;
    expect(spec.nodes).toHaveLength(4);
    for (const link of spec.links!) {
      expect(link.source).not.toBe(link.target);
    }
  });

  /** A ribbon's width IS the value; there is no way to draw a negative one. */
  it('drops non-positive flows rather than drawing an impossible ribbon', () => {
    const spec = raw(
      [...FLOWS, { fromDesk: 'FX', toDesk: 'Client C', notional: -50 }],
      ['fromDesk', 'toDesk', 'notional'],
      'sankey',
    )!;
    expect(spec.links).toHaveLength(3);
    expect(spec.nodes!.map((n) => n.name)).not.toContain('Client C');
  });

  it('returns nothing without two categorical columns to flow between', () => {
    expect(grouped(SECTORS, ['sector', 'total'], 'sankey')).toBeUndefined();
  });
});

describe('candlestick', () => {
  const BARS = [
    { day: '2026-08-01', open: 100, high: 108, low: 99, close: 105 },
    { day: '2026-08-02', open: 105, high: 106, low: 96, close: 98 },
  ];

  it('carries all four prices per period', () => {
    const spec = raw(BARS, ['day', 'open', 'high', 'low', 'close'], 'candlestick')!;
    expect(spec.kind).toBe('candlestick');
    expect(spec.points[0]).toMatchObject({ open: 100, high: 108, low: 99, close: 105 });
  });

  /** Up and down candles — the one convention every trader already reads. */
  it('colours a down period red and an up period green', () => {
    const spec = raw(BARS, ['day', 'open', 'high', 'low', 'close'], 'candlestick')!;
    expect(spec.points[0].fill).toBe(POSITIVE_COLOR);
    expect(spec.points[1].fill).toBe(NEGATIVE_COLOR);
  });

  /** A grouped OHLC query names its columns `first_open`, `max_high` and so
   *  on — the aggregate prefix must not hide them. */
  it('finds the four columns through an aggregate prefix', () => {
    const spec = grouped(
      [
        { day: '2026-08-01', first_open: 100, max_high: 108, min_low: 99, last_close: 105 },
        { day: '2026-08-02', first_open: 105, max_high: 106, min_low: 96, last_close: 98 },
      ],
      ['day', 'first_open', 'max_high', 'min_low', 'last_close'],
      'candlestick',
    )!;
    expect(spec.kind).toBe('candlestick');
    expect(spec.points[0].high).toBe(108);
  });

  /** `value` is what every generic reader of a point uses — tooltip, axis
   *  domain, "how big is this". The close is the number that matters. */
  it('exposes the close as the generic value', () => {
    const spec = raw(BARS, ['day', 'open', 'high', 'low', 'close'], 'candlestick')!;
    expect(spec.points.map((p) => p.value)).toEqual([105, 98]);
  });

  it('returns nothing when the four columns are not all there', () => {
    expect(raw(BARS.map(({ day, open, close }) => ({ day, open, close })), ['day', 'open', 'close'], 'candlestick')).toBeUndefined();
  });
});

/**
 * `ChartStyle.palette` was accepted and validated but never consulted, so
 * "colour these by sign" wrote cleanly and changed nothing.
 */
describe('the palette override', () => {
  it('forces one hue for `single`', () => {
    expect(fillForStyle('bar', -5, 3, true, 'single')).toBe(SERIES_COLOR);
  });

  it('walks the ramp for `categorical`', () => {
    expect(fillForStyle('bar', 5, 1, false, 'categorical')).toBe(chartColor(1));
  });

  it('uses red and green for `sign`, even on an unsigned series', () => {
    expect(fillForStyle('bar', -5, 0, false, 'sign')).toBe(NEGATIVE_COLOR);
    expect(fillForStyle('bar', 5, 0, false, 'sign')).toBe(POSITIVE_COLOR);
  });

  it('falls back to the per-kind rule for `auto` and when unset', () => {
    expect(fillForStyle('pie', 5, 2, false, 'auto')).toBe(chartColor(2));
    expect(fillForStyle('bar', -5, 2, true, undefined)).toBe(NEGATIVE_COLOR);
    expect(fillForStyle('bar', 5, 2, false, undefined)).toBe(SERIES_COLOR);
  });
});
