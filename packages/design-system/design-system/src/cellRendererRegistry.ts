// ─────────────────────────────────────────────────────────────
//  FI Design System — Cell Renderer Registry
//
//  Single source of truth for:
//    • Renderer IDs (string union used in profile state)
//    • Per-renderer config shapes (typed `cellRendererParams`)
//    • The discriminated-union `CellRendererConfig`
//    • The `cellRendererComponents` map that AG Grid spreads into
//      `gridOptions.components` so a colDef can set
//      `cellRenderer: 'pill'` (string lookup, not class reference)
//    • The `cellRendererCatalogue` UI metadata used by the column
//      settings editor dropdown
//
//  Vanilla TypeScript only — no React, no JSX. The renderer
//  classes referenced here implement `ICellRendererComp` from
//  `ag-grid-community` and live next door in `cellRenderers.ts`.
//
//  All colour-bearing config fields use `ThemeAwareColor` so a
//  user's authored colours survive a dark/light theme flip.
// ─────────────────────────────────────────────────────────────

import type { ICellRendererComp } from 'ag-grid-community';
import {
  BookNameRenderer,
  ChangeValueRenderer,
  ColoredValueRenderer,
  FilledAmountRenderer,
  OasValueRenderer,
  PnlValueRenderer,
  RatingBadgeRenderer,
  RfqStatusRenderer,
  SideCellRenderer,
  SignedValueRenderer,
  StatusBadgeRenderer,
  TickerCellRenderer,
  YtdValueRenderer,
  // New configurable renderers (Tier 1 + 2 + FI specialised)
  PillCellRenderer,
  HeatmapCellRenderer,
  PercentBarCellRenderer,
  TrendArrowCellRenderer,
  SparklineCellRenderer,
  MultiLineCellRenderer,
  IconTextCellRenderer,
  CountryFlagCellRenderer,
  RatingDeltaCellRenderer,
  TimeSinceCellRenderer,
  AllocationBarCellRenderer,
} from './cellRenderers';

// ─── Shared colour primitive ───────────────────────────────────

/**
 * Theme-aware colour. Either slot may be omitted; the renderer
 * falls back to the slot present (so an "always red" override
 * works without authoring twice).
 */
export interface ThemeAwareColor {
  dark?: string;
  light?: string;
}

// ─── Per-renderer config interfaces ────────────────────────────

/**
 * PillCellRenderer — exact-string-match rules with per-rule colours.
 *
 * Each rule matches `String(value)` against `value` exactly. First
 * match wins; if no rule matches, `fallback` (if any) paints the
 * pill, otherwise the cell renders as plain text.
 */
export interface PillRendererConfig {
  rules: Array<{
    value: string;
    bg: ThemeAwareColor;
    fg?: ThemeAwareColor;
    border?: ThemeAwareColor;
  }>;
  fallback?: {
    bg: ThemeAwareColor;
    fg?: ThemeAwareColor;
    border?: ThemeAwareColor;
  };
  /** Visual shape — defaults to `pill` (fully rounded). */
  shape?: 'pill' | 'square';
}

/**
 * HeatmapCellRenderer — numeric value → colour gradient between
 * `min` / (optional) `mid` / `max` colours. `domain` may be
 * explicit; without it the renderer reads the column's
 * `aggValueDomain` from its params or falls back to [0, 100].
 */
export interface HeatmapRendererConfig {
  domain?: { min: number; max: number };
  colorScale: {
    min: ThemeAwareColor;
    mid?: ThemeAwareColor;
    max: ThemeAwareColor;
  };
  textColor?: ThemeAwareColor;
}

/**
 * PercentBarCellRenderer — proportional horizontal bar inside the
 * cell. `max` may be a literal or a reference to another field on
 * the row (`{ fromField: 'qty' }`).
 */
export interface PercentBarRendererConfig {
  max: number | { fromField: string };
  barColor: ThemeAwareColor;
  trackColor?: ThemeAwareColor;
  showPercent?: boolean;
  showValue?: boolean;
}

/**
 * TrendArrowCellRenderer — directional arrow plus optional delta
 * text. `threshold` defines a neutral dead-band around 0 (default 0).
 */
export interface TrendArrowRendererConfig {
  threshold?: number;
  upColor: ThemeAwareColor;
  downColor: ThemeAwareColor;
  neutralColor?: ThemeAwareColor;
  /** Decimal places to use when rendering the delta value. */
  decimals?: number;
  showDelta?: boolean;
}

/**
 * SparklineCellRenderer — tiny inline line / area / bar chart for
 * an array-of-numbers cell value. Renders as inline SVG (no React,
 * no chart-library dependency).
 */
