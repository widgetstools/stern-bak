/**
 * Summary Panel — configurable stat/chart/heatmap widgets computed from the
 * grid's own current rows, refreshed as the grid ticks, docked around the
 * blotter as ordinary panels in the SAME dock instance the blotter itself
 * lives in — see `widget/BlotterDock.tsx`, which owns that one dock and
 * reconciles it against this module's state. Gated by the host-prop
 * `showSummaryPanel`, same pattern `showFiltersToolbar` uses for
 * `FiltersToolbar`.
 *
 * A widget's `query` reuses `DataQuery` (`@wellsfargo-starui/data`) — the
 * exact shape `query_grid_data` already teaches the model, so configuring a
 * panel needs no new vocabulary. Pure config + presentation: unlike alerts,
 * there is no runtime to `activate` — `useSummaryPanelData` (in
 * `summaryWidgetContent.tsx`) reads rows itself via `useGridApi()` /
 * `platform.rows`, recomputing widgets from the live row set rather than
 * reacting to per-cell deltas.
 *
 * Layout — this file is the module shell only:
 *
 *   ./SummaryPanelPanel.tsx      — ListPane / EditorPane / SettingsPanel
 *   ./summaryWidgetContent.tsx   — live row data + widget-card rendering
 *                                  (consumed by widget/BlotterDock.tsx)
 *   ./DataChart.tsx              — recharts rendering (shared with the AI Assistant)
 *   ./AnalysisTable.tsx          — shared table/heatmap renderer (shared with the AI Assistant)
 */

import type { Module } from '@wellsfargo-starui/core';
import { LABEL_CONTRASTS, CHART_PALETTES } from '@wellsfargo-starui/data';
import type { ChartStyle, ChartKind, DataQuery } from '@wellsfargo-starui/data';
import {
  SummaryPanelEditor,
  SummaryPanelList,
  SummaryPanelPanel,
} from './SummaryPanelPanel.js';

export const SUMMARY_PANEL_MODULE_ID = 'summary-panel';

const WIDGET_KINDS = ['digest', 'chart', 'heatmap', 'table', 'text'] as const;
export type SummaryWidgetKind = (typeof WIDGET_KINDS)[number];

export interface SummaryWidget {
  id: string;
  title?: string;
  /**
   * 'digest'  — per-column stats + highlight lines (`summariseRows`).
   * 'chart'   — a rendered chart (`runQuery` + `buildChartSpec`).
   * 'table'   — a plain result table with its computed analysis and an honest
   *             "showing N of M" footer.
   * 'heatmap' — the same table with cells shaded by magnitude (a table-render
   *             MODE, not a chart kind — see `@wellsfargo-starui/data`'s
   *             `CHART_KINDS` doc).
   * 'text'    — narrative the author wrote, rendered as formatted TEXT.
   */
  kind: SummaryWidgetKind;
  /**
   * The analysis behind the widget. A `text` widget has none, and gets an
   * empty query rather than an optional field, so nothing downstream needs a
   * null check for the one kind that doesn't query anything.
   */
  query: DataQuery;
  /**
   * `kind: 'text'` only — the narrative to show.
   *
   * Rendered as TEXT with a small, safe formatting subset (bold, inline code,
   * bullets, line breaks); never as markup. It is the one field here whose
   * content an author writes freely, which is exactly why it does not get an
   * HTML path — same posture the report vocabulary's `commentary` block takes.
   */
  text?: string;
  /**
   * `kind: 'text'` only — what the narrative is current AS OF ("the 14:32
   * close", "start of day").
   *
   * A text widget is the one card that does NOT recompute when rows tick,
   * sitting in a sidebar where every other tab does. Numbers in it therefore
   * go stale silently, which is the whole hazard — and a stamp is what makes
   * them honest rather than forbidden. When it is absent the card says the
   * note is static instead, so a reader is never left assuming it is live.
   */
  asOf?: string;
  /** Only meaningful when `kind === 'chart'`. Defaults to `'auto'`. */
  chartKind?: ChartKind;
  /**
   * Presentation options — label contrast, grid lines, legend, palette.
   * Semantic rather than raw colours, so both themes stay correct; see
   * `ChartStyle` in `@wellsfargo-starui/data`.
   */
  style?: ChartStyle;
}

