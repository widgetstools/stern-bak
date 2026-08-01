import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ICellRendererParams } from 'ag-grid-community';
import {
  AllocationBarCellRenderer,
  BookNameRenderer,
  ChangeValueRenderer,
  ColoredValueRenderer,
  CountryFlagCellRenderer,
  FilledAmountRenderer,
  HeatmapCellRenderer,
  IconTextCellRenderer,
  MultiLineCellRenderer,
  OasValueRenderer,
  PercentBarCellRenderer,
  PillCellRenderer,
  PnlValueRenderer,
  RatingBadgeRenderer,
  RatingDeltaCellRenderer,
  RfqStatusRenderer,
  SideCellRenderer,
  SignedValueRenderer,
  SparklineCellRenderer,
  StatusBadgeRenderer,
  TickerCellRenderer,
  TimeSinceCellRenderer,
  TrendArrowCellRenderer,
  YtdValueRenderer,
} from './cellRenderers';

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

describe('Simple Cell Renderers', () => {
  describe('SideCellRenderer', () => {
    it('renders BUY side in positive color', () => {
      const renderer = new SideCellRenderer();
      renderer.init({ value: 'Buy' } as ICellRendererParams);
      const el = renderer.getGui();
      expect(el.textContent).toBe('BUY');
      expect(el.style.color).toContain('positive');
    });

    it('renders SELL side in negative color', () => {
      const renderer = new SideCellRenderer();
      renderer.init({ value: 'Sell' } as ICellRendererParams);
      const el = renderer.getGui();
      expect(el.textContent).toBe('SELL');
      expect(el.style.color).toContain('negative');
    });

    it('handles B abbreviation', () => {
      const renderer = new SideCellRenderer();
      renderer.init({ value: 'B' } as ICellRendererParams);
      expect(renderer.getGui().textContent).toBe('BUY');
    });

    it('refresh returns false', () => {
      const renderer = new SideCellRenderer();
      renderer.init({ value: 'Buy' } as ICellRendererParams);
      expect(renderer.refresh()).toBe(false);
    });
  });

  describe('StatusBadgeRenderer', () => {
    it('renders Filled status', () => {
      const renderer = new StatusBadgeRenderer();
      renderer.init({ value: 'Filled' } as ICellRendererParams);
      expect(renderer.getGui().textContent).toBe('Filled');
      expect(renderer.getGui().style.background).toContain('positive');
    });

    it('renders Partial status', () => {
      const renderer = new StatusBadgeRenderer();
      renderer.init({ value: 'Partial' } as ICellRendererParams);
      expect(renderer.getGui().style.background).toContain('warning');
    });

    it('renders Pending status', () => {
      const renderer = new StatusBadgeRenderer();
      renderer.init({ value: 'Pending' } as ICellRendererParams);
      expect(renderer.getGui().style.background).toContain('info');
    });

    it('renders Cancelled status', () => {
      const renderer = new StatusBadgeRenderer();
      renderer.init({ value: 'Cancelled' } as ICellRendererParams);
      expect(renderer.getGui().style.background).toContain('negative');
    });

    it('renders Working status', () => {
      const renderer = new StatusBadgeRenderer();
      renderer.init({ value: 'Working' } as ICellRendererParams);
      expect(renderer.getGui().style.background).toContain('info');
    });

    it('renders unknown status as Pending', () => {
      const renderer = new StatusBadgeRenderer();
      renderer.init({ value: 'Unknown' } as ICellRendererParams);
      expect(renderer.getGui().style.background).toContain('info');
    });
  });

  describe('ColoredValueRenderer', () => {
    it('renders positive value in positive color', () => {
      const renderer = new ColoredValueRenderer();
      renderer.init({ value: 42, valueFormatted: '42' } as ICellRendererParams);
      const el = renderer.getGui();
      expect(el.textContent).toContain('+42');
      expect(el.style.color).toContain('positive');
    });

    it('renders negative value in negative color', () => {
      const renderer = new ColoredValueRenderer();
      renderer.init({ value: -15, valueFormatted: '-15' } as ICellRendererParams);
      const el = renderer.getGui();
      expect(el.textContent).toContain('-15');
      expect(el.style.color).toContain('negative');
    });

    it('renders zero without plus prefix', () => {
      const renderer = new ColoredValueRenderer();
      renderer.init({ value: 0, valueFormatted: '0' } as ICellRendererParams);
      const el = renderer.getGui();
      expect(el.textContent).toContain('0');
      expect(el.style.color).toContain('positive');
    });

    it('falls back to raw value when valueFormatted is absent', () => {
      const renderer = new ColoredValueRenderer();
      renderer.init({ value: 7 } as ICellRendererParams);
      expect(renderer.getGui().textContent).toContain('+7');
    });
  });

  describe('OasValueRenderer', () => {
    it('renders low OAS in positive color', () => {
      const renderer = new OasValueRenderer();
      renderer.init({ value: 50 } as ICellRendererParams);
      const el = renderer.getGui();
      expect(el.textContent).toBe('+50');
      expect(el.style.color).toContain('positive');
    });

    it('renders high OAS (>80) in warning color', () => {
      const renderer = new OasValueRenderer();
      renderer.init({ value: 95 } as ICellRendererParams);
      expect(renderer.getGui().style.color).toContain('warning');
    });

    it('renders zero and negative values without plus', () => {
      const renderer = new OasValueRenderer();
      renderer.init({ value: 0 } as ICellRendererParams);
      expect(renderer.getGui().textContent).toBe('0');
      renderer.init({ value: -5 } as ICellRendererParams);
      expect(renderer.getGui().textContent).toBe('-5');
    });
  });

  describe('SignedValueRenderer', () => {
    it('renders positive value with plus sign', () => {
      const renderer = new SignedValueRenderer();
      renderer.init({ value: 10, valueFormatted: '10' } as ICellRendererParams);
      expect(renderer.getGui().textContent).toBe('+10');
    });

    it('renders negative value without plus sign', () => {
      const renderer = new SignedValueRenderer();
      renderer.init({ value: -5, valueFormatted: '-5' } as ICellRendererParams);
      expect(renderer.getGui().textContent).toBe('-5');
    });
  });

  describe('TickerCellRenderer', () => {
    it('renders ticker in highlight color', () => {
      const renderer = new TickerCellRenderer();
      renderer.init({ value: 'AAPL' } as ICellRendererParams);
      const el = renderer.getGui();
      expect(el.textContent).toBe('AAPL');
      expect(el.style.color).toContain('highlight');
    });
  });

  describe('RatingBadgeRenderer', () => {
    it('renders aaa rating class', () => {
      const renderer = new RatingBadgeRenderer();
      renderer.init({ value: 'Aaa', data: { rtgClass: 'aaa' } } as ICellRendererParams);
      expect(renderer.getGui().style.background).toContain('positive');
    });

    it('renders aa rating class', () => {
      const renderer = new RatingBadgeRenderer();
      renderer.init({ value: 'Aa1', data: { rtgClass: 'aa' } } as ICellRendererParams);
      expect(renderer.getGui().style.background).toContain('positive');
    });

    it('renders a rating class', () => {
      const renderer = new RatingBadgeRenderer();
      renderer.init({ value: 'A2', data: { rtgClass: 'a' } } as ICellRendererParams);
      expect(renderer.getGui().style.background).toContain('info');
    });

    it('renders hy rating class', () => {
      const renderer = new RatingBadgeRenderer();
      renderer.init({ value: 'Caa', data: { rtgClass: 'hy' } } as ICellRendererParams);
      expect(renderer.getGui().style.background).toContain('negative');
    });

    it('defaults to bbb rating when not provided', () => {
      const renderer = new RatingBadgeRenderer();
      renderer.init({ value: 'Baa', data: {} } as ICellRendererParams);
      expect(renderer.getGui().style.background).toContain('warning');
    });
  });

  describe('PnlValueRenderer', () => {
    it('renders positive profit with K suffix', () => {
      const renderer = new PnlValueRenderer();
      renderer.init({ value: 100 } as ICellRendererParams);
      expect(renderer.getGui().textContent).toBe('+100K');
      expect(renderer.getGui().style.color).toContain('positive');
    });

    it('renders negative loss with K suffix', () => {
      const renderer = new PnlValueRenderer();
      renderer.init({ value: -50 } as ICellRendererParams);
      expect(renderer.getGui().textContent).toBe('-50K');
      expect(renderer.getGui().style.color).toContain('negative');
    });

    it('renders zero as positive', () => {
      const renderer = new PnlValueRenderer();
      renderer.init({ value: 0 } as ICellRendererParams);
      expect(renderer.getGui().textContent).toBe('+0K');
    });
  });

  describe('FilledAmountRenderer', () => {
    it('renders fully filled amount in positive color', () => {
      const renderer = new FilledAmountRenderer();
      renderer.init({ value: 100, data: { qty: 100 } } as ICellRendererParams);
      expect(renderer.getGui().style.color).toContain('positive');
    });

    it('renders partial fill in warning color', () => {
      const renderer = new FilledAmountRenderer();
      renderer.init({ value: 75, data: { qty: 100 } } as ICellRendererParams);
      expect(renderer.getGui().style.color).toContain('warning');
    });
  });

  describe('BookNameRenderer', () => {
    it('renders book name in highlight color', () => {
      const renderer = new BookNameRenderer();
      renderer.init({ value: 'Primary' } as ICellRendererParams);
      expect(renderer.getGui().textContent).toBe('Primary');
      expect(renderer.getGui().style.color).toContain('highlight');
    });
  });

  describe('ChangeValueRenderer', () => {
    it('renders positive change with plus prefix', () => {
      const renderer = new ChangeValueRenderer();
      renderer.init({ value: 2.5 } as ICellRendererParams);
      const el = renderer.getGui();
      expect(el.textContent).toBe('+2.50');
      expect(el.style.color).toContain('positive');
    });

    it('renders negative change without plus prefix', () => {
      const renderer = new ChangeValueRenderer();
      renderer.init({ value: -1.25 } as ICellRendererParams);
      const el = renderer.getGui();
      expect(el.textContent).toBe('-1.25');
      expect(el.style.color).toContain('negative');
    });

    it('renders zero with plus prefix', () => {
      const renderer = new ChangeValueRenderer();
      renderer.init({ value: 0 } as ICellRendererParams);
      expect(renderer.getGui().textContent).toBe('+0.00');
    });
  });

  describe('YtdValueRenderer', () => {
    it('renders positive YTD value', () => {
      const renderer = new YtdValueRenderer();
      renderer.init({ value: '+15%' } as ICellRendererParams);
      expect(renderer.getGui().style.color).toContain('positive');
    });

    it('renders negative YTD value', () => {
      const renderer = new YtdValueRenderer();
      renderer.init({ value: '-8%' } as ICellRendererParams);
      expect(renderer.getGui().style.color).toContain('negative');
    });

    it('treats values without leading plus as negative color', () => {
      const renderer = new YtdValueRenderer();
      renderer.init({ value: '8%' } as ICellRendererParams);
      expect(renderer.getGui().style.color).toContain('negative');
    });
  });

  describe('RfqStatusRenderer', () => {
    it('renders live status', () => {
      const renderer = new RfqStatusRenderer();
      renderer.init({ value: 'live' } as ICellRendererParams);
      const el = renderer.getGui();
      expect(el.textContent).toBe('LIVE');
      expect(el.style.background).toContain('info');
    });

    it('renders done status', () => {
      const renderer = new RfqStatusRenderer();
      renderer.init({ value: 'done' } as ICellRendererParams);
      const el = renderer.getGui();
      expect(el.textContent).toBe('DONE');
      expect(el.style.background).toContain('positive');
    });

    it('renders stale status', () => {
      const renderer = new RfqStatusRenderer();
      renderer.init({ value: 'stale' } as ICellRendererParams);
      const el = renderer.getGui();
      expect(el.textContent).toBe('STALE');
      expect(el.style.background).toContain('neutral');
    });

    it('defaults to live when value is missing', () => {
      const renderer = new RfqStatusRenderer();
      renderer.init({} as ICellRendererParams);
      expect(renderer.getGui().textContent).toBe('LIVE');
    });

    it('falls back to live styling for unknown status', () => {
      const renderer = new RfqStatusRenderer();
      renderer.init({ value: 'unknown' } as ICellRendererParams);
      expect(renderer.getGui().textContent).toBe('UNKNOWN');
      expect(renderer.getGui().style.background).toContain('info');
    });
  });
});

