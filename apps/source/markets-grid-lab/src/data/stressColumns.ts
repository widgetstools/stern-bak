import type { ColDef } from 'ag-grid-community';
import { baseColumns, fmt } from './columns';
import type { LabRow } from './types';

/**
 * A deliberately wide column set, for the one question the other tabs cannot
 * ask: what does this cost when the book is big?
 *
 * The lab's normal tabs run 20-40 columns over 500 rows — comfortable for both
 * engines, and therefore useless as a comparison. Width matters as much as
 * depth here: under the client row model every column of every row is
 * materialized in this window, while under Perspective a window reads the
 * cells its viewport covers, so the gap widens along both axes at once.
 *
 * The extra columns are DERIVED from real fields rather than invented, so they
 * sort, filter and aggregate like the rest of the book instead of being inert
 * padding that the engine could shortcut.
 */

/** Numeric fields the generated positions row always carries. */
const RISK_SOURCES = [
  'krd1Y', 'krd2Y', 'krd5Y', 'krd10Y', 'krd30Y',
  'modifiedDuration', 'effectiveDuration', 'spreadDuration', 'convexity',
  'dv01', 'cs01',
] as const;

const PRICE_SOURCES = [
  'bidPrice', 'midPrice', 'askPrice', 'lastPrice', 'avgCost',
] as const;

const PNL_SOURCES = [
  'unrealizedPnL', 'dailyPnL', 'mtdPnL', 'ytdPnL', 'realizedPnL',
] as const;

function numeric(field: string, headerName: string, formatter: ColDef['valueFormatter']): ColDef<LabRow> {
  return {
    field,
    headerName,
    width: 110,
    type: 'numericColumn',
    valueFormatter: formatter,
    filter: 'agNumberColumnFilter',
    sortable: true,
    resizable: true,
  };
}

/**
 * Widen the base column set to roughly `target` columns by repeating the
 * numeric families across scenario suffixes.
 *
 * Each generated column reads a REAL field — `krd5Y_s3` is the same number as
 * `krd5Y`. That keeps the row generator untouched (it already emits 250+
 * fields) while giving the grid genuinely more work per row to lay out,
 * format, style and scroll.
 */
export function buildStressColumns(target = 120): ColDef<LabRow>[] {
  const columns: ColDef<LabRow>[] = [...baseColumns];
  const families: Array<{ sources: readonly string[]; label: string; formatter: ColDef['valueFormatter'] }> = [
    { sources: RISK_SOURCES, label: 'Risk', formatter: fmt.num4 },
    { sources: PRICE_SOURCES, label: 'Px', formatter: fmt.price },
    { sources: PNL_SOURCES, label: 'P&L', formatter: fmt.signedMoney },
  ];

  let scenario = 1;
  while (columns.length < target) {
    const before = columns.length;
    for (const family of families) {
      for (const source of family.sources) {
        if (columns.length >= target) break;
        columns.push(
          numeric(source, `${family.label} ${source} · s${scenario}`, family.formatter),
        );
      }
    }
    scenario += 1;
    // Nothing was added — every family is empty, and another pass would spin.
    if (columns.length === before) break;
  }

  // AG Grid keys columns by `colId`, defaulting to `field`; repeated fields
  // would collide and only the first would render. The id is what makes a
  // repeat its own column, and it is also what a saved profile stores.
  return columns.map((col, index) =>
    index < baseColumns.length ? col : { ...col, colId: `stress-${index}` },
  );
}

/** Row counts the stress tab offers. The top of the range is the point. */
export const STRESS_ROW_COUNTS = [1_000, 10_000, 50_000, 200_000] as const;

export type StressRowCount = (typeof STRESS_ROW_COUNTS)[number];
