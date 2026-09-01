/**
 * Column layout (order / visibility / pinning / width) and row grouping.
 *
 * ## Why this writes TWO layers
 *
 * Layout lives in AG-Grid's own `GridState`, persisted by the `grid-state`
 * module and replayed through `api.setState()` on grid-ready / profile-load.
 * Whatever is in that snapshot therefore WINS at runtime over per-column
 * config. But a grid that has never been saved has no snapshot at all, and
 * then only `column-customization` assignments (`initialHide`,
 * `initialPinned`, `initialWidth`) have any say.
 *
 * Writing one layer alone gives a coin-flip: hide a column via config and a
 * stale snapshot re-shows it; hide it via the snapshot and a fresh grid
 * ignores it. So both are written and kept in agreement.
 *
 * Column ORDER is the exception — assignments have no ordering field, so
 * order is snapshot-only.
 */

/** Named AG-Grid aggregations that survive a round trip through GridState. */
export const AGG_FUNCS = ['sum', 'min', 'max', 'count', 'avg', 'first', 'last'] as const;
export type AggFuncName = (typeof AGG_FUNCS)[number];

export interface GridStateSlices {
  columnOrder?: { orderedColIds: string[] };
  columnVisibility?: { hiddenColIds: string[] };
  columnPinning?: { leftColIds: string[]; rightColIds: string[] };
  columnSizing?: { columnSizingModel: Array<{ colId: string; width?: number; flex?: number }> };
  rowGroup?: { groupColIds: string[] };
  aggregation?: { aggregationModel: Array<{ colId: string; aggFunc: string }> };
  /** AG-Grid's own pivot slice: the mode flag plus the column dimension. */
  pivot?: { pivotMode: boolean; pivotColIds: string[] };
  /** Sort columns and directions. Mirrors AG-Grid's `SortState`. */
  sort?: { sortModel: Array<{ colId: string; sort: 'asc' | 'desc' }> };
  /** Column filters. `filterModel` is keyed by colId — the same shape a
   *  saved-filter pill carries. */
  filter?: { filterModel: Record<string, unknown> };
  /**
   * Which row groups are open. AG-Grid collapses every group by default and
   * treats this as the list of row ids explicitly expanded — so it is a
   * SNAPSHOT of open groups, not a diff.
   */
  rowGroupExpansion?: { expandedRowGroupIds: string[] };
  [slice: string]: unknown;
}

export interface SavedGridStateEnvelope {
  schemaVersion: number;
  savedAt: string;
  gridState: GridStateSlices;
  viewportAnchor: { firstRowIndex: number; leftColId: string | null; horizontalPixel: number };
  quickFilter?: string;
  /**
   * Columns hidden BY the grouped/pivot view rather than by the user, so
   * flattening the grid restores exactly those and leaves deliberately hidden
   * columns alone. AG-Grid ignores the key; it rides along in the envelope.
   *
   * It is lost if the user clicks Save while grouped (the module recaptures
   * `saved` wholesale). The cost of that is columns staying hidden after an
   * ungroup until someone shows them — visible and one call to fix, unlike
   * silently un-hiding a column the user meant to keep hidden.
   */
  assistantAutoHiddenColIds?: string[];
  [key: string]: unknown;
}

/** Matches GRID_STATE_SCHEMA_VERSION in the engine's grid-state module. */
const GRID_STATE_SCHEMA_VERSION = 3;

/**
 * A snapshot the module can replay, built around whatever is already saved.
 * `savedAt` is refreshed so the row reads as a real capture rather than a
 * half-populated one.
 */
export function withGridStateSlices(
  prev: SavedGridStateEnvelope | null | undefined,
  patch: GridStateSlices,
  now: string,
): SavedGridStateEnvelope {
  return {
    schemaVersion: prev?.schemaVersion ?? GRID_STATE_SCHEMA_VERSION,
    viewportAnchor: prev?.viewportAnchor ?? { firstRowIndex: 0, leftColId: null, horizontalPixel: 0 },
    ...(prev ?? {}),
    savedAt: now,
    gridState: { ...(prev?.gridState ?? {}), ...patch },
  };
}

