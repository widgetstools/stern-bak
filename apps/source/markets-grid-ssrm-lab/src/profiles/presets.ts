import type { ColDef, ColGroupDef } from 'ag-grid-community';
import { defaultColDef as baseDefaultColDef, fmt, pickColumns } from '../data/columns';
import type { LabRow } from '../data/types';
import {
  CALCULATED_ACTIVE_PROFILE_ID,
  CALCULATED_DEMO_PROFILES,
} from './catalogs/calculatedCatalog';
import {
  CONDITIONAL_ACTIVE_PROFILE_ID,
  CONDITIONAL_DEMO_PROFILES,
} from './catalogs/conditionalCatalog';
import {
  FORMATTER_TOOLBAR_ACTIVE_PROFILE_ID,
  FORMATTER_TOOLBAR_DEMO_PROFILES,
} from './catalogs/formatterToolbarCatalog';
import {
  RENDERERS_ACTIVE_PROFILE_ID,
  RENDERERS_DEMO_PROFILES,
} from './catalogs/renderersCatalog';
import type { ProfilePreset } from './types';

// ─── Helpers ─────────────────────────────────────────────────────────

const num0 = new Intl.NumberFormat('en-US');
const intFmt = (p: { value: unknown }) =>
  p.value == null ? '' : num0.format(Math.round(Number(p.value)));

const PNL_RULES = {
  'lab-cell-loser':  (p: { value: unknown }) => Number(p.value) < 0,
  'lab-cell-winner': (p: { value: unknown }) => Number(p.value) > 0,
};

// ─── Trader View ─────────────────────────────────────────────────────

const TRADER_FIELDS = [
  'cusip', 'ticker', 'instrumentDescription',
  'bidPrice', 'midPrice', 'askPrice', 'priceChangePct', 'bidAskWidthBps',
  'yieldToMaturity', 'oas',
  'quantityFace', 'marketValue',
  'unrealizedPnL', 'dailyPnL',
  'book', 'trader',
];

const traderView: ProfilePreset = {
  id: 'preset-trader-view',
  name: 'Trader View',
  tagline: 'Dense pricing + P&L · everything else hidden',
  accent: 'blue',
  description: `# Trader View

The desk's working blotter. Pricing fields are pinned and grouped tightly;
P&L columns get coloured cell rules. Everything you don't need to act on
right now is hidden — open Column Settings to bring back ratings, risk, or
reference data.

- **Pinned**: CUSIP · Ticker
- **Visible**: Bid/Mid/Ask · YTM · OAS · Quantity · Mkt Value · Unreal/Daily P&L · Book · Trader
- **Hidden**: Ratings, risk decomposition, secondary yields, MTD/YTD P&L
- **Row height**: 32 px (compact)
- **Cell flash**: on`,
  rowHeight: 32,
  toolbars: { showFiltersToolbar: true, showFormattingToolbar: true, showEditingToolbar: true },
  buildColumns: () => {
    const cols = pickColumns(TRADER_FIELDS);
    return cols.map((c) => {
      if (c.field === 'cusip' || c.field === 'ticker') return { ...c, pinned: 'left' };
      if (c.field === 'dailyPnL' || c.field === 'unrealizedPnL') return { ...c, cellClassRules: PNL_RULES };
      return c;
    });
  },
};

// ─── Analytics View ──────────────────────────────────────────────────

const ANALYTICS_FIELDS = [
  'cusip', 'ticker', 'instrumentDescription',
  'assetClass', 'issuerSector', 'issuerSubSector', 'currency', 'compositeRating', 'seniority',
  'midPrice', 'yieldToMaturity', 'yieldToWorst', 'currentYield', 'oas', 'zSpread', 'iSpread',
  'modifiedDuration', 'dv01', 'convexity', 'krdSparkline', 'cs01',
  'marketValue', 'quantityFace',
  'unrealizedPnL', 'mtdPnL', 'ytdPnL',
];

