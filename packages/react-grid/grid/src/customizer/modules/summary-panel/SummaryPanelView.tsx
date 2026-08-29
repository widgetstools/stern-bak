/**
 * The always-visible strip — one compact card per configured widget,
 * recomputed from the grid's own current rows as they change.
 *
 * Unlike Alerts, which evaluates cell deltas incrementally, a widget's query
 * aggregates over the WHOLE current row set (groupBy / pivotBy / sum), so
 * there is no meaningful "only the changed rows" shortcut — every recompute
 * reads every row via `api.forEachNode`. `platform.rows` already coalesces a
 * burst of flushes into one emit per task; this adds a further DEBOUNCE_MS on
 * top so a busy streaming blotter doesn't re-run every widget's aggregation
 * on every one of those coalesced ticks.
 *
 * `useGridApi()` already requires a `<GridProvider>` ancestor (it throws
 * otherwise), so this always renders inside one — `MarketsGridHost` mounts it
 * there unconditionally. Renders nothing when no widgets are configured.
 */
import { useCallback, useEffect, useState } from 'react';
import type { GridApi } from 'ag-grid-community';
import { runQuery, summariseRows, buildChartSpec, type QueryResult } from '@wellsfargo-starui/data';
import { useGridPlatform } from '../../hooks/GridProvider';
import { useGridApi } from '../../hooks/useGridApi';
import { useModuleState } from '../../hooks/useModuleState';
import { DataChart } from './DataChart.js';
import { AnalysisTable, compact } from './AnalysisTable.js';
import { KIND_LABEL } from './SummaryPanelPanel.js';
import { SUMMARY_PANEL_MODULE_ID, type SummaryPanelState, type SummaryWidget } from './index.js';

const DEBOUNCE_MS = 400;

function readAllRows(api: GridApi): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  api.forEachNode((node) => {
    if (node.data) out.push(node.data as Record<string, unknown>);
  });
  return out;
}

export function SummaryPanelView() {
  const platform = useGridPlatform();
  const api = useGridApi();
  const [state] = useModuleState<SummaryPanelState | undefined>(SUMMARY_PANEL_MODULE_ID);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);

  const refresh = useCallback(() => {
    if (!api) return;
    setRows(readAllRows(api));
  }, [api]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = platform.rows.subscribe(() => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(refresh, DEBOUNCE_MS);
    });
    return () => {
      unsubscribe();
      if (timer !== null) clearTimeout(timer);
    };
  }, [platform, refresh]);

  // Module not registered on this grid, or nothing configured — render
  // nothing rather than an empty strip taking up vertical space.
  if (!state || state.widgets.length === 0) return null;

  return (
    <div
      className="ds-summary-panel flex items-stretch gap-2 overflow-x-auto border-b border-border/60 bg-muted/10 px-2 py-2"
      data-testid="summary-panel-strip"
    >
      {state.widgets.map((widget) => (
        <WidgetCard key={widget.id} widget={widget} rows={rows} />
      ))}
    </div>
  );
}

function WidgetCard({ widget, rows }: { widget: SummaryWidget; rows: Record<string, unknown>[] }) {
  return (
    <div
      className="flex w-72 shrink-0 flex-col overflow-hidden rounded-md border border-border/60 bg-background"
      data-testid={`summary-widget-${widget.id}`}
    >
      <div className="truncate border-b border-border/60 bg-muted/20 px-2 py-1 text-[11px] font-medium text-foreground/90">
        {widget.title || KIND_LABEL[widget.kind]}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {widget.kind === 'digest' ? <DigestCard widget={widget} rows={rows} /> : <QueryCard widget={widget} rows={rows} />}
      </div>
    </div>
  );
}

function DigestCard({ widget, rows }: { widget: SummaryWidget; rows: Record<string, unknown>[] }) {
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
              <div className="font-mono text-[11px] tabular-nums text-foreground">{compact(stat.sum)}</div>
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

function QueryCard({ widget, rows }: { widget: SummaryWidget; rows: Record<string, unknown>[] }) {
  const outcome = runQuery(rows, widget.query);
  if (!outcome.ok) {
    return <p className="px-2 py-1.5 text-[10px] leading-relaxed text-muted-foreground">{outcome.error}</p>;
  }
  const result: QueryResult = outcome.value;

  if (widget.kind === 'heatmap') {
    return (
      <div className="max-h-40 overflow-auto">
        <AnalysisTable
          columns={result.columns}
          rows={result.rows}
          stickyLeadingCols={result.pivot?.rowDims.length ?? 0}
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
      <DataChart spec={spec} />
    </div>
  );
}
