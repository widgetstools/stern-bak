/**
 * columnSelectorModel — pure, framework-free logic for the Column Selector
 * dialog. No React, no AG-Grid. Operates on plain data so it can be unit
 * tested in isolation and reasoned about without a grid instance.
 *
 * The dialog keeps two ordered lists: `visible` (columns shown in the grid)
 * and `available` (columns hidden from the grid). On Apply the grid columns
 * are reordered to `[...visible, ...available]` with the available ones hidden
 * — see `computeColumnState`.
 */

/** A column as seen by the selector UI. */
export interface ColumnItem {
  readonly colId: string;
  readonly headerName: string;
  /** Locked columns (`colDef.lockVisible`) stay visible and can't be removed. */
  readonly locked: boolean;
}

/** Raw per-column input used to seed the selector (produced by the adapter). */
export interface ColumnDescriptor extends ColumnItem {
  /** True when the column is currently hidden from the grid. */
  readonly hidden: boolean;
}

/** The two ordered lists the dialog edits. */
export interface ColumnSelectorState {
  readonly visible: readonly ColumnItem[];
  readonly available: readonly ColumnItem[];
}

/** One entry of the AG-Grid `applyColumnState` payload we produce. */
export interface ColumnStateEntry {
  readonly colId: string;
  readonly hide: boolean;
}

function toItem(d: ColumnDescriptor): ColumnItem {
  return { colId: d.colId, headerName: d.headerName, locked: d.locked };
}

/**
 * Split descriptors into the visible / available lists, preserving the source
 * order within each list. Locked columns are always treated as visible.
 */
export function buildInitialState(descriptors: readonly ColumnDescriptor[]): ColumnSelectorState {
  const visible: ColumnItem[] = [];
  const available: ColumnItem[] = [];
  for (const d of descriptors) {
    if (d.hidden && !d.locked) available.push(toItem(d));
    else visible.push(toItem(d));
  }
  return { visible, available };
}

/** Items from `source` whose colId is in `ids`, in `source` order. */
function pick(source: readonly ColumnItem[], ids: ReadonlySet<string>): ColumnItem[] {
  return source.filter((c) => ids.has(c.colId));
}

/** Items from `source` whose colId is NOT in `ids`, in `source` order. */
function omit(source: readonly ColumnItem[], ids: ReadonlySet<string>): ColumnItem[] {
  return source.filter((c) => !ids.has(c.colId));
}

/**
 * Move the given columns from `available` to the end of `visible`, preserving
 * their relative order from `available`. Ids not in `available` are ignored.
 */
export function moveToVisible(state: ColumnSelectorState, ids: readonly string[]): ColumnSelectorState {
  const idSet = new Set(ids);
  const moving = pick(state.available, idSet);
  if (moving.length === 0) return state;
  return {
    visible: [...state.visible, ...moving],
    available: omit(state.available, idSet),
  };
}

/**
 * Move the given columns from `visible` to the end of `available`, preserving
 * their relative order. Locked columns and ids not in `visible` are ignored.
 */
export function moveToAvailable(state: ColumnSelectorState, ids: readonly string[]): ColumnSelectorState {
  const idSet = new Set(ids);
  const moving = state.visible.filter((c) => idSet.has(c.colId) && !c.locked);
  if (moving.length === 0) return state;
  const movingIds = new Set(moving.map((c) => c.colId));
  return {
    visible: omit(state.visible, movingIds),
    available: [...state.available, ...moving],
  };
}

/**
 * Reorder `visible` by relocating the `ids` block (a single item or a
 * multi-selection) relative to `overColId`. When dragging downward the block
 * lands after the target; upward, before it. Relative order within the moved
 * block is preserved. Dropping onto a member of the block is a no-op.
 */
export function reorderVisible(
  state: ColumnSelectorState,
  ids: readonly string[],
  activeColId: string,
  overColId: string,
): ColumnSelectorState {
  const idSet = new Set(ids);
  if (idSet.size === 0 || idSet.has(overColId)) return state;

  const fromIndex = state.visible.findIndex((c) => c.colId === activeColId);
  const overIndex = state.visible.findIndex((c) => c.colId === overColId);
  if (fromIndex === -1 || overIndex === -1) return state;
  const movingDown = fromIndex < overIndex;

  const moving = pick(state.visible, idSet);
  const remaining = omit(state.visible, idSet);
  const overPos = remaining.findIndex((c) => c.colId === overColId);
  if (overPos === -1) return state;
  const insertAt = movingDown ? overPos + 1 : overPos;

  const next = [...remaining.slice(0, insertAt), ...moving, ...remaining.slice(insertAt)];
  return { ...state, visible: next };
}

/** Case-insensitive substring filter over headerName + colId. */
export function filterItems(items: readonly ColumnItem[], query: string): ColumnItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...items];
  return items.filter(
    (c) => c.headerName.toLowerCase().includes(q) || c.colId.toLowerCase().includes(q),
  );
}

/**
 * Produce the AG-Grid `applyColumnState` payload: visible columns first (shown,
 * in order), then available columns (hidden, in order).
 */
export function computeColumnState(state: ColumnSelectorState): ColumnStateEntry[] {
  return [
    ...state.visible.map((c) => ({ colId: c.colId, hide: false })),
    ...state.available.map((c) => ({ colId: c.colId, hide: true })),
  ];
}
