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

const WIDGET_KINDS = ['digest', 'chart', 'heatmap'] as const;
export type SummaryWidgetKind = (typeof WIDGET_KINDS)[number];

export interface SummaryWidget {
  id: string;
  title?: string;
  /**
   * 'digest'  — per-column stats + a highlight line (`summariseRows`).
   * 'chart'   — a rendered chart (`runQuery` + `buildChartSpec`).
   * 'heatmap' — a shaded table (`runQuery`; a table-rendering mode, not a
   *             chart kind — see `@wellsfargo-starui/data`'s `CHART_KINDS` doc).
   */
  kind: SummaryWidgetKind;
  query: DataQuery;
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
  const { id, kind, query, title, chartKind, style } = raw;
  if (typeof id !== 'string' || id.length === 0) return null;
  if (!(WIDGET_KINDS as readonly string[]).includes(kind as string)) return null;
  if (!isPlainObject(query)) return null;
  const widget: SummaryWidget = { id, kind: kind as SummaryWidgetKind, query: query as DataQuery };
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

export { useSummaryPanelData, SummaryWidgetContent, DigestCard, QueryCard } from './summaryWidgetContent.js';
export { DataChart, compactNumber } from './DataChart.js';
export { AnalysisTable, compact } from './AnalysisTable.js';