describe('Configurable Renderers', () => {
  beforeEach(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
  });

  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
  });

  describe('PillCellRenderer', () => {
    it('paints a pill with rule-matched bg + fg', () => {
      const r = new PillCellRenderer();
      r.init(
        makeParams({
          value: 'Filled',
          rules: [{ value: 'Filled', bg: { dark: '#22c55e' }, fg: { dark: '#ffffff' } }],
        }),
      );
      const gui = r.getGui();
      expect(gui.textContent).toBe('Filled');
      expect(gui.style.background).toBe('rgb(34, 197, 94)');
      expect(gui.style.borderRadius).toBe('9999px');
      r.destroy();
    });

    it('falls back to plain text when no rule matches and no fallback', () => {
      const r = new PillCellRenderer();
      r.init(
        makeParams({
          value: 'Unknown',
          rules: [{ value: 'Filled', bg: { dark: '#22c55e' } }],
        }),
      );
      expect(r.getGui().getAttribute('style')).toBeFalsy();
      r.destroy();
    });

    it('uses fallback style when value does not match any rule', () => {
      const r = new PillCellRenderer();
      r.init(
        makeParams({
          value: 'Other',
          rules: [{ value: 'X', bg: { dark: '#777777' } }],
          fallback: { bg: { dark: '#777777' } },
        }),
      );
      expect(r.getGui().style.background).toBe('rgb(119, 119, 119)');
      r.destroy();
    });

    it('honours square shape and border color', () => {
      const r = new PillCellRenderer();
      r.init(
        makeParams({
          value: 'X',
          rules: [{
            value: 'X',
            bg: { dark: '#22c55e' },
            border: { dark: '#14532d' },
          }],
          shape: 'square',
        }),
      );
      expect(r.getGui().style.borderRadius).toBe('2px');
      expect(r.getGui().style.border).toContain('1px solid');
      r.destroy();
    });

    it('repaints on refresh and light theme mode', async () => {
      const r = new PillCellRenderer();
      const params = makeParams({
        value: 'A',
        rules: [{ value: 'A', bg: { dark: '#111111', light: '#eeeeee' } }],
      });
      r.init(params);
      expect(r.getGui().style.background).toBe('rgb(17, 17, 17)');
      document.documentElement.setAttribute('data-theme', 'light');
      await new Promise((resolve) => queueMicrotask(resolve));
      expect(r.getGui().style.background).toBe('rgb(238, 238, 238)');
      r.refresh(makeParams({
        value: 'B',
        rules: [{ value: 'B', bg: { dark: '#222222' } }],
      }));
      expect(r.getGui().textContent).toBe('B');
      r.destroy();
    });

    it('uses pickThemeColor fallbacks when mode key is absent', () => {
      const r = new PillCellRenderer();
      r.init(
        makeParams({
          value: 'Z',
          rules: [{ value: 'Z', bg: { light: '#aabbcc' } }],
        }),
      );
      // dark mode falls back to c.light ?? c.dark — only light is set
      expect(r.getGui().style.background).toBe('rgb(170, 187, 204)');
      r.destroy();
    });

    it('renders null value as empty plain text', () => {
      const r = new PillCellRenderer();
      r.init(makeParams({ value: null }));
      expect(r.getGui().textContent).toBe('');
      r.destroy();
    });
  });

  describe('HeatmapCellRenderer', () => {
    it('interpolates between min and max without mid stop', () => {
      const r = new HeatmapCellRenderer();
      r.init(
        makeParams({
          value: 50,
          domain: { min: 0, max: 100 },
          colorScale: { min: { dark: '#000000' }, max: { dark: '#ffffff' } },
        }),
      );
      expect(r.getGui().style.background).toMatch(/^rgb\(12[7-8], 12[7-8], 12[7-8]\)$/);
      r.destroy();
    });

    it('handles three-stop gradient below mid', () => {
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
      expect(r.getGui().style.background).toBe('rgb(128, 0, 0)');
      r.destroy();
    });

    it('handles three-stop gradient above mid', () => {
      const r = new HeatmapCellRenderer();
      r.init(
        makeParams({
          value: 75,
          domain: { min: 0, max: 100 },
          colorScale: {
            min: { dark: '#000000' },
            mid: { dark: '#ff0000' },
            max: { dark: '#0000ff' },
          },
        }),
      );
      expect(r.getGui().style.background).toBe('rgb(128, 0, 128)');
      r.destroy();
    });

    it('uses valueFormatted and strips style for non-finite values', () => {
      const r = new HeatmapCellRenderer();
      r.init(
        makeParams({
          value: 'n/a',
          valueFormatted: 'N/A',
          colorScale: { min: { dark: '#000' }, max: { dark: '#fff' } },
        }),
      );
      expect(r.getGui().textContent).toBe('N/A');
      expect(r.getGui().getAttribute('style')).toBeFalsy();
      r.destroy();
    });

    it('defaults domain to 0..100 when omitted', () => {
      const r = new HeatmapCellRenderer();
      r.init(
        makeParams({
          value: 100,
          colorScale: { min: { dark: '#000000' }, max: { dark: '#ffffff' } },
        }),
      );
      expect(r.getGui().style.background).toBe('rgb(255, 255, 255)');
      r.destroy();
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
      r.destroy();
    });

    it('reads max from data field', () => {
      const r = new PercentBarCellRenderer();
      r.init(
        makeParams({
          value: 25,
          max: { fromField: 'total' },
          data: { total: 50 },
          barColor: { dark: '#3b82f6' },
        }),
      );
      expect((r.getGui().firstChild as HTMLElement).style.width).toBe('50%');
      r.destroy();
    });

    it('shows percent and raw value labels', () => {
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
      r.destroy();

      const r2 = new PercentBarCellRenderer();
      r2.init(
        makeParams({
          value: 42,
          max: 100,
          barColor: { dark: '#22c55e' },
          showValue: true,
        }),
      );
      expect(r2.getGui().textContent).toBe('42');
      r2.destroy();
    });

    it('skips paint when config or value is invalid', () => {
      const r = new PercentBarCellRenderer();
      r.init(makeParams({ value: 10 }));
      expect(r.getGui().childNodes.length).toBe(0);
      r.destroy();

      const r2 = new PercentBarCellRenderer();
      r2.init(makeParams({ value: NaN, max: 100, barColor: { dark: '#000' } }));
      expect(r2.getGui().childNodes.length).toBe(0);
      r2.destroy();
    });
  });

  describe('TrendArrowCellRenderer', () => {
    it('renders up, down, and flat arrows', () => {
      const up = new TrendArrowCellRenderer();
      up.init(makeParams({ value: 1.23, upColor: { dark: '#22c55e' }, downColor: { dark: '#ef4444' } }));
      expect(up.getGui().textContent).toContain('▲');
      up.destroy();

      const down = new TrendArrowCellRenderer();
      down.init(makeParams({ value: -0.5, upColor: { dark: '#22c55e' }, downColor: { dark: '#ef4444' } }));
      expect(down.getGui().textContent).toContain('▼');
      down.destroy();

      const flat = new TrendArrowCellRenderer();
      flat.init(makeParams({
        value: 0.001,
        threshold: 0.01,
        upColor: { dark: '#22c55e' },
        downColor: { dark: '#ef4444' },
        neutralColor: { dark: '#888888' },
      }));
      expect(flat.getGui().textContent).toContain('◆');
      flat.destroy();
    });

    it('hides delta text when showDelta is false', () => {
      const r = new TrendArrowCellRenderer();
      r.init(makeParams({
        value: 2,
        upColor: { dark: '#22c55e' },
        downColor: { dark: '#ef4444' },
        showDelta: false,
      }));
      expect(r.getGui().textContent).toBe('▲');
      r.destroy();
    });
  });

  describe('SparklineCellRenderer', () => {
    it('emits polyline for line variant', () => {
      const r = new SparklineCellRenderer();
      r.init(makeParams({
        value: [1, 3, 2, 4, 5],
        variant: 'line',
        lineColor: { dark: '#22c55e' },
      }));
      expect(r.getGui().querySelector('polyline')).toBeTruthy();
      r.destroy();
    });

    it('renders bars for bar variant', () => {
      const r = new SparklineCellRenderer();
      r.init(makeParams({
        value: [1, 2, 3],
        variant: 'bar',
        lineColor: { dark: '#3b82f6' },
      }));
      expect(r.getGui().querySelectorAll('rect').length).toBe(3);
      r.destroy();
    });

    it('renders filled area for area variant', () => {
      const r = new SparklineCellRenderer();
      r.init(makeParams({
        value: [1, 4, 2],
        variant: 'area',
        lineColor: { dark: '#22c55e' },
        fillColor: { dark: '#14532d' },
      }));
      expect(r.getGui().querySelector('path')).toBeTruthy();
      r.destroy();
    });

    it('skips svg when data is too short or config missing', () => {
      const r = new SparklineCellRenderer();
      r.init(makeParams({ value: [1], variant: 'line', lineColor: { dark: '#000' } }));
      expect(r.getGui().querySelector('svg')).toBeNull();
      r.destroy();
    });
  });

  describe('MultiLineCellRenderer', () => {
    it('renders primary value plus secondary field', () => {
      const r = new MultiLineCellRenderer();
      r.init(makeParams({
        value: 'AAPL',
        data: { name: 'Apple Inc.' },
        secondaryField: 'name',
        secondaryColor: { dark: '#888888' },
        secondarySize: 11,
      }));
      const children = r.getGui().children;
      expect(children[0]?.textContent).toBe('AAPL');
      expect(children[1]?.textContent).toBe('Apple Inc.');
      r.destroy();
    });

    it('renders primary only when secondary is absent', () => {
      const r = new MultiLineCellRenderer();
      r.init(makeParams({
        value: 'AAPL',
        data: {},
        secondaryField: 'missing',
      }));
      expect(r.getGui().children.length).toBe(1);
      r.destroy();
    });
  });

  describe('IconTextCellRenderer', () => {
    it('renders icon-svg and text in left position by default', () => {
      const r = new IconTextCellRenderer();
      r.init(makeParams({
        value: 'Bond',
        iconId: 'bond',
        iconSvg: '<svg xmlns="http://www.w3.org/2000/svg"><path d="M1 2"/></svg>',
      }));
      const children = r.getGui().children;
      expect(children[0]?.querySelector('svg')).toBeTruthy();
      expect(children[1]?.textContent).toBe('Bond');
      r.destroy();
    });

    it('puts icon after text when position=right', () => {
      const r = new IconTextCellRenderer();
      r.init(makeParams({
        value: 'Trade',
        iconId: 'trade',
        iconSvg: '<svg><path d="M1 2"/></svg>',
        position: 'right',
      }));
      const children = r.getGui().children;
      expect(children[0]?.textContent).toBe('Trade');
      expect(children[1]?.querySelector('svg')).toBeTruthy();
      r.destroy();
    });

    it('uses currentColor when iconColor is omitted', () => {
      const r = new IconTextCellRenderer();
      r.init(makeParams({
        value: 'X',
        iconId: 'x',
        iconSvg: '<svg></svg>',
      }));
      expect(r.getGui().firstChild).toBeTruthy();
      r.destroy();
    });
  });

  describe('CountryFlagCellRenderer', () => {
    it('emits regional-indicator emoji from 2-letter code', () => {
      const r = new CountryFlagCellRenderer();
      r.init(makeParams({ value: 'GB' }));
      expect((r.getGui().firstChild as HTMLElement).textContent).toBe('🇬🇧');
    });

    it('maps ISO-4217 currency codes including EUR', () => {
      const us = new CountryFlagCellRenderer();
      us.init(makeParams({ value: 'USD' }));
      expect((us.getGui().firstChild as HTMLElement).textContent).toBe('🇺🇸');

      const eu = new CountryFlagCellRenderer();
      eu.init(makeParams({ value: 'EUR' }));
      expect((eu.getGui().firstChild as HTMLElement).textContent).toBe('🇪🇺');
    });

    it('reads codeField + labelField when configured', () => {
      const r = new CountryFlagCellRenderer();
      r.init(makeParams({
        value: 'ignored',
        data: { iso2: 'JP', country: 'Japan' },
        codeField: 'iso2',
        labelField: 'country',
      }));
      const kids = r.getGui().children;
      expect(kids[0]?.textContent).toBe('🇯🇵');
      expect(kids[1]?.textContent).toBe('Japan');
    });

    it('hides label when showLabel is false', () => {
      const r = new CountryFlagCellRenderer();
      r.init(makeParams({ value: 'US', showLabel: false }));
      expect(r.getGui().children.length).toBe(1);
    });

    it('returns empty flag for bullion codes and non-string input', () => {
      const r = new CountryFlagCellRenderer();
      r.init(makeParams({ value: 'XAU' }));
      expect((r.getGui().firstChild as HTMLElement).textContent).toBe('');

      const r2 = new CountryFlagCellRenderer();
      r2.init(makeParams({ value: 123 as unknown as string }));
      expect((r2.getGui().firstChild as HTMLElement).textContent).toBe('');
    });
  });

  describe('RatingDeltaCellRenderer', () => {
    const scale = ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC', 'D'];

    it('shows up arrow on upgrade and down on downgrade', () => {
      const up = new RatingDeltaCellRenderer();
      up.init(makeParams({
        value: 'AA',
        data: { prevRating: 'A' },
        scale,
        previousField: 'prevRating',
        upColor: { dark: '#22c55e' },
        downColor: { dark: '#ef4444' },
      }));
      expect(up.getGui().textContent).toContain('▲');
      up.destroy();

      const down = new RatingDeltaCellRenderer();
      down.init(makeParams({
        value: 'BB',
        data: { prevRating: 'A' },
        scale,
        previousField: 'prevRating',
        upColor: { dark: '#22c55e' },
        downColor: { dark: '#ef4444' },
      }));
      expect(down.getGui().textContent).toContain('▼');
      down.destroy();
    });

    it('shows no arrow when unchanged or scale lookup fails', () => {
      const same = new RatingDeltaCellRenderer();
      same.init(makeParams({
        value: 'A',
        data: { prevRating: 'A' },
        scale,
        previousField: 'prevRating',
        upColor: { dark: '#22c55e' },
        downColor: { dark: '#ef4444' },
      }));
      expect(same.getGui().textContent).toBe('A');
      same.destroy();

      const unknown = new RatingDeltaCellRenderer();
      unknown.init(makeParams({
        value: 'ZZZ',
        data: { prevRating: 'A' },
        scale,
        previousField: 'prevRating',
        upColor: { dark: '#22c55e' },
        downColor: { dark: '#ef4444' },
      }));
      expect(unknown.getGui().textContent).toBe('ZZZ');
      unknown.destroy();
    });
  });

  describe('TimeSinceCellRenderer', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('formats relative time buckets', () => {
      vi.useFakeTimers();
      const now = new Date('2024-06-01T12:00:00Z').getTime();
      vi.setSystemTime(now);

      const justNow = new TimeSinceCellRenderer();
      justNow.init(makeParams({ value: now - 2000 }));
      expect(justNow.getGui().textContent).toBe('just now');
      justNow.destroy();

      const mins = new TimeSinceCellRenderer();
      mins.init(makeParams({ value: now - 5 * 60 * 1000 }));
      expect(mins.getGui().textContent).toBe('5m ago');
      mins.destroy();

      const hours = new TimeSinceCellRenderer();
      hours.init(makeParams({ value: now - 2 * 3600 * 1000 }));
      expect(hours.getGui().textContent).toBe('2h ago');
      hours.destroy();

      const days = new TimeSinceCellRenderer();
      days.init(makeParams({ value: now - 3 * 86400 * 1000 }));
      expect(days.getGui().textContent).toBe('3d ago');
      days.destroy();
    });

    it('handles Date, epoch seconds, strings, and future timestamps', () => {
      vi.useFakeTimers();
      vi.setSystemTime('2024-06-01T12:00:00Z');

      const fromDate = new TimeSinceCellRenderer();
      fromDate.init(makeParams({ value: new Date('2024-06-01T11:00:00Z') }));
      expect(fromDate.getGui().textContent).toContain('h ago');
      fromDate.destroy();

      const fromSec = new TimeSinceCellRenderer();
      fromSec.init(makeParams({ value: Math.floor(Date.now() / 1000) - 30 }));
      expect(fromSec.getGui().textContent).toContain('s ago');
      fromSec.destroy();

      const fromStr = new TimeSinceCellRenderer();
      fromStr.init(makeParams({ value: '2024-06-01T11:59:00Z' }));
      expect(fromStr.getGui().textContent).toContain('m ago');
      fromStr.destroy();

      const future = new TimeSinceCellRenderer();
      future.init(makeParams({
        value: Date.now() + 3600 * 1000,
        futureColor: { dark: '#ff00ff' },
      }));
      expect(future.getGui().textContent).toMatch(/from now/);
      expect(future.getGui().style.color).toBe('rgb(255, 0, 255)');
      future.destroy();

      const invalid = new TimeSinceCellRenderer();
      invalid.init(makeParams({ value: 'not-a-date' }));
      expect(invalid.getGui().textContent).toBe('');
      invalid.destroy();
    });
  });

  describe('AllocationBarCellRenderer', () => {
    it('renders proportional segments from object value', () => {
      const r = new AllocationBarCellRenderer();
      r.init(makeParams({
        value: { equity: 60, bonds: 30, cash: 10 },
        segmentColorMap: {
          equity: { dark: '#3b82f6' },
          bonds: { dark: '#22c55e' },
          cash: { dark: '#9ca3af' },
        },
      }));
      const bar = r.getGui().firstChild as HTMLElement;
      expect(bar.children.length).toBe(3);
      r.destroy();
    });

    it('renders legend and array-shaped segments', () => {
      const r = new AllocationBarCellRenderer();
      r.init(makeParams({
        value: [{ key: 'Equity', weight: 100 }],
        segmentColorMap: { Equity: { dark: '#3b82f6' } },
        legend: true,
      }));
      expect(r.getGui().textContent).toContain('Equity');
      r.destroy();
    });

    it('skips paint for empty or invalid segments', () => {
      const r = new AllocationBarCellRenderer();
      r.init(makeParams({
        value: [],
        segmentColorMap: { x: { dark: '#000' } },
      }));
      expect(r.getGui().childNodes.length).toBe(0);
      r.destroy();

      const r2 = new AllocationBarCellRenderer();
      r2.init(makeParams({
        value: [{ key: 'bad', weight: NaN }, { weight: 1 }],
        segmentColorMap: { bad: { dark: '#000' } },
      }));
      expect(r2.getGui().childNodes.length).toBe(0);
      r2.destroy();

      const r3 = new AllocationBarCellRenderer();
      r3.init(makeParams({
        value: { a: 'nope' },
        segmentColorMap: { a: { dark: '#000' } },
      }));
      expect(r3.getGui().childNodes.length).toBe(0);
      r3.destroy();
    });

    it('uses light theme colors when data-theme is light', () => {
      document.documentElement.setAttribute('data-theme', 'light');
      const r = new AllocationBarCellRenderer();
      r.init(makeParams({
        value: { a: 100 },
        segmentColorMap: { a: { dark: '#111111', light: '#fefefe' } },
      }));
      const block = (r.getGui().firstChild as HTMLElement).firstChild as HTMLElement;
      expect(block.style.background).toBe('rgb(254, 254, 254)');
      r.destroy();
    });
  });
});
