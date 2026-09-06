/**
 * Run a report against real rows BEFORE anyone is shown it.
 *
 * A dashboard used to be composed hopefully: the model picked blocks, the
 * window opened, and whichever ones could not draw said "nothing chartable"
 * on screen. The user then went back to the chat to find out why, block by
 * block. Every part of that loop is avoidable — the answer is knowable at
 * compose time, because the queries are pure and the rows are already there.
 *
 * So each block is executed here and classified. The distinction that matters:
 *
 *  - **Broken** — the block can never draw. A column that does not exist, a
 *    result with no numeric to plot, a chart kind the shape cannot satisfy.
 *    This is a composition mistake and the model must fix it, so creation is
 *    refused with the reason per block.
 *  - **Empty** — the query is valid and matched nothing right now. That is
 *    data, not a mistake. The dashboard is created and the fact is reported.
 *
 * Refusing the first and allowing the second is what makes the result
 * deterministic: a dashboard that is created renders, and one that would not
 * is rejected with the specific reason rather than shipped to be discovered.
 */
import type { ConfigManager } from '@wellsfargo-starui/core/host/config';
import {
  runQuery,
  buildChartSpec,
  whyNotChartable,
  type DataProviderConfigStore,
  type ReportSpec,
  type ReportBlock,
  type ChartKind,
} from '@wellsfargo-starui/data';
import type { RegistryEntry } from '@wellsfargo-starui/openfin/config';
import { readColumnCatalogue, resolveColumn } from './columnResolver';
import { fetchGridRows, type DataHubClient } from './dataAccess';

export interface BlockVerdict {
  index: number;
  kind: string;
  title?: string;
  status: 'ok' | 'empty' | 'broken';
  reason?: string;
}

export interface Preflight {
  verdicts: BlockVerdict[];
  broken: BlockVerdict[];
  empty: BlockVerdict[];
  rowCount: number;
}

export interface PreflightDeps {
  configManager: ConfigManager;
  configStore: DataProviderConfigStore;
  client?: DataHubClient;
}

/** Every column name a block's query mentions. */
function columnsUsed(block: ReportBlock): string[] {
  const q = (block as { query?: Record<string, unknown> }).query;
  if (!q) return [];
  const filters = (q.filter as Array<{ column?: string }> | undefined) ?? [];
  const aggs = (q.aggregate as Array<{ column?: string }> | undefined) ?? [];
  const sort = q.sortBy as { column?: string } | undefined;
  return [
    ...((q.columns as string[] | undefined) ?? []),
    ...((q.groupBy as string[] | undefined) ?? []),
    ...((q.pivotBy as string[] | undefined) ?? []),
    ...filters.map((f) => f.column),
    ...aggs.map((a) => a.column),
    sort?.column,
  ].filter((c): c is string => typeof c === 'string' && c.length > 0);
}

/**
 * Execute every block and say what each one would actually render.
 *
 * The rows are fetched once and shared: sixteen blocks against one snapshot,
 * not sixteen snapshot fetches.
 */
export async function preflightReport(
  deps: PreflightDeps,
  entry: RegistryEntry,
  spec: ReportSpec,
): Promise<{ ok: true; value: Preflight } | { ok: false; error: string }> {
  const fetched = await fetchGridRows(deps.configManager, deps.configStore, entry, deps.client, {
    allowSample: true,
  });
  if (!fetched.ok) return { ok: false, error: fetched.error };
  const rows = fetched.value.rows;
  const catalogue = await readColumnCatalogue(deps.configManager, deps.configStore, entry);

  const verdicts: BlockVerdict[] = spec.blocks.map((block, index) => {
    const base = { index, kind: block.kind, title: block.title };
    if (block.kind === 'commentary') return { ...base, status: 'ok' as const };

    // A column that does not exist is the commonest composition mistake and
    // the one with the clearest fix, so it is checked before anything runs.
    const unknown = columnsUsed(block).filter((name) => !resolveColumn(name, catalogue).ok);
    if (unknown.length > 0) {
      return {
        ...base,
        status: 'broken' as const,
        reason: `references ${unknown.map((u) => `"${u}"`).join(', ')}, which ${unknown.length === 1 ? 'is not a column' : 'are not columns'} on this blotter`,
      };
    }

    const outcome = runQuery(rows, (block as { query: Parameters<typeof runQuery>[1] }).query);
    if (!outcome.ok) return { ...base, status: 'broken' as const, reason: outcome.error };
    const result = outcome.value;

    if (result.rows.length === 0) {
      return { ...base, status: 'empty' as const, reason: 'the query matched no rows right now' };
    }

    if (block.kind === 'chart') {
      const input = {
        columns: result.columns,
        rows: result.rows,
        grouped: result.grouped,
        pivot: result.pivot,
        requested: ((block as { chart?: string }).chart as ChartKind | undefined) ?? 'auto',
      };
      if (!buildChartSpec(input)) {
        return { ...base, status: 'broken' as const, reason: whyNotChartable(input) ?? 'nothing chartable in this result' };
      }
    }

    if (block.kind === 'kpis') {
      // A tile whose column is missing from the result renders an em-dash,
      // which looks like a number that happens to be unavailable rather than
      // a tile pointing at nothing.
      const tiles = (block as { tiles?: Array<{ label?: string; column?: string; fn?: string }> }).tiles ?? [];
      const missing = tiles.filter((t) => {
        if (!t.column) return true;
        const row = result.rows[0] ?? {};
        if (t.column in row) return false;
        if (t.fn && `${t.fn}_${t.column}` in row) return false;
        return !Object.keys(row).some((k) => k.endsWith(`_${t.column}`));
      });
      if (missing.length === tiles.length && tiles.length > 0) {
        return {
          ...base,
          status: 'broken' as const,
          reason: `no tile finds its value — the query returns ${result.columns.join(', ')}, so aggregate the columns the tiles name`,
        };
      }
      if (missing.length > 0) {
        return {
          ...base,
          status: 'broken' as const,
          reason: `tile(s) ${missing.map((t) => `"${t.label ?? t.column}"`).join(', ')} find no value in a result of ${result.columns.join(', ')}`,
        };
      }
    }

    return { ...base, status: 'ok' as const };
  });

  return {
    ok: true,
    value: {
      verdicts,
      broken: verdicts.filter((v) => v.status === 'broken'),
      empty: verdicts.filter((v) => v.status === 'empty'),
      rowCount: rows.length,
    },
  };
}

/** One line per bad block, addressed by index so the model can fix in place. */
export function describeBroken(broken: readonly BlockVerdict[]): string {
  return broken
    .map((v) => `block ${v.index} (${v.kind}${v.title ? ` "${v.title}"` : ''}) ${v.reason}`)
    .join('; ');
}

export function describeEmpty(empty: readonly BlockVerdict[]): string {
  return empty
    .map((v) => `block ${v.index}${v.title ? ` "${v.title}"` : ''}`)
    .join(', ');
}
