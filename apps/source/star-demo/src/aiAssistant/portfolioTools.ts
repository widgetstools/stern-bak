/**
 * One question across every blotter at once.
 *
 * Every other data tool takes a single `targetGridId`, which is right for a
 * trader looking at one book and wrong for the person who owns several. "What's
 * my total exposure?", "which desk is carrying the risk?", "where is my biggest
 * position across all of these?" could not be asked at all — the model's only
 * option was to query each blotter in turn and add the numbers up in prose,
 * which is exactly the arithmetic this codebase deliberately keeps out of the
 * model (see "The arithmetic is done in code").
 *
 * `runQuery` is pure and total, so the composition is the easy part: fetch each
 * blotter's rows, tag each row with the blotter it came from, union, and run one
 * query over the result. The care is all in being honest about the union —
 * blotters have different columns and different providers, and quietly treating
 * a missing column as zero would produce a confident wrong total.
 */
import type { ConfigManager } from '@wellsfargo-starui/core/host/config';
import type { DataProviderConfigStore } from '@wellsfargo-starui/data';
import { runQuery, type DataQuery, type QueryResult } from '@wellsfargo-starui/data';
import { loadRegistryConfig, type RegistryEntry } from '@wellsfargo-starui/openfin/config';
import { BLOTTER_COMPONENT_TYPE } from './gridProfiles';
import { readColumnCatalogue, resolveColumn, type CatalogColumn } from './columnResolver';
import { fetchGridRows, type DataHubClient } from './dataAccess';
import { DATA_CELL, type DataCellPayload } from './dataTools';
import type { ToolExecutionResult } from './toolResult';

/**
 * The column each row's origin lands in. Named without a leading underscore
 * because it is a real column as far as the query engine is concerned — it can
 * be grouped by, filtered on and sorted, which is the entire point ("break my
 * exposure down BY blotter").
 */
export const SOURCE_COLUMN = 'blotter';

interface Contribution {
  displayName: string;
  configId: string;
  rows: number;
}
interface Skip {
  displayName: string;
  reason: string;
}

export interface PortfolioDeps {
  configManager: ConfigManager;
  configStore: DataProviderConfigStore;
  client?: DataHubClient;
}

/**
 * Resolve a user-facing column name against the UNION of every contributing
 * blotter's catalogue.
 *
 * A name is accepted when it resolves the same way everywhere it is known. When
 * two blotters disagree — "Market Value" is `marketValue` on one and `mv` on
 * another — that is reported rather than resolved to whichever came first,
 * because summing two different columns into one total is a wrong answer that
 * looks right.
 */
function resolveAcross(
  input: string,
  catalogues: Array<{ name: string; catalogue: CatalogColumn[] }>,
): { ok: true; colId: string } | { ok: false; error: string } {
  if (input === SOURCE_COLUMN) return { ok: true, colId: SOURCE_COLUMN };
  const hits = new Map<string, string[]>();
  for (const { name, catalogue } of catalogues) {
    const match = resolveColumn(input, catalogue);
    // An empty catalogue passes anything through; that is not evidence.
    if (match.ok && catalogue.length > 0) {
      const list = hits.get(match.colId) ?? [];
      list.push(name);
      hits.set(match.colId, list);
    }
  }
  if (hits.size === 0) {
    return { ok: false, error: `No column matching "${input}" on any of these blotters.` };
  }
  if (hits.size > 1) {
    const detail = [...hits.entries()].map(([colId, names]) => `${colId} (${names.join(', ')})`).join('; ');
    return {
      ok: false,
      error:
        `"${input}" means different columns on different blotters: ${detail}. ` +
        'Totalling those together would be wrong — pass the exact colId you mean.',
    };
  }
  return { ok: true, colId: [...hits.keys()][0] };
}

/** Every column name a query mentions, so each can be checked once. */
function queryColumnNames(query: DataQuery): string[] {
  return [
    ...(query.columns ?? []),
    ...(query.groupBy ?? []),
    ...(query.pivotBy ?? []),
    ...(query.filter ?? []).map((f) => f.column),
    ...(query.aggregate ?? []).map((a) => a.column),
    ...(query.sortBy?.column ? [query.sortBy.column] : []),
  ].filter((c): c is string => typeof c === 'string');
}

/** Rewrites every column name in a query through `map`. */
function rewriteQuery(query: DataQuery, map: Map<string, string>): DataQuery {
  const at = (c: string) => map.get(c) ?? c;
  return {
    ...query,
    columns: query.columns?.map(at),
    groupBy: query.groupBy?.map(at),
    pivotBy: query.pivotBy?.map(at),
    filter: query.filter?.map((f) => ({ ...f, column: at(f.column) })),
    aggregate: query.aggregate?.map((a) => ({ ...a, column: at(a.column), as: a.as ?? `${a.fn}_${a.column}` })),
    sortBy: query.sortBy ? { ...query.sortBy, column: at(query.sortBy.column) } : undefined,
  };
}

