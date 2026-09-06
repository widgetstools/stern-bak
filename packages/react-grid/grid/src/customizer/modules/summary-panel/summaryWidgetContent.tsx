/**
 * Data + rendering for one summary-panel widget — everything BlotterDock
 * needs that isn't dock-layout mechanics (that lives in
 * `../../../widget/BlotterDock.tsx`, which owns the one unified dock
 * instance the blotter and every widget panel share).
 *
 * ## Where the rows come from, and why it changed
 *
 * These widgets used to read the GRID: `api.forEachNode` into a fresh array on
 * every `platform.rows` tick, pushed through React state. On a large blotter
 * under Windows that made the dock sluggish to drag, for three compounding
 * reasons:
 *
 *  1. `platform.rows` is a GRID-event bus — `modelUpdated`, `sortChanged` and
 *     `filterChanged` are among its sources. Sorting or filtering changes no
 *     data, yet re-ran every widget's aggregation over every row.
 *  2. Each tick produced a NEW array identity, so every widget re-rendered
 *     even when its own numbers had not moved.
 *  3. Worst of all, `runQuery` / `summariseRows` / `buildChartSpec` ran in the
 *     card render bodies, unmemoized. Dockview re-renders its panels while a
 *     drag is in progress, so every frame of a drag re-aggregated the whole
 *     row set, synchronously, on the main thread. That is the sluggishness.
 *
 * Now: a `LiveRowSource` fed by the data provider supplies one array that is
 * mutated in place, and change is reported by a VERSION counter. A re-render
 * caused by anything other than data — a drag, a resize, a theme flip — costs
 * nothing, because every aggregation is memoized on `[version, widget]`.
 *
 * When no provider source is present (a consumer mounting `MarketsGrid`
 * directly), it falls back to the old grid read, so nothing regresses for
 * them.
 *
 * A widget's query aggregates over the WHOLE row set (groupBy / pivotBy /
 * sum), so there is no meaningful "only the changed rows" shortcut for the
 * aggregation itself — which is exactly why it must not run when nothing
 * changed, and must not run for a widget nobody is looking at.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { GridApi } from 'ag-grid-community';
import { runQuery, summariseRows, buildChartSpec, type QueryResult } from '@wellsfargo-starui/data';
import { useGridPlatform } from '../../hooks/GridProvider';
import { useGridApi } from '../../hooks/useGridApi';
import { useModuleState } from '../../hooks/useModuleState';
import { useLiveRowSource } from './LiveRowSourceContext.js';
import { DataChart } from './DataChart.js';
import { AnalysisTable, compact } from './AnalysisTable.js';
import { SUMMARY_PANEL_MODULE_ID, type SummaryPanelState, type SummaryWidget } from './index.js';

// The grid-read fallback re-scans every row, which is real work on a large
// blotter. The provider path does not scan at all, but still coalesces bursts.
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
  /**
   * The current rows. STABLE BY REFERENCE when a provider source is supplying
   * them — pair it with `rowsVersion`, never with its identity.
   */
  rows: Record<string, unknown>[];
  /** Bumps only when the row CONTENT changed. The memo key for every widget. */
  rowsVersion: number;
  /** Removes one widget from module state — the settings panel's delete
   *  button, a chatbot `remove_module_item` call, and BlotterDock's own
   *  dock-header close button all end up here. */
  removeWidget: (widgetId: string) => void;
}

const EMPTY_ROWS: Record<string, unknown>[] = [];

/** `widgets` is `[]` (not `undefined`) when the module isn't registered on
 *  this grid, so callers can treat "no module" and "module, no widgets" the
 *  same way — both mean nothing to dock. */