export interface ColumnLayoutArgs {
  order?: string[];
  hide?: string[];
  show?: string[];
  pinLeft?: string[];
  pinRight?: string[];
  unpin?: string[];
  width?: Record<string, number>;
}

export type LayoutResult<T> = { ok: true; value: T } | { ok: false; error: string };

function stringList(value: unknown, field: string): string[] | { error: string } {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string' || !v)) {
    return { error: `${field} must be an array of column-id strings.` };
  }
  return value as string[];
}

function isListError(v: unknown): v is { error: string } {
  return typeof v === 'object' && v !== null && 'error' in v;
}

export function normalizeColumnLayoutArgs(args: Record<string, unknown>): LayoutResult<ColumnLayoutArgs> {
  const out: ColumnLayoutArgs = {};
  for (const field of ['order', 'hide', 'show', 'pinLeft', 'pinRight', 'unpin'] as const) {
    const list = stringList(args[field], field);
    if (isListError(list)) return { ok: false, error: list.error };
    if (list.length > 0) out[field] = list;
  }

  if (args.width !== undefined) {
    const raw = args.width;
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      return { ok: false, error: 'width must be an object mapping colId to a pixel width, e.g. { "marketValue": 120 }.' };
    }
    const width: Record<string, number> = {};
    for (const [colId, px] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof px !== 'number' || !Number.isFinite(px) || px <= 0) {
        return { ok: false, error: `width["${colId}"] must be a positive number of pixels.` };
      }
      width[colId] = Math.round(px);
    }
    if (Object.keys(width).length > 0) out.width = width;
  }

  const touched = Object.keys(out).length > 0;
  if (!touched) {
    return {
      ok: false,
      error: 'Nothing to change — supply at least one of order, hide, show, pinLeft, pinRight, unpin or width.',
    };
  }

  const hidden = new Set(out.hide ?? []);
  const shown = (out.show ?? []).filter((id) => hidden.has(id));
  if (shown.length > 0) {
    return { ok: false, error: `Column(s) listed in both hide and show: ${shown.join(', ')}.` };
  }
  return { ok: true, value: out };
}

/** Applies a layout patch to the previous slices, preserving untouched ones. */
export function applyColumnLayout(prev: GridStateSlices, patch: ColumnLayoutArgs): GridStateSlices {
  const next: GridStateSlices = { ...prev };

  if (patch.order) {
    // Partial orders are legal: the named columns lead, everything already
    // known follows in its existing order. The engine's restore then appends
    // any live column the snapshot never saw.
    const seen = new Set(patch.order);
    const rest = (prev.columnOrder?.orderedColIds ?? []).filter((id) => !seen.has(id));
    next.columnOrder = { orderedColIds: [...patch.order, ...rest] };
  }

  if (patch.hide || patch.show) {
    const hidden = new Set(prev.columnVisibility?.hiddenColIds ?? []);
    for (const id of patch.hide ?? []) hidden.add(id);
    for (const id of patch.show ?? []) hidden.delete(id);
    next.columnVisibility = { hiddenColIds: [...hidden] };
  }

  if (patch.pinLeft || patch.pinRight || patch.unpin) {
    const left = new Set(prev.columnPinning?.leftColIds ?? []);
    const right = new Set(prev.columnPinning?.rightColIds ?? []);
    for (const id of patch.pinLeft ?? []) {
      right.delete(id);
      left.add(id);
    }
    for (const id of patch.pinRight ?? []) {
      left.delete(id);
      right.add(id);
    }
    for (const id of patch.unpin ?? []) {
      left.delete(id);
      right.delete(id);
    }
    next.columnPinning = { leftColIds: [...left], rightColIds: [...right] };
  }

  if (patch.width) {
    const model = [...(prev.columnSizing?.columnSizingModel ?? [])];
    for (const [colId, width] of Object.entries(patch.width)) {
      const idx = model.findIndex((entry) => entry.colId === colId);
      if (idx === -1) model.push({ colId, width });
      else model[idx] = { ...model[idx], width };
    }
    next.columnSizing = { columnSizingModel: model };
  }

  return next;
}

