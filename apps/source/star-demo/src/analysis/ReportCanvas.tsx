/**
 * Renders a `ReportSpec` as one composition rather than a column of cards.
 *
 * The layout follows the editorial reference this was modelled on: standing
 * context down the left, the thing that moves across the middle, aggregate
 * totals down the right, and rotated band labels in the gutter grouping
 * consecutive blocks. What that buys over a dashboard is that the reader takes
 * in the shape of the whole before reading a single number.
 *
 * Two things the reference does that are load-bearing and easy to lose:
 *
 * - **Numerals carry the page.** Headline figures are large, tabular and
 *   lightly tracked, with a hairline rule under each and a small-caps label
 *   above. That contrast — tiny label, big number — is most of the design.
 * - **Colour is semantic, never decorative.** Each lane and each tile means
 *   something by its hue. The reference is a dark-only print piece on one
 *   fixed palette; this has to render under both `[data-theme]` values and
 *   pass `check:ds-tokens`, so every colour resolves through `--ds-*`.
 *
 * Every block is trusted code chosen by name. The model composes the spec; it
 * never supplies markup, script or drawing instructions.
 */
import { useMemo } from 'react';
import { cn } from '@wellsfargo-starui/react';
import {
  buildChartSpec,
  formatValue,
  formatCompact,
  runQuery,
  type ChartKind,
  type CommentaryBlock,
  type KpiBlock,
  type KpiTile,
  type LanesBlock,
  type QueryResult,
  type ReportBlock,
  type ReportSpec,
} from '@wellsfargo-starui/data';
import { AnalysisTable, DataChart, LaneChart } from '@wellsfargo-starui/grid/customizer';

export interface ReportCanvasProps {
  spec: ReportSpec;
  /**
   * The rows to draw. When these come from a `LiveRowSource` the array is
   * STABLE BY REFERENCE and mutated in place, so its identity is not a change
   * signal — {@link rowsVersion} is.
   */
  rows: Array<Record<string, unknown>>;
  /** Bumps only when row CONTENT changed. The memo key for every block. */
  rowsVersion?: number;
  /** Shown under the title — what these numbers are and when they ran. */
  provenance?: string;
  ranAt?: Date;
  /**
   * How the numbers arrive, so the badge tells the truth.
   *
   * The badge used to key off `spec.refreshMs`, which stopped meaning anything
   * once the window subscribed to the provider: a genuinely live report showed
   * NO live indicator (it has no refreshMs), and a report that still polled
   * showed "live · every 5s" whether or not that was what was happening.
   *
   * Omitted means "infer it from the spec" — the pre-existing behaviour.
   */
  liveness?: 'streaming' | 'polled' | 'static';
}

/**
 * How much width a side rail gets, from what is in it.
 *
 * A fixed 220-300px is fine for commentary and stacked stats and far too
 * narrow for a table, which then shows its first column and clips the rest.
 * Tables and pivots are the wide case; everything else keeps the tighter
 * track so the main region is not starved for a rail of prose.
 */
function railTrack(blocks: Array<{ block: ReportBlock; index: number }>): string {
  const hasTable = blocks.some(({ block }) => block.kind === 'table' || block.kind === 'pivot');
  return hasTable ? 'minmax(320px, 420px)' : 'minmax(220px, 300px)';
}

/**
 * The rotated label in the gutter. Set in the reference's own idiom: large,
 * low-contrast, and read bottom-to-top so it never competes with the data.
 */
function BandLabel({ label }: { label: string }) {
  return (
    <div className="flex-shrink-0 flex items-center justify-center w-7 select-none">
      <span
        className="text-[13px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/55 whitespace-nowrap"
        style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
      >
        {label}
      </span>
    </div>
  );
}

/** A section heading with the reference's full-width rule under it. */
function BlockTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground pb-1 mb-2 border-b border-border/60">
      {children}
    </h3>
  );
}

/**
 * The headline-number treatment: small label, big tabular numeral, hairline
 * rule. Repeated at three sizes across the reference, and it is what makes a
 * wall of statistics scannable instead of dense.
 *
 * An optional bar can show the value's position within a range, for utilization
 * or allocation KPIs where the relationship to a ceiling matters as much as
 * the absolute number.
 */