export function useSummaryPanelData(): SummaryPanelData {
  const platform = useGridPlatform();
  const api = useGridApi();
  const liveSource = useLiveRowSource();
  const [state, setState] = useModuleState<SummaryPanelState | undefined>(SUMMARY_PANEL_MODULE_ID);

  // Zero widgets → zero cost. A blotter with the summary panel enabled but no
  // widgets configured (the common steady state) must not pay a row read, a
  // subscription or a timer for data nothing renders.
  const widgetCount = state?.widgets.length ?? 0;

  // Provider path: mirror the source's own version. It already owns the array
  // and only bumps when content moved, so there is nothing to copy or diff.
  const [liveVersion, setLiveVersion] = useState(0);
  useEffect(() => {
    if (!liveSource || widgetCount === 0) return;
    setLiveVersion(liveSource.getVersion());
    return liveSource.subscribe(() => setLiveVersion(liveSource.getVersion()));
  }, [liveSource, widgetCount]);

  // Grid fallback, only for consumers with no provider source. Keeps the array
  // in a ref and publishes a version, so the memo contract below is identical
  // on both paths.
  const fallbackRowsRef = useRef<Record<string, unknown>[]>(EMPTY_ROWS);
  const [fallbackVersion, setFallbackVersion] = useState(0);

  const refresh = useCallback(() => {
    if (!api) return;
    fallbackRowsRef.current = readAllRows(api);
    setFallbackVersion((v) => v + 1);
  }, [api]);

  useEffect(() => {
    if (liveSource) return;
    if (widgetCount === 0) {
      // Release the snapshot so a widgets-removed session stops pinning rows.
      if (fallbackRowsRef.current.length > 0) {
        fallbackRowsRef.current = EMPTY_ROWS;
        setFallbackVersion((v) => v + 1);
      }
      return;
    }
    refresh();
  }, [liveSource, widgetCount, refresh]);

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
    if (liveSource || widgetCount === 0) return; // provider path, or nothing to feed
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
  }, [liveSource, platform, refresh, widgetCount]);

  const removeWidget = useCallback(
    (widgetId: string) => {
      setState((prev) => (prev ? { ...prev, widgets: prev.widgets.filter((w) => w.id !== widgetId) } : prev));
    },
    [setState],
  );

  const rows = widgetCount === 0
    ? EMPTY_ROWS
    : liveSource
      ? liveSource.getRows()
      : fallbackRowsRef.current;

  return {
    widgets: state?.widgets ?? [],
    rows,
    rowsVersion: liveSource ? liveVersion : fallbackVersion,
    removeWidget,
  };
}

/**
 * `rows` is stable by reference and mutated in place; `rowsVersion` is the
 * change signal. Every aggregation below keys on the version, so a re-render
 * that isn't about data does no work.
 */
export interface WidgetCardProps {
  widget: SummaryWidget;
  rows: Record<string, unknown>[];
  rowsVersion: number;
}

/**
 * A deliberately tiny formatter: `**bold**`, `` `code` ``, `- ` bullets and
 * line breaks. Nothing else.
 *
 * The alternative was pulling a markdown renderer into this package, which
 * every consumer of `@wellsfargo-starui/grid` would then carry — a real cost
 * for bold and bullets in a narrow sidebar card. More importantly, this
 * returns React NODES: the text is escaped by React like any other string, so
 * there is no HTML path for author-written content to travel down. Same
 * posture the report vocabulary's `commentary` block takes.
 */
function formatInline(line: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  // Alternation order matters: bold before code, so `**a**` is not eaten by a
  // stray backtick pairing across it.
  const pattern = /\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = pattern.exec(line)) !== null) {
    if (match.index > last) out.push(line.slice(last, match.index));
    if (match[1] !== undefined) {
      out.push(<strong key={`${keyPrefix}-b${i}`} className="font-semibold text-foreground">{match[1]}</strong>);
    } else {
      out.push(
        <code key={`${keyPrefix}-c${i}`} className="font-mono text-[9px] rounded-sm bg-muted/60 px-1 py-px">
          {match[2]}
        </code>,
      );
    }
    last = pattern.lastIndex;
    i += 1;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}

export function TextCard({ widget }: { widget: SummaryWidget }) {
  const lines = (widget.text ?? '').split('\n');
  return (
    <div className="flex flex-col gap-1 px-2 py-1.5 text-[10px] leading-relaxed text-foreground/85">
      {/* Every other tab in this sidebar recomputes as rows tick; this one
          does not. Saying so — with the author's own "as of" when they gave
          one — is what lets a note carry numbers honestly instead of having
          to avoid them. */}
      <p className="text-[9px] uppercase tracking-wide text-muted-foreground/60">
        {widget.asOf ? `As of ${widget.asOf} · not live` : 'Written note · does not update'}
      </p>
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <span key={i} className="block h-1" />;
        if (/^[-*]\s+/.test(trimmed)) {
          return (
            <div key={i} className="flex gap-1.5">
              <span className="text-muted-foreground/70 select-none">·</span>
              <span className="min-w-0">{formatInline(trimmed.replace(/^[-*]\s+/, ''), `l${i}`)}</span>
            </div>
          );
        }
        return <p key={i}>{formatInline(trimmed, `l${i}`)}</p>;
      })}
    </div>
  );
}

/**
 * The analysis the query engine already computed, which the sidebar used to
 * throw away: the plain-sentence observations about THIS result, and an honest
 * row count. "Showing 5 of 2,000 matching rows" is the difference between a
 * table someone trusts and one they have to go and check.
 */
