import type { GridApi } from 'ag-grid-community';
import {
  buildBulkUpdatePatchesFromRaw,
  collectBulkUpdateTargets,
  type BulkUpdateSelection,
  type BulkUpdateTarget,
  type CellPatch,
  type EditApplyResult,
  type EditJournal,
  type EditPlatform,
} from '@wellsfargo-starui/core';
import {
  applyAndRecord,
  cellCountLabel,
  resolveJournalLabel,
  type JournalLabel,
} from '../../../editing/applyAndRecord.js';

/**
 * The selected cells, plus how many selected rows the grid could not reach.
 *
 * The second half is not decoration: a range under the server-side row model
 * is expressed in displayed indices spanning the whole dataset, so a selection
 * can legitimately name rows no block holds. Applying to the rest and
 * reporting that count as the job is the silent partial apply this returns
 * instead of.
 */
export function resolveBulkUpdateTargets(
  api: GridApi,
  rowIdField = 'id',
): BulkUpdateSelection {
  const getRowId = (data: Record<string, unknown>) => String(data[rowIdField] ?? data.id ?? '');
  return collectBulkUpdateTargets(api as never, getRowId);
}

export interface ApplyBulkUpdateOptions {
  journal?: EditJournal | null;
  journalLabel?: JournalLabel;
  patches?: readonly CellPatch[];
}

export async function applyBulkUpdateEdits(
  platform: EditPlatform,
  targets: BulkUpdateTarget[],
  rawValue: string,
  options: ApplyBulkUpdateOptions = {},
): Promise<EditApplyResult> {
  const patches = options.patches ?? buildBulkUpdatePatchesFromRaw(targets, rawValue);
  return applyAndRecord(platform, patches, options.journal, {
    source: 'bulk-update',
    label: resolveJournalLabel(
      options.journalLabel,
      (applied) => `Set · ${cellCountLabel(applied)}`,
    ),
  });
}