function Stat({
  label,
  value,
  exact,
  tone,
  size = 'md',
  barFill,
  barColor,
}: {
  label: string;
  value: string;
  /** The unrounded figure, kept on the title so a compacted number is one hover from exact. */
  exact?: string;
  tone?: 'positive' | 'negative';
  size?: 'sm' | 'md' | 'lg';
  /** Bar fill as a fraction 0-1, when a bar should render. */
  barFill?: number;
  /** Bar colour intent: 'positive' (green) | 'negative' (red) | 'neutral' (blue). */
  barColor?: 'positive' | 'negative' | 'neutral';
}) {
  const clampedFill = barFill !== undefined ? Math.max(0, Math.min(1, barFill)) : undefined;
  const barColorClass = barColor === 'positive'
    ? 'bg-[var(--ds-accent-positive)]'
    : barColor === 'negative'
      ? 'bg-[var(--ds-accent-negative)]'
      : 'bg-[var(--ds-primary)]';

  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground truncate" title={label}>{label}</div>
      <div
        title={exact ?? value}
        className={cn(
          'font-mono tabular-nums leading-none mt-1 truncate',
          size === 'lg' && 'text-[26px]',
          size === 'md' && 'text-[19px]',
          size === 'sm' && 'text-[14px]',
          tone === 'positive' && 'text-[var(--ds-accent-positive)]',
          tone === 'negative' && 'text-[var(--ds-accent-negative)]',
          !tone && 'text-foreground',
        )}
      >
        {value}
      </div>
      {clampedFill !== undefined && (
        <div className="mt-1 h-1.5 bg-border/30 rounded-full overflow-hidden">
          <div
            className={cn('h-full transition-all', barColorClass)}
            style={{ width: `${clampedFill * 100}%` }}
          />
        </div>
      )}
      {clampedFill === undefined && <div className="mt-1 border-b border-border/45" />}
    </div>
  );
}

/**
 * Finds a tile's value in the result row.
 *
 * Aggregating RENAMES the column: `aggregate: [{ column: 'marketValue', fn:
 * 'sum' }]` produces `sum_marketValue`. A tile naturally names the column the
 * user knows — and the tool resolver deliberately maps it to that base colId —
 * so an exact lookup finds nothing and the tile renders an em-dash. Falling
 * back to the aggregated form is what makes the obvious spec the working one.
 *
 * Same `<fn>_<column>` convention `formatValue`'s `AGG_PREFIX` already knows.
 */
function readTile(row: Record<string, unknown> | undefined, tile: KpiTile): { raw: unknown; colId: string } {
  if (!row) return { raw: undefined, colId: tile.column };
  if (tile.column in row) return { raw: row[tile.column], colId: tile.column };

  if (tile.fn) {
    const named = `${tile.fn}_${tile.column}`;
    if (named in row) return { raw: row[named], colId: named };
  }
  // No `fn` given: take whichever aggregate of this column the query produced.
  const suffix = `_${tile.column}`;
  const match = Object.keys(row).find((k) => k.endsWith(suffix));
  return match ? { raw: row[match], colId: match } : { raw: undefined, colId: tile.column };
}

/**
 * The figure a KPI tile shows.
 *
 * A headline number is set at 19-26px in a tile that may be a fraction of a
 * side rail, so an exact `12,547,648.32` does not fit and renders as
 * `12,547,64…` — an ellipsis where the answer should be, which is worse than a
 * rounded number. Anything long enough to clip is compacted to `12.55M`
 * instead, and the exact value is kept on the element's title so it is one
 * hover away rather than gone.
 */
const MAX_STAT_CHARS = 9;

function statValue(colId: string, raw: unknown): string {
  if (raw === undefined || raw === null) return '—';
  const exact = formatValue(colId, raw);
  if (exact.length <= MAX_STAT_CHARS) return exact;
  const compact = formatCompact(raw);
  return compact.length < exact.length ? compact : exact;
}

/**
 * Reads each tile's number off the block's own query result.
 *
 * A KPI is never a number the model typed — it is a number the engine
 * produced. The model chooses which column to surface and what to call it.
 */