function ResultFooter({ result }: { result: QueryResult }) {
  const shown = result.rows.length;
  return (
    <div className="flex flex-col gap-1 px-2 pb-1.5 pt-1">
      {result.highlights?.slice(0, 2).map((line) => (
        <p key={line} className="text-[10px] leading-relaxed text-foreground/80">
          {line}
        </p>
      ))}
      <p className="text-[9px] text-muted-foreground/70">
        {shown === result.matched
          ? `${result.matched.toLocaleString()} matching row${result.matched === 1 ? '' : 's'}`
          : `Showing ${shown.toLocaleString()} of ${result.matched.toLocaleString()} matching rows`}
      </p>
    </div>
  );
}

export function DigestCard({ widget, rows, rowsVersion }: WidgetCardProps) {
  const { query } = widget;
  // Keyed on the VERSION, never on `rows` identity: the array is mutated in
  // place, and a re-render from a dock drag must not re-aggregate.
  const digest = useMemo(
    () => summariseRows(rows, { columns: query.columns, groupBy: query.groupBy?.[0], topN: 3 }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rows is stable by reference; rowsVersion is the change signal
    [rowsVersion, query.columns, query.groupBy],
  );
  const highlight = digest.highlights[0];
  const numerics = digest.columns.filter((c) => c.kind === 'number').slice(0, 2);

  return (
    <div className="flex flex-col gap-1.5 px-2 py-1.5">
      {digest.highlights.slice(0, 2).map((line) => (
        <p key={line} className="text-[10px] leading-relaxed text-foreground/80">{line}</p>
      ))}
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

export function QueryCard({ widget, rows, rowsVersion }: WidgetCardProps) {
  // The single most expensive thing the panel does, and it used to run in the
  // render body — so every frame of a dock drag re-ran it over every row.
  const outcome = useMemo(
    () => runQuery(rows, widget.query),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rows is stable by reference; rowsVersion is the change signal
    [rowsVersion, widget.query],
  );
  const result: QueryResult | null = outcome.ok ? outcome.value : null;

  // Hooks must run unconditionally, so the chart spec is computed before the
  // early return rather than after it.
  const spec = useMemo(
    () =>
      result
        ? buildChartSpec({
            columns: result.columns,
            rows: result.rows,
            grouped: result.grouped,
            // A pivoted widget IS multi-series. Without this the builder saw a
            // flat column list and drew only the last pivot column.
            pivot: result.pivot,
            requested: widget.chartKind ?? 'auto',
            scale: widget.scale,
            baseline: widget.baseline,
          })
        : null,
    [result, widget.chartKind, widget.scale, widget.baseline],
  );

  if (!outcome.ok) {
    return <p className="px-2 py-1.5 text-[10px] leading-relaxed text-muted-foreground">{outcome.error}</p>;
  }
  if (!result) return null;

  // `table` and `heatmap` are the same table; heatmap additionally shades
  // cells by magnitude.
  if (widget.kind === 'table' || widget.kind === 'heatmap') {
    return (
      // Fills the panel it is given rather than being clipped at a fixed
      // 160px. A cross-tab is the widget most likely to be dragged large on
      // purpose, and the old cap meant making the panel bigger did nothing —
      // the user still scrolled a letterbox.
      <div className="flex h-full max-h-full flex-col">
        <div className="min-h-0 flex-1 overflow-auto">
          <AnalysisTable
            columns={result.columns}
            rows={result.rows}
            stickyLeadingCols={result.pivot?.rowDims.length ?? 0}
            valueColId={result.pivot?.measures[0]}
            heatmap={widget.kind === 'heatmap'}
          />
        </div>
        <ResultFooter result={result} />
      </div>
    );
  }

  if (!spec) return <p className="px-2 py-1.5 text-[10px] text-muted-foreground">Not enough data to chart yet.</p>;

  return (
    <div className="flex h-full max-h-full flex-col">
      <div className="min-h-0 flex-1 px-1.5 py-1">
        <DataChart spec={spec} style={widget.style} />
      </div>
      {/* What the chart is of, in words — the chat panel has always shown this
          and the sidebar never did, which left an unlabelled chart. */}
      <p className="px-2 pb-0.5 text-[9px] text-muted-foreground/60">{spec.caption}</p>
      <ResultFooter result={result} />
    </div>
  );
}

/** Dispatches on `widget.kind` — the one place BlotterDock needs to know
 *  there are three rendering families: narrative, digest, and everything that
 *  runs a query. */
export function SummaryWidgetContent({ widget, rows, rowsVersion }: WidgetCardProps) {
  if (widget.kind === 'text') return <TextCard widget={widget} />;
  if (widget.kind === 'digest') return <DigestCard widget={widget} rows={rows} rowsVersion={rowsVersion} />;
  return <QueryCard widget={widget} rows={rows} rowsVersion={rowsVersion} />;
}
