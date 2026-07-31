import type { GridApi } from 'ag-grid-community';
import {
  applyForwardPatches,
  buildBulkUpdatePatchesFromRaw,
  collectBulkUpdateTargets,
  type BulkUpdateTarget,
  type EditJournal,
} from '@wellsfargo-starui/engine';
import { withJournalApplyGuard } from '../../../editing/journalApplyGuard.js';

export function resolveBulkUpdateTargets(api: GridApi, rowIdField = 'id'): BulkUpdateTarget[] {
  const getRowId = (data: Record<string, unknown>) => String(data[rowIdField] ?? data.id ?? '');
  const fromRange = collectBulkUpdateTargets(api as never, getRowId);
  return fromRange;
}

export interface ApplyBulkUpdateOptions {
  rowIdField?: string;
  journal?: EditJournal | null;
  journalLabel?: string;
  patches?: readonly import('@wellsfargo-starui/engine').CellPatch[];
  journalApplyGridId?: string;
}

export async function applyBulkUpdateEdits(
  api: GridApi,
  targets: BulkUpdateTarget[],
  rawValue: string,
  options: ApplyBulkUpdateOptions = {},
): Promise<number> {
  const rowIdField = options.rowIdField ?? 'id';
  const patches = options.patches ?? buildBulkUpdatePatchesFromRaw(targets, rawValue);
  if (patches.length === 0) return 0;

  const applyPatches = () => applyForwardPatches(api as never, patches, rowIdField);
  if (options.journalApplyGridId) {
    await withJournalApplyGuard(options.journalApplyGridId, applyPatches);
  } else {
    await applyPatches();
  }

  if (options.journal) {
    options.journal.record({
      source: 'bulk-update',
      label: options.journalLabel ?? `Set · ${patches.length} cell${patches.length === 1 ? '' : 's'}`,
      patches,
    });
  }

  return patches.length;
}
