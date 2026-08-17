/**
 * Addressed row reads and patch-to-row assembly against the live GridApi.
 *
 * Shared by BOTH data adapters on purpose. `getRowNode` and
 * `getDisplayedRowAtIndex` exist under either row model and mean the same
 * thing — "the row this grid currently holds at this address". What differs
 * is coverage: under the client-side row model the grid holds everything, so
 * a miss means the id is wrong; under the server-side row model a miss means
 * the row is outside the loaded block window, which is what
 * `DataCapabilities.canAddressUnloadedRows` reports.
 *
 * Keeping the mechanics here rather than in each adapter is what stops the
 * two from drifting on the part they genuinely share.
 */
import type { GridApi } from 'ag-grid-community';
import { markClientEdited } from './computedFields';
import type {
  DataRow,
  MutationRejection,
  MutationResult,
  RowPatch,
  RowsByIdResult,
  RowsInRangeResult,
} from './types';

interface RowNodeLike {
  id?: string;
  data?: unknown;
}

function toDataRow(node: RowNodeLike | null | undefined, fallbackId: string): DataRow | null {
  const data = node?.data;
  if (!data || typeof data !== 'object') return null;
  const id = typeof node?.id === 'string' ? node.id : fallbackId;
  return { id, data: data as Record<string, unknown> };
}

export function readRowsById(api: GridApi, ids: readonly string[]): RowsByIdResult {
  const rows: DataRow[] = [];
  const missing: string[] = [];
  for (const id of ids) {
    const row = toDataRow(api.getRowNode(id) as RowNodeLike | undefined, id);
    if (row) rows.push(row);
    else missing.push(id);
  }
  return { rows, missing };
}

export function readRowsInRange(
  api: GridApi,
  startIndex: number,
  endIndex: number,
): RowsInRangeResult {
  const from = Math.max(0, Math.min(startIndex, endIndex));
  const to = Math.max(startIndex, endIndex);
  const rows: DataRow[] = [];
  const missingIndices: number[] = [];
  for (let i = from; i <= to; i += 1) {
    // A loading stub answers this call with a node that has no `data` — the
    // server-side row model's "not loaded yet". `collectBulkUpdateTargets`
    // silently `continue`s past exactly this today; here it is reported.
    const row = toDataRow(api.getDisplayedRowAtIndex(i) as RowNodeLike | undefined, String(i));
    if (row) rows.push(row);
    else missingIndices.push(i);
  }
  return { rows, missingIndices };
}

export interface AssembledRow {
  readonly rowId: string;
  /** Full row object, ready for a transaction. */
  readonly row: Record<string, unknown>;
}

export interface AssembledRows {
  readonly assembled: AssembledRow[];
  /** Row ids whose current data the grid could not produce. */
  readonly unresolved: string[];
}

/**
 * Merge patches onto the rows the grid currently holds, one full row per id.
 *
 * Both AG-Grid transaction APIs take whole rows, not field deltas, so this
 * step is unavoidable — and it is precisely the step that needs the current
 * row. A caller that assembled rows itself would have to read them itself,
 * which is the row-model-specific knowledge the port exists to hold.
 *
 * Because the merge starts from the existing row, anything the SOURCE stamped
 * on it survives the patch — including `__ssrmCalculated`, the claim that this
 * row already carries computed values. `markClientEdited` records which fields
 * the edit overwrote so the claim can be re-judged against the new row rather
 * than believed; see `platform/computedFields.ts` for why that beats deleting
 * the stamp outright.
 */
export function assemblePatchRows(api: GridApi, patches: readonly RowPatch[]): AssembledRows {
  const byRowId = new Map<string, Record<string, unknown>>();
  const editedFields = new Map<string, string[]>();
  const missing = new Set<string>();

  for (const patch of patches) {
    if (missing.has(patch.rowId)) continue;
    let row = byRowId.get(patch.rowId);
    if (!row) {
      const existing = (api.getRowNode(patch.rowId) as RowNodeLike | undefined)?.data;
      if (!existing || typeof existing !== 'object') {
        missing.add(patch.rowId);
        continue;
      }
      row = { ...(existing as Record<string, unknown>) };
      byRowId.set(patch.rowId, row);
      editedFields.set(patch.rowId, []);
    }
    const edited = editedFields.get(patch.rowId)!;
    for (const [field, value] of Object.entries(patch.fields)) {
      row[field] = value;
      edited.push(field);
    }
  }

  for (const [rowId, row] of byRowId) {
    markClientEdited(row, editedFields.get(rowId) ?? []);
  }

  return {
    assembled: [...byRowId].map(([rowId, row]) => ({ rowId, row })),
    unresolved: [...missing],
  };
}

/** Every displayed index a range covers, clamped at zero. */
export function indicesBetween(startIndex: number, endIndex: number): number[] {
  const from = Math.max(0, Math.min(startIndex, endIndex));
  const to = Math.max(startIndex, endIndex);
  const out: number[] = [];
  for (let i = from; i <= to; i += 1) out.push(i);
  return out;
}

/** Nothing was attempted — one rejection per distinct row id, same reason. */
export function rejectAllPatches(
  patches: readonly RowPatch[],
  reason: string,
): MutationResult {
  const seen = new Set<string>();
  const rejected: MutationRejection[] = [];
  for (const p of patches) {
    if (seen.has(p.rowId)) continue;
    seen.add(p.rowId);
    rejected.push({ rowId: p.rowId, reason });
  }
  return { applied: [], rejected, ok: false };
}
