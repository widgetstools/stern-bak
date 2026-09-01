/**
 * Data + rendering for one summary-panel widget — everything BlotterDock
 * needs that isn't dock-layout mechanics (that lives in
 * `../../../widget/BlotterDock.tsx`, which owns the one unified dock
 * instance the blotter and every widget panel share).
 *
 * `useSummaryPanelData` recomputes widgets from the grid's own current rows
 * as they change. Unlike Alerts, which evaluates cell deltas incrementally, a
 * widget's query aggregates over the WHOLE current row set (groupBy /
 * pivotBy / sum), so there is no meaningful "only the changed rows"
 * shortcut — every recompute reads every row via `api.forEachNode`.
 * `platform.rows` already coalesces a burst of flushes into one emit per
 * task; this throttles further on top (see REFRESH_INTERVAL_MS below) so a
 * busy streaming blotter doesn't re-run every widget's aggregation on every
 * one of those coalesced ticks.
 */
import { useCallback, useEffect, useState } from 'react';
import type { GridApi } from 'ag-grid-community';
import { runQuery, summariseRows, buildChartSpec, type QueryResult } from '@wellsfargo-starui/data';
import { useGridPlatform } from '../../hooks/GridProvider';
import { useGridApi } from '../../hooks/useGridApi';
import { useModuleState } from '../../hooks/useModuleState';
import { DataChart } from './DataChart.js';
import { AnalysisTable, compact } from './AnalysisTable.js';
import { SUMMARY_PANEL_MODULE_ID, type SummaryPanelState, type SummaryWidget } from './index.js';

// A widget's query re-scans every row on every recompute (see below), which
// is real work on a large blotter — 750ms keeps widgets reasonably live
// without turning every busy tick into extra main-thread contention.
const REFRESH_INTERVAL_MS = 750;

function readAllRows(api: GridApi): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  api.forEachNode((node) => {
    if (node.data) out.push(node.data as Record<string, unknown>);
  });
  return out;
}

export interface SummaryPanelData {
  widgets: SummaryWidget[];
  rows: Record<string, unknown>[];
  /** Removes one widget from module state — the settings panel's delete
   *  button, a chatbot `remove_module_item` call, and BlotterDock's own
   *  dock-header close button all end up here. */
  removeWidget: (widgetId: string) => void;
}

/** `widgets` is `[]` (not `undefined`) when the module isn't registered on
 *  this grid, so callers can treat "no module" and "module, no widgets" the
 *  same way — both mean nothing to dock. */
export function useSummaryPanelData(): SummaryPanelData {
  const platform = useGridPlatform();
  const api = useGridApi();
  const [state, setState] = useModuleState<SummaryPanelState | undefined>(SUMMARY_PANEL_MODULE_ID);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);

  // Zero widgets → zero cost. A blotter with the summary panel enabled but
  // no widgets configured (the common steady state) must not pay a full
  // 20k-row forEachNode read + React state set every refresh interval for
  // data nothing renders. The row snapshot is also released so the previous
  // array doesn't pin row objects across a widgets-removed session.
  const widgetCount = state?.widgets.length ?? 0;

  const refresh = useCallback(() => {
    if (!api) return;
    setRows(readAllRows(api));
  }, [api]);

  useEffect(() => {
    if (widgetCount === 0) {
      setRows((prev) => (prev.length === 0 ? prev : []));
      return;
    }
    refresh();
  }, [widgetCount, refresh]);

  // Throttled, not debounced: a busy blotter never has a >REFRESH_INTERVAL_MS
  // gap between ticks, and a pure debounce (reset-on-every-tick) would then
  // never fire at all while streaming — leaving widgets frozen mid-session,
  // then dumping one big recompute the moment traffic finally pauses, which
  // tends to land right as the user goes to interact with something else.
  // This instead runs refresh() at most once per REFRESH_INTERVAL_MS, and if
  // more ticks arrived during that window, immediately queues exactly one
  // more round afterward — bounded, predictable cost instead of a
  // stale-then-burst pattern.
  useEffect(() => {
    if (widgetCount === 0) return; // no widgets → no subscription, no timers, no row reads
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pending = false;
    const schedule = () => {
      if (timer !== null) {
        pending = true;
        return;
      }
      timer = setTimeout(() => {
        timer = null;
        refresh();
        if (pending) {
          pending = false;
          schedule();
        }
      }, REFRESH_INTERVAL_MS);
    };
    const unsubscribe = platform.rows.subscribe(schedule);
    return () => {
      unsubscribe();
      if (timer !== null) clearTimeout(timer);
    };
  }, [platform, refresh, widgetCount]);

  const removeWidget = useCallback(
    (widgetId: string) => {
      setState((prev) => (prev ? { ...prev, widgets: prev.widgets.filter((w) => w.id !== widgetId) } : prev));
    },
    [setState],
  );

  return { widgets: state?.widgets ?? [], rows, removeWidget };
}