const analyticsView: ProfilePreset = {
  id: 'preset-analytics-view',
  name: 'Analytics View',
  tagline: 'Wide: rating, risk decomposition, KRD curve',
  accent: 'purple',
  description: `# Analytics View

The research / risk lens. All ratings, sub-sectors, seniority, risk metrics
(duration / DV01 / convexity / KRD curve) are visible. Pricing is reduced to
mid-only; P&L is YTD-centric.

- **Visible**: full rating + sector ladder · all yields and spreads · risk
  decomposition · KRD sparkline · MTD/YTD P&L
- **Hidden**: bid/ask, daily P&L (replaced by MTD/YTD)
- **Row height**: 36 px (default)`,
  buildColumns: () => pickColumns(ANALYTICS_FIELDS),
};

// ─── Compact ─────────────────────────────────────────────────────────

const COMPACT_FIELDS = [
  'cusip', 'ticker',
  'midPrice', 'yieldToMaturity', 'oas',
  'modifiedDuration',
  'marketValue', 'unrealizedPnL', 'dailyPnL',
];

const compactView: ProfilePreset = {
  id: 'preset-compact',
  name: 'Compact',
  tagline: 'Tight rows · integers · monospace numbers',
  accent: 'slate',
  description: `# Compact

For when you need to see everything at a glance. Row height halves to 28 px
and every numeric column drops decimals — useful for very large portfolios
where decimal precision is noise.`,
  rowHeight: 28,
  buildColumns: () => {
    const cols = pickColumns(COMPACT_FIELDS);
    return cols.map((c) => {
      if (c.type === 'numericColumn') return { ...c, valueFormatter: intFmt };
      return c;
    });
  },
};

// ─── Grouped ─────────────────────────────────────────────────────────

const groupedView: ProfilePreset = {
  id: 'preset-grouped',
  name: 'Grouped',
  tagline: 'All columns under nested header groups',
  accent: 'green',
  description: `# Grouped

Every column visible, organised under collapsible header groups: Identifier,
Reference, Pricing, Yields & Spreads, Risk, Quantities & Cost, P&L, Status &
Book. Click any group chevron to reveal extra columns marked with
\`columnGroupShow: 'open'\`.`,
  buildColumns: () => {
    const c = (field: string, extra?: Partial<ColDef<LabRow>>): ColDef<LabRow> => {
      const base = pickColumns([field])[0];
      if (!base) throw new Error(`unknown field: ${field}`);
      return { ...base, ...extra };
    };
    const groups: (ColDef<LabRow> | ColGroupDef<LabRow>)[] = [
      { headerName: 'Identifier', groupId: 'identifier', children: [c('cusip', { pinned: 'left' }), c('ticker', { pinned: 'left' }), c('instrumentDescription')] },
      { headerName: 'Reference',  groupId: 'reference',  children: [c('assetClass'), c('issuerSector'), c('currency'), c('compositeRating'), c('issuerCountryCode', { columnGroupShow: 'open' })] },
      { headerName: 'Pricing',    groupId: 'pricing',    children: [c('bidPrice'), c('midPrice'), c('askPrice'), c('priceChangePct'), c('bidAskWidthBps', { columnGroupShow: 'open' })] },
      { headerName: 'Yields',     groupId: 'yields',     children: [c('yieldToMaturity'), c('oas'), c('zSpread', { columnGroupShow: 'open' })] },
      { headerName: 'Risk',       groupId: 'risk',       children: [c('modifiedDuration'), c('dv01'), c('convexity', { columnGroupShow: 'open' })] },
      { headerName: 'Quantities', groupId: 'qty',        children: [c('quantityFace'), c('marketValue')] },
      { headerName: 'P&L',        groupId: 'pnl',        children: [c('unrealizedPnL'), c('dailyPnL'), c('mtdPnL', { columnGroupShow: 'open' }), c('ytdPnL', { columnGroupShow: 'open' })] },
      { headerName: 'Status',     groupId: 'status',     children: [c('book'), c('trader'), c('maturityDate')] },
    ];
    return groups as ColDef<LabRow>[];
  },
};

// ─── Calculated-heavy ────────────────────────────────────────────────