export const SORT_DIRECTIONS = ['asc', 'desc'] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

export interface SortArgs {
  /** Empty clears sorting entirely. Order is the sort precedence. */
  sortModel: Array<{ colId: string; sort: SortDirection }>;
}

/**
 * `sortBy` is an ordered list — first entry is the primary sort. An empty
 * array (or an explicit `clear`) removes all sorting, which is how "stop
 * sorting" is expressed; there is no separate clear tool.
 */
export function normalizeSortArgs(args: Record<string, unknown>): LayoutResult<SortArgs> {
  if (args.clear === true) return { ok: true, value: { sortModel: [] } };
  const raw = args.sortBy;
  if (raw === undefined) {
    return { ok: false, error: 'Supply sortBy (an ordered array of { column, direction }), or clear: true to remove sorting.' };
  }
  if (!Array.isArray(raw)) {
    return { ok: false, error: 'sortBy must be an array of { column, direction } objects, ordered by precedence.' };
  }
  const sortModel: SortArgs['sortModel'] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) {
      return { ok: false, error: 'Each sortBy entry must be an object like { "column": "marketValue", "direction": "desc" }.' };
    }
    const e = entry as { column?: unknown; direction?: unknown };
    if (typeof e.column !== 'string' || !e.column) {
      return { ok: false, error: 'Each sortBy entry needs a "column" naming the column to sort.' };
    }
    const direction = e.direction ?? 'asc';
    if (direction !== 'asc' && direction !== 'desc') {
      return { ok: false, error: `sortBy["${e.column}"].direction must be "asc" or "desc".` };
    }
    if (seen.has(e.column)) {
      return { ok: false, error: `Column "${e.column}" appears twice in sortBy — a column can only be sorted once.` };
    }
    seen.add(e.column);
    sortModel.push({ colId: e.column, sort: direction });
  }
  return { ok: true, value: { sortModel } };
}

export interface GroupExpansionArgs {
  /** Snapshot of the groups that should be open. */
  expandedRowGroupIds: string[];
  /** `-1` expands every level, `0` collapses all; undefined leaves it alone. */
  groupDefaultExpanded?: number;
}

/**
 * Expansion has two genuinely different mechanisms and conflating them is the
 * mistake to prevent:
 *   - expand/collapse ALL is `general-settings.groupDefaultExpanded`
 *     (`-1` / `0`) — declarative, survives a reload, applies to groups that
 *     don't exist yet.
 *   - expanding SPECIFIC groups is `gridState.rowGroupExpansion`, a snapshot
 *     of open row ids. AG-Grid collapses everything by default, so this list
 *     is absolute, not a delta.
 */
export function normalizeGroupExpansionArgs(args: Record<string, unknown>): LayoutResult<GroupExpansionArgs> {
  const mode = args.mode;
  if (mode !== undefined && mode !== 'all' && mode !== 'none' && mode !== 'specific') {
    return { ok: false, error: 'mode must be "all" (expand every group), "none" (collapse every group), or "specific".' };
  }
  if (mode === 'all') return { ok: true, value: { expandedRowGroupIds: [], groupDefaultExpanded: -1 } };
  if (mode === 'none') return { ok: true, value: { expandedRowGroupIds: [], groupDefaultExpanded: 0 } };

  const list = stringList(args.expandGroups, 'expandGroups');
  if (isListError(list)) return { ok: false, error: list.error };
  if (list.length === 0) {
    return {
      ok: false,
      error:
        'Supply mode: "all" / "none", or expandGroups with the row-group ids to open. ' +
        'Group ids come from the grid\'s own row ids (e.g. "row-group-sector-Financials") — ' +
        'read them from a grouped result rather than inventing them.',
    };
  }
  return { ok: true, value: { expandedRowGroupIds: list } };
}

