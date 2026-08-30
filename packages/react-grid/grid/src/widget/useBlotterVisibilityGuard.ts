/**
 * Guards an AG-Grid instance against a documented AG-Grid + dock-manager
 * failure mode: when a dock panel's tab is inactive, the dock collapses its
 * container to zero width — and AG-Grid, unable to measure a viewport at
 * zero width, abandons column virtualisation and synchronously renders
 * EVERY column instead of just the visible ones. On a wide grid this has
 * been measured (in a sibling app using this same dock library) as a ~15x
 * slower render, landing exactly on the tab-click that triggers it — which
 * is what makes it read as "the UI froze."
 *
 * `BlotterDock`'s blotter panel is `dockable: false` (it can't be dragged
 * OUT of its group) but summary widgets are freely dockable and CAN be
 * dropped directly onto the blotter's own tab, sharing its group — so a
 * hidden-blotter scenario is reachable, not just hypothetical, and this
 * guard costs nothing when it never happens (the common case: the blotter
 * stays alone in its group).
 *
 * The fix, same shape as the reference writeup: unmount AG-Grid BEFORE the
 * dock collapses its container (a `pointerdown` listener in the capture
 * phase, synchronously flushed — reacting to the visibility change itself
 * is too late, the expensive render has already run by then), and remount
 * once the panel is actually visible again (a `ResizeObserver`, which fires
 * on any gesture that lands the panel at non-zero width, regardless of
 * which internal events the dock library uses for that gesture). Column
 * state, filter model, and scroll position are captured on teardown and
 * restored via `restoreState` once the new instance is ready, so a hide/show
 * cycle doesn't reset the user's view.
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { flushSync } from 'react-dom';
import type { GridApi, ColumnState, FilterModel } from 'ag-grid-community';

interface SavedGridViewState {
  columnState: ColumnState[];
  filterModel: FilterModel;
  firstRow: number;
}

export interface BlotterVisibilityGuard {
  /** Whether the grid should be mounted right now. */
  isMounted: boolean;
  /** Attach to the panel's own root element — the ResizeObserver target that
   *  detects the panel becoming visible again. */
  containerRef: RefObject<HTMLDivElement | null>;
  /** Call from `onGridReady` after a remount to reapply whatever was saved
   *  at teardown. A no-op on the very first mount (nothing saved yet). */
  restoreState: (api: GridApi) => void;
}

export function useBlotterVisibilityGuard(
  panelId: string,
  getApi: () => GridApi | null,
): BlotterVisibilityGuard {
  const [isMounted, setIsMounted] = useState(true);
  const savedStateRef = useRef<SavedGridViewState | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const tabClickAtRef = useRef<number | null>(null);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      const clickedTab = target?.closest('.dock-tab');
      if (!clickedTab) return;
      // Already this panel's own tab — it isn't about to be hidden.
      if (clickedTab.getAttribute('data-tab-id') === panelId) return;
      const group = clickedTab.closest('.dock-tab-group');
      // The clicked tab has to belong to a group THIS panel's tab is also
      // in — a click anywhere else in the dock is none of this guard's
      // business.
      if (!group?.querySelector(`[data-tab-id="${panelId}"]`)) return;

      const api = getApi();
      if (api) {
        try {
          savedStateRef.current = {
            columnState: api.getColumnState(),
            filterModel: api.getFilterModel(),
            firstRow: api.getFirstDisplayedRowIndex(),
          };
        } catch {
          // Best-effort — a mid-teardown API call throwing shouldn't block
          // the unmount that's about to save this render from itself.
          savedStateRef.current = null;
        }
      }
      // Synchronous: the dock's own click handling (which collapses this
      // panel's container) must see the grid already gone, not scheduled
      // to go — that ordering is the entire point of the capture phase +
      // flushSync combination.
      tabClickAtRef.current = performance.now();
      flushSync(() => setIsMounted(false));
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [panelId, getApi]);

  useEffect(() => {
    if (isMounted) return;
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      if ((entries[0]?.contentRect.width ?? 0) > 0) setIsMounted(true);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [isMounted]);

  // Canary: log click→painted latency for every teardown/remount cycle.
  // Deliberately always-on (it only fires on the rare hide/show gesture) —
  // this whole guard silently stops working if a dock-library upgrade
  // renames `.dock-tab` / `.dock-tab-group`, and the disappearance of this
  // console line is the earliest observable symptom. The double-rAF lands
  // the measurement after the browser has actually painted the remounted
  // grid, so the number is what the user felt, not what React committed.
  useEffect(() => {
    if (!isMounted) return;
    const clickedAt = tabClickAtRef.current;
    if (clickedAt === null) return;
    tabClickAtRef.current = null;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        // eslint-disable-next-line no-console
        console.log(`[blotter-dock] tab click→painted ${(performance.now() - clickedAt).toFixed(0)}ms`);
      }),
    );
  }, [isMounted]);

  const restoreState = useCallback((api: GridApi) => {
    const saved = savedStateRef.current;
    if (!saved) return;
    api.applyColumnState({ state: saved.columnState, applyOrder: true });
    api.setFilterModel(saved.filterModel);
    api.ensureIndexVisible(saved.firstRow, 'top');
  }, []);

  return { isMounted, containerRef, restoreState };
}
