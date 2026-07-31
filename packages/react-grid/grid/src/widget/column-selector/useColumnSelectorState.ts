/**
 * useColumnSelectorState — React state for the Column Selector dialog. Owns the
 * draft lists, per-list search + multi-selection, and the transfer / reorder /
 * apply handlers. All list mutations delegate to the pure `columnSelectorModel`;
 * all AG-Grid access goes through `gridColumnAdapter`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GridApi } from 'ag-grid-community';
import {
  buildInitialState,
  filterItems,
  moveToAvailable,
  moveToVisible,
  reorderVisible,
  type ColumnItem,
  type ColumnSelectorState,
} from './columnSelectorModel';
import { applyColumnSelection, readGridColumns } from './gridColumnAdapter';

/** Modifier flags from a pointer/keyboard event used for multi-selection. */
export interface SelectModifiers {
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
}

/** Per-list controller consumed by `ColumnList`. */
export interface ColumnListController {
  readonly items: readonly ColumnItem[];
  readonly filtered: readonly ColumnItem[];
  readonly query: string;
  readonly setQuery: (q: string) => void;
  readonly selected: ReadonlySet<string>;
  readonly onItemClick: (colId: string, mods: SelectModifiers) => void;
  readonly onItemDoubleClick: (colId: string) => void;
  /** Reorder allowed only when no search filter is narrowing the list. */
  readonly canReorder: boolean;
}

export interface UseColumnSelectorState {
  readonly available: ColumnListController;
  readonly visible: ColumnListController;
  readonly addSelected: () => void;
  readonly removeSelected: () => void;
  readonly addAll: () => void;
  readonly removeAll: () => void;
  readonly canAdd: boolean;
  readonly canRemove: boolean;
  readonly canAddAll: boolean;
  readonly canRemoveAll: boolean;
  readonly reorder: (activeColId: string, overColId: string) => void;
  readonly apply: () => void;
}

const EMPTY: ColumnSelectorState = { visible: [], available: [] };

/** Resolve a click into the next selection set, honouring modifier keys. */
function nextSelection(
  filtered: readonly ColumnItem[],
  current: ReadonlySet<string>,
  anchor: string | null,
  colId: string,
  mods: SelectModifiers,
): Set<string> {
  if (mods.shiftKey && anchor) {
    const order = filtered.map((c) => c.colId);
    const a = order.indexOf(anchor);
    const b = order.indexOf(colId);
    if (a !== -1 && b !== -1) {
      const [lo, hi] = a < b ? [a, b] : [b, a];
      return new Set(order.slice(lo, hi + 1));
    }
  }
  if (mods.metaKey || mods.ctrlKey) {
    const next = new Set(current);
    if (next.has(colId)) next.delete(colId);
    else next.add(colId);
    return next;
  }
  return new Set([colId]);
}

