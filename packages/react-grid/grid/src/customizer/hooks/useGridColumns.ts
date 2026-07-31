import { useMemo, useSyncExternalStore } from 'react';
import type { Column, GridApi } from 'ag-grid-community';
import { useGridPlatform } from './GridProvider';

/**
 * Minimal, stable-shaped snapshot of a grid column.
 *
 * Deliberately narrow — panels need the id + user-visible headerName +
 * a few flags. Anything richer (width / pinning / hide state) changes
 * on every drag and would trigger useless re-renders; panels that need
 * those subscribe via `useGridEvent('columnResized', ...)` directly.
 */
export interface GridColumnInfo {
  readonly colId: string;
  readonly headerName: string;
  readonly cellDataType: string | undefined;
}

/**
 * Returns the live list of grid columns, re-rendering only when the
 * column SET changes (add / remove / visibility) — NOT on width / pin
 * drags. Subscribes through AG-Grid events routed by the platform's
 * `ApiHub`, so listeners are disposed with the platform.
 *
 * Replaces each v2 panel's hand-rolled `setInterval` / raw
 * `api.addEventListener` wiring — the events / cleanup / coalescing all
 * live here.
 *
 * Snapshot identity is stable across renders when the column set is
 * unchanged: the returned array reference is cached on a monotonic
 * "column-set version" computed from the live api. This means React's
 * `useSyncExternalStore` short-circuits re-renders correctly.
 */
export function useGridColumns(options?: {
  /** Include AG-Grid internal columns (ids starting `ag-Grid-`).
   *  Default `false` — these aren't user-editable. */
  includeInternal?: boolean;
}): GridColumnInfo[] {
  const platform = useGridPlatform();
  const includeInternal = options?.includeInternal ?? false;

  // Single subscriber drives React; coalesces the 5 events that can
  // change the column SET into a single rerender tick.
  const subscribe = useMemo(
    () => (onChange: () => void) => {
      const disposers: Array<() => void> = [
        platform.api.onReady(() => onChange()),
        platform.api.on('columnEverythingChanged', onChange),
        platform.api.on('displayedColumnsChanged', onChange),
        platform.api.on('columnVisible', onChange),
      ];
      return () => disposers.forEach((d) => { try { d(); } catch { /* ok */ } });
    },
    [platform],
  );

  // getSnapshot returns a stable reference when content hasn't changed,
  // so React's useSyncExternalStore doesn't re-render spuriously. We
  // re-compute only when the api's column-set fingerprint changes.
  const getSnapshot = useMemo(() => makeStableGetter(platform, includeInternal), [platform, includeInternal]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Build a getSnapshot that returns the SAME array reference across calls
 * when the underlying column set hasn't changed. useSyncExternalStore
 * detects "no change" by ref-equality on the returned snapshot, so this
 * is how we avoid gratuitous re-renders when we fire the subscriber for
 * unrelated reasons (e.g. a panel re-mounts).
 */
function makeStableGetter(platform: { api: { api: GridApi | null } }, includeInternal: boolean) {
  let lastFingerprint = '';
  let lastResult: GridColumnInfo[] = [];
  return (): GridColumnInfo[] => {
    const api = platform.api.api;
    if (!api) return lastResult.length === 0 ? lastResult : [];
    let columns: Column[];
    try {
      columns = (api.getColumns() ?? []) as Column[];
    } catch {
      return lastResult;
    }

    // Fingerprint = joined colIds. Cheap; stable across width/pin drags.
    let fp = '';
    for (const c of columns) fp += c.getColId() + '|';
    if (fp === lastFingerprint) return lastResult;
    lastFingerprint = fp;

    lastResult = columns
      .filter((c) => includeInternal || !c.getColId().startsWith('ag-Grid-'))
      .map((c) => {
        const def = c.getColDef();
        const rawType = (def as { cellDataType?: unknown }).cellDataType;
        return {
          colId: c.getColId(),
          headerName: def.headerName ?? c.getColId(),
          cellDataType: typeof rawType === 'string' ? rawType : undefined,
        };
      });
    return lastResult;
  };
}
