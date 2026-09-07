/**
 * The shared table renderer for both a flat query result and a pivoted one —
 * built on the design system's `Table` primitives (token-driven, matches the
 * rest of the app) rather than a bare `<table>`.
 *
 * Three things a plain table doesn't give you, all needed once results live
 * in a full-width panel instead of a cramped transcript column:
 *   - click-to-sort (the data's already in memory — no re-query);
 *   - `stickyLeadingCols` freezes a pivot's row-label columns while its
 *     (potentially many) pivoted columns scroll underneath;
 *   - `heatmap` shades numeric cells by magnitude instead of drawing a
 *     separate chart — see `@wellsfargo-starui/data`'s `heatmapCellColor` for
 *     the color math.
 *
 * Shared between this module's summary-panel heatmap widgets and the AI
 * Assistant's own analysis panel (`apps/source/star-demo/src/aiAssistant/chat/`,
 * which imports this from `@wellsfargo-starui/grid`).
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { cn, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@wellsfargo-starui/react';
import { heatmapDomain, heatmapCellColor, formatValue, formatCompact, type HeatmapDomain } from '@wellsfargo-starui/data';
import { useActiveThemeMode } from '../../hooks/useActiveThemeMode';

/**
 * Blank/null/undefined → an em dash. A number is formatted with ITS OWN
 * column's format when `colId` is supplied — so a price keeps its 4 decimals,
 * a DV01 gets its thousands separator and a P&L reads the way it does on the
 * blotter. Without a colId there is nothing to key a format off, so it falls
 * back to compact magnitude (12.3K, 4.5M). Shared with `DataResultCell`'s
 * stat cards and category bars.
 */
export function compact(value: unknown, colId?: string): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number') return colId ? formatValue(colId, value) : formatCompact(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

