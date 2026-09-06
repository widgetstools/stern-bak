/**
 * Dragging and resizing dashboard blocks, kept out of the renderer.
 *
 * `ReportCanvas` draws a spec. This owns the DRAFT of that spec while someone
 * rearranges it, so the canvas stays a function of whatever blocks it is
 * handed and the editing rules live in one testable place.
 *
 * Two deliberate choices:
 *
 * **Native HTML5 drag, not a library.** Reordering a dozen cards needs
 * `draggable` + three handlers; a drag-and-drop dependency would ship to every
 * consumer of this app for that. Resizing uses pointer events for the same
 * reason — and because pointer capture keeps a drag working when the cursor
 * leaves the element, which mouse events do not.
 *
 * **The draft is never written back on its own.** A layout change is a
 * proposal until someone saves it: dragging a card by accident must not
 * silently rewrite a dashboard other people open. `dirty` drives the save and
 * undo affordances, and `reset` throws the draft away.
 */
import { useCallback, useMemo, useState } from 'react';
import type { ReportBlock, ReportSpec } from '@wellsfargo-starui/data';

export type BlockRegion = 'left' | 'main' | 'right';

/** Bounds a resize. Below the floor a block shows nothing; above the ceiling
 *  it is taller than any screen and pushes everything else out of view. */
export const MIN_BLOCK_HEIGHT = 120;
export const MAX_BLOCK_HEIGHT = 900;

export function clampHeight(px: number): number {
  return Math.max(MIN_BLOCK_HEIGHT, Math.min(MAX_BLOCK_HEIGHT, Math.round(px)));
}

export interface LayoutEditing {
  /** The blocks as currently arranged — the spec's, or the draft's. */
  blocks: ReportBlock[];
  /** True when the draft differs from the spec it started from. */
  dirty: boolean;
  /** Move the block at `from` to sit at `to`, optionally changing its region. */
  move: (from: number, to: number, region?: BlockRegion) => void;
  /** Set one block's height in px, clamped. */
  resize: (index: number, height: number) => void;
  /** Throw the draft away and go back to the saved layout. */
  reset: () => void;
  /** The blocks to persist, or `null` when nothing has changed. */
  pending: ReportBlock[] | null;
  /** Called after a successful save so the draft becomes the new baseline. */
  commit: () => void;
}

/**
 * Only layout fields are compared. A live dashboard's DATA changes constantly;
 * `dirty` must mean "someone moved something", not "a number ticked".
 */
function layoutSignature(blocks: readonly ReportBlock[]): string {
  return blocks
    .map((b) => `${b.kind}:${b.region ?? 'main'}:${(b as { height?: number }).height ?? ''}:${b.title ?? ''}`)
    .join('|');
}

export function useLayoutEditing(spec: ReportSpec | null): LayoutEditing {
  const [draft, setDraft] = useState<ReportBlock[] | null>(null);
  // The layout the draft is measured against. It moves on save, not on every
  // spec change, so a re-render from live data does not silently clear dirty.
  const [baseline, setBaseline] = useState<string | null>(null);

  const specBlocks = useMemo(() => spec?.blocks ?? [], [spec]);
  const blocks = draft ?? specBlocks;

  const dirty = useMemo(() => {
    if (!draft) return false;
    return layoutSignature(draft) !== (baseline ?? layoutSignature(specBlocks));
  }, [draft, baseline, specBlocks]);

  const move = useCallback(
    (from: number, to: number, region?: BlockRegion) => {
      setDraft((prev) => {
        const current = prev ?? specBlocks;
        if (from < 0 || from >= current.length) return prev;
        const next = [...current];
        const [moved] = next.splice(from, 1);
        // Dropping a card into a different rail is a region change as well as
        // a reorder — the two are one gesture, so they are one operation.
        const placed = region && region !== (moved.region ?? 'main') ? { ...moved, region } : moved;
        next.splice(Math.max(0, Math.min(next.length, to)), 0, placed);
        return next;
      });
    },
    [specBlocks],
  );

  const resize = useCallback(
    (index: number, height: number) => {
      setDraft((prev) => {
        const current = prev ?? specBlocks;
        if (index < 0 || index >= current.length) return prev;
        const next = [...current];
        next[index] = { ...next[index], height: clampHeight(height) } as ReportBlock;
        return next;
      });
    },
    [specBlocks],
  );

  const reset = useCallback(() => setDraft(null), []);

  const commit = useCallback(() => {
    setDraft((current) => {
      if (current) setBaseline(layoutSignature(current));
      return current;
    });
  }, []);

  return { blocks, dirty, move, resize, reset, pending: dirty ? blocks : null, commit };
}