const calculatedHeavy: ProfilePreset = {
  id: 'preset-calculated-heavy',
  name: 'Calculated-heavy',
  tagline: 'Stacks of derived columns',
  accent: 'amber',
  description: `# Calculated-heavy

Shows derived columns alongside their inputs. B/A width, risk bucket, carry
to risk, dollar duration, spread-to-benchmark — all computed on every tick
via \`valueGetter\` (the runtime equivalent of the calculated-columns
module).`,
  buildColumns: () => {
    const base = pickColumns([
      'cusip', 'ticker', 'instrumentDescription',
      'bidPrice', 'midPrice', 'askPrice', 'bidAskWidthBps',
      'yieldToMaturity', 'oas', 'modifiedDuration',
      'marketValue', 'dailyPnL', 'mtdPnL', 'ytdPnL',
    ]);
    const calc: ColDef<LabRow>[] = [
      {
        colId: 'pnlTotalP',
        headerName: 'P&L Total',
        width: 130,
        type: 'numericColumn',
        valueGetter: (p) =>
          Number(p.data?.dailyPnL ?? 0) +
          Number(p.data?.mtdPnL ?? 0) +
          Number(p.data?.ytdPnL ?? 0),
        valueFormatter: fmt.signedMoney,
        cellClassRules: PNL_RULES,
      },
      {
        colId: 'carryRiskP',
        headerName: 'Carry/Risk',
        width: 110,
        type: 'numericColumn',
        valueGetter: (p) => {
          const y = Number(p.data?.yieldToMaturity);
          const d = Number(p.data?.modifiedDuration);
          return Number.isFinite(y) && Number.isFinite(d) && d !== 0 ? y / d : undefined;
        },
        valueFormatter: fmt.num2,
      },
      {
        colId: 'dollarDurP',
        headerName: 'Dollar Dur',
        width: 130,
        type: 'numericColumn',
        valueGetter: (p) => {
          const mv = Number(p.data?.marketValue);
          const d = Number(p.data?.modifiedDuration);
          return Number.isFinite(mv) && Number.isFinite(d) ? (mv * d) / 100 : undefined;
        },
        valueFormatter: fmt.money,
      },
    ];
    return [...base, ...calc];
  },
};

// ─── Alert-heavy ─────────────────────────────────────────────────────

const alertHeavy: ProfilePreset = {
  id: 'preset-alert-heavy',
  name: 'Alert-heavy',
  tagline: 'Conditional styling everywhere',
  accent: 'pink',
  description: `# Alert-heavy

Every column with semantics gets a conditional-styling rule: losers red,
winners green, wide spreads amber, junk ratings highlighted, high yields
flagged. Combined with the live tick this turns the grid into a wall-board.`,
  buildColumns: () => {
    const cols = pickColumns([
      'cusip', 'ticker', 'compositeRating',
      'bidPrice', 'askPrice', 'priceChangePct', 'bidAskWidthBps',
      'yieldToMaturity', 'yieldToWorst', 'oas',
      'unrealizedPnL', 'dailyPnL', 'mtdPnL', 'ytdPnL',
    ]);
    const JUNK_RULES = {
      'lab-cell-junk': (p: { data?: LabRow | null }) =>
        ['BB+','BB','BB-','B+','B','B-','CCC'].includes(String(p.data?.compositeRating ?? '')),
    };
    const WIDE_RULES = {
      'lab-cell-warn': (p: { data?: LabRow | null }) => {
        const b = Number(p.data?.bidPrice);
        const a = Number(p.data?.askPrice);
        return Number.isFinite(b) && Number.isFinite(a) && a - b > 0.1;
      },
    };
    const YIELD_WATCH = { 'lab-cell-warn': (p: { value: unknown }) => Number(p.value) > 8 };
    return cols.map((c) => {
      switch (c.field ?? c.colId) {
        case 'unrealizedPnL':
        case 'dailyPnL':
        case 'mtdPnL':
        case 'ytdPnL':
        case 'priceChangePct':
          return { ...c, cellClassRules: PNL_RULES };
        case 'bidPrice':
        case 'askPrice':
        case 'bidAskWidthBps':
          return { ...c, cellClassRules: WIDE_RULES };
        case 'yieldToWorst':
          return { ...c, cellClassRules: YIELD_WATCH };
        case 'compositeRating':
          return { ...c, cellClassRules: JUNK_RULES };
        default:
          return c;
      }
    });
  },
};

