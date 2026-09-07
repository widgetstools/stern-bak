/**
 * Renders a `ReportSpec` as one composition rather than a column of cards.
 *
 * The arrangement follows the editorial reference this was modelled on:
 * standing context down the left, the thing that moves across the middle,
 * aggregate totals down the right. What that buys over a wall of widgets is
 * that the reader takes in the shape of the whole before reading a single
 * number.
 *
 * The composition is now held by `@widgetstools/react-dock-manager` — the same
 * dock that runs the blotter's summary panel, so a dashboard is dragged,
 * split and resized by exactly the gestures the blotter already taught. One
 * difference, and it is deliberate: panels here never STACK into tabs
 * (`preventsStacking`). Summary widgets are alternatives, so tabbing them is
 * right; dashboard blocks are read together, and one hidden behind a tab is
 * one nobody reads. The regions above are the opening arrangement only — see
 * `dockLayout` — and a saved layout wins over them for good.
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
import { createContext, useContext, useMemo, useState } from 'react';
import { Save, Undo2 } from 'lucide-react';
import { DockManagerCore, type WidgetProps } from '@widgetstools/react-dock-manager';
import '@widgetstools/react-dock-manager/styles.css';
import { cn } from '@wellsfargo-starui/react';
import {
  buildChartSpec,
  formatValue,
  formatCompact,
  runQuery,
  whyNotChartable,
  type ChartKind,
  type CommentaryBlock,
  type KpiBlock,
  type KpiTile,
  type LanesBlock,
  type QueryResult,
  type ReportBlock,
  type ReportSpec,
} from '@wellsfargo-starui/data';
import { AnalysisTable, DataChart, LaneChart, useActiveThemeMode } from '@wellsfargo-starui/grid/customizer';
import { useLayoutEditing } from './useLayoutEditing';
import { BLOCK_WIDGET_TYPE, preventsStacking } from './dockLayout';

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
  /**
   * Supplying this makes the dashboard EDITABLE: panels can be dragged and
   * split apart, and the header gains save/undo once something moves. It
   * receives the dock's own serialized layout, which is opaque here on purpose
   * — the dock manager owns that schema.
   */
  onSaveLayout?: (dock: string) => void | Promise<void>;
  /**
   * Why the layout cannot be saved, when it cannot. Set for an ephemeral
   * report: blocks still move and resize — rearranging is useful whether or
   * not it can be kept — but the save control explains itself instead of
   * silently doing nothing.
   */
  saveDisabledReason?: string;
}

/**
 * The band a block belongs to.
 *
 * This used to be a rotated label in the gutter, spanning a run of consecutive
 * blocks that named the same band. A run is a property of a single ordered
 * column, and once panels can be dragged anywhere there is no run to span: two
 * blocks in the same band can sit at opposite corners. So the band travels
 * WITH its block, as a small eyebrow at the top of the panel — it still
 * answers "what is this part of" without depending on an ordering that no
 * longer exists, and it is the one label the dock's tab does not already show.
 */