function compareValues(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const [sa, sb] = [String(a ?? ''), String(b ?? '')];
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

/** All present values in a column are numbers — decides right-align and
 *  whether the column is a heatmap-shading candidate. A column with no
 *  values at all (every row blank) is not numeric — nothing to align right. */
function isNumericColumn(rows: ReadonlyArray<Record<string, unknown>>, col: string): boolean {
  const present = rows.map((r) => r[col]).filter((v) => v !== null && v !== undefined && v !== '');
  return present.length > 0 && present.every((v) => typeof v === 'number');
}

const STICKY_COL_WIDTH = 132;

/**
 * Below this many rows everything is rendered and nothing is windowed.
 *
 * Virtualisation costs a scroll listener, a measurement and two spacer rows,
 * and buys nothing on the short results this table mostly shows — the query
 * engine's default limit is 50. It earns its keep on the long ones.
 */
const VIRTUALIZE_ABOVE = 80;
/** Rows kept rendered beyond the viewport, so a flick does not show blank. */
const OVERSCAN = 8;
/** Used until a real row has been measured. */
const ASSUMED_ROW_HEIGHT = 24;

/**
 * Which rows are worth rendering.
 *
 * A 500-row result — the engine's hard cap — is 4,000 cells, and React
 * re-renders every one of them on each live tick, not just on a scroll.
 * Measured at 6x CPU throttle, one full re-render of 500x8 took 841ms. A
 * ~400px viewport shows about 17 of those rows.
 *
 * The window is expressed as two spacer rows rather than absolute
 * positioning, so the table stays a real `<table>`: the sticky header, the
 * frozen columns, text selection and find-in-page all keep working, which is
 * what a canvas grid would have cost.
 */
function useRowWindow(
  scrollRef: React.RefObject<HTMLDivElement | null>,
  rowCount: number,
  rowHeight: number,
): { from: number; to: number; topPad: number; bottomPad: number } {
  const [range, setRange] = useState({ from: 0, to: rowCount });

  useEffect(() => {
    const box = scrollRef.current;
    if (!box || rowCount <= VIRTUALIZE_ABOVE) {
      setRange({ from: 0, to: rowCount });
      return;
    }
    const measure = () => {
      const first = Math.floor(box.scrollTop / rowHeight);
      const visible = Math.ceil(box.clientHeight / rowHeight);
      setRange({
        from: Math.max(0, first - OVERSCAN),
        to: Math.min(rowCount, first + visible + OVERSCAN),
      });
    };
    measure();
    box.addEventListener('scroll', measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => {
      box.removeEventListener('scroll', measure);
      observer.disconnect();
    };
  }, [scrollRef, rowCount, rowHeight]);

  const clamped = { from: Math.max(0, range.from), to: Math.min(rowCount, range.to) };
  return {
    ...clamped,
    topPad: clamped.from * rowHeight,
    bottomPad: Math.max(0, (rowCount - clamped.to) * rowHeight),
  };
}

export interface AnalysisTableProps {
  columns: string[];
  rows: Array<Record<string, unknown>>;
  /** Freezes this many leading columns in place — a pivot's row-label
   *  columns, so they stay visible while the (possibly many) pivoted
   *  columns scroll underneath. */
  stickyLeadingCols?: number;
  /** Shades numeric cells by magnitude instead of plain text — see
   *  `@wellsfargo-starui/data`'s heatmap helpers. */
  heatmap?: boolean;
  /**
   * Colour numeric cells by sign: positive in green, negative in red.
   * Ignored if `heatmap` is true (magnitude shading takes precedence).
   */
  signed?: boolean;
  /**
   * The measure a PIVOT's cells hold. A pivot names its columns after the
   * pivot dimension's values ("Financials", "USD"), which say nothing about
   * how the numbers should read — so cells are formatted by this instead.
   * Ignored for a non-pivot table, where each column formats as itself.
   */
  valueColId?: string;
  /**
   * Classes for the table's own scroll box — `h-full` to fill a sized panel,
   * `max-h-[320px]` to cap it.
   *
   * This matters more than it looks. `position: sticky` binds to the NEAREST
   * scrolling ancestor, and this component's wrapper is always one. A caller
   * that wrapped it in its own `overflow-auto` box therefore got two nested
   * scroll containers: the outer one did the scrolling, the inner one bound
   * the sticky header, and so the header did not stick. Sizing THIS element
   * keeps scrolling and sticking on the same box, which is the only
   * arrangement in which either works.
   */
  className?: string;
  /** Inline styles for the same scroll box — for a caller-computed cap that
   *  cannot be expressed as a static utility class. */
  style?: React.CSSProperties;
}

export function AnalysisTable({
  columns,
  rows,
  stickyLeadingCols = 0,
  heatmap = false,
  signed = false,
  valueColId,
  className,
  style,
}: AnalysisTableProps) {
  const [sort, setSort] = useState<{ column: string; direction: 'asc' | 'desc' } | null>(null);
  const theme = useActiveThemeMode();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const rowRef = useRef<HTMLTableRowElement | null>(null);
  // Measured rather than assumed: row height follows the theme's font and
  // padding, and a window built on a wrong height drifts as you scroll.
  const [rowHeight, setRowHeight] = useState(ASSUMED_ROW_HEIGHT);
  useLayoutEffect(() => {
    const h = rowRef.current?.getBoundingClientRect().height;
    if (h && Math.abs(h - rowHeight) > 0.5) setRowHeight(h);
  }, [rowHeight, rows.length]);

  const numericCols = useMemo(
    () => new Set(columns.filter((c) => isNumericColumn(rows, c))),
    [columns, rows],
  );

  // Domain computed once per column, not per cell — a heatmap shades EVERY
  // cell in a column against the same min/max, and this table can have up to
  // 500 rows.
  const domains = useMemo(() => {
    if (!heatmap) return new Map<string, HeatmapDomain>();
    const out = new Map<string, HeatmapDomain>();
    for (const col of columns) {
      if (!numericCols.has(col)) continue;
      const domain = heatmapDomain(rows.map((r) => r[col]));
      if (domain) out.set(col, domain);
    }
    return out;
  }, [heatmap, columns, rows, numericCols]);

  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const dir = sort.direction === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => compareValues(a[sort.column], b[sort.column]) * dir);
  }, [rows, sort]);

  const { from, to, topPad, bottomPad } = useRowWindow(scrollRef, sortedRows.length, rowHeight);
  const visibleRows = useMemo(() => sortedRows.slice(from, to), [sortedRows, from, to]);

  const toggleSort = (col: string) => {
    setSort((prev) => {
      if (prev?.column !== col) return { column: col, direction: 'desc' };
      // Third click on the same column clears the sort — "top N" is the
      // common case (default descending), but a user comparing values wants
      // a way back to the result's own natural order.
      if (prev.direction === 'desc') return { column: col, direction: 'asc' };
      return null;
    });
  };

  if (rows.length === 0) return <div className="px-2.5 py-3 text-[11px] text-muted-foreground">No rows matched.</div>;

  /** Sticky positioning for a leading (frozen) column, and/or the header row —
   *  both bind to the same scrolling ancestor (the wrapper below), so a corner
   *  cell that is both just gets both styles at once. */
  const stickyStyle = (colIndex: number, isHeader: boolean): React.CSSProperties | undefined => {
    const frozen = colIndex < stickyLeadingCols;
    if (!frozen && !isHeader) return undefined;
    return {
      position: 'sticky',
      ...(isHeader ? { top: 0 } : null),
      ...(frozen ? { left: colIndex * STICKY_COL_WIDTH, minWidth: STICKY_COL_WIDTH, maxWidth: STICKY_COL_WIDTH } : null),
    };
  };

  return (
    // Unconstrained by default: with no height from `className`, this grows
    // to its rows and the sticky header simply has nothing to stick to — the
    // natural fallback for the small inline sample-rows table. A caller that
    // wants scrolling sizes THIS element rather than wrapping it, so that the
    // scroll box and the sticky header's ancestor are the same box.
    <div ref={scrollRef} className={cn('relative w-full overflow-auto', className)} style={style}>
      <table className="w-full caption-bottom text-[11px] border-collapse">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {columns.map((col, i) => {
              const active = sort?.column === col;
              return (
                <TableHead
                  key={col}
                  onClick={() => toggleSort(col)}
                  style={stickyStyle(i, true)}
                  className={cn(
                    'h-auto py-1.5 px-2 font-mono text-[10px] font-normal whitespace-nowrap cursor-pointer select-none hover:text-foreground z-20 bg-background',
                    numericCols.has(col) && 'text-right',
                    i < stickyLeadingCols && 'border-r border-border/60',
                  )}
                >
                  <span className="inline-flex items-center gap-1">
                    {col}
                    {active && (sort.direction === 'desc' ? <ArrowDown className="h-2.5 w-2.5" /> : <ArrowUp className="h-2.5 w-2.5" />)}
                  </span>
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {/* Spacers stand in for the rows outside the window, so the scroll
              bar and every row's position stay exactly where they would be if
              all of them were rendered. */}
          {topPad > 0 && <tr style={{ height: topPad }} aria-hidden />}
          {visibleRows.map((row, vi) => (
            <TableRow key={from + vi} ref={vi === 0 ? rowRef : undefined}>
              {columns.map((col, ci) => {
                const value = row[col];
                const shade = heatmap ? heatmapCellColor(value, domains.get(col), theme) : undefined;
                // Sign-coloring: positive in green, negative in red (only when heatmap is off)
                const signColor = signed && !heatmap && typeof value === 'number'
                  ? value > 0 ? 'text-[var(--ds-accent-positive)]' : value < 0 ? 'text-[var(--ds-accent-negative)]' : undefined
                  : undefined;
                return (
                  <TableCell
                    key={col}
                    style={{ ...stickyStyle(ci, false), ...(shade ? { backgroundColor: shade } : null) }}
                    className={cn(
                      'py-1 px-2 whitespace-nowrap',
                      numericCols.has(col) ? 'text-right font-mono tabular-nums' : 'text-foreground/90',
                      ci < stickyLeadingCols && 'bg-background border-r border-border/60 font-medium',
                      signColor,
                    )}
                  >
                    {compact(value, valueColId && ci >= stickyLeadingCols ? valueColId : col)}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
          {bottomPad > 0 && <tr style={{ height: bottomPad }} aria-hidden />}
        </TableBody>
      </table>
    </div>
  );
}
