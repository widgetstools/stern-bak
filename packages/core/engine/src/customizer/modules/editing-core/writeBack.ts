/**
 * Write-back: what happens to an edit AFTER it lands in the grid.
 *
 * The deployed architecture is optimistic and server-authoritative. A user
 * edits a cell; the value appears immediately; the app POSTs it to a service;
 * the service updates the table; the STOMP feed broadcasts the new value back
 * and every window — including the one that made the edit — converges on the
 * server's version. The grid is never the system of record.
 *
 * Two consequences shape this module:
 *
 *  - **The platform must not own the POST.** Every deployment's write service
 *    is different, so {@link EditWriteBack.submit} is supplied by the app and
 *    may do anything it likes. Nothing here speaks HTTP.
 *  - **The platform MUST own the failure.** A rejected write leaves the grid
 *    showing a value the server does not have, and an undo stack containing an
 *    edit that never happened. Neither is reachable from application code
 *    without reaching into grid internals, so reverting is this module's job.
 *
 * The success path deliberately does nothing. A confirmed edit is confirmed by
 * the broadcast arriving, not by the POST resolving — so resolving only means
 * "stop watching for failure".
 */
import type { CellPatch, EditApplyResult, EditSource } from './types.js';

/** One user action's worth of edits, handed to the app to persist. */
export interface EditSubmission {
  readonly gridId: string;
  /** Which funnel produced the edit — inline editor, bulk update, nudge, … */
  readonly source: EditSource;
  /**
   * The patches that LANDED in the grid, never the ones attempted. Each
   * carries `oldValue`, which is what makes a rollback possible without the
   * app having to remember anything.
   */
  readonly patches: readonly CellPatch[];
}

/**
 * The app's write-back call. Resolve when the service has accepted the edit;
 * reject to have the grid revert it.
 *
 * It is deliberately not given a way to report partial success: a submission
 * is one user action, and "three of your five cells saved" is a state no
 * undo stack can represent honestly. Split the work into separate actions if
 * the service can accept them independently.
 */
export type SubmitEdits = (submission: EditSubmission) => void | Promise<void>;

/** A write the service refused, and what the grid managed to do about it. */
export interface EditWriteBackFailure {
  readonly submission: EditSubmission;
  /** Whatever {@link SubmitEdits} rejected with. */
  readonly error: unknown;
  /** Patches restored to their previous value. */
  readonly rolledBack: readonly CellPatch[];
  /**
   * Patches that could NOT be restored — under the server-side row model a
   * row whose block has been evicted cannot be addressed, so its cell keeps
   * the rejected value until the source re-delivers it. Non-empty here means
   * the user is looking at something wrong and has to be told.
   */
  readonly stuck: readonly CellPatch[];
}

export interface EditWriteBack {
  readonly submit: SubmitEdits;
  /**
   * Called once per refused submission, after the revert has been attempted.
   *
   * Optional because telling the user is not the app's job: the React grid
   * raises its own toast for every failure, distinguishing `rolledBack` from
   * `stuck`. Supply this for what the app wants to *do* about it — telemetry,
   * a retry queue — not for whether the user finds out.
   */
  readonly onFailure?: (failure: EditWriteBackFailure) => void;
}

/**
 * What {@link submitEdits} needs from the grid to undo its own optimism.
 * Passed in rather than reached for so this module stays free of both the
 * data port and React.
 */
export interface EditWriteBackHooks {
  /** Restore the patches' previous values; resolves with what actually reverted. */
  rollback: (patches: readonly CellPatch[]) => Promise<EditApplyResult>;
  /** Drop the optimistic journal entry — a refused edit never happened. */
  retract?: () => void;
}

const NO_PATCHES: readonly CellPatch[] = [];

/**
 * Submit one action's edits and reconcile the grid with the answer.
 *
 * Resolves `true` when the service accepted the write. On refusal it retracts
 * the journal entry, reverts the cells, reports through
 * {@link EditWriteBack.onFailure} and resolves `false` — it does not rethrow,
 * because callers run this detached from the funnel that produced the edit so
 * the value can appear before the round trip finishes.
 */
export async function submitEdits(
  writeBack: EditWriteBack,
  submission: EditSubmission,
  hooks: EditWriteBackHooks,
): Promise<boolean> {
  if (submission.patches.length === 0) return true;

  try {
    await writeBack.submit(submission);
    return true;
  } catch (error) {
    await revert(writeBack, submission, hooks, error);
    return false;
  }
}

async function revert(
  writeBack: EditWriteBack,
  submission: EditSubmission,
  hooks: EditWriteBackHooks,
  error: unknown,
): Promise<void> {
  // Retract BEFORE reverting: the revert is itself a write, and an undo stack
  // that still holds the refused entry while the revert lands would let the
  // user redo their way back to a value the server rejected.
  safely(hooks.retract);

  let rolledBack = NO_PATCHES;
  try {
    rolledBack = (await hooks.rollback(submission.patches)).applied;
  } catch {
    // A revert that throws leaves everything stuck, which is what the empty
    // `rolledBack` below reports. Swallowing keeps `onFailure` reachable —
    // it is the only thing that will tell the user anything.
  }

  const landed = new Set(rolledBack);
  const stuck = submission.patches.filter((patch) => !landed.has(patch));

  safely(() => writeBack.onFailure?.({ submission, error, rolledBack, stuck }));
}

/** A reporting hook that throws must not replace the failure it is reporting. */
function safely(fn: (() => void) | undefined): void {
  if (!fn) return;
  try {
    fn();
  } catch {
    /* the caller's problem, not the write path's */
  }
}