function BandLabel({ label }: { label: string }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70 select-none truncate">
      {label}
    </div>
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
      if (!chartSpec) {
        // Name the missing ingredient. "Nothing chartable" told the reader
        // nothing and the model less, so a block that could never draw looked
        // the same as one waiting for data.
        return (
          <Empty
            reason={
              whyNotChartable({
                columns: result.columns,
                rows: result.rows,
                grouped: result.grouped,
                pivot: result.pivot,
                requested: (block.chart as ChartKind | undefined) ?? 'auto',
              }) ?? 'Nothing chartable in this result.'
            }
          />
        );
      }
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

/**
 * What each dock panel renders.
 *
 * The dock creates panels from a serialized layout, so a panel knows only its
 * own index — it cannot be handed props. This context is how it reaches the
 * blocks and their results, and it is the same shape the blotter's summary
 * panel uses for the same reason.
 */
interface BlockPanelData {
  blocks: readonly ReportBlock[];
  results: Map<number, { result: QueryResult | null; error?: string }>;
}
const BlockPanelContext = createContext<BlockPanelData>({ blocks: [], results: new Map() });

/**
 * One block, filling the panel the dock sized for it.
 *
 * A dock panel has a height the layout chose, so the card is a column: the
 * heading takes what it needs and the body takes the rest and scrolls inside
 * itself. That is what stops a forty-row table from deciding how tall its
 * neighbours are — the constraint the old flow layout could never enforce.
 *
 * Dragging is the dock's own title bar. There is no grip of ours here: two
 * drag affordances on one card, doing the same thing by different rules, is
 * worse than one that is part of the panel chrome people already know from
 * the blotter.
 */
function BlockPanel({ panel }: WidgetProps) {
  const { blocks, results } = useContext(BlockPanelContext);
  const index = Number((panel.widgetProps as { index?: number } | undefined)?.index ?? Number.NaN);
  const block = Number.isInteger(index) ? blocks[index] : undefined;

  if (!block) {
    // A layout saved against a different set of blocks. Say so rather than
    // rendering an empty panel that looks like a bug in the data.
    return (
      <p className="p-3 text-[11px] text-muted-foreground">
        This panel’s block is no longer part of the report.
      </p>
    );
  }

  const outcome = results.get(index);
  return (
    // The block's TITLE is the dock panel's own tab label — see `panelConfig`
    // — so repeating it here would print every heading twice. The band is not
    // in the tab, and is what answers "what is this part of", so it stays.
    <div className="flex h-full min-h-0 flex-col bg-background px-3 pb-2 pt-1.5">
      {block.band && <BandLabel label={block.band} />}
      <div className={cn('min-h-0 flex-1 overflow-auto', block.band && 'mt-1.5')}>
        <BlockBody block={block} result={outcome?.result ?? null} error={outcome?.error} />
      </div>
    </div>
  );
}

const BLOCK_WIDGETS = { [BLOCK_WIDGET_TYPE]: BlockPanel };

export function ReportCanvas({
  spec,
  rows,
  rowsVersion = 0,
  provenance,
  ranAt,
  liveness,
  onSaveLayout,
  saveDisabledReason,
}: ReportCanvasProps) {
  // Rearranging is useful even when it cannot be kept — seeing the layout you
  // want is most of the value, and a report with no handles at all reads as a
  // missing feature rather than a deliberate limit.
  const editable = Boolean(onSaveLayout) || Boolean(saveDisabledReason);
  // The draft lives here so the canvas stays a function of the blocks it is
  // handed; `useLayoutEditing` owns the rules and the dirty comparison.
  const layout = useLayoutEditing(spec, editable);
  const [saving, setSaving] = useState(false);
  // The dock paints its own chrome, so it has to follow `<html data-theme>`
  // the way every other surface in the app does.
  const themeMode = useActiveThemeMode();

  const handleSave = async () => {
    if (!onSaveLayout || !layout.pending) return;
    setSaving(true);
    try {
      await onSaveLayout(layout.pending);
      layout.commit();
    } finally {
      setSaving(false);
    }
  };
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
  //
  // Rearranging never touches the blocks — the arrangement lives entirely in
  // the dock's own layout — so a drag cannot invalidate this at all.
  const specBlocks = spec.blocks;

  const results = useMemo(() => {
    const out = new Map<number, { result: QueryResult | null; error?: string }>();
    specBlocks.forEach((block, index) => {
      if (block.kind === 'commentary') return;
      const outcome = runQuery(rows, block.query);
      out.set(index, outcome.ok ? { result: outcome.value } : { result: null, error: outcome.error });
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rows may be stable by reference; rowsVersion is the change signal
  }, [specBlocks, rowsVersion]);

  const panelData = useMemo<BlockPanelData>(() => ({ blocks: specBlocks, results }), [specBlocks, results]);

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-background text-foreground px-8 py-7">
      <header className="mb-6 flex-shrink-0">
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
          {/*
            Nothing until something moves. A dashboard is read far more often
            than it is rearranged, so the controls appear only once there is a
            change to keep or discard — and they sit in the meta line rather
            than as a toolbar, which would be present all the time to say
            nothing most of the time.
          */}
          {layout.dirty && (
            <span className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={layout.reset}
                title="Discard layout changes"
                aria-label="Discard layout changes"
                className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] text-muted-foreground/85 hover:bg-muted/50 hover:text-foreground"
              >
                <Undo2 className="h-3 w-3" aria-hidden />
                Undo
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !onSaveLayout}
                title={saveDisabledReason ?? 'Save this layout'}
                aria-label={saveDisabledReason ?? 'Save this layout'}
                className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] text-[var(--ds-primary)] hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Save className="h-3 w-3" aria-hidden />
                {saving ? 'Saving…' : 'Save layout'}
              </button>
            </span>
          )}
        </div>
      </header>

      {/* The dock positions its panels absolutely, so it needs a definite
          height to divide up — not a block that grows to its content. */}
      <div className="min-h-0 flex-1">
        <BlockPanelContext.Provider value={panelData}>
          <DockManagerCore
            // A dock manager cannot be driven back to a previous layout by
            // props — the arrangement lives inside it. Remounting on a new key
            // is what makes undo possible.
            key={layout.mountKey}
            initialState={layout.initialState}
            widgets={BLOCK_WIDGETS}
            theme={themeMode}
            onStateChange={layout.applyState}
            // Panels split; they never stack. A chart hidden behind a tab is a
            // chart nobody reads — see `preventsStacking`.
            onWillDrop={(event, _source, _target, position) => preventsStacking(event, position)}
            // Dropping a panel onto the window edge is another way to stack
            // the whole dashboard into one column, and it is not needed when
            // every panel already has a home.
            allowRootDock={false}
            className="h-full"
          />
        </BlockPanelContext.Provider>
      </div>
    </div>
  );
}
