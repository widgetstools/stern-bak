import {
  buildNudgePatches,
  type BuildNudgePatchesOptions,
  type EditApplyResult,
  type EditJournal,
  type EditPlatform,
  type NudgeDirection,
} from '@wellsfargo-starui/core';
import { applyAndRecord, cellCountLabel } from '../../../editing/applyAndRecord.js';

export interface ApplyPlusMinusOptions {
  journal?: EditJournal | null;
  journalLabel?: string;
}

/**
 * Nudge every selected cell by the step its matching rule declares.
 *
 * The rule is matched against the whole ROW (`resolveNudgeForCell` evaluates a
 * predicate over it), so this reads the rows first — through the port, one
 * batched call, rather than `api.getRowNode` per cell. A row the port cannot
 * address contributes no patch, exactly as an unmatched rule does.
 */
export async function applyPlusMinusNudge(
  platform: EditPlatform,
  options: Omit<BuildNudgePatchesOptions, 'getRowData'> & {
    getRowData?: BuildNudgePatchesOptions['getRowData'];
  },
  applyOptions: ApplyPlusMinusOptions = {},
): Promise<EditApplyResult> {
  const getRowData = options.getRowData ?? (await readRows(platform, options.cells));

  const patches = buildNudgePatches({ ...options, getRowData });
  return applyAndRecord(platform, patches, applyOptions.journal, {
    source: 'plus-minus',
    label: (applied) => {
      if (applyOptions.journalLabel) return applyOptions.journalLabel;
      const dir = options.direction === 'increment' ? '+' : '−';
      return `Nudge ${dir} · ${cellCountLabel(applied)}`;
    },
  });
}

async function readRows(
  platform: EditPlatform,
  cells: BuildNudgePatchesOptions['cells'],
): Promise<BuildNudgePatchesOptions['getRowData']> {
  const ids = [...new Set(cells.map((cell) => cell.rowId))];
  const { rows } = await platform.data.getRowsById(ids);
  const byId = new Map(rows.map((row) => [row.id, row.data]));
  return (rowId: string) => byId.get(rowId);
}

export type { NudgeDirection };