export interface SparklineRendererConfig {
  variant: 'line' | 'area' | 'bar';
  lineColor: ThemeAwareColor;
  fillColor?: ThemeAwareColor;
  height?: number;
}

/**
 * MultiLineCellRenderer — two-line composite: primary (cell value)
 * + secondary text from another field on the row.
 */
export interface MultiLineRendererConfig {
  secondaryField: string;
  secondaryColor?: ThemeAwareColor;
  /** Secondary text size in px. Default 10. */
  secondarySize?: number;
}

/**
 * IconTextCellRenderer — leading or trailing icon plus the cell
 * value as text. The editor resolves the icon (from
 * `@wellsfargo-starui/icons-svg`) at write time and stores both the source
 * `iconId` (for re-editing) and the raw inner SVG markup
 * (`iconSvg`) the renderer drops into an inline `<svg>` element.
 * Vanilla TS — no runtime SVG-file fetching.
 */
export interface IconTextRendererConfig {
  iconId: string;
  /** Inner SVG markup (paths/groups) — wrapped in `<svg viewBox="0 0 24 24">…</svg>` by the renderer. */
  iconSvg: string;
  iconColor?: ThemeAwareColor;
  position: 'left' | 'right';
}

/**
 * CountryFlagCellRenderer — code → regional-indicator emoji flag
 * plus optional label.
 *
 * The renderer accepts either:
 *  - **ISO-3166-alpha-2** country codes (`'US'`, `'JP'`, `'GB'`, …)
 *  - **ISO-4217** currency codes (`'USD'`, `'EUR'`, `'GBP'`, …) —
 *    mapped through an internal currency→country table. EUR maps to
 *    the regional indicators `E+U` (🇪🇺); bullion / crypto codes
 *    (`XAU`, `XAG`, `XPT`, `BTC`) intentionally have no flag.
 */
export interface CountryFlagRendererConfig {
  /** Field to read the code from; defaults to the cell value. */
  codeField?: string;
  showLabel?: boolean;
  /** Field to read the label text from; defaults to the cell value. */
  labelField?: string;
}

/**
 * RatingDeltaCellRenderer — credit-rating cell with an
 * up/down/flat arrow when the current rating differs from a
 * previous-rating sibling field. Scale is ordered high→low so the
 * renderer can compare positions.
 */
export interface RatingDeltaRendererConfig {
  scale: string[];
  previousField: string;
  upColor: ThemeAwareColor;
  downColor: ThemeAwareColor;
}

/**
 * TimeSinceCellRenderer — relative-time string ("5m ago" / "2h ago")
 * that auto-refreshes on a configurable cadence.
 */
export interface TimeSinceRendererConfig {
  /** Seconds between refresh ticks; default 60. */
  refreshSec?: number;
  /** Colour override when the timestamp is in the future. */
  futureColor?: ThemeAwareColor;
}

/**
 * AllocationBarCellRenderer — stacked horizontal bar. Cell value
 * should be a Record<key,number> or an array of `{ key, weight }`.
 */
export interface AllocationBarRendererConfig {
  segmentColorMap: Record<string, ThemeAwareColor>;
  legend?: boolean;
}

// ─── Renderer ID union ────────────────────────────────────────

/**
 * Every registered renderer id. Used both as the AG-Grid
 * `cellRenderer` string and as the `cellRendererId` field on a
 * `ColumnAssignment`.
 */
export type CellRendererId =
  // Configurable (new in this PR)
  | 'pill'
  | 'heatmap'
  | 'percent-bar'
  | 'trend-arrow'
  | 'sparkline'
  | 'multi-line'
  | 'icon-text'
  | 'country-flag'
  | 'rating-delta'
  | 'time-since'
  | 'allocation-bar'
  // Existing built-ins (zero-config, shipped earlier)
  | 'side'
  | 'status-badge'
  | 'colored-value'
  | 'oas-value'
  | 'signed-value'
  | 'ticker'
  | 'rating-badge'
  | 'pnl-value'
  | 'filled-amount'
  | 'book-name'
  | 'change-value'
  | 'ytd-value'
  | 'rfq-status';

// ─── Discriminated config union ───────────────────────────────

/**
 * Discriminated by `kind` so a single field on a `ColumnAssignment`
 * can hold any renderer's config without inflating the column
 * shape into a dozen mutually-exclusive optional fields. Always
 * use this union when storing config — never the bare interface.
 */
