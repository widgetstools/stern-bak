/**
 * Selection arithmetic for AG Grid's hierarchical (groupSelects) server-side
 * selection state.
 *
 * With `groupSelects` set, `getServerSideSelectionState()` returns a TREE —
 * `{ selectAllChildren, toggledNodes: [...] }` — not the flat
 * `{ selectAll, toggledNodes: string[] }`. AG Grid's own serializer
 * (verified in the installed 36.1 bundle) gives a toggled entry the meaning
 * "opposite of my parent's state": an entry's own state is
 * `selectAllChildren ?? !parentSelected`, and leaf entries carry `nodeId`
 * only. Counting therefore needs each toggled GROUP's leaf population —
 * which the engine already puts on every loaded group row as `__count` —
 * and each toggled leaf counts as one.
 *
 * Everything here returns `null` for "unknowable" (a toggled group's row is
 * not loaded, no grouping to resolve ids against) so callers fall back to
 * the loaded-node walk instead of presenting a wrong number as a count.
 */
import type { GridApi } from 'ag-grid-community';

export interface SsrmGroupSelectionNode {
  nodeId?: string;
  selectAllChildren?: boolean;
  toggledNodes?: SsrmGroupSelectionNode[];
}

/** Flat state has `selectAll`; the group tree never does. */
export function isGroupSelectionState(state: unknown): state is SsrmGroupSelectionNode {
  if (!state || typeof state !== 'object' || 'selectAll' in state) return false;
  const s = state as SsrmGroupSelectionNode;
  return typeof s.selectAllChildren === 'boolean' || Array.isArray(s.toggledNodes);
}

/** Leaf rows under a node id, read from the loaded rows; `null` = not loaded. */
export type LeafCountLookup = (nodeId: string) => number | null;

type LookupApi = Partial<Pick<GridApi, 'forEachNode'>>;

/**
 * One `forEachNode` walk (AG Grid's `getRowNode` is a linear scan under
 * SSRM): group rows answer with their engine leaf count (`__count`), leaf
 * rows answer 1.
 */
export function leafCountLookupFromApi(api: LookupApi): LeafCountLookup {
  const counts = new Map<string, number>();
  try {
    api.forEachNode?.((node) => {
      if (typeof node.id !== 'string') return;
      if (node.group) {
        const count = (node.data as { __count?: unknown } | undefined)?.__count;
        if (typeof count === 'number') counts.set(node.id, count);
      } else if (node.data != null) {
        counts.set(node.id, 1);
      }
    });
  } catch {
    /* destroyed — every lookup misses and callers fall back */
  }
  return (nodeId) => counts.get(nodeId) ?? null;
}

/**
 * Leaf rows selected under a hierarchical selection state, or `null` when a
 * toggled node's population is unknown. `available` is the filtered total —
 * the population the root state selects over.
 */
export function countGroupSelection(
  state: SsrmGroupSelectionNode,
  available: number,
  leafCountOf: LeafCountLookup,
): number | null {
  const selectedUnder = (
    node: SsrmGroupSelectionNode,
    avail: number,
    parentSelected: boolean,
  ): number | null => {
    const self = node.selectAllChildren ?? !parentSelected;
    let selected = self ? avail : 0;
    for (const toggled of node.toggledNodes ?? []) {
      if (typeof toggled?.nodeId !== 'string') return null;
      const toggledAvail = leafCountOf(toggled.nodeId);
      if (toggledAvail == null) return null;
      const toggledSelected = selectedUnder(toggled, toggledAvail, self);
      if (toggledSelected == null) return null;
      // Under a selected parent a toggled child REMOVES its unselected
      // leaves; under a deselected parent it ADDS its selected ones.
      selected += self ? toggledSelected - toggledAvail : toggledSelected;
    }
    return Math.max(0, selected);
  };
  return selectedUnder(state, available, false);
}

/**
 * Filter FLAT drained rows (an export) by a hierarchical selection state.
 *
 * The state names nodes by their grouped-grid ids — `key` at level 0,
 * `level:parents:key` below (see `createSsrmGetRowId`) — while the export
 * drains flat rows, so each row's group chain is rebuilt from its own
 * values. Returns `null` when there is no grouping to resolve ids against.
 */
export function filterRowsByGroupSelection(
  rows: readonly Record<string, unknown>[],
  state: SsrmGroupSelectionNode,
  groupCols: readonly string[],
  leafIdOf: (row: Record<string, unknown>) => string,
): Record<string, unknown>[] | null {
  if (groupCols.length === 0) return null;
  const isSelected = (row: Record<string, unknown>): boolean => {
    const parts = groupCols.map((col) => String(row[col] ?? ''));
    let node: SsrmGroupSelectionNode | undefined = state;
    let selected = node.selectAllChildren ?? false;
    for (let level = 0; level < groupCols.length; level += 1) {
      const id = level === 0
        ? parts[0]
        : `${level}:${parts.slice(0, level).join('|')}:${parts[level]}`;
      const next: SsrmGroupSelectionNode | undefined =
        node?.toggledNodes?.find((t) => t.nodeId === id);
      if (!next) return selected;
      selected = next.selectAllChildren ?? !selected;
      node = next;
    }
    const leafId = `${groupCols.length}:${parts.join('|')}:${leafIdOf(row)}`;
    const leafToggle = node?.toggledNodes?.find((t) => t.nodeId === leafId);
    return leafToggle ? !selected : selected;
  };
  return rows.filter((row) => isSelected(row));
}
