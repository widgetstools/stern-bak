import type { GridApi } from 'ag-grid-community';
import { applyDelta } from './applyDelta';
import { labRowsEqual } from './rowDiff';
import type { LabRow } from './types';

const ID_FIELD = 'id' as const;

function splitTransaction(
  api: GridApi,
  rows: readonly LabRow[],
): { add: LabRow[]; update: LabRow[] } {
  const add: LabRow[] = [];
  const update: LabRow[] = [];
  for (const row of rows) {
    const id = String(row[ID_FIELD]);
    if (api.getRowNode(id)) {
      update.push(row);
    } else {
      add.push(row);
    }
  }
  return { add, update };
}

/**
 * Apply a mock-provider delta through AG-Grid transactions instead of
 * replacing `rowData` on every tick. Returns the updated lab snapshot
 * (for scenarios / demo-console bookkeeping).
 */
export function applyLabStreamDelta(
  api: GridApi | null,
  snapshot: readonly LabRow[],
  incoming: readonly LabRow[],
  replace: boolean,
): LabRow[] {
  if (incoming.length === 0 && !replace) return snapshot as LabRow[];

  if (replace) {
    const next = [...incoming];
    if (api) {
      try {
        api.setGridOption('rowData', next);
      } catch {
        /* grid tearing down */
      }
    }
    return next;
  }

  const nextSnapshot = applyDelta(snapshot, incoming, ID_FIELD);

  if (!api) return nextSnapshot;

  const { add, update } = splitTransaction(api, incoming);
  if (add.length === 0 && update.length === 0) return nextSnapshot;

  try {
    api.applyTransactionAsync({ add, update });
  } catch {
    /* grid tearing down */
  }

  return nextSnapshot;
}

/** Push a one-shot scenario overlay as row updates. */
export function applyLabRowUpdates(api: GridApi, updates: readonly LabRow[]): void {
  if (updates.length === 0) return;
  try {
    api.applyTransactionAsync({ update: [...updates] });
  } catch {
    /* grid tearing down */
  }
}

export function diffRowUpdates(before: readonly LabRow[], after: readonly LabRow[]): LabRow[] {
  const beforeById = new Map(before.map((r) => [r[ID_FIELD], r]));
  const updates: LabRow[] = [];
  for (const row of after) {
    const prev = beforeById.get(row[ID_FIELD]);
    if (!prev) {
      updates.push(row);
      continue;
    }
    if (!labRowsEqual(prev, row)) {
      updates.push(row);
    }
  }
  return updates;
}