function Kpis({ block, result }: { block: KpiBlock; result: QueryResult | null }) {
  const row = result?.rows[0];
  // Tiles fit themselves to the region they are in. A fixed `repeat(4, 1fr)`
  // gave each tile a quarter of whatever width it had — about 45px in the
  // narrow side rails — so the headline number truncated to "6…" and the tile
  // conveyed nothing. `auto-fit` + a min track width wraps instead: four
  // across the main region, one or two down a rail, always wide enough to
  // read the figure it exists to show.
  return (
    <div className="grid gap-x-5 gap-y-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))' }}>
      {block.tiles.map((tile) => {
        const { raw, colId } = readTile(row, tile);
        const numeric = typeof raw === 'number' ? raw : undefined;

        // Bar rendering: read max from the row (either literal or a sibling column)
        let barFill: number | undefined;
        let barColor: 'positive' | 'negative' | 'neutral' | undefined;
        if (tile.bar && numeric !== undefined && row) {
          const maxVal =
            typeof tile.bar.max === 'number'
              ? tile.bar.max
              : typeof tile.bar.max === 'string' && tile.bar.max in row
                ? (row[tile.bar.max] as number | undefined)
                : undefined;
          if (typeof maxVal === 'number' && maxVal > 0) {
            const min = tile.bar.min ?? 0;
            barFill = (numeric - min) / (maxVal - min);
            // Bar colour: use sign-based colouring if signed, otherwise neutral
            barColor = tile.signed ? (numeric < 0 ? 'negative' : 'positive') : 'neutral';
          }
        }

        return (
          <Stat
            key={`${tile.label}-${tile.column}`}
            label={tile.label}
            value={statValue(colId, raw)}
            exact={raw === undefined || raw === null ? undefined : formatValue(colId, raw)}
            tone={tile.signed && numeric !== undefined ? (numeric < 0 ? 'negative' : 'positive') : undefined}
            size="lg"
            barFill={barFill}
            barColor={barColor}
          />
        );
      })}
    </div>
  );
}

/** Narrative. The one block the model authors, so it renders as TEXT — never
 *  as markup, whatever it happens to contain. */
function Commentary({ block }: { block: CommentaryBlock }) {
  return (
    <p className="text-[12px] leading-relaxed text-muted-foreground whitespace-pre-wrap max-w-[68ch]">{block.text}</p>
  );
}

function Lanes({ block, result }: { block: LanesBlock; result: QueryResult | null }) {
  if (!result) return <Empty />;
  return <LaneChart rows={result.rows} axis={block.axis} lanes={block.lanes} />;
}

function Empty({ reason }: { reason?: string } = {}) {
  return <p className="text-[11px] text-muted-foreground py-2">{reason ?? 'No data for this block.'}</p>;
}

function BlockBody({
  block,
  result,
  error,
}: {
  block: ReportBlock;
  result: QueryResult | null;
  error?: string;
}) {
  if (block.kind === 'commentary') return <Commentary block={block} />;
  if (error) return <Empty reason={error} />;

  switch (block.kind) {
    case 'kpis':
      return <Kpis block={block} result={result} />;
    case 'lanes':
      return <Lanes block={block} result={result} />;
    case 'chart': {
      if (!result) return <Empty />;
      const chartSpec = buildChartSpec({
        columns: result.columns,
        rows: result.rows,
        grouped: result.grouped,
        pivot: result.pivot,
        normalize: block.normalize,
        scale: block.scale,
        baseline: block.baseline,
        requested: (block.chart as ChartKind | undefined) ?? 'auto',
      });
      if (!chartSpec) return <Empty reason="Nothing chartable in this result." />;
      return (
        <div className="min-h-[180px]">
          <DataChart spec={chartSpec} style={block.style} />
          <p className="mt-1 text-[10px] text-muted-foreground/85">{chartSpec.caption}</p>
        </div>
      );
    }
    case 'table':
    case 'pivot': {
      if (!result) return <Empty />;
      // A pivot names its columns after the pivot dimension's VALUES
      // ("Financials", "USD"), which say nothing about how the numbers should
      // read — so its cells format by the measure, and its row-label columns
      // stay frozen while the pivoted ones scroll.
      const pivot = result.pivot;
      return (
        // A table BOUNDS itself rather than growing to its row count. A
        // hundred-row result used to push everything below it off the page and
        // stretch its whole region, so the charts beside it went with it. The
        // scroll is inside the block; the dashboard's own height stays the
        // dashboard's.
        <div
          className="overflow-auto rounded-sm border border-border/40"
          style={{ maxHeight: block.maxHeight ?? 320 }}
        >
        <AnalysisTable
          columns={result.columns}
          rows={result.rows}
          heatmap={block.heatmap}
          signed={block.signed}
          stickyLeadingCols={pivot?.rowDims.length}
          valueColId={pivot?.measures[0]}
        />
        </div>
      );
    }
    default:
      return null;
  }
}