export function DigestCard({ widget, rows }: { widget: SummaryWidget; rows: Record<string, unknown>[] }) {
  const { query } = widget;
  const digest = summariseRows(rows, { columns: query.columns, groupBy: query.groupBy?.[0], topN: 3 });
  const highlight = digest.highlights[0];
  const numerics = digest.columns.filter((c) => c.kind === 'number').slice(0, 2);

  return (
    <div className="flex flex-col gap-1.5 px-2 py-1.5">
      {highlight && <p className="text-[10px] leading-relaxed text-foreground/80">{highlight}</p>}
      {digest.groups ? (
        <ul className="space-y-1">
          {digest.groups.buckets.slice(0, 3).map((bucket) => (
            <li key={bucket.value} className="flex items-center gap-1.5 text-[10px]">
              <span className="w-20 truncate text-foreground/90" title={bucket.value}>{bucket.value}</span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-sm bg-muted/50">
                <span className="block h-full rounded-sm bg-foreground/40" style={{ width: `${bucket.share}%` }} />
              </span>
              <span className="w-8 shrink-0 text-right font-mono tabular-nums text-muted-foreground">{bucket.share}%</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="grid grid-cols-2 gap-1.5">
          {numerics.map((stat) => (
            <div key={stat.colId} className="min-w-0 rounded-sm border border-border/50 px-1.5 py-1">
              <div className="truncate font-mono text-[9px] text-muted-foreground">{stat.colId}</div>
              <div className="font-mono text-[11px] tabular-nums text-foreground">{compact(stat.sum, stat.colId)}</div>
            </div>
          ))}
        </div>
      )}
      {!highlight && !digest.groups && numerics.length === 0 && (
        <p className="text-[10px] text-muted-foreground">No rows matched.</p>
      )}
    </div>
  );
}

export function QueryCard({ widget, rows }: { widget: SummaryWidget; rows: Record<string, unknown>[] }) {
  const outcome = runQuery(rows, widget.query);
  if (!outcome.ok) {
    return <p className="px-2 py-1.5 text-[10px] leading-relaxed text-muted-foreground">{outcome.error}</p>;
  }
  const result: QueryResult = outcome.value;

  if (widget.kind === 'heatmap') {
    return (
      // Fills the panel it is given rather than being clipped at a fixed
      // 160px. A cross-tab is the widget most likely to be dragged large on
      // purpose, and the old cap meant making the panel bigger did nothing —
      // the user still scrolled a letterbox.
      <div className="h-full max-h-full overflow-auto">
        <AnalysisTable
          columns={result.columns}
          rows={result.rows}
          stickyLeadingCols={result.pivot?.rowDims.length ?? 0}
          valueColId={result.pivot?.measures[0]}
          heatmap
        />
      </div>
    );
  }

  const spec = buildChartSpec({
    columns: result.columns,
    rows: result.rows,
    grouped: result.grouped,
    requested: widget.chartKind ?? 'auto',
  });
  if (!spec) return <p className="px-2 py-1.5 text-[10px] text-muted-foreground">Not enough data to chart yet.</p>;

  return (
    <div className="px-1.5 py-1">
      <DataChart spec={spec} style={widget.style} />
    </div>
  );
}

/** Dispatches on `widget.kind` — the one place BlotterDock needs to know
 *  there are two rendering families (digest vs. everything else). */
export function SummaryWidgetContent({ widget, rows }: { widget: SummaryWidget; rows: Record<string, unknown>[] }) {
  return widget.kind === 'digest' ? <DigestCard widget={widget} rows={rows} /> : <QueryCard widget={widget} rows={rows} />;
}
