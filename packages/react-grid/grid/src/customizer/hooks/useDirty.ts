import { useCallback, useMemo, useSyncExternalStore } from 'react';
import type { IDirtyBus } from '@wellsfargo-starui/engine';
import { useGridPlatform } from './GridProvider';

/**
 * React binding for the per-platform `DirtyBus`. Scoped to the current
 * `GridPlatform` so dirty state never bleeds between two grids on the
 * same page — the bug v2 had with `window.dispatchEvent('gc-dirty-change')`.
 *
 * Two call shapes, both safe under concurrent rendering:
 *
 *   // 1. Aggregate read — "is ANY key dirty?"
 *   //    Used by the settings sheet's `DIRTY=NN` counter.
 *   const anyDirty = useDirty();                  // boolean
 *
 *   // 2. Per-key read + setter — used by per-card LEDs + draft saves.
 *   const { isDirty, set } = useDirty('cs:rule-abc');
 */
export function useDirty(): boolean;
export function useDirty(key: string): DirtyHandle;
export function useDirty(key?: string): boolean | DirtyHandle {
  const platform = useGridPlatform();
  const bus: IDirtyBus = platform.resources.dirty();

  const subscribe = useCallback((fn: () => void) => bus.subscribe(fn), [bus]);
  const getSnapshot = useCallback(() => {
    return key === undefined ? bus.count() > 0 : bus.isDirty(key);
  }, [bus, key]);

  const value = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // The per-key setter is deliberately stable per (bus, key) so passing it
  // through memoized children doesn't re-render.
  const set = useCallback(
    (dirty: boolean) => {
      if (key === undefined) return;
      bus.set(key, dirty);
    },
    [bus, key],
  );

  // Return shape depends on the call form. The hook sequence is identical
  // in both cases (useCallback × 2 + useSyncExternalStore × 1 + useCallback
  // × 1 + useMemo × 1) — only the packaging differs — so this is safe
  // under the Rules of Hooks.
  return useMemo<boolean | DirtyHandle>(
    () =>
      key === undefined
        ? (value as boolean)
        : { isDirty: value as boolean, set },
    [key, value, set],
  );
}

export interface DirtyHandle {
  isDirty: boolean;
  set: (dirty: boolean) => void;
}

/**
 * Count-flavoured companion — reads the number of currently-dirty keys
 * on the per-platform DirtyBus. Subscribes via `useSyncExternalStore`
 * so the reading stays tear-free under concurrent rendering. Used by
 * the settings-sheet header to render `DIRTY=NN`.
 */
export function useDirtyCount(): number {
  const platform = useGridPlatform();
  const bus: IDirtyBus = platform.resources.dirty();
  const subscribe = useCallback((fn: () => void) => bus.subscribe(fn), [bus]);
  const getSnapshot = useCallback(() => bus.count(), [bus]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
