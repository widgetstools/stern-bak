/**
 * A notebook-style output cell for the data tools.
 *
 * Every other tool result is a one-line summary plus collapsible JSON, which is
 * right for a config write and useless for an analysis. This renders the shape
 * a person actually reads: provenance, stat cards, a chart when the result is
 * grouped, and the table itself.
 *
 * Monochrome by default — bars and text carry weight, not hue. The one
 * deliberate exception is `chart: 'heatmap'`: the table itself shades its
 * numeric cells (see `heatmap.ts`), which is the whole point of asking for
 * one. Every colour, chart or shading, comes from design-system tokens, so
 * light and dark both resolve from `[data-theme]`.
 */
import { useState } from 'react';
import { cn } from '@wellsfargo-starui/react';
import { ChevronRight, Database, FlaskConical } from 'lucide-react';
import type { DataCellPayload } from '../dataTools';
import { buildChartSpec, type ColumnDigest, type NumericStats } from '@wellsfargo-starui/data';
import { DataChart, AnalysisTable, compact } from '@wellsfargo-starui/grid/customizer';

/** Where the numbers came from. A generated sample must never read like live
 *  data — this is the visual half of that promise. */
function ProvenanceLine({ payload }: { payload: DataCellPayload }) {
  const sample = payload.source === 'sample';
  const Icon = sample ? FlaskConical : Database;
  return (
    <div
      className={cn(
        'flex items-start gap-1.5 px-2.5 py-1.5 text-[10px] leading-relaxed border-b border-border/60',
        sample ? 'text-foreground' : 'text-muted-foreground',
      )}
    >
      <Icon className="h-3 w-3 mt-px flex-shrink-0" />
      <span className="min-w-0">
        {sample && <span className="font-medium uppercase tracking-wider mr-1">Generated sample —</span>}
        {payload.provenance}
      </span>
    </div>
  );
}

function StatCard({ stat }: { stat: NumericStats }) {
  return (
    <div className="rounded-md border border-border/60 px-2 py-1.5 min-w-0">
      <div className="truncate font-mono text-[10px] text-muted-foreground">{stat.colId}</div>
      <div className="mt-0.5 font-mono text-[13px] tabular-nums text-foreground">{compact(stat.sum, stat.colId)}</div>
      <div className="mt-0.5 font-mono text-[9px] tabular-nums text-muted-foreground/80">
        x̄ {compact(stat.mean, stat.colId)} · {compact(stat.min, stat.colId)}–{compact(stat.max, stat.colId)}
      </div>
    </div>
  );
}