// ─── Formatter focus ─────────────────────────────────────────────────

const formatterFocus: ProfilePreset = {
  id: 'preset-formatter-focus',
  name: 'Formatter Focus',
  tagline: 'Same numbers, multiple formatters side-by-side',
  accent: 'amber',
  description: `# Formatter Focus

The same numeric fields rendered under several formatters at once — useful
for comparing how the same value reads under different presentations.

- **Mid (3dp / 4dp / int)** — three columns reading the same field
- **YTM (% / bps)** — yield rendered both ways
- **Daily P&L (signed / coloured / plain)** — three views of the same value`,
  buildColumns: () => {
    const c = (overrides: ColDef<LabRow>): ColDef<LabRow> => ({
      resizable: true,
      sortable: true,
      type: 'numericColumn',
      ...overrides,
    });
    return [
      ...pickColumns(['cusip', 'ticker']),
      c({ colId: 'mid3dp', headerName: 'Mid (3dp)', field: 'midPrice', valueFormatter: fmt.price, width: 100 }),
      c({ colId: 'mid4dp', headerName: 'Mid (4dp)', field: 'midPrice', valueFormatter: fmt.num4, width: 100 }),
      c({ colId: 'midInt', headerName: 'Mid (int)', field: 'midPrice', valueFormatter: intFmt, width: 90 }),
      c({ colId: 'ytmPct', headerName: 'YTM (%)',   field: 'yieldToMaturity', valueFormatter: fmt.pct, width: 100 }),
      c({ colId: 'ytmBps', headerName: 'YTM (bps)', field: 'yieldToMaturity', valueFormatter: (p) =>
            p.value == null ? '' : `${(Number(p.value) * 100).toFixed(0)} bps`, width: 110 }),
      c({ colId: 'pnlSign',    headerName: 'P&L (signed)',    field: 'dailyPnL', valueFormatter: fmt.signedMoney, width: 130 }),
      c({ colId: 'pnlPlain',   headerName: 'P&L (plain)',     field: 'dailyPnL', valueFormatter: fmt.money,      width: 130 }),
      c({ colId: 'pnlColored', headerName: 'P&L (coloured)',  field: 'dailyPnL', valueFormatter: fmt.signedMoney,
         cellClassRules: PNL_RULES, width: 140 }),
    ];
  },
};

// ─── Renderer focus ──────────────────────────────────────────────────

const rendererFocus: ProfilePreset = {
  id: 'preset-renderer-focus',
  name: 'Renderer Focus',
  tagline: 'Heatmaps · pills · percent bars · sparklines',
  accent: 'green',
  description: `# Renderer Focus

Every column with a sensible visualisation gets a cell renderer — heatmaps
on OAS, percent bars on duration & market value, sparkline on the KRD curve,
pills on rating + sector, country flags, trend arrows, time-since on the
update timestamp.`,
  buildColumns: () => {
    const cols = pickColumns([
      'cusip', 'ticker', 'issuerSector', 'issuerCountryCode', 'currency', 'compositeRating',
      'midPrice', 'priceChangePct', 'oas',
      'modifiedDuration', 'krdSparkline',
      'marketValue', 'dailyPnL',
      'lastUpdate',
    ]);
    return cols.map((c) => {
      switch (c.field ?? c.colId) {
        case 'compositeRating':
          return { ...c, cellRenderer: 'rating-badge' };
        case 'issuerSector':
          return { ...c, cellRenderer: 'pill', cellRendererParams: {
            rules: [{ value: 'Financials', bg: { dark: '#0f2b3f', light: '#dbeaf6' } }],
            fallback: { bg: { dark: '#1f2733', light: '#e8edf2' } },
          }};
        case 'issuerCountryCode':
          return { ...c, cellRenderer: 'country-flag', cellRendererParams: { codeField: 'issuerCountryCode' } };
        case 'currency':
          return { ...c, cellRenderer: 'country-flag', cellRendererParams: { codeField: 'currency' } };
        case 'priceChangePct':
          return { ...c, cellRenderer: 'trend-arrow', cellRendererParams: { threshold: 0 } };
        case 'modifiedDuration':
          return { ...c, cellRenderer: 'percent-bar', cellRendererParams: { max: 30, showValue: true, valueFormatter: fmt.num2 } };
        case 'oas':
          return { ...c, cellRenderer: 'heatmap', cellRendererParams: {
            domain: { min: 20, max: 600 },
            colorScale: {
              min: { dark: '#0f2b1c', light: '#e8f4ec' },
              mid: { dark: '#3a3010', light: '#fbf0cf' },
              max: { dark: '#3a1818', light: '#fcdada' },
            },
          }};
        case 'krdSparkline':
          return { ...c, cellRenderer: 'sparkline' };
        case 'marketValue':
          return { ...c, cellRenderer: 'percent-bar', cellRendererParams: { max: 50_000_000, showValue: true, valueFormatter: fmt.money } };
        case 'dailyPnL':
          return { ...c, cellRenderer: 'pnl-value' };
        case 'lastUpdate':
          return { ...c, cellRenderer: 'time-since' };
        default:
          return c;
      }
    });
  },
  defaultColDef: { ...baseDefaultColDef, autoHeight: false },
};

