import {
  applyForwardPatches,
  type CellPatch,
  type EditApplyResult,
  type EditJournal,
  type EditPlatform,
  type EditSource,
} from '@wellsfargo-starui/core';
import { submitAppliedEdits } from './editWriteBack.js';
import { withJournalApplyGuard } from './journalApplyGuard.js';

/** Nothing to write, so nothing to confirm and nothing to record. */
const NOTHING_APPLIED: EditApplyResult = { applied: [], rejected: [], ok: true };

export interface JournalEntryDraft {
  source: EditSource;
  /**
   * Built from the patches that ACTUALLY landed, not the ones attempted —
   * "Nudge + · 3 cells" over an entry holding two is the same lie the history
   * panel used to tell about the edit as a whole.
   */
  label: (applied: readonly CellPatch[]) => string;
}

/**
 * The spine every editing funnel shares: write through the port, then record
 * only what the port confirmed.
 *
 * Two things it is load-bearing for, both of which were previously repeated
 * per funnel and one of which was optional:
 *
 *  - the apply guard is ALWAYS on, so a `cellValueChanged` raised by our own
 *    transaction cannot journal a second entry for the same edit. Every caller
 *    already passed the grid id; making it a parameter of the platform rather
 *    than an option removes the shape where one forgets;
 *  - the journal entry carries `result.applied`. An edit that did not land is
 *    absent from the history panel and from the undo stack — which is the
 *    whole of roadmap finding T2-1.
 */
export async function applyAndRecord(
  platform: EditPlatform,
  patches: readonly CellPatch[],
  journal: EditJournal | null | undefined,
  entry: JournalEntryDraft,
): Promise<EditApplyResult> {
  if (patches.length === 0) return NOTHING_APPLIED;

  const result = await withJournalApplyGuard(platform.gridId, () =>
    applyForwardPatches(platform.data, patches),
  );

  if (result.applied.length > 0) {
    const recorded = journal?.record({
      source: entry.source,
      label: entry.label(result.applied),
      patches: result.applied,
    });

    // Detached on purpose: the value is already on screen and must not wait
    // for the service. Refusal comes back as a revert, not as a rejection
    // here — see `submitAppliedEdits`.
    submitAppliedEdits({
      gridId: platform.gridId,
      source: entry.source,
      patches: result.applied,
      journal,
      entryId: recorded?.id,
    });
  }

  return result;
}

/** `n cell` / `n cells` — the suffix every funnel's default label ends with. */
export function cellCountLabel(patches: readonly CellPatch[]): string {
  return `${patches.length} cell${patches.length === 1 ? '' : 's'}`;
}

/**
 * A caller's label override. A function form exists because a label that
 * mentions how many cells changed can only be written once the port has said
 * how many did.
 */
export type JournalLabel = string | ((applied: readonly CellPatch[]) => string);

export function resolveJournalLabel(
  override: JournalLabel | undefined,
  fallback: (applied: readonly CellPatch[]) => string,
): (applied: readonly CellPatch[]) => string {
  if (override === undefined) return fallback;
  return typeof override === 'function' ? override : () => override;
}