/** Blocks in one region, with consecutive same-band blocks sharing a gutter. */
function Region({
  blocks,
  results,
  className,
}: {
  blocks: Array<{ block: ReportBlock; index: number }>;
  results: Map<number, { result: QueryResult | null; error?: string }>;
  className?: string;
}) {
  if (blocks.length === 0) return null;

  // Consecutive blocks naming the same band are grouped so the rotated label
  // spans the run rather than repeating beside each one.
  const runs: Array<{ band?: string; items: typeof blocks }> = [];
  for (const item of blocks) {
    const last = runs[runs.length - 1];
    if (last && last.band === item.block.band) last.items.push(item);
    else runs.push({ band: item.block.band, items: [item] });
  }

  return (
    <div className={cn('flex flex-col gap-7 min-w-0', className)}>
      {runs.map((run, ri) => (
        <div key={ri} className="flex gap-2 min-w-0">
          {run.band && <BandLabel label={run.band} />}
          <div className="flex flex-col gap-7 min-w-0 flex-1">
            {run.items.map(({ block, index }) => (
              <section key={index} className="min-w-0">
                {block.title && <BlockTitle>{block.title}</BlockTitle>}
                <BlockBody
                  block={block}
                  result={results.get(index)?.result ?? null}
                  error={results.get(index)?.error}
                />
              </section>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ReportCanvas({ spec, rows, rowsVersion = 0, provenance, ranAt, liveness }: ReportCanvasProps) {
  // Unspecified means "read it off the spec", which is what every caller did
  // before this prop existed — so a caller that doesn't pass it keeps the old
  // behaviour instead of silently losing its badge.
  const howLive = liveness ?? (spec.refreshMs ? 'polled' : 'static');

  // Every non-commentary block runs its own query against the one row set —
  // up to 16 full-row queries, so this is the expensive part of a report.
  //
  // Keyed on the VERSION, not on `rows`: a live source mutates one array in
  // place, so an identity-keyed memo would never invalidate and the report
  // would freeze at its first render. It also means a re-render that isn't
  // about data — a resize, a theme flip, a context-menu open — costs nothing.
  const results = useMemo(() => {
    const out = new Map<number, { result: QueryResult | null; error?: string }>();
    spec.blocks.forEach((block, index) => {
      if (block.kind === 'commentary') return;
      const outcome = runQuery(rows, block.query);
      out.set(index, outcome.ok ? { result: outcome.value } : { result: null, error: outcome.error });
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rows may be stable by reference; rowsVersion is the change signal
  }, [spec, rowsVersion]);

  const byRegion = useMemo(() => {
    const left: Array<{ block: ReportBlock; index: number }> = [];
    const main: Array<{ block: ReportBlock; index: number }> = [];
    const right: Array<{ block: ReportBlock; index: number }> = [];
    spec.blocks.forEach((block, index) => {
      const bucket = block.region === 'left' ? left : block.region === 'right' ? right : main;
      bucket.push({ block, index });
    });
    return { left, main, right };
  }, [spec]);

  return (
    <div className="w-full min-h-full bg-background text-foreground px-8 py-7">
      <header className="mb-8">
        <h1 className="text-[34px] font-bold uppercase tracking-[-0.01em] leading-[0.95] max-w-[16ch]">
          {spec.title}
        </h1>
        <div className="mt-3 border-t border-border pt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          {spec.period && (
            <span className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{spec.period}</span>
          )}
          {/* A refresh is FRESH data, not the snapshot the transcript quoted.
              Saying which and when is the honest half of a live report. */}
          {provenance && <span className="text-[11px] text-muted-foreground/85">{provenance}</span>}
          {spec.asOf && (
            <span className="text-[11px] text-muted-foreground/85">
              as of {new Date(spec.asOf).toLocaleTimeString()}
            </span>
          )}
          {ranAt && !spec.asOf && (
            <span className="text-[11px] font-mono text-muted-foreground/85">
              ran {ranAt.toLocaleTimeString()}
            </span>
          )}
          {howLive === 'streaming' ? (
            <span className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground/85">
              live · streaming
            </span>
          ) : howLive === 'polled' && spec.refreshMs ? (
            <span className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground/85">
              live · every {Math.round(spec.refreshMs / 1000)}s
            </span>
          ) : null}
        </div>
      </header>

      <div
        className="grid gap-x-10 gap-y-8 items-start"
        style={{
          // The rails only take space when they hold something, so a
          // main-only report is not three columns with two empty. They are
          // also sized by WHAT they hold: a table needs room for its columns,
          // and a 220px rail clipped every one after the first — the cure for
          // which is width, not a smaller font.
          gridTemplateColumns: [
            byRegion.left.length ? railTrack(byRegion.left) : '',
            'minmax(0, 1fr)',
            byRegion.right.length ? railTrack(byRegion.right) : '',
          ]
            .filter(Boolean)
            .join(' '),
        }}
      >
        <Region blocks={byRegion.left} results={results} />
        <Region blocks={byRegion.main} results={results} />
        <Region blocks={byRegion.right} results={results} />
      </div>
    </div>
  );
}
