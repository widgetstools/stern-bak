/**
 * The DRAFT of a dashboard's arrangement while someone rearranges it.
 *
 * `ReportCanvas` draws a spec; the dock manager owns dragging, splitting,
 * resizing and floating. What is left — and what belongs here — is the
 * question neither of them answers: when has the arrangement actually CHANGED,
 * and what should be written when it is saved.
 *
 * That question is the whole reason this file exists. The dock reports state
 * on mount, on every re-measure and on each frame of a drag. Treating any of
 * those as an edit would light up the save control on a dashboard nobody
 * touched, and a save prompt that appears on its own teaches people to ignore
 * it.
 *
 * **The draft is never written back on its own.** An arrangement is a proposal
 * until someone saves it: a panel nudged by accident must not silently rewrite
 * a dashboard other people open. `dirty` drives the save and undo affordances,
 * and `reset` throws the draft away — remounting the dock on the saved layout,
 * which is the only way to put a dock manager back where it was.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import type { ReportSpec } from '@wellsfargo-starui/data';
import { deserialize, serialize, type DockManagerState } from '@widgetstools/dock-manager-core';
import { buildDockState } from './dockLayout';

export interface LayoutEditing {
  /** The arrangement to mount. Restored from the spec, or derived from it. */
  initialState: DockManagerState;
  /**
   * Changes identity only when the dock must be REMOUNTED — on undo, or when
   * the saved layout itself changed. Used as the dock's React key, because a
   * dock manager cannot be driven back to a previous layout by props.
   */
  mountKey: number;
  /** True when the arrangement differs from the one that was last saved. */
  dirty: boolean;
  /** Hand back what the dock reported. A no-op change stays a no-op. */
  applyState: (next: DockManagerState) => void;
  /** Throw the draft away and remount on the saved arrangement. */
  reset: () => void;
  /** The layout to persist, or `null` when nothing has changed. */
  pending: string | null;
  /** Called after a successful save so the draft becomes the new baseline. */
  commit: () => void;
}

/** Serializing throws on a state the dock considers malformed; a layout we
 *  cannot describe is one we must not save. */
function safeSerialize(state: DockManagerState): string | null {
  try {
    return serialize(state);
  } catch (err) {
    console.warn('[dashboard] could not serialize the layout; not offering to save it:', err);
    return null;
  }
}

export function useLayoutEditing(spec: ReportSpec | null, editable = true): LayoutEditing {
  const blocks = useMemo(() => spec?.blocks ?? [], [spec]);
  const savedDock = spec?.dock;

  /**
   * The arrangement to mount: the saved one when there is a usable one, else
   * derived from the blocks' regions.
   *
   * A saved layout is handed to the dock as-is rather than merged with a
   * derived one. It was written by this same dock from a state it produced, so
   * it is already complete — and `deserialize` reports its own warnings, which
   * is a better check than anything reconstructed here would be.
   */
  const [mountKey, setMountKey] = useState(0);
  const initialState = useMemo(() => {
    if (savedDock) {
      try {
        const { state, warnings } = deserialize(savedDock);
        if (warnings.length > 0) console.warn('[dashboard] saved layout restored with warnings:', warnings);
        return state;
      } catch (err) {
        console.warn('[dashboard] saved layout could not be restored; arranging from the spec instead:', err);
      }
    }
    return buildDockState(blocks, { editable });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mountKey forces a rebuild on undo
  }, [blocks, savedDock, editable, mountKey]);

  // The arrangement the draft is measured against. It moves on SAVE, not on
  // every spec change, so a re-render from live data cannot silently clear
  // dirty and lose someone's unsaved work.
  const [baseline, setBaseline] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);

  // What the dock was last mounted with. A state report echoing this back —
  // which is exactly what mounting and re-measuring produce — is not an edit.
  const mounted = useRef<string | null>(null);
  mounted.current = useMemo(() => safeSerialize(initialState), [initialState]);

  const applyState = useCallback((next: DockManagerState) => {
    const incoming = safeSerialize(next);
    if (incoming === null || incoming === mounted.current) return;
    setDraft((prev) => (prev === incoming ? prev : incoming));
  }, []);

  const dirty = draft !== null && draft !== (baseline ?? mounted.current);

  const reset = useCallback(() => {
    setDraft(null);
    // A dock manager has no "go back" — the layout lives inside it. Bumping
    // the key remounts it on the saved arrangement, which is the undo.
    setMountKey((n) => n + 1);
  }, []);

  const commit = useCallback(() => {
    setDraft((current) => {
      if (current) setBaseline(current);
      return current;
    });
  }, []);

  return {
    initialState,
    mountKey,
    dirty,
    applyState,
    reset,
    pending: dirty ? draft : null,
    commit,
  };
}