// ─── Catalogue ───────────────────────────────────────────────────────

// ─── Module-state gallery presets (profile selector inside grid) ───

const conditionalStylingLab: ProfilePreset = {
  id: 'preset-conditional-lab',
  name: 'CS rule lab',
  tagline: `${CONDITIONAL_DEMO_PROFILES.length} conditional-styling profiles in the selector`,
  accent: 'purple',
  description: `# Conditional styling lab

Column layout is a compact P&L + pricing slice. Use the **profile selector**
to switch between flash, diff, row-scope, and disabled-rule curricula —
same catalogs as the Conditional Styling tab.`,
  buildColumns: () =>
    pickColumns([
      'cusip', 'ticker', 'bidPrice', 'midPrice', 'askPrice', 'lastPrice',
      'priceChangePct', 'yieldToWorst', 'bidAskWidthBps',
      'dailyPnL', 'unrealizedPnL', 'mtdPnL', 'ytdPnL', 'compositeRating',
    ]),
  demoProfiles: CONDITIONAL_DEMO_PROFILES,
  activeDemoProfileId: CONDITIONAL_ACTIVE_PROFILE_ID,
};

const renderersLab: ProfilePreset = {
  id: 'preset-renderers-lab',
  name: 'Renderer lab',
  tagline: `${RENDERERS_DEMO_PROFILES.length} cell-renderer profiles`,
  accent: 'green',
  description: `# Cell renderer lab

Visual columns driven by **column-customization** renderer assignments.
Use the profile selector to switch between pills, charts, P&L, and flags.`,
  buildColumns: () =>
    pickColumns([
      'cusip', 'ticker', 'issuerSector', 'compositeRating',
      'priceChangePct', 'oas', 'modifiedDuration', 'krdSparkline',
      'marketValue', 'dailyPnL', 'lastUpdate',
    ]),
  demoProfiles: RENDERERS_DEMO_PROFILES,
  activeDemoProfileId: RENDERERS_ACTIVE_PROFILE_ID,
  defaultColDef: { ...baseDefaultColDef, autoHeight: false },
};

const formatterToolbarLab: ProfilePreset = {
  id: 'preset-formatter-toolbar-lab',
  name: 'Formatter toolbar lab',
  tagline: `${FORMATTER_TOOLBAR_DEMO_PROFILES.length} pre-painted style profiles`,
  accent: 'amber',
  description: `# Formatter toolbar lab

Wide desk layout with **showFormattingToolbar**. Profiles ship
pre-painted cell/header styles or a blank canvas for live painting.`,
  buildColumns: () =>
    pickColumns([
      'cusip', 'ticker', 'bidPrice', 'midPrice', 'askPrice',
      'dailyPnL', 'unrealizedPnL', 'compositeRating', 'book', 'trader',
    ]),
  demoProfiles: FORMATTER_TOOLBAR_DEMO_PROFILES,
  activeDemoProfileId: FORMATTER_TOOLBAR_ACTIVE_PROFILE_ID,
  toolbars: { showFormattingToolbar: true, showEditingToolbar: true },
};

