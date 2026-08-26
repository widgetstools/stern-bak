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
  [slice: string]: unknown;
}

export interface SavedGridStateEnvelope {
  schemaVersion: number;
  savedAt: string;
  gridState: GridStateSlices;
  viewportAnchor: { firstRowIndex: number; leftColId: string | null; horizontalPixel: number };
  quickFilter?: string;
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
}

export function normalizeRowGroupingArgs(args: Record<string, unknown>): LayoutResult<RowGroupingArgs> {
  const groupBy = stringList(args.groupBy, 'groupBy');
  if (isListError(groupBy)) return { ok: false, error: groupBy.error };
  if (args.groupBy === undefined) {
    return { ok: false, error: 'groupBy is required — pass an empty array to clear row grouping.' };
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
  return { ok: true, value: { groupBy, aggregations } };
}

/** Row-group + aggregation slices for the snapshot layer. */
export function applyRowGrouping(prev: GridStateSlices, patch: RowGroupingArgs): GridStateSlices {
  const next: GridStateSlices = {
    ...prev,
    rowGroup: { groupColIds: [...patch.groupBy] },
  };
  const aggs = Object.entries(patch.aggregations ?? {});
  if (aggs.length > 0) {
    next.aggregation = { aggregationModel: aggs.map(([colId, aggFunc]) => ({ colId, aggFunc })) };
  } else if (patch.groupBy.length === 0) {
    // Clearing the grouping clears the aggregates with it, otherwise the
    // totals linger on an ungrouped grid.
    next.aggregation = { aggregationModel: [] };
  }
  return next;
}
