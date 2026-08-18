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
 *    the dataset, so this asks for `count` per pill instead. A `scan` there
 *    would page the entire dataset across `postMessage` on every recompute,
 *    which is far worse than the RPC it replaces.
 *
 * BOTH SHAPES PATCH FROM A DELTA, and the difference between them is one
 * question: for the row that just changed, was its PRIOR membership known?
 *
 * That is all a patch needs. The badge counts the whole dataset; a changed row
 * is one row OF that dataset; if its membership flipped, the total moved by
 * exactly one — whether or not anything is known about the other 99,999 rows.
 * So {@link PillMembership} carries `evaluated`: the ids whose membership has
 * been established. A scan that covered the dataset sets it to `null`, meaning
 * "all of them" — absence from a pill's set is then a fact, not a gap. A
 * per-pill `count` establishes no row at all, so it starts empty and FILLS
 * from the deltas themselves. The first tick to touch a row records it and
 * asks for a recompute (its prior state is genuinely unknown, and guessing
 * would drift the badge one row at a time); every later tick on that row is
 * patched with no RPC at all. On a live blotter the same viewport rows tick
 * over and over, so the cost decays to nothing after the first pass instead of
 * being one RPC per pill per emit forever.
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

/**
 * What is known about which rows each pill matches — the state a delta patches
 * counts against.
 *
 * Mutated in place across ticks: it IS the accumulated membership, not a
 * snapshot of one pass.
 */
export interface PillMembership {
  /** Row ids known to match each pill, keyed by pill id. */
  readonly sets: Map<string, Set<string>>;
  /**
   * Row ids whose membership has been established. `null` means every row
   * has — the walk covered the dataset — so a row absent from a pill's set is
   * known NOT to match it. A non-null set is the rows seen so far; a row
   * outside it may or may not already be in the source's total, and no delta
   * can say which.
   */
  readonly evaluated: Set<string> | null;
}

export interface FilterPillCounts {
  readonly counts: Record<string, number>;
  readonly membership: PillMembership;
}

/** The outcome of patching counts from one delta. */
export interface PillCountPatch {
  /** The patched counts, or `null` when nothing publishable came of it —
   *  either no pill's membership moved, or the delta could not be resolved. */
  readonly counts: Record<string, number> | null;
  /** A changed row's PRIOR membership was unknown, so the total cannot be
   *  moved by hand. The caller recomputes; the membership recorded here makes
   *  the NEXT delta on those rows patchable. */
  readonly unresolved: boolean;
}

/** Membership with a slot per pill and nothing established about any row. */
export function emptyPillMembership(
  filters: readonly CountableFilter[],
): PillMembership {
  const sets = new Map<string, Set<string>>();
  for (const f of filters) sets.set(f.id, new Set());
  return { sets, evaluated: new Set() };
}

/**
 * Every pill counted against the whole dataset, through the port.
 *
 * `prior` is the membership accumulated from earlier deltas. The counting
 * path carries it forward — those rows' memberships are current row state and
 * a fresh count does not invalidate them, while discarding them would send
 * every subsequent tick back through a full recompute and the storm would
 * never end. The scanning path replaces it: a walk of the dataset is
 * authoritative about every row, which is strictly more than `prior` knows.
 */
export async function computeFilterPillCounts(
  data: GridDataPort,
  filters: readonly CountableFilter[],
  prior?: PillMembership,
): Promise<FilterPillCounts> {
  if (filters.length === 0) {
    return { counts: {}, membership: emptyPillMembership(filters) };
  }
  return data.capabilities.canAddressUnloadedRows.supported
    ? countByScan(data, filters)
    : countByPort(data, filters, prior);
}

/**
 * Patch counts from a row-change delta instead of recounting the dataset.
 *
 * `membership` is mutated in place — it is what this delta is relative to, and
 * the caller holds it across ticks for exactly that reason. Every changed row
 * is recorded whether or not it could be patched, because its CURRENT
 * membership is knowable either way and that is what the next delta needs.
 */
export function patchPillCounts(
  change: RowChange,
  filters: readonly CountableFilter[],
  membership: PillMembership,
  counts: Readonly<Record<string, number>>,
): PillCountPatch {
  const next = { ...counts };
  const { sets, evaluated } = membership;
  let changed = false;
  let unresolved = false;

  const touchNode = (node: IRowNode, removed: boolean): void => {
    const rowId = node.id;
    if (typeof rowId !== 'string') return;
    const data = node.data as Record<string, unknown> | undefined;
    // `evaluated === null` is "the walk covered the dataset": every row's
    // membership is established, so absence from a set means "does not match".
    const knownBefore = evaluated === null || evaluated.has(rowId);
    for (const f of filters) {
      const set = sets.get(f.id);
      if (!set) { unresolved = true; continue; }
      const was = set.has(rowId);
      const now = !removed && !!data && rowMatchesPill(data, f, warnPillRefusalOnce);
      if (now) set.add(rowId);
      else set.delete(rowId);
      if (!knownBefore) { unresolved = true; continue; }
      if (was === now) continue;
      // A pill the port could not answer holds no number. Inventing one from
      // zero and moving it by one would put a made-up total on the badge.
      if (!(f.id in next)) { unresolved = true; continue; }
      changed = true;
      next[f.id] = Math.max(0, next[f.id] + (now ? 1 : -1));
    }
    if (evaluated) {
      if (removed) evaluated.delete(rowId);
      else evaluated.add(rowId);
    }
  };

  for (const node of change.removed) touchNode(node, true);
  for (const node of change.added) touchNode(node, false);
  for (const node of change.updated) touchNode(node, false);

  // A partly-resolved delta publishes nothing: half a patch on top of a total
  // the rest of the delta also moved is a number that was never true.
  return { counts: unresolved || !changed ? null : next, unresolved };
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
  const sets = new Map<string, Set<string>>();
  for (const f of filters) {
    counts[f.id] = 0;
    sets.set(f.id, new Set());
  }
  const result = await data.scan((row) => {
    if (!row.id) return;
    for (const f of filters) {
      if (!rowMatchesPill(row.data, f, warnPillRefusalOnce)) continue;
      sets.get(f.id)!.add(row.id);
      counts[f.id] += 1;
    }
  }, { scope: 'all' });
  // A scan that could not cover the dataset leaves counts that describe a
  // fraction of it, and a membership that claims rows it never reached do not
  // match. Reporting nothing established sends the next change through a full
  // recompute rather than patching numbers built from a partial walk.
  return result.complete
    ? { counts, membership: { sets, evaluated: null } }
    : { counts, membership: emptyPillMembership(filters) };
}

async function countByPort(
  data: GridDataPort,
  filters: readonly CountableFilter[],
  prior: PillMembership | undefined,
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
  return { counts, membership: carryForward(prior, filters) };
}

/**
 * Keep what earlier deltas established, provided it still describes THIS pill
 * list. A pill added since has no recorded membership even for rows already
 * seen, so the whole thing starts again rather than patching one pill from
 * another pill's observations.
 */
function carryForward(
  prior: PillMembership | undefined,
  filters: readonly CountableFilter[],
): PillMembership {
  if (
    prior
    && prior.evaluated !== null
    && prior.sets.size === filters.length
    && filters.every((f) => prior.sets.has(f.id))
  ) {
    return prior;
  }
  return emptyPillMembership(filters);
}