export function useColumnSelectorState(api: GridApi | null, open: boolean): UseColumnSelectorState {
  const [state, setState] = useState<ColumnSelectorState>(EMPTY);
  const [availableSel, setAvailableSel] = useState<ReadonlySet<string>>(new Set());
  const [visibleSel, setVisibleSel] = useState<ReadonlySet<string>>(new Set());
  const [availableQuery, setAvailableQuery] = useState('');
  const [visibleQuery, setVisibleQuery] = useState('');
  const availableAnchor = useRef<string | null>(null);
  const visibleAnchor = useRef<string | null>(null);
  const wasOpen = useRef(false);

  // Seed the draft from the live grid each time the dialog opens.
  useEffect(() => {
    if (open && !wasOpen.current) {
      setState(api ? buildInitialState(readGridColumns(api)) : EMPTY);
      setAvailableSel(new Set());
      setVisibleSel(new Set());
      setAvailableQuery('');
      setVisibleQuery('');
      availableAnchor.current = null;
      visibleAnchor.current = null;
    }
    wasOpen.current = open;
  }, [open, api]);

  const availableFiltered = useMemo(
    () => filterItems(state.available, availableQuery),
    [state.available, availableQuery],
  );
  const visibleFiltered = useMemo(
    () => filterItems(state.visible, visibleQuery),
    [state.visible, visibleQuery],
  );

  const onAvailableClick = useCallback(
    (colId: string, mods: SelectModifiers) => {
      setAvailableSel((cur) => nextSelection(availableFiltered, cur, availableAnchor.current, colId, mods));
      availableAnchor.current = colId;
    },
    [availableFiltered],
  );
  const onVisibleClick = useCallback(
    (colId: string, mods: SelectModifiers) => {
      setVisibleSel((cur) => nextSelection(visibleFiltered, cur, visibleAnchor.current, colId, mods));
      visibleAnchor.current = colId;
    },
    [visibleFiltered],
  );

  const clearSelections = useCallback(() => {
    setAvailableSel(new Set());
    setVisibleSel(new Set());
  }, []);

  const addIds = useCallback(
    (idList: readonly string[]) => {
      if (idList.length === 0) return;
      setState((s) => moveToVisible(s, idList));
      clearSelections();
    },
    [clearSelections],
  );
  const removeIds = useCallback(
    (idList: readonly string[]) => {
      if (idList.length === 0) return;
      setState((s) => moveToAvailable(s, idList));
      clearSelections();
    },
    [clearSelections],
  );

  const addSelected = useCallback(() => addIds([...availableSel]), [addIds, availableSel]);
  const removeSelected = useCallback(() => removeIds([...visibleSel]), [removeIds, visibleSel]);
  const addAll = useCallback(
    () => addIds(availableFiltered.map((c) => c.colId)),
    [addIds, availableFiltered],
  );
  const removeAll = useCallback(
    () => removeIds(visibleFiltered.map((c) => c.colId)),
    [removeIds, visibleFiltered],
  );

  const onAvailableDouble = useCallback((colId: string) => addIds([colId]), [addIds]);
  const onVisibleDouble = useCallback((colId: string) => removeIds([colId]), [removeIds]);

  const reorder = useCallback(
    (activeColId: string, overColId: string) => {
      setState((s) => {
        const ids = visibleSel.has(activeColId) && visibleSel.size > 1
          ? s.visible.filter((c) => visibleSel.has(c.colId)).map((c) => c.colId)
          : [activeColId];
        return reorderVisible(s, ids, activeColId, overColId);
      });
    },
    [visibleSel],
  );

  const apply = useCallback(() => {
    if (api) applyColumnSelection(api, state);
  }, [api, state]);

  const canReorderVisible = visibleQuery.trim() === '';
  const removableVisible = useMemo(
    () => state.visible.some((c) => !c.locked),
    [state.visible],
  );
  const hasRemovableSelected = useMemo(
    () => [...visibleSel].some((id) => state.visible.find((c) => c.colId === id && !c.locked)),
    [visibleSel, state.visible],
  );

  return {
    available: {
      items: state.available,
      filtered: availableFiltered,
      query: availableQuery,
      setQuery: setAvailableQuery,
      selected: availableSel,
      onItemClick: onAvailableClick,
      onItemDoubleClick: onAvailableDouble,
      canReorder: false,
    },
    visible: {
      items: state.visible,
      filtered: visibleFiltered,
      query: visibleQuery,
      setQuery: setVisibleQuery,
      selected: visibleSel,
      onItemClick: onVisibleClick,
      onItemDoubleClick: onVisibleDouble,
      canReorder: canReorderVisible,
    },
    addSelected,
    removeSelected,
    addAll,
    removeAll,
    canAdd: availableSel.size > 0,
    canRemove: hasRemovableSelected,
    canAddAll: availableFiltered.length > 0,
    canRemoveAll: removableVisible && visibleFiltered.length > 0,
    reorder,
    apply,
  };
}
