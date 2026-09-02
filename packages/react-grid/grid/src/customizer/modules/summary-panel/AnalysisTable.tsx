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
import { useMemo, useState } from 'react';
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
}

export function AnalysisTable({
  columns,
  rows,
  stickyLeadingCols = 0,
  heatmap = false,
  signed = false,
  valueColId,
}: AnalysisTableProps) {
  const [sort, setSort] = useState<{ column: string; direction: 'asc' | 'desc' } | null>(null);
  const theme = useActiveThemeMode();

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
    // No fixed height here on purpose: a bounding ancestor with its own
    // `overflow`/height (the analysis panel, for the main result; nothing,
    // for the small inline sample-rows table) decides whether this actually
    // scrolls. Sticky header/columns just have no visible effect when it
    // doesn't — not a bug, the natural fallback for an unconstrained table.
    <div className="relative w-full overflow-auto">
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
          {sortedRows.map((row, ri) => (
            <TableRow key={ri}>
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
        </TableBody>
      </table>
    </div>
  );
}
