/**
 * The row-count badge on each saved-filter pill, answered through
 * `platform.data`.
 *
 * ONE MEANING, both row models. A badge counts rows in the WHOLE dataset that
 * match this pill's own model — `scope: 'all'`, so neither the filter the grid
 * currently applies nor the quick-filter text narrows it. That is the
 * client-side grid's meaning (`forEachNode` sees both past), and binding
 * constraint 1 of the parity roadmap makes CSRM the reference. It is also the
 * only reading where two pills' badges are comparable to each other: a number
 * that moved because a *different* pill was toggled on answers a question
 * nobody asked. The server-side path used to fold the quick filter in
 * (`ssrmFilterCounts.ts`, deleted with this module's arrival), so the same
 * badge meant two different things depending on the row model.
 *
 * TWO SHAPES OF ANSWER, chosen by capability rather than by row model:
 *
 *  - `capabilities.canAddressUnloadedRows` is exactly the question "is a set of
 *    row ids spanning the dataset meaningful here". When it is, one `scan`
 *    pass builds every pill's count AND its match set — the same single
 *    `forEachNode` walk the hook has always made, and what the incremental
 *    delta path in `useFilterCounts` patches on a streaming tick.
 *  - When it is not, a match set would describe the loaded window rather than
 *    the dataset, so this asks for `count` per pill instead and leaves the
 *    match sets empty. A `scan` there would page the entire dataset across
 *    `postMessage` on every recompute, which is far worse than the RPC it
 *    replaces.
 *
 * Where the match sets come back empty, every row change falls back to a full
 * recompute — one RPC per pill per emit. That is the storm Phase 5 of the
 * parity roadmap closes, by giving `RowChangeSignal` a real server-side delta
 * source; it is not closed here, and this comment is the hand-off.
 *
 * A pill whose model the shared predicate cannot evaluate OVER-includes and
 * warns once, rather than reading zero. `bindSsrmTicks` set that precedent for
 * a hot path that must not drop work: the refusal is raised for real on the
 * query path, where it reaches the user, and a badge is not the place to
 * surface it.
 */
import type { IRowNode } from 'ag-grid-community';
import {
  doesRowMatchFilterModel,
  type GridDataPort,
  type RowChange,
} from '@wellsfargo-starui/core';

export interface CountableFilter {
  readonly id: string;
  readonly filterModel: Record<string, unknown>;
}

export interface FilterPillCounts {
  readonly counts: Record<string, number>;
  /** Row ids matching each pill, empty when the port cannot address the whole
   *  dataset by id. An empty map means "recompute in full next time". */
  readonly matchSets: Map<string, Set<string>>;
}

/** Every pill counted against the whole dataset, through the port. */
export async function computeFilterPillCounts(
  data: GridDataPort,
  filters: readonly CountableFilter[],
): Promise<FilterPillCounts> {
  if (filters.length === 0) return { counts: {}, matchSets: new Map() };
  return data.capabilities.canAddressUnloadedRows.supported
    ? countByScan(data, filters)
    : countByPort(data, filters);
}

/**
 * Patch counts from a row-change delta instead of recounting the dataset.
 *
 * `matchSets` is mutated in place — it is the membership this delta is
 * relative to, and the caller holds it across ticks for exactly that reason.
 * Returns the new counts, or `null` when no pill's membership moved (the
 * common case on a tick that touched columns nobody filters on).
 *
 * Only reachable when {@link computeFilterPillCounts} produced match sets; a
 * caller with none must recompute in full.
 */
export function patchPillCounts(
  change: RowChange,
  filters: readonly CountableFilter[],
  matchSets: Map<string, Set<string>>,
  counts: Readonly<Record<string, number>>,
): Record<string, number> | null {
  const next = { ...counts };
  let changed = false;

  const touchNode = (node: IRowNode, removed: boolean): void => {
    const rowId = node.id;
    if (typeof rowId !== 'string') return;
    const data = node.data as Record<string, unknown> | undefined;
    for (const f of filters) {
      const set = matchSets.get(f.id);
      if (!set) continue;
      const was = set.has(rowId);
      const now = !removed && !!data && rowMatchesPill(data, f, warnPillRefusalOnce);
      if (was === now) continue;
      changed = true;
      if (now) {
        set.add(rowId);
        next[f.id] = (next[f.id] ?? 0) + 1;
      } else {
        set.delete(rowId);
        next[f.id] = Math.max(0, (next[f.id] ?? 0) - 1);
      }
    }
  };

  for (const node of change.removed) touchNode(node, true);
  for (const node of change.added) touchNode(node, false);
  for (const node of change.updated) touchNode(node, false);

  return changed ? next : null;
}

/**
 * Evaluate one pill against one row, over-including on a refusal.
 *
 * Exported because the incremental delta path applies the SAME rule to the
 * rows a tick changed — a pill that over-includes in the full pass and
 * under-includes in the delta would drift its own badge downward tick by tick.
 */
export function rowMatchesPill(
  data: Record<string, unknown>,
  filter: CountableFilter,
  warn: (filter: CountableFilter, err: unknown) => void,
): boolean {
  try {
    return doesRowMatchFilterModel(data, filter.filterModel);
  } catch (err) {
    warn(filter, err);
    return true;
  }
}

/** One warning per pill per page, not one per row per tick. */
const warnedPills = new Set<string>();

export function warnPillRefusalOnce(filter: CountableFilter, err: unknown): void {
  const key = `${filter.id}:${JSON.stringify(filter.filterModel)}`;
  if (warnedPills.has(key)) return;
  warnedPills.add(key);
  // eslint-disable-next-line no-console
  console.warn(
    `[FiltersToolbar] pill "${filter.id}" has a filter this grid cannot count; ` +
      'its badge over-counts until the filter is applied, which reports the ' +
      'reason properly.',
    err,
  );
}

async function countByScan(
  data: GridDataPort,
  filters: readonly CountableFilter[],
): Promise<FilterPillCounts> {
  const counts: Record<string, number> = {};
  const matchSets = new Map<string, Set<string>>();
  for (const f of filters) {
    counts[f.id] = 0;
    matchSets.set(f.id, new Set());
  }
  const result = await data.scan((row) => {
    if (!row.id) return;
    for (const f of filters) {
      if (!rowMatchesPill(row.data, f, warnPillRefusalOnce)) continue;
      matchSets.get(f.id)!.add(row.id);
      counts[f.id] += 1;
    }
  }, { scope: 'all' });
  // A scan that could not cover the dataset leaves counts that describe a
  // fraction of it. Reporting no match sets sends the next change through a
  // full recompute rather than patching numbers built from a partial walk.
  return result.complete ? { counts, matchSets } : { counts, matchSets: new Map() };
}

async function countByPort(
  data: GridDataPort,
  filters: readonly CountableFilter[],
): Promise<FilterPillCounts> {
  const entries = await Promise.all(
    filters.map(async (f) => {
      const { count, complete } = await data.count({ scope: 'all', filterModel: f.filterModel });
      // `complete: false` is "the port could not look" — a refused model, a
      // detached source. Zero would be a claim; the pill keeps no number.
      return [f.id, complete ? count : null] as const;
    }),
  );
  const counts: Record<string, number> = {};
  for (const [id, count] of entries) {
    if (count != null) counts[id] = count;
  }
  return { counts, matchSets: new Map() };
}
