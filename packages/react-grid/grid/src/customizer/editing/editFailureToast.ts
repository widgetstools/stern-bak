/**
 * What the user is told when the service refuses a write.
 *
 * **Two messages, never one.** `EditWriteBackFailure` reports `rolledBack` and
 * `stuck` separately because they are separate situations, and a submission
 * can produce both at once:
 *
 *  - `rolledBack` — the cell is back to the value the server has. Annoying,
 *    but the screen is honest and there is nothing to do about it.
 *  - `stuck` — the revert itself failed, so the cell still shows the refused
 *    value. Under the server-side row model this is reachable whenever the
 *    row's block has been evicted between the edit and the answer. The screen
 *    is lying and only the user can decide what to do about it.
 *
 * Collapsing those into one string would throw away the only part the user can
 * act on, so they are raised as two toasts and the stuck one does not expire.
 */
import { sonnerToast } from '@wellsfargo-starui/react';
import type { CellPatch, EditWriteBackFailure } from '@wellsfargo-starui/core';

/** How many distinct field names a description lists before summarising. */
const MAX_NAMED_FIELDS = 3;

/** One toast's worth of copy, separated from raising it so it can be tested. */
export interface EditFailureMessage {
  readonly title: string;
  readonly description: string;
  /** `null` = never expires. The stuck message is the one that must not. */
  readonly durationMs: number | null;
}

export interface EditFailureMessages {
  readonly reverted: EditFailureMessage | null;
  readonly stuck: EditFailureMessage | null;
}

function cells(count: number): string {
  return count === 1 ? '1 cell' : `${count} cells`;
}

/** `price`, `price and bid`, `price, bid and 2 more`. */
function namedFields(patches: readonly CellPatch[]): string {
  const unique = [...new Set(patches.map((patch) => patch.field))];
  if (unique.length === 0) return '';
  if (unique.length === 1) return unique[0];
  if (unique.length > MAX_NAMED_FIELDS) {
    const shown = unique.slice(0, MAX_NAMED_FIELDS);
    return `${shown.join(', ')} and ${unique.length - shown.length} more`;
  }
  const last = unique[unique.length - 1];
  return `${unique.slice(0, -1).join(', ')} and ${last}`;
}

/**
 * The service's own words, when it gave any. Trimmed hard: this lands in a
 * toast beside the sentence that explains what happened, not instead of it.
 */
function reasonFrom(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  return trimmed.length > 120 ? `${trimmed.slice(0, 119)}…` : trimmed;
}

function withReason(sentence: string, reason: string): string {
  return reason ? `${sentence} ${reason}` : sentence;
}

export function describeEditFailure(
  failure: EditWriteBackFailure,
): EditFailureMessages {
  const reason = reasonFrom(failure.error);
  const { rolledBack, stuck } = failure;

  return {
    reverted:
      rolledBack.length === 0
        ? null
        : {
            title: 'Edit rejected — reverted',
            description: withReason(
              `${cells(rolledBack.length)} in ${namedFields(rolledBack)} went back to the previous value.`,
              reason,
            ),
            durationMs: 8_000,
          },
    stuck:
      stuck.length === 0
        ? null
        : {
            title: 'Edit rejected — NOT reverted',
            description: withReason(
              `${cells(stuck.length)} in ${namedFields(stuck)} still show the rejected value and the grid could not undo them. `
                + 'Refresh to see what the server has.',
              reason,
            ),
            durationMs: null,
          },
  };
}

function raise(message: EditFailureMessage): void {
  sonnerToast.error(message.title, {
    description: message.description,
    duration: message.durationMs ?? Infinity,
  });
}

/**
 * Surface a refused write. Called for every failure, whether or not the app
 * supplied its own `onFailure` — an app handler is for what the app wants to
 * do about it (telemetry, a retry queue), not for whether the user finds out.
 */
export function reportEditFailure(failure: EditWriteBackFailure): void {
  const { reverted, stuck } = describeEditFailure(failure);
  if (reverted) raise(reverted);
  if (stuck) raise(stuck);
}
