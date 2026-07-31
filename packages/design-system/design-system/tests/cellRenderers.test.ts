// @vitest-environment jsdom
/**
 * Renderer-class smoke tests.
 *
 * For each new configurable renderer, instantiate it, drive `init`
 * with a representative `params` shape, then assert the produced
 * DOM. These aren't snapshot-style — they pin a few high-signal
 * structural / textual / style outputs per renderer so a refactor
 * doesn't silently change the user-visible cell content.
 *
 * Theme is forced to 'dark' for every test (the renderers read
 * `<html data-theme>` at init time).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AllocationBarCellRenderer,
  CountryFlagCellRenderer,
  HeatmapCellRenderer,
  IconTextCellRenderer,
  MultiLineCellRenderer,
  PercentBarCellRenderer,
  PillCellRenderer,
  RatingDeltaCellRenderer,
  SparklineCellRenderer,
  TimeSinceCellRenderer,
  TrendArrowCellRenderer,
} from '../src/cellRenderers';
import type { ICellRendererParams } from 'ag-grid-community';

beforeEach(() => {
  document.documentElement.setAttribute('data-theme', 'dark');
});

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
});

function makeParams<T extends object>(extra: T): ICellRendererParams & T {
  return {
    value: undefined,
    data: undefined,
    node: {} as never,
    api: {} as never,
    columnApi: {} as never,
    context: {} as never,
    eGridCell: document.createElement('div'),
    eParentOfValue: document.createElement('div'),
    refreshCell: () => {},
    setValue: () => {},
    formatValue: () => '',
    valueFormatted: null,
    rowIndex: 0,
    ...extra,
  } as unknown as ICellRendererParams & T;
}

describe('PillCellRenderer', () => {
  it('paints a pill with rule-matched bg + fg', () => {
    const r = new PillCellRenderer();
    r.init(
      makeParams({
        value: 'Filled',
        rules: [
          { value: 'Filled', bg: { dark: '#22c55e' }, fg: { dark: '#ffffff' } },
        ],
      }),
    );
    const gui = r.getGui();
    expect(gui.textContent).toBe('Filled');
    expect(gui.style.background).toBe('rgb(34, 197, 94)');
    expect(gui.style.color).toBe('rgb(255, 255, 255)');
    expect(gui.style.borderRadius).toBe('9999px');
    r.destroy?.();
  });

  it('falls back to plain text when no rule matches and no fallback', () => {
    const r = new PillCellRenderer();
    r.init(
      makeParams({
        value: 'Unknown',
        rules: [{ value: 'Filled', bg: { dark: '#22c55e' } }],
      }),
    );
    const gui = r.getGui();
    expect(gui.textContent).toBe('Unknown');
    expect(gui.getAttribute('style')).toBeFalsy();
    r.destroy?.();
  });

  it('uses fallback style when value does not match any rule', () => {
    const r = new PillCellRenderer();
    r.init(
      makeParams({
        value: 'Other',
        rules: [{ value: 'X', bg: { dark: '#22c55e' } }],
        fallback: { bg: { dark: '#777777' } },
      }),
    );
    expect(r.getGui().style.background).toBe('rgb(119, 119, 119)');
    r.destroy?.();
  });

  it('honours square shape', () => {
    const r = new PillCellRenderer();
    r.init(
      makeParams({
        value: 'X',
        rules: [{ value: 'X', bg: { dark: '#22c55e' } }],
        shape: 'square',
      }),
    );
    expect(r.getGui().style.borderRadius).toBe('2px');
    r.destroy?.();
  });
});

describe('HeatmapCellRenderer', () => {
  it('interpolates between min and max', () => {
    const r = new HeatmapCellRenderer();
    r.init(
      makeParams({
        value: 50,
        domain: { min: 0, max: 100 },
        colorScale: {
          min: { dark: '#000000' },
          max: { dark: '#ffffff' },
        },
      }),
    );
    const gui = r.getGui();
    // 50% of [#000000, #ffffff] ≈ rgb(128, 128, 128)
    expect(gui.style.background).toMatch(/^rgb\(12[7-8], 12[7-8], 12[7-8]\)$/);
    r.destroy?.();
  });

  it('handles three-stop gradient through mid', () => {
    const r = new HeatmapCellRenderer();
    r.init(
      makeParams({
        value: 25,
        domain: { min: 0, max: 100 },
        colorScale: {
          min: { dark: '#000000' },
          mid: { dark: '#ff0000' },
          max: { dark: '#0000ff' },
        },
      }),
    );
    // At t=0.25 (below mid 0.5), interpolate min↔mid at 0.5
    expect(r.getGui().style.background).toBe('rgb(128, 0, 0)');
    r.destroy?.();
  });
});

describe('PercentBarCellRenderer', () => {
  it('renders a proportional bar element', () => {
    const r = new PercentBarCellRenderer();
    r.init(
      makeParams({
        value: 30,
        max: 100,
        barColor: { dark: '#3b82f6' },
      }),
    );
    const bar = r.getGui().firstChild as HTMLElement;
    expect(bar?.style.width).toBe('30%');
    expect(bar?.style.background).toBe('rgb(59, 130, 246)');
    r.destroy?.();
  });

  it('shows percent label when configured', () => {
    const r = new PercentBarCellRenderer();
    r.init(
      makeParams({
        value: 75,
        max: 100,
        barColor: { dark: '#22c55e' },
        showPercent: true,
      }),
    );
    expect(r.getGui().textContent).toBe('75%');
    r.destroy?.();
  });
});

describe('TrendArrowCellRenderer', () => {
  it('renders up arrow for positive value', () => {
    const r = new TrendArrowCellRenderer();
    r.init(
      makeParams({
        value: 1.23,
        upColor: { dark: '#22c55e' },
        downColor: { dark: '#ef4444' },
      }),
    );
    const gui = r.getGui();
    expect(gui.textContent).toContain('▲');
    expect(gui.textContent).toContain('+1.23');
    r.destroy?.();
  });

  it('renders down arrow for negative value', () => {
    const r = new TrendArrowCellRenderer();
    r.init(
      makeParams({
        value: -0.5,
        upColor: { dark: '#22c55e' },
        downColor: { dark: '#ef4444' },
      }),
    );
    expect(r.getGui().textContent).toContain('▼');
    r.destroy?.();
  });

  it('respects threshold dead-band', () => {
    const r = new TrendArrowCellRenderer();
    r.init(
      makeParams({
        value: 0.001,
        threshold: 0.01,
        upColor: { dark: '#22c55e' },
        downColor: { dark: '#ef4444' },
      }),
    );
    expect(r.getGui().textContent).toContain('◆');
    r.destroy?.();
  });
});

describe('SparklineCellRenderer', () => {
  it('emits an inline svg with a polyline for line variant', () => {
    const r = new SparklineCellRenderer();
    r.init(
      makeParams({
        value: [1, 3, 2, 4, 5],
        variant: 'line',
        lineColor: { dark: '#22c55e' },
      }),
    );
    const svg = r.getGui().querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg!.querySelector('polyline')).toBeTruthy();
    r.destroy?.();
  });

  it('renders bars for bar variant', () => {
    const r = new SparklineCellRenderer();
    r.init(
      makeParams({
        value: [1, 2, 3],
        variant: 'bar',
        lineColor: { dark: '#3b82f6' },
      }),
    );
    expect(r.getGui().querySelectorAll('rect').length).toBe(3);
    r.destroy?.();
  });
});

describe('MultiLineCellRenderer', () => {
  it('renders primary value plus secondary field', () => {
    const r = new MultiLineCellRenderer();
    r.init(
      makeParams({
        value: 'AAPL',
        data: { ticker: 'AAPL', name: 'Apple Inc.' },
        secondaryField: 'name',
      }),
    );
    const children = r.getGui().children;
    expect(children[0]?.textContent).toBe('AAPL');
    expect(children[1]?.textContent).toBe('Apple Inc.');
    r.destroy?.();
  });
});

describe('IconTextCellRenderer', () => {
  it('renders icon-svg and text in left position by default', () => {
    const r = new IconTextCellRenderer();
    r.init(
      makeParams({
        value: 'Bond',
        iconId: 'bond',
        iconSvg: '<svg xmlns="http://www.w3.org/2000/svg"><path d="M1 2"/></svg>',
        position: 'left',
      }),
    );
    const children = r.getGui().children;
    expect(children[0]?.querySelector('svg')).toBeTruthy();
    expect(children[1]?.textContent).toBe('Bond');
    r.destroy?.();
  });

  it('puts icon after text when position=right', () => {
    const r = new IconTextCellRenderer();
    r.init(
      makeParams({
        value: 'Trade',
        iconId: 'trade',
        iconSvg: '<svg><path d="M1 2"/></svg>',
        position: 'right',
      }),
    );
    const children = r.getGui().children;
    expect(children[0]?.textContent).toBe('Trade');
    expect(children[1]?.querySelector('svg')).toBeTruthy();
    r.destroy?.();
  });
});

describe('CountryFlagCellRenderer', () => {
  it('emits regional-indicator emoji from the cell value when no codeField configured', () => {
    const r = new CountryFlagCellRenderer();
    r.init(
      makeParams({
        value: 'GB',
        data: { name: 'United Kingdom' },
      }),
    );
    const flag = r.getGui().firstChild as HTMLElement;
    expect(flag?.textContent).toBe('🇬🇧');
  });

  it('reads codeField + labelField when configured', () => {
    const r = new CountryFlagCellRenderer();
    r.init(
      makeParams({
        value: 'whatever',
        data: { iso2: 'JP', country: 'Japan' },
        codeField: 'iso2',
        labelField: 'country',
        showLabel: true,
      }),
    );
    const kids = r.getGui().children;
    expect(kids[0]?.textContent).toBe('🇯🇵');
    expect(kids[1]?.textContent).toBe('Japan');
  });

  it('maps ISO-4217 currency codes to the issuing country flag (USD → 🇺🇸)', () => {
    const r = new CountryFlagCellRenderer();
    r.init(makeParams({ value: 'USD' }));
    const flag = r.getGui().firstChild as HTMLElement;
    expect(flag?.textContent).toBe('🇺🇸');
  });

  it('maps EUR to the regional-indicator EU flag (🇪🇺)', () => {
    const r = new CountryFlagCellRenderer();
    r.init(makeParams({ value: 'EUR' }));
    expect((r.getGui().firstChild as HTMLElement)?.textContent).toBe('🇪🇺');
  });

  it('maps GBP / JPY / CHF / CAD to their countries', () => {
    const r = new CountryFlagCellRenderer();
    r.init(makeParams({ value: 'GBP' }));
    expect((r.getGui().firstChild as HTMLElement)?.textContent).toBe('🇬🇧');
    const r2 = new CountryFlagCellRenderer();
    r2.init(makeParams({ value: 'JPY' }));
    expect((r2.getGui().firstChild as HTMLElement)?.textContent).toBe('🇯🇵');
    const r3 = new CountryFlagCellRenderer();
    r3.init(makeParams({ value: 'CHF' }));
    expect((r3.getGui().firstChild as HTMLElement)?.textContent).toBe('🇨🇭');
    const r4 = new CountryFlagCellRenderer();
    r4.init(makeParams({ value: 'CAD' }));
    expect((r4.getGui().firstChild as HTMLElement)?.textContent).toBe('🇨🇦');
  });

  it('emits empty flag for unknown 3-letter inputs (bullion / crypto)', () => {
    const r = new CountryFlagCellRenderer();
    r.init(makeParams({ value: 'XAU' })); // gold, no country
    expect((r.getGui().firstChild as HTMLElement)?.textContent).toBe('');
  });
});

describe('RatingDeltaCellRenderer', () => {
  const scale = ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC', 'D'];

  it('shows up arrow on upgrade', () => {
    const r = new RatingDeltaCellRenderer();
    r.init(
      makeParams({
        value: 'AA',
        data: { prevRating: 'A' },
        scale,
        previousField: 'prevRating',
        upColor: { dark: '#22c55e' },
        downColor: { dark: '#ef4444' },
      }),
    );
    expect(r.getGui().textContent).toContain('▲');
    r.destroy?.();
  });

  it('shows down arrow on downgrade', () => {
    const r = new RatingDeltaCellRenderer();
    r.init(
      makeParams({
        value: 'BB',
        data: { prevRating: 'A' },
        scale,
        previousField: 'prevRating',
        upColor: { dark: '#22c55e' },
        downColor: { dark: '#ef4444' },
      }),
    );
    expect(r.getGui().textContent).toContain('▼');
    r.destroy?.();
  });

  it('shows no arrow when rating is unchanged', () => {
    const r = new RatingDeltaCellRenderer();
    r.init(
      makeParams({
        value: 'A',
        data: { prevRating: 'A' },
        scale,
        previousField: 'prevRating',
        upColor: { dark: '#22c55e' },
        downColor: { dark: '#ef4444' },
      }),
    );
    expect(r.getGui().textContent).toBe('A');
    r.destroy?.();
  });
});

describe('TimeSinceCellRenderer', () => {
  it('formats a 5-minute-old timestamp as "5m ago"', () => {
    const r = new TimeSinceCellRenderer();
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    r.init(makeParams({ value: fiveMinAgo }));
    expect(r.getGui().textContent).toMatch(/5m ago/);
    r.destroy?.();
  });

  it('handles future timestamps with "from now" suffix', () => {
    const r = new TimeSinceCellRenderer();
    r.init(makeParams({ value: Date.now() + 60 * 60 * 1000 }));
    expect(r.getGui().textContent).toMatch(/from now/);
    r.destroy?.();
  });
});

describe('AllocationBarCellRenderer', () => {
  it('renders one segment per key with proportional widths', () => {
    const r = new AllocationBarCellRenderer();
    r.init(
      makeParams({
        value: { equity: 60, bonds: 30, cash: 10 },
        segmentColorMap: {
          equity: { dark: '#3b82f6' },
          bonds: { dark: '#22c55e' },
          cash: { dark: '#9ca3af' },
        },
        legend: false,
      }),
    );
    const bar = r.getGui().firstChild as HTMLElement;
    expect(bar.children.length).toBe(3);
    const widths = Array.from(bar.children).map((c) => (c as HTMLElement).style.width);
    expect(widths).toEqual(['60%', '30%', '10%']);
    r.destroy?.();
  });
});
