/**
 * The two data tools: `summarize_grid_data` (the describe()) and
 * `query_grid_data` (the cell you run).
 *
 * Both return a `DataCellPayload`, which the transcript renders as a notebook
 * output cell — table, chart, sample rows — rather than the raw JSON every
 * other tool result gets. The model still receives the same payload as text, so
 * it can narrate what the user is looking at.
 */
import type { ConfigManager } from '@wellsfargo-starui/core/host/config';
import {
  type DataProviderConfigStore,
  summariseRows,
  type DataDigest,
  runQuery,
  type DataQuery,
  type QueryResult,
  CHART_KINDS,
  SUMMARY_CHART_KINDS,
  type ChartKind,
} from '@wellsfargo-starui/data';
import { resolveGridEntry } from './gridProfiles';
import { readColumnCatalogue, resolveColumns, resolveColumn } from './columnResolver';
import { fetchGridRows, type DataHubClient, type RowSource } from './dataAccess';
import type { ToolExecutionResult } from './toolResult';

/** Marker the transcript keys on to render a rich cell instead of raw JSON. */
export const DATA_CELL = 'data-cell' as const;

export interface DataCellPayload {
  kind: typeof DATA_CELL;
  gridName: string;
  source: RowSource;
  provenance: string;
  rowCount: number;
  digest?: DataDigest;
  table?: QueryResult;
  /** What the model asked for, echoed for the cell header. */
  ran: string;
  /**
   * Chart override. Omitted (or 'auto') lets the result's own shape decide —
   * see `chartSpec.ts`. Set only when the user asked for a particular chart.
   */
  chart?: ChartKind;
  /**
   * The resolved query that produced `table`, kept so anything downstream can
   * RE-RUN it rather than only redisplay the snapshot: the Analysis window
   * re-queries instead of marshalling rows across a window boundary, and a
   * summary-panel widget speaks this identical shape, which is what makes
   * pin-to-blotter a possibility later.
   *
   * Column names here are already resolved to real colIds. It survives
   * `trimOldAnalysisPayloads` (which empties `table.rows` but spreads the rest
   * of the payload), so an old result stays re-runnable after its rows are
   * dropped — the point of keeping the query rather than the data.
   */
  query?: DataQuery;
}

interface DataToolDeps {
  configManager: ConfigManager;
  configStore: DataProviderConfigStore;
  client?: DataHubClient;
}

async function rowsFor(deps: DataToolDeps, args: Record<string, unknown>) {
  const targetGridId = args.targetGridId as string | undefined;
  if (!targetGridId) return { ok: false as const, error: 'Missing required field: targetGridId.' };
  const entry = await resolveGridEntry(targetGridId);
  if (!entry) {
    return { ok: false as const, error: `No grid registered with id "${targetGridId}". Call list_grids to see valid ids.` };
  }
  const fetched = await fetchGridRows(deps.configManager, deps.configStore, entry, deps.client, {
    allowSample: args.allowSample === true,
  });
  if (!fetched.ok) return { ok: false as const, error: fetched.error };
  return { ok: true as const, entry, rowSet: fetched.value };
}

/**
 * `undefined` when the caller said nothing — the usual case, letting the
 * result's shape choose. `null` signals a bad value, so a typo becomes an
 * explanation rather than a silently ignored argument. `allowed` is the
 * calling tool's OWN menu — `summarize_grid_data` passes
 * `SUMMARY_CHART_KINDS` so a stray `'heatmap'` (nothing there to shade) is
 * caught here rather than silently accepted and doing nothing.
 */
function readChartKind(args: Record<string, unknown>, allowed: readonly ChartKind[]): ChartKind | undefined | null {
  const raw = args.chart;
  if (raw === undefined) return undefined;
  return (allowed as readonly unknown[]).includes(raw) ? (raw as ChartKind) : null;
}

/** Column arguments come in the user's words, same as every other column tool. */
async function resolveNames(
  deps: DataToolDeps,
  entry: Parameters<typeof readColumnCatalogue>[2],
  names: string[] | undefined,
): Promise<{ ok: true; value: string[] | undefined } | { ok: false; error: string }> {
  if (!names?.length) return { ok: true, value: undefined };
  const catalogue = await readColumnCatalogue(deps.configManager, deps.configStore, entry);
  const resolved = resolveColumns(names, catalogue);
  return resolved.ok ? { ok: true, value: resolved.colIds } : { ok: false, error: resolved.error };
}

