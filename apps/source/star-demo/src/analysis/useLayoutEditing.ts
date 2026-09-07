/**
 * The DRAFT of a dashboard's arrangement while someone rearranges it.
 *
 * `ReportCanvas` draws a spec; react-grid-layout owns the dragging, resizing,
 * collision and compaction. What is left — and what belongs here — is the
 * question neither of them answers: when has the arrangement actually CHANGED,
 * and what should be written when it is saved.
 *
 * That question is the whole reason this file still exists after the engine
 * arrived. RGL emits `onLayoutChange` constantly: on mount, on every
 * breakpoint switch, on each frame of a drag. Treating any of those as an edit
 * would light up the save control on a dashboard nobody touched, and a save
 * prompt that appears on its own teaches people to ignore it.
 *
 * **The draft is never written back on its own.** An arrangement is a proposal
 * until someone saves it: a block nudged by accident must not silently rewrite
 * a dashboard other people open. `dirty` drives the save and undo affordances,
 * and `reset` throws the draft away.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import type { ReportBlock, ReportSpec } from '@wellsfargo-starui/data';
import { applyLayoutToBlocks, deriveLayout, layoutSignature } from './autoLayout';

export type GridLayoutItem = { i: string; x: number; y: number; w: number; h: number };

export interface LayoutEditing {
  /** The blocks as currently arranged — the spec's, or the draft's. */
  blocks: ReportBlock[];
  /** Their grid positions, derived for any block never placed by hand. */
  layout: GridLayoutItem[];
  /** True when the arrangement differs from the one that was last saved. */
  dirty: boolean;
  /** Hand back what the engine produced. A no-op change stays a no-op. */
  applyLayout: (next: readonly GridLayoutItem[]) => void;
  /** Throw the draft away and go back to the saved arrangement. */
  reset: () => void;
  /** The blocks to persist, or `null` when nothing has changed. */
  pending: ReportBlock[] | null;
  /** Called after a successful save so the draft becomes the new baseline. */
  commit: () => void;
}

export function useLayoutEditing(spec: ReportSpec | null): LayoutEditing {
  const [draft, setDraft] = useState<ReportBlock[] | null>(null);
  // The arrangement the draft is measured against. It moves on SAVE, not on
  // every spec change, so a re-render from live data cannot silently clear
  // dirty and lose someone's unsaved work.
  const [baseline, setBaseline] = useState<string | null>(null);

  const specBlocks = useMemo(() => spec?.blocks ?? [], [spec]);
  const blocks = draft ?? specBlocks;
  const layout = useMemo(() => deriveLayout(blocks), [blocks]);

  // What the engine was last given. An `onLayoutChange` echoing this back —
  // which is exactly what mounting and re-measuring produce — is not an edit.
  const rendered = useRef<string>('');
  rendered.current = layoutSignature(layout);

  const savedSignature = useMemo(() => layoutSignature(deriveLayout(specBlocks)), [specBlocks]);

  const applyLayout = useCallback(
    (next: readonly GridLayoutItem[]) => {
      const incoming = layoutSignature(next);
      if (incoming === rendered.current) return;
      setDraft((prev) => applyLayoutToBlocks(prev ?? specBlocks, next));
    },
    [specBlocks],
  );

  const dirty = useMemo(() => {
    if (!draft) return false;
    return layoutSignature(deriveLayout(draft)) !== (baseline ?? savedSignature);
  }, [draft, baseline, savedSignature]);

  const reset = useCallback(() => setDraft(null), []);

  const commit = useCallback(() => {
    setDraft((current) => {
      if (current) setBaseline(layoutSignature(deriveLayout(current)));
      return current;
    });
  }, []);

  return { blocks, layout, dirty, applyLayout, reset, pending: dirty ? blocks : null, commit };
}