function CategoryBars({ stat }: { stat: Extract<ColumnDigest, { kind: 'text' | 'boolean' }> }) {
  return (
    <div className="min-w-0">
      <div className="truncate font-mono text-[10px] text-muted-foreground mb-1">
        {stat.colId} <span className="text-muted-foreground/70">· {stat.distinct} distinct</span>
      </div>
      <div className="space-y-0.5">
        {stat.top.map((entry) => (
          <div key={entry.value} className="flex items-center gap-1.5 text-[10px]">
            <span className="w-24 truncate text-foreground/90" title={entry.value}>{entry.value}</span>
            <span className="h-2 flex-1 rounded-sm bg-muted/50 overflow-hidden">
              <span className="block h-full rounded-sm bg-foreground/40" style={{ width: `${entry.share}%` }} />
            </span>
            <span className="w-10 text-right font-mono tabular-nums text-muted-foreground">{entry.share}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * What to draw, from whichever half of the payload carries a shape worth
 * charting. A grouped digest charts its buckets; a query result charts its own
 * table. `buildChartSpec` returns undefined when neither is worth drawing.
 */
function chartFor(payload: DataCellPayload) {
  const { digest, table } = payload;
  if (digest?.groups) {
    return buildChartSpec({
      columns: [digest.groups.by, 'rows'],
      rows: digest.groups.buckets.map((b) => ({ [digest.groups!.by]: b.value, rows: b.rowCount })),
      grouped: true,
      requested: payload.chart,
    });
  }
  if (table && table.columns.length >= 2) {
    return buildChartSpec({
      columns: table.columns,
      rows: table.rows,
      grouped: table.grouped ?? false,
      // A pivoted result IS multi-series — passing this is what makes a
      // cross-tab chart as a cross-tab instead of one arbitrary column.
      pivot: table.pivot,
      requested: payload.chart,
    });
  }
  return undefined;
}

export function DataResultCell({ payload }: { payload: DataCellPayload }) {
  const [showRaw, setShowRaw] = useState(false);
  const { digest, table } = payload;
  // The query engine's own `QueryResult.highlights` (`dataQuery.ts`) is the
  // digest's counterpart for a chart/pivot/heatmap result — same slot below,
  // whichever half of the payload is populated.
  const highlights = digest?.highlights ?? table?.highlights ?? [];
  const numerics = (digest?.columns ?? []).filter((c): c is NumericStats => c.kind === 'number');
  const categories = (digest?.columns ?? []).filter(
    (c): c is Extract<ColumnDigest, { kind: 'text' | 'boolean' }> => c.kind === 'text' || c.kind === 'boolean',
  );
  // 'heatmap' is a table-shading MODE, not a chart — checked before calling
  // into the chart pipeline at all, not after: `buildChartSpec` already bails
  // to `undefined` for it, but that alone wouldn't turn shading ON, only
  // prevent a broken chart. This is what actually wires the request to the
  // table.
  const isHeatmap = payload.chart === 'heatmap';
  const chart = isHeatmap ? undefined : chartFor(payload);

  return (
    <div className="w-full rounded-lg border border-border/60 overflow-hidden">
      <div className="flex items-baseline gap-2 px-2.5 py-1.5 border-b border-border/60 bg-muted/20">
        <span className="font-mono text-[11px] text-foreground/90">{payload.gridName}</span>
        <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">{payload.ran}</span>
        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">{payload.rowCount} rows</span>
      </div>

      <ProvenanceLine payload={payload} />

      {highlights.length > 0 && (
        <ul className="px-2.5 py-2 space-y-1 border-b border-border/60">
          {highlights.map((line) => (
            <li key={line} className="text-[11px] leading-relaxed text-foreground/90 flex gap-1.5">
              <span className="text-muted-foreground/60 select-none">·</span>
              <span className="min-w-0">{line}</span>
            </li>
          ))}
        </ul>
      )}

      {numerics.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 px-2.5 py-2 border-b border-border/60">
          {numerics.slice(0, 6).map((stat) => <StatCard key={stat.colId} stat={stat} />)}
        </div>
      )}

      {chart && (
        <div className="px-2.5 py-2 border-b border-border/60">
          <div className="mb-1 text-[10px] text-muted-foreground/80">{chart.caption}</div>
          <DataChart spec={chart} />
        </div>
      )}

      {categories.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 px-2.5 py-2 border-b border-border/60">
          {categories.slice(0, 4).map((stat) => <CategoryBars key={stat.colId} stat={stat} />)}
        </div>
      )}

      {table && (
        <AnalysisTable
          columns={table.columns}
          rows={table.rows}
          stickyLeadingCols={table.pivot?.rowDims.length ?? 0}
          valueColId={table.pivot?.measures[0]}
          heatmap={isHeatmap}
        />
      )}
      {table?.truncated && (
        <div className="px-2.5 py-1 text-[10px] text-muted-foreground border-t border-border/60">
          Showing {table.rows.length} of {table.matched} matching rows.
        </div>
      )}

      {digest && digest.sample.length > 0 && (
        <details className="border-t border-border/60">
          <summary className="cursor-pointer px-2.5 py-1 text-[10px] text-muted-foreground hover:bg-muted/30 select-none">
            sample rows ({digest.sample.length})
          </summary>
          <AnalysisTable columns={Object.keys(digest.sample[0])} rows={digest.sample} />
        </details>
      )}

      <button
        type="button"
        onClick={() => setShowRaw((v) => !v)}
        className="flex w-full items-center gap-1 px-2.5 py-1 text-[10px] text-muted-foreground hover:bg-muted/30 border-t border-border/60"
      >
        <ChevronRight className={cn('h-3 w-3 transition-transform', showRaw && 'rotate-90')} />
        raw result
      </button>
      {showRaw && (
        <pre className="overflow-x-auto bg-muted/40 px-2.5 py-2 text-[10px] leading-relaxed max-h-64">
          {JSON.stringify(payload, null, 2)}
        </pre>
      )}
    </div>
  );
}