export type CellRendererConfig =
  | { kind: 'pill'; config: PillRendererConfig }
  | { kind: 'heatmap'; config: HeatmapRendererConfig }
  | { kind: 'percent-bar'; config: PercentBarRendererConfig }
  | { kind: 'trend-arrow'; config: TrendArrowRendererConfig }
  | { kind: 'sparkline'; config: SparklineRendererConfig }
  | { kind: 'multi-line'; config: MultiLineRendererConfig }
  | { kind: 'icon-text'; config: IconTextRendererConfig }
  | { kind: 'country-flag'; config: CountryFlagRendererConfig }
  | { kind: 'rating-delta'; config: RatingDeltaRendererConfig }
  | { kind: 'time-since'; config: TimeSinceRendererConfig }
  | { kind: 'allocation-bar'; config: AllocationBarRendererConfig };

// ─── Components map (AG Grid `gridOptions.components`) ────────

/**
 * Spread into `<AgGridReact components={...}>` so a colDef can
 * reference any renderer by id:
 *
 *   colDef.cellRenderer = 'pill';
 *   colDef.cellRendererParams = pillConfig;
 *
 * Hoisted (frozen object reference) so AgGridReact's
 * shallow-equality prop sync doesn't re-fire on every parent
 * render.
 */
export const cellRendererComponents: Readonly<
  Record<CellRendererId, new () => ICellRendererComp>
> = Object.freeze({
  // Configurable
  'pill': PillCellRenderer,
  'heatmap': HeatmapCellRenderer,
  'percent-bar': PercentBarCellRenderer,
  'trend-arrow': TrendArrowCellRenderer,
  'sparkline': SparklineCellRenderer,
  'multi-line': MultiLineCellRenderer,
  'icon-text': IconTextCellRenderer,
  'country-flag': CountryFlagCellRenderer,
  'rating-delta': RatingDeltaCellRenderer,
  'time-since': TimeSinceCellRenderer,
  'allocation-bar': AllocationBarCellRenderer,
  // Existing zero-config built-ins (registered by id so they too
  // can be selected from the column settings dropdown).
  'side': SideCellRenderer,
  'status-badge': StatusBadgeRenderer,
  'colored-value': ColoredValueRenderer,
  'oas-value': OasValueRenderer,
  'signed-value': SignedValueRenderer,
  'ticker': TickerCellRenderer,
  'rating-badge': RatingBadgeRenderer,
  'pnl-value': PnlValueRenderer,
  'filled-amount': FilledAmountRenderer,
  'book-name': BookNameRenderer,
  'change-value': ChangeValueRenderer,
  'ytd-value': YtdValueRenderer,
  'rfq-status': RfqStatusRenderer,
});

// ─── Catalogue metadata (UI dropdown) ─────────────────────────

export type CellRendererCategory =
  | 'visual-analytics'
  | 'composite'
  | 'fi-specialised'
  | 'existing';

export interface CellRendererCatalogueEntry {
  readonly id: CellRendererId;
  readonly label: string;
  readonly description: string;
  readonly category: CellRendererCategory;
  /**
   * `true` when the renderer reads `cellRendererParams` for
   * per-column configuration — drives the editor UI's
   * "needs config" badge.
   */
  readonly configurable: boolean;
}