export async function queryAcrossBlotters(
  deps: PortfolioDeps,
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const a = args as { gridIds?: string[]; allowSample?: boolean };
  // Same flat argument shape as `query_grid_data`, so the model writes one kind
  // of query and only changes which tool it calls.
  const query: DataQuery = {
    columns: (args.columns as string[]) ?? undefined,
    groupBy: (args.groupBy as string[]) ?? undefined,
    pivotBy: (args.pivotBy as string[]) ?? undefined,
    filter: (args.filter as DataQuery['filter']) ?? undefined,
    aggregate: (args.aggregate as DataQuery['aggregate']) ?? undefined,
    sortBy: (args.sortBy as DataQuery['sortBy']) ?? undefined,
    limit: typeof args.limit === 'number' ? args.limit : undefined,
  };

  const registry = await loadRegistryConfig();
  const all = (registry?.entries ?? []).filter((e) => e.componentType === BLOTTER_COMPONENT_TYPE);
  let entries: RegistryEntry[] = all;
  if (a.gridIds?.length) {
    const missing: string[] = [];
    entries = [];
    for (const id of a.gridIds) {
      const hit = all.find((e) => e.configId === id) ?? all.find((e) => e.id === id);
      if (hit) entries.push(hit);
      else missing.push(id);
    }
    if (missing.length) {
      return { ok: false, summary: `No grid registered with id ${missing.map((m) => `"${m}"`).join(', ')}. Call list_grids to see valid ids.` };
    }
  }
  if (entries.length === 0) {
    return { ok: false, summary: 'No blotters are registered, so there is nothing to query across.' };
  }

  const rows: Array<Record<string, unknown>> = [];
  const contributed: Contribution[] = [];
  const skipped: Skip[] = [];
  const catalogues: Array<{ name: string; catalogue: CatalogColumn[] }> = [];

  for (const entry of entries) {
    const fetched = await fetchGridRows(deps.configManager, deps.configStore, entry, deps.client, {
      allowSample: a.allowSample === true,
    });
    if (!fetched.ok) {
      skipped.push({ displayName: entry.displayName, reason: fetched.error });
      continue;
    }
    const catalogue = await readColumnCatalogue(deps.configManager, deps.configStore, entry);
    catalogues.push({ name: entry.displayName, catalogue });
    for (const row of fetched.value.rows) {
      rows.push({ ...row, [SOURCE_COLUMN]: entry.displayName });
    }
    contributed.push({ displayName: entry.displayName, configId: entry.configId, rows: fetched.value.rows.length });
  }

  if (contributed.length === 0) {
    return {
      ok: false,
      summary:
        'None of the blotters could be read: ' +
        skipped.map((s) => `${s.displayName} — ${s.reason}`).join('; '),
    };
  }

  const map = new Map<string, string>();
  for (const name of new Set(queryColumnNames(query))) {
    const resolved = resolveAcross(name, catalogues);
    if (!resolved.ok) return { ok: false, summary: resolved.error };
    map.set(name, resolved.colId);
  }

  const outcome = runQuery(rows, rewriteQuery(query, map));
  if (!outcome.ok) return { ok: false, summary: outcome.error };
  const table: QueryResult = outcome.value;

  // Which blotters are behind a number is part of the number's meaning, so it
  // travels with the result rather than only in the prose.
  const provenance =
    `union of ${contributed.length} blotter(s): ` +
    contributed.map((c) => `${c.displayName} (${c.rows} rows)`).join(', ') +
    (skipped.length ? `. SKIPPED: ${skipped.map((s) => `${s.displayName} — ${s.reason}`).join('; ')}` : '');

  const payload: DataCellPayload = {
    kind: DATA_CELL,
    gridName: `${contributed.length} blotters`,
    source: 'live',
    provenance,
    rowCount: table.matched,
    table,
    ran: `across ${contributed.map((c) => c.displayName).join(' + ')}`,
    query: rewriteQuery(query, map),
  };

  return {
    ok: true,
    summary:
      `${table.matched} result row(s) from ${table.scanned} rows across ` +
      `${contributed.length} blotter(s) — ${contributed.map((c) => `${c.displayName} ${c.rows}`).join(', ')}` +
      `${table.truncated ? `, showing the first ${table.rows.length}` : ''}.` +
      // A silently-absent book is the failure mode that matters here: a total
      // missing a whole blotter still looks like a total.
      (skipped.length
        ? ` NOT included: ${skipped.map((s) => `${s.displayName} (${s.reason})`).join('; ')} — this total does not cover them.`
        : ''),
    data: payload,
  };
}