export interface RowGroupingArgs {
  groupBy: string[];
  aggregations?: Record<string, AggFuncName>;
  /** Column dimension. Non-empty turns pivot mode on unless `pivotMode: false`. */
  pivotBy?: string[];
  /** Explicit pivot-mode toggle. Defaults to `pivotBy.length > 0`. */
  pivotMode?: boolean;
  /**
   * Hide every column that isn't a measure while the view is grouped or
   * pivoting. Defaults to TRUE — see `planGroupedVisibility`.
   */
  hideNonNumeric?: boolean;
}

export function normalizeRowGroupingArgs(args: Record<string, unknown>): LayoutResult<RowGroupingArgs> {
  const groupBy = stringList(args.groupBy, 'groupBy');
  if (isListError(groupBy)) return { ok: false, error: groupBy.error };
  if (args.groupBy === undefined) {
    return { ok: false, error: 'groupBy is required — pass an empty array to clear row grouping.' };
  }

  const pivotBy = stringList(args.pivotBy, 'pivotBy');
  if (isListError(pivotBy)) return { ok: false, error: pivotBy.error };

  if (args.pivotMode !== undefined && typeof args.pivotMode !== 'boolean') {
    return { ok: false, error: 'pivotMode must be a boolean.' };
  }
  if (args.hideNonNumeric !== undefined && typeof args.hideNonNumeric !== 'boolean') {
    return { ok: false, error: 'hideNonNumeric must be a boolean.' };
  }
  const pivotMode = (args.pivotMode as boolean | undefined) ?? pivotBy.length > 0;

  // AG-Grid pivots the VALUE columns within each row group, so a pivot with no
  // row group has nothing to put down the left-hand side and renders a single
  // total row. Caught here rather than left to look like a broken grid.
  if (pivotMode && groupBy.length === 0) {
    return {
      ok: false,
      error:
        'A pivot needs at least one row group: groupBy is the row dimension, pivotBy the column dimension. ' +
        'Pass groupBy (e.g. ["issuerSector"]) alongside pivotBy, or clear pivotMode.',
    };
  }
  const overlap = pivotBy.filter((id) => groupBy.includes(id));
  if (overlap.length > 0) {
    return {
      ok: false,
      error: `Column(s) in both groupBy and pivotBy: ${overlap.join(', ')}. A column can be the row dimension or the column dimension, not both.`,
    };
  }

  const aggregations: Record<string, AggFuncName> = {};
  if (args.aggregations !== undefined) {
    const raw = args.aggregations;
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      return { ok: false, error: 'aggregations must be an object mapping colId to an aggregation, e.g. { "marketValue": "sum" }.' };
    }
    for (const [colId, fn] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof fn !== 'string' || !(AGG_FUNCS as readonly string[]).includes(fn)) {
        return { ok: false, error: `aggregations["${colId}"] must be one of: ${AGG_FUNCS.join(', ')}.` };
      }
      aggregations[colId] = fn as AggFuncName;
    }
  }

  // A pivot with no measure produces a grid of empty cells — the pivot columns
  // exist but have nothing to total.
  if (pivotMode && Object.keys(aggregations).length === 0) {
    return {
      ok: false,
      error:
        'A pivot needs at least one aggregated measure — pass aggregations, e.g. { "marketValue": "sum" }. ' +
        'Those are the numbers that fill the pivoted cells.',
    };
  }

  return {
    ok: true,
    value: {
      groupBy,
      aggregations,
      pivotBy,
      pivotMode,
      hideNonNumeric: (args.hideNonNumeric as boolean | undefined) ?? true,
    },
  };
}

/** Columns a grouped/pivot view keeps on screen, and what it hides. */
export interface GroupedVisibilityPlan {
  /** Full hidden set for the snapshot, user-hidden columns included. */
  hiddenColIds: string[];
  /** The subset this view hid, so flattening can restore exactly it. */
  autoHiddenColIds: string[];
}