const calculatedColumnsLab: ProfilePreset = {
  id: 'preset-calculated-lab',
  name: 'Calc column lab',
  tagline: `${CALCULATED_DEMO_PROFILES.length} virtual-column profiles`,
  accent: 'amber',
  description: `# Calculated columns lab

Research-width columns with risk + P&L inputs. Profile selector switches
between the full 11-column expression set and focused subsets (P&L, risk,
spreads).`,
  buildColumns: () =>
    pickColumns([
      'cusip', 'ticker', 'bidPrice', 'midPrice', 'askPrice',
      'yieldToMaturity', 'yieldToWorst', 'oas', 'benchmarkYield',
      'modifiedDuration', 'dv01', 'cs01', 'convexity',
      'marketValue', 'quantityFace', 'avgDailyVolume30d',
      'dailyPnL', 'mtdPnL', 'ytdPnL',
    ]),
  demoProfiles: CALCULATED_DEMO_PROFILES,
  activeDemoProfileId: CALCULATED_ACTIVE_PROFILE_ID,
};

const executionDesk: ProfilePreset = {
  id: 'preset-execution-desk',
  name: 'Execution desk',
  tagline: 'Liquidity · spread · size · fast ticks',
  accent: 'blue',
  description: `# Execution desk

Wide bid/ask/mid with spread in bps, face quantity, and ADV. Stream runs
at 400ms so tick-flash rules (if you add CS from the module) are obvious.`,
  buildColumns: () =>
    pickColumns([
      'cusip', 'ticker', 'instrumentDescription',
      'bidPrice', 'midPrice', 'askPrice', 'lastPrice',
      'bidAskWidthBps', 'priceChangePct',
      'quantityFace', 'avgDailyVolume30d', 'marketValue',
      'book', 'trader',
    ]),
  stream: { updateIntervalMs: 400 },
};

const creditResearch: ProfilePreset = {
  id: 'preset-credit-research',
  name: 'Credit research',
  tagline: 'Ratings · spreads · curve · risk',
  accent: 'green',
  description: `# Credit research

Issuer + rating block, spread stack (OAS, benchmark), and risk metrics
for relative-value work. Grouped column headers mirror a research template.`,
  buildColumns: () => {
    const issuer: ColGroupDef<LabRow> = {
      headerName: 'Issuer',
      children: pickColumns(['cusip', 'ticker', 'issuerSector', 'compositeRating']),
    };
    const spreads: ColGroupDef<LabRow> = {
      headerName: 'Spreads',
      children: pickColumns(['yieldToMaturity', 'yieldToWorst', 'oas', 'benchmarkYield']),
    };
    const risk: ColGroupDef<LabRow> = {
      headerName: 'Risk',
      children: pickColumns(['modifiedDuration', 'dv01', 'cs01', 'convexity']),
    };
    const pnl: ColGroupDef<LabRow> = {
      headerName: 'P&L',
      children: pickColumns(['marketValue', 'dailyPnL', 'mtdPnL', 'ytdPnL']).map((c) => {
        const f = c.field ?? c.colId;
        if (f === 'dailyPnL' || f === 'mtdPnL' || f === 'ytdPnL') {
          return { ...c, cellClassRules: PNL_RULES };
        }
        return c;
      }),
    };
    return [issuer, spreads, risk, pnl];
  },
};

export const PRESETS: ProfilePreset[] = [
  traderView,
  analyticsView,
  compactView,
  groupedView,
  calculatedHeavy,
  alertHeavy,
  formatterFocus,
  rendererFocus,
  executionDesk,
  creditResearch,
  renderersLab,
  formatterToolbarLab,
  conditionalStylingLab,
  calculatedColumnsLab,
];