export interface SummaryPanelState {
  widgets: SummaryWidget[];
}

export const INITIAL_SUMMARY_PANEL: SummaryPanelState = { widgets: [] };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Validates one persisted widget, dropping malformed entries at load time —
 *  same discipline `saved-filters` uses for its own opaque-ish records: a
 *  broken card should never crash the strip, only be silently absent. */
function validateWidget(raw: unknown): SummaryWidget | null {
  if (!isPlainObject(raw)) return null;
  const { id, kind, query, title, chartKind, style, text } = raw;
  if (typeof id !== 'string' || id.length === 0) return null;
  if (!(WIDGET_KINDS as readonly string[]).includes(kind as string)) return null;
  // Every kind but `text` is defined by its query, so a missing one is a
  // malformed widget. A `text` widget has nothing to query.
  const isText = kind === 'text';
  if (!isText && !isPlainObject(query)) return null;
  const widget: SummaryWidget = {
    id,
    kind: kind as SummaryWidgetKind,
    query: (isPlainObject(query) ? query : {}) as DataQuery,
  };
  if (isText) {
    if (typeof text !== 'string' || text.trim().length === 0) return null;
    widget.text = text;
    const asOf = (raw as { asOf?: unknown }).asOf;
    if (typeof asOf === 'string' && asOf.trim().length > 0) widget.asOf = asOf.trim();
  }
  if (typeof title === 'string' && title.length > 0) widget.title = title;
  if (typeof chartKind === 'string') widget.chartKind = chartKind as ChartKind;
  const validStyle = validateStyle(style);
  if (validStyle) widget.style = validStyle;
  return widget;
}

/**
 * Style is validated rather than passed through: an unrecognised value would
 * reach the renderer and either do nothing or throw, and a widget whose style
 * silently vanishes on reload is worse than one that never took it. Unknown
 * keys are dropped; recognised ones are kept exactly.
 */
function validateStyle(raw: unknown): ChartStyle | undefined {
  if (!isPlainObject(raw)) return undefined;
  const out: ChartStyle = {};
  if ((LABEL_CONTRASTS as readonly string[]).includes(raw.labelContrast as string)) {
    out.labelContrast = raw.labelContrast as ChartStyle['labelContrast'];
  }
  if ((CHART_PALETTES as readonly string[]).includes(raw.palette as string)) {
    out.palette = raw.palette as ChartStyle['palette'];
  }
  if (typeof raw.showGrid === 'boolean') out.showGrid = raw.showGrid;
  if (typeof raw.showLegend === 'boolean') out.showLegend = raw.showLegend;
  return Object.keys(out).length > 0 ? out : undefined;
}

function validateWidgets(raw: unknown): SummaryWidget[] {
  if (!Array.isArray(raw)) return [];
  const out: SummaryWidget[] = [];
  for (const item of raw) {
    const widget = validateWidget(item);
    if (widget) out.push(widget);
  }
  return out;
}

export const summaryPanelModule: Module<SummaryPanelState> = {
  id: SUMMARY_PANEL_MODULE_ID,
  name: 'Summary Panel',
  code: '18',
  schemaVersion: 1,
  // One above alerts (27) — the highest priority among modules that don't
  // use one of the 200+/1000+ sentinel values reserved for grid-state /
  // toolbar-visibility / toolbar-date-settings / saved-filters.
  priority: 28,

  getInitialState: () => ({ widgets: [] }),

  serialize: (state) => ({ widgets: state.widgets }),

  deserialize: (raw) => {
    if (!isPlainObject(raw)) return { widgets: [] };
    return { widgets: validateWidgets(raw.widgets) };
  },

  SettingsPanel: SummaryPanelPanel,
  ListPane: SummaryPanelList,
  EditorPane: SummaryPanelEditor,
};

export { useSummaryPanelData, SummaryWidgetContent, DigestCard, QueryCard, TextCard } from './summaryWidgetContent.js';
export { DataChart, compactNumber } from './DataChart.js';
export { LaneChart, laneToneVar } from './LaneChart.js';
export { AnalysisTable, compact } from './AnalysisTable.js';