export const cellRendererCatalogue: ReadonlyArray<CellRendererCatalogueEntry> = Object.freeze([
  // ─── Configurable: Visual analytics ─────────────────────────
  {
    id: 'pill',
    label: 'Pill',
    description: 'Coloured pill with per-value background & foreground rules.',
    category: 'visual-analytics',
    configurable: true,
  },
  {
    id: 'heatmap',
    label: 'Heatmap',
    description: 'Colour-scale gradient driven by numeric value.',
    category: 'visual-analytics',
    configurable: true,
  },
  {
    id: 'percent-bar',
    label: 'Percent Bar',
    description: 'Proportional horizontal bar inside the cell.',
    category: 'visual-analytics',
    configurable: true,
  },
  {
    id: 'trend-arrow',
    label: 'Trend Arrow + Delta',
    description: 'Directional arrow with magnitude, configurable threshold.',
    category: 'visual-analytics',
    configurable: true,
  },
  {
    id: 'sparkline',
    label: 'Sparkline',
    description: 'Inline mini-chart from an array of numbers.',
    category: 'visual-analytics',
    configurable: true,
  },
  // ─── Configurable: Composite text/icon ──────────────────────
  {
    id: 'multi-line',
    label: 'Multi-Line',
    description: 'Two-line cell: primary value + secondary field.',
    category: 'composite',
    configurable: true,
  },
  {
    id: 'icon-text',
    label: 'Icon + Text',
    description: 'Icon from @wellsfargo-starui/icons-svg next to the value.',
    category: 'composite',
    configurable: true,
  },
  {
    id: 'country-flag',
    label: 'Country Flag',
    description: 'Flag emoji from an ISO-3166-alpha-2 country code OR an ISO-4217 currency code (USD → 🇺🇸, EUR → 🇪🇺, JPY → 🇯🇵, …), plus optional label.',
    category: 'composite',
    configurable: true,
  },
  // ─── Configurable: FI specialised ───────────────────────────
  {
    id: 'rating-delta',
    label: 'Rating Delta',
    description: 'Credit rating with up/down arrow vs. a previous-rating field.',
    category: 'fi-specialised',
    configurable: true,
  },
  {
    id: 'time-since',
    label: 'Time Since',
    description: 'Auto-refreshing relative time ("5m ago").',
    category: 'fi-specialised',
    configurable: true,
  },
  {
    id: 'allocation-bar',
    label: 'Allocation Bar',
    description: 'Stacked horizontal bar coloured by key.',
    category: 'fi-specialised',
    configurable: true,
  },
  // ─── Existing zero-config built-ins ─────────────────────────
  {
    id: 'side',
    label: 'Buy / Sell side',
    description: 'BUY / SELL badge — green / red, monospaced.',
    category: 'existing',
    configurable: false,
  },
  {
    id: 'status-badge',
    label: 'Status Badge',
    description: 'Filled / Partial / Pending / Cancelled / Working pill.',
    category: 'existing',
    configurable: false,
  },
  {
    id: 'colored-value',
    label: 'Coloured Value',
    description: 'Numeric value coloured by sign.',
    category: 'existing',
    configurable: false,
  },
  {
    id: 'oas-value',
    label: 'OAS Value',
    description: 'OAS spread with > 80 warning threshold.',
    category: 'existing',
    configurable: false,
  },
  {
    id: 'signed-value',
    label: 'Signed Value',
    description: 'Numeric value with leading ± prefix.',
    category: 'existing',
    configurable: false,
  },
  {
    id: 'ticker',
    label: 'Ticker',
    description: 'Bold cyan ticker symbol.',
    category: 'existing',
    configurable: false,
  },
  {
    id: 'rating-badge',
    label: 'Rating Badge',
    description: 'Credit-rating pill keyed by `rtgClass` on the row.',
    category: 'existing',
    configurable: false,
  },
  {
    id: 'pnl-value',
    label: 'P&L Value',
    description: 'P&L value with K suffix and sign colour.',
    category: 'existing',
    configurable: false,
  },
  {
    id: 'filled-amount',
    label: 'Filled Amount',
    description: 'Filled qty coloured green when full, amber when partial.',
    category: 'existing',
    configurable: false,
  },
  {
    id: 'book-name',
    label: 'Book Name',
    description: 'Cyan book-name text.',
    category: 'existing',
    configurable: false,
  },
  {
    id: 'change-value',
    label: 'Change Value',
    description: 'Index-style ±N.NN change value.',
    category: 'existing',
    configurable: false,
  },
  {
    id: 'ytd-value',
    label: 'YTD Value',
    description: 'YTD string coloured by leading ± prefix.',
    category: 'existing',
    configurable: false,
  },
  {
    id: 'rfq-status',
    label: 'RFQ Status',
    description: 'LIVE / DONE / STALE RFQ-status pill.',
    category: 'existing',
    configurable: false,
  },
]);

/**
 * Catalogue entries grouped by category — convenient for rendering
 * `<SelectGroup>` blocks in the UI without re-grouping on every
 * render.
 */
export const cellRendererCatalogueByCategory: Readonly<
  Record<CellRendererCategory, ReadonlyArray<CellRendererCatalogueEntry>>
> = Object.freeze({
  'visual-analytics': cellRendererCatalogue.filter((e) => e.category === 'visual-analytics'),
  'composite': cellRendererCatalogue.filter((e) => e.category === 'composite'),
  'fi-specialised': cellRendererCatalogue.filter((e) => e.category === 'fi-specialised'),
  'existing': cellRendererCatalogue.filter((e) => e.category === 'existing'),
});

/** Set of IDs that the configurable-config editor knows how to author. */
export const CONFIGURABLE_RENDERER_IDS: ReadonlySet<CellRendererId> = new Set([
  'pill',
  'heatmap',
  'percent-bar',
  'trend-arrow',
  'sparkline',
  'multi-line',
  'icon-text',
  'country-flag',
  'rating-delta',
  'time-since',
  'allocation-bar',
]);

/** Look up a catalogue entry by id; `undefined` for unknown ids. */
export function getCellRendererEntry(
  id: string | undefined,
): CellRendererCatalogueEntry | undefined {
  if (!id) return undefined;
  return cellRendererCatalogue.find((e) => e.id === (id as CellRendererId));
}