export interface VisibilityInput {
  /** Every column the grid has, with its declared type resolved to numeric-ness. */
  columns: ReadonlyArray<{ colId: string; numeric: boolean }>;
  /** Hidden set before this call. */
  previouslyHidden: readonly string[];
  /** What the previous grouped/pivot view hid, from the envelope. */
  previouslyAutoHidden: readonly string[];
}

/**
 * Decide what a grouped or pivoted grid shows.
 *
 * Two rules, both of which exist because the flat 250-column blotter is
 * unreadable the moment it rolls up:
 *
 *  1. **Dimension columns disappear as individual columns.** A column being
 *     grouped or pivoted moves into the auto group column / the pivot headers,
 *     so leaving it in the body repeats the value on every row.
 *  2. **Only measures stay.** A group row can only meaningfully show an
 *     aggregate, so non-numeric columns are hidden while grouped. An explicitly
 *     aggregated column always survives, whatever its declared type — the
 *     caller asked for that number.
 *
 * Flattening (`groupBy: []`, no pivot) restores exactly what rule 2 hid and
 * nothing else, so a column the user hid by hand stays hidden.
 */
export function planGroupedVisibility(
  patch: Pick<RowGroupingArgs, 'groupBy' | 'pivotBy' | 'pivotMode' | 'aggregations' | 'hideNonNumeric'>,
  input: VisibilityInput,
): GroupedVisibilityPlan {
  const autoHidden = new Set<string>();
  const hidden = new Set(input.previouslyHidden);

  // Whatever the last grouped view hid is released first; the rules below then
  // re-hide what this one needs. Without this, ungrouping one dimension and
  // grouping another would accumulate hidden columns forever.
  for (const colId of input.previouslyAutoHidden) hidden.delete(colId);

  const grouped = patch.groupBy.length > 0;
  const pivoting = patch.pivotMode === true;
  if (!grouped && !pivoting) {
    return { hiddenColIds: [...hidden], autoHiddenColIds: [] };
  }

  const measures = new Set(Object.keys(patch.aggregations ?? {}));
  const dimensions = new Set([...patch.groupBy, ...(patch.pivotBy ?? [])]);

  for (const column of input.columns) {
    if (dimensions.has(column.colId)) {
      autoHidden.add(column.colId);
      continue;
    }
    if (patch.hideNonNumeric === false) continue;
    if (measures.has(column.colId) || column.numeric) continue;
    autoHidden.add(column.colId);
  }
  for (const colId of autoHidden) hidden.add(colId);

  return { hiddenColIds: [...hidden], autoHiddenColIds: [...autoHidden] };
}

/**
 * Row-group / pivot / aggregation slices for the snapshot layer, plus the
 * visibility the grouped view implies when a `plan` is supplied.
 */
export function applyRowGrouping(
  prev: GridStateSlices,
  patch: RowGroupingArgs,
  plan?: GroupedVisibilityPlan,
): GridStateSlices {
  const next: GridStateSlices = {
    ...prev,
    rowGroup: { groupColIds: [...patch.groupBy] },
  };

  const pivotColIds = [...(patch.pivotBy ?? [])];
  const pivotMode = patch.pivotMode === true;
  // Written even when off, so leaving pivot mode actually clears the slice
  // rather than letting a stale one be replayed on the next profile load.
  next.pivot = { pivotMode, pivotColIds };

  const aggs = Object.entries(patch.aggregations ?? {});
  if (aggs.length > 0) {
    next.aggregation = { aggregationModel: aggs.map(([colId, aggFunc]) => ({ colId, aggFunc })) };
  } else if (patch.groupBy.length === 0) {
    // Clearing the grouping clears the aggregates with it, otherwise the
    // totals linger on an ungrouped grid.
    next.aggregation = { aggregationModel: [] };
  }

  if (plan) next.columnVisibility = { hiddenColIds: plan.hiddenColIds };
  return next;
}
