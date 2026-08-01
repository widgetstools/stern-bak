import type { GridApi } from 'ag-grid-community';
import {
  applyForwardPatches,
  buildNudgePatches,
  type BuildNudgePatchesOptions,
  type EditJournal,
  type NudgeDirection,
} from '@wellsfargo-starui/core';
import { withJournalApplyGuard } from '../../../editing/journalApplyGuard.js';

export interface ApplyPlusMinusOptions {
  rowIdField?: string;
  journal?: EditJournal | null;
  journalApplyGridId?: string;
  journalLabel?: string;
}

export async function applyPlusMinusNudge(
  api: GridApi,
  options: Omit<BuildNudgePatchesOptions, 'getRowData'> & {
    getRowData?: BuildNudgePatchesOptions['getRowData'];
  },
  applyOptions: ApplyPlusMinusOptions = {},
): Promise<number> {
  const rowIdField = applyOptions.rowIdField ?? 'id';
  const getRowData =
    options.getRowData ??
    ((rowId: string) => api.getRowNode(rowId)?.data as Record<string, unknown> | undefined);

  const patches = buildNudgePatches({ ...options, getRowData });
  if (patches.length === 0) return 0;

  const apply = () => applyForwardPatches(api as never, patches, rowIdField);
  if (applyOptions.journalApplyGridId) {
    await withJournalApplyGuard(applyOptions.journalApplyGridId, apply);
  } else {
    await apply();
  }

  if (applyOptions.journal) {
    const dir = options.direction === 'increment' ? '+' : '−';
    applyOptions.journal.record({
      source: 'plus-minus',
      label: applyOptions.journalLabel ?? `Nudge ${dir} · ${patches.length} cell${patches.length === 1 ? '' : 's'}`,
      patches,
    });
  }

  return patches.length;
}

export type { NudgeDirection };
