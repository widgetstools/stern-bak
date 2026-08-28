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
