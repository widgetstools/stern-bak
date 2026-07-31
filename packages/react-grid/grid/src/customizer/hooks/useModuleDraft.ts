import { useCallback, useEffect, useRef, useState } from 'react';
import { useGridPlatform } from './GridProvider';
import { useModuleState } from './useModuleState';
import { useDirty } from './useDirty';

/**
 * Per-card draft hook.
 *
 * Shape:
 *   - No `store` arg — reads the platform via `useGridPlatform` context.
 *   - Integrates with the per-platform `DirtyBus`, so the settings-sheet
 *     DIRTY=NN counter and per-card LEDs stay in sync automatically. No
 *     `window.dispatchEvent` bus.
 *   - The dirty-bus key is derived from `moduleId + itemId` so drafts
 *     across panels never collide.
 *
 * Shape — "pick one item from a module's state, edit it locally, commit
 * on Save":
 *
 *   const { draft, setDraft, dirty, save, discard, missing } =
 *     useModuleDraft<RuleState, Rule>({
 *       moduleId: 'conditional-styling',
 *       itemId: rule.id,
 *       selectItem: (s) => s.rules.find((r) => r.id === rule.id),
 *       commitItem: (next) => (s) => ({
 *         ...s,
 *         rules: s.rules.map((r) => (r.id === next.id ? next : r)),
 *       }),
 *     });
 */
export interface UseModuleDraftOptions<TState, TItem> {
  readonly moduleId: string;
  /** Stable identifier for the item inside the module's state. Used as
   *  the dirty-bus key so the settings sheet's DIRTY counter is accurate. */
  readonly itemId: string;
  /** Extract the item we're editing. May return `undefined` if the item
   *  was deleted elsewhere (the `missing` flag surfaces this). */
  readonly selectItem: (state: TState) => TItem | undefined;
  /** Build the module-state reducer that commits the edited draft. */
  readonly commitItem: (next: TItem) => (state: TState) => TState;
  /** Custom deep-equality. Defaults to JSON.stringify compare — good
   *  enough for POJO module items. */
  readonly isEqual?: (a: TItem, b: TItem) => boolean;
}

export interface UseModuleDraftResult<TItem> {
  /** The currently-edited draft. Always defined when the item exists. */
  readonly draft: TItem;
  /** Patch the draft — shallow merge (object form) or functional update. */
  readonly setDraft: (patch: Partial<TItem> | ((prev: TItem) => TItem)) => void;
  /** True when draft differs from the committed upstream value. */
  readonly dirty: boolean;
  /** Commit the draft into module state. The upstream auto-save picks
   *  this up on its regular debounce. */
  readonly save: () => void;
  /** Revert the draft to the current committed value. */
  readonly discard: () => void;
  /** The item no longer exists in module state (deleted elsewhere). */
  readonly missing: boolean;
}

function jsonEqual<T>(a: T, b: T): boolean {
  try { return JSON.stringify(a) === JSON.stringify(b); }
  catch { return a === b; }
}

export function useModuleDraft<TState, TItem>({
  moduleId,
  itemId,
  selectItem,
  commitItem,
  isEqual = jsonEqual,
}: UseModuleDraftOptions<TState, TItem>): UseModuleDraftResult<TItem> {
  const platform = useGridPlatform();
  const [moduleState, setModuleState] = useModuleState<TState>(moduleId);
  const committed = selectItem(moduleState);

  // Local draft — never null; falls back to the last known committed value
  // when the upstream briefly disappears (e.g. mid-delete).
  const [draft, setDraftState] = useState<TItem | undefined>(committed);
  const committedRef = useRef<TItem | undefined>(committed);

  // Dirty key scoped to (moduleId, itemId) so drafts never collide.
  const dirtyKey = `${moduleId}:${itemId}`;
  const { set: setDirtyBus } = useDirty(dirtyKey);

  const dirty =
    draft !== undefined && committed !== undefined && !isEqual(draft, committed);

  // Keep the DirtyBus in sync. Pushing on every render is correct
  // because `bus.set` coalesces — it only notifies when the value
  // actually flips.
  useEffect(() => {
    setDirtyBus(dirty);
  }, [dirty, setDirtyBus]);

  // When the platform tears down the dirty bus resets itself; this effect
  // just clears the key on component unmount.
  useEffect(() => {
    return () => { setDirtyBus(false); };
  }, [setDirtyBus]);

  // Re-seed the draft when upstream changes AND we're clean — so a
  // rename from another surface doesn't silently stomp our edits.
  useEffect(() => {
    if (committed === undefined) {
      committedRef.current = undefined;
      return;
    }
    const prev = committedRef.current;
    committedRef.current = committed;

    if (draft === undefined) {
      setDraftState(committed);
      return;
    }

    const wasClean = prev !== undefined && isEqual(prev, draft);
    const committedChanged = prev === undefined || !isEqual(prev, committed);
    if (wasClean && committedChanged) setDraftState(committed);
    // Reason: this effect's job is to detect external `committed` mutations
    // and reset the draft when the user hadn't been editing. Listing
    // `draft` and `prev` would re-fire on every keystroke and could clobber
    // mid-edit state. Only the committed-side change is the real trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [committed]);

  const setDraft = useCallback<UseModuleDraftResult<TItem>['setDraft']>(
    (patch) => {
      setDraftState((prev) => {
        if (prev === undefined) return prev;
        if (typeof patch === 'function') return (patch as (p: TItem) => TItem)(prev);
        return { ...prev, ...patch };
      });
    },
    [],
  );

  const save = useCallback(() => {
    if (draft === undefined) return;
    setModuleState(commitItem(draft));
    // A per-card Save persists the active profile. Module state is
    // explicit-save-only (auto-save is disabled on the markets-grid host),
    // so without this the commit would sit in memory until the user also
    // clicked the grid's main Save — every customizer panel's own "Save"
    // looked like it persisted but didn't. The host controller listens for
    // this event and runs its canonical save (capture live grid state →
    // saveActiveProfile). `setModuleState` writes the store synchronously,
    // so the host's `serializeAll()` already sees this commit.
    platform.events.emit('settings:save-requested', { gridId: platform.gridId });
  }, [draft, commitItem, setModuleState, platform]);

  const discard = useCallback(() => {
    if (committedRef.current !== undefined) setDraftState(committedRef.current);
  }, []);

  return {
    draft: (draft ?? committed) as TItem,
    setDraft,
    dirty,
    save,
    discard,
    missing: committed === undefined,
  };
}
