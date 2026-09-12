/**
 * Turn a lab scenario into an SSRM edit batch.
 *
 * The CSRM lab overlays scenario patches onto every incoming tick client-
 * side. Under SSRM the client owns no rows, so the SAME scenario transform
 * runs over the loaded block rows and the changed rows go to the engine
 * through the real `applyEdits` write path — whole rows (the engine upserts
 * whole records) plus the changed columns, so the worker's edit overlay
 * holds the injected values over stale whole-row resends until the feed
 * genuinely moves those fields. One injection, real write path — which is
 * itself the parity point.
 */
import type { LabRow } from '../../../markets-grid-lab/src/data/types';
import type { LabScenario } from '../../../markets-grid-lab/src/demo/types';
import { labRowFieldPatch } from '../../../markets-grid-lab/src/data/rowDiff';

export interface SsrmScenarioEditBatch {
  rows: Record<string, unknown>[];
  editedColumns: string[][];
}

export function buildScenarioEditBatch(
  scenario: Pick<LabScenario, 'apply'>,
  loadedRows: readonly LabRow[],
): SsrmScenarioEditBatch {
  const after = scenario.apply(loadedRows);
  const afterById = new Map(after.map((r) => [String(r.id), r]));
  const rows: Record<string, unknown>[] = [];
  const editedColumns: string[][] = [];
  for (const before of loadedRows) {
    const next = afterById.get(String(before.id));
    if (!next) continue;
    const patch = labRowFieldPatch(before, next);
    if (!patch) continue;
    rows.push({ ...next });
    editedColumns.push(Object.keys(patch));
  }
  return { rows, editedColumns };
}