export async function summarizeGridData(
  deps: DataToolDeps,
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const got = await rowsFor(deps, args);
  if (!got.ok) return { ok: false, summary: got.error };
  const { entry, rowSet } = got;

  const columns = await resolveNames(deps, entry, args.columns as string[] | undefined);
  if (!columns.ok) return { ok: false, summary: columns.error };

  let groupBy: string | undefined;
  if (typeof args.groupBy === 'string' && args.groupBy) {
    const catalogue = await readColumnCatalogue(deps.configManager, deps.configStore, entry);
    const match = resolveColumn(args.groupBy, catalogue);
    if (!match.ok) return { ok: false, summary: match.error };
    groupBy = match.colId;
  }

  const chart = readChartKind(args, SUMMARY_CHART_KINDS);

  if (chart === null) return { ok: false, summary: `chart must be one of: ${SUMMARY_CHART_KINDS.join(", ")}.` };

  const digest = summariseRows(rowSet.rows, { columns: columns.value, groupBy });
  const payload: DataCellPayload = {
    kind: DATA_CELL,
    gridName: entry.displayName,
    source: rowSet.source,
    provenance: rowSet.provenance,
    rowCount: digest.rowCount,
    digest,
    chart,
    ran: groupBy ? `summary of ${digest.rowCount} rows, grouped by ${groupBy}` : `summary of ${digest.rowCount} rows`,
  };

  return {
    ok: true,
    summary:
      `${digest.rowCount} rows from "${entry.displayName}" (${rowSet.provenance}). ` +
      (digest.highlights[0] ?? 'No notable concentrations.'),
    data: payload,
  };
}

export async function queryGridData(
  deps: DataToolDeps,
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const got = await rowsFor(deps, args);
  if (!got.ok) return { ok: false, summary: got.error };
  const { entry, rowSet } = got;

  const catalogue = await readColumnCatalogue(deps.configManager, deps.configStore, entry);
  const query: DataQuery = {
    filter: (args.filter as DataQuery['filter']) ?? undefined,
    aggregate: (args.aggregate as DataQuery['aggregate']) ?? undefined,
    sortBy: (args.sortBy as DataQuery['sortBy']) ?? undefined,
    limit: typeof args.limit === 'number' ? args.limit : undefined,
  };

  // Every column the query names — projection, grouping, filters, aggregates,
  // sort — is resolved from the user's wording before anything runs.
  const projection = await resolveNames(deps, entry, args.columns as string[] | undefined);
  if (!projection.ok) return { ok: false, summary: projection.error };
  query.columns = projection.value;

  const grouping = await resolveNames(deps, entry, args.groupBy as string[] | undefined);
  if (!grouping.ok) return { ok: false, summary: grouping.error };
  query.groupBy = grouping.value;

  const pivoting = await resolveNames(deps, entry, args.pivotBy as string[] | undefined);
  if (!pivoting.ok) return { ok: false, summary: pivoting.error };
  query.pivotBy = pivoting.value;

  for (const clause of query.filter ?? []) {
    const match = resolveColumn(clause.column, catalogue);
    if (!match.ok) return { ok: false, summary: match.error };
    clause.column = match.colId;
  }
  for (const agg of query.aggregate ?? []) {
    const match = resolveColumn(agg.column, catalogue);
    if (!match.ok) return { ok: false, summary: match.error };
    agg.column = match.colId;
  }
  if (query.sortBy?.column) {
    const match = resolveColumn(query.sortBy.column, catalogue);
    if (!match.ok) return { ok: false, summary: match.error };
    query.sortBy = { ...query.sortBy, column: match.colId };
  }

  const chart = readChartKind(args, CHART_KINDS);

  if (chart === null) return { ok: false, summary: `chart must be one of: ${CHART_KINDS.join(", ")}.` };

  const outcome = runQuery(rowSet.rows, query);
  if (!outcome.ok) return { ok: false, summary: outcome.error };
  const table = outcome.value;

  const ran = [
    query.pivotBy?.length
      ? `pivoted: rows by ${query.groupBy?.join(', ')}, columns by ${query.pivotBy.join(', ')}`
      : query.groupBy?.length ? `grouped by ${query.groupBy.join(', ')}` : `${table.matched} rows`,
    query.filter?.length ? `filtered (${query.filter.length})` : '',
    query.sortBy?.column ? `sorted by ${query.sortBy.column}` : '',
  ].filter(Boolean).join(' · ');

  const payload: DataCellPayload = {
    kind: DATA_CELL,
    gridName: entry.displayName,
    source: rowSet.source,
    provenance: rowSet.provenance,
    rowCount: table.matched,
    table,
    ran,
    chart,
    query,
  };

  return {
    ok: true,
    summary:
      `${table.matched} result row(s) from ${table.scanned} scanned on "${entry.displayName}"` +
      `${table.truncated ? `, showing the first ${table.rows.length}` : ''} (${rowSet.provenance}).`,
    data: payload,
  };
}
