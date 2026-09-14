/**
 * applyProviderToGrid — route live provider ticks into an AG Grid client-side
 * model: ADDS ride `applyTransactionAsync` (they change the row set, with
 * pending-add deduplication); UPDATES go through {@link createRenderedRowUpdater}
 * — node data is already current, so rendered cells are refreshed in one
 * batch and only rows whose sort / filter / group / aggregate key changed
 * still ride a transaction (refactor plan B1, WORKLOG 21). Without a
 * `rowIdField` the grid cannot address nodes, so that path keeps the plain
 * update transaction.
 *
 * Extracted from MarketsGridContainer so `IDataProvider.onTick` can be
 * wired without duplicating the classifier.
 */

import type { GridApi, IRowNode } from 'ag-grid-community';
import { composeRowId } from '@wellsfargo-starui/types/shared';
import { createRenderedRowUpdater, type RenderedRowUpdaterOptions } from './renderedRowUpdates.js';

export interface SplitProviderRowsResult<TData> {
  adds: TData[];
  updates: TData[];
  /** Row id of each entry in `updates`, same order. */
  updateIds: string[];
  /**
   * Rows coalesced because an add for the same id is already queued.
   * Latest payload is retained and applied once the add transaction lands.
   */
  coalescedPending: number;
}

export interface ApplyProviderTickResult {
  coalescedPending: number;
  addCount: number;
  updateCount: number;
}

export interface ApplyProviderToGridState {
  clearPendingAdds(): void;
  getPendingAddCount(): number;
  /** Index snapshot row ids once — live ticks then avoid O(n) `getRowNode`. */
  markSnapshotLoaded<TData>(
    rows: readonly TData[],
    rowIdField: string | readonly string[] | undefined,
  ): void;
  markSnapshotLoadedWithResolver<TData>(
    rows: readonly TData[],
    resolveId: (row: TData) => string | null,
  ): void;
  splitRows<TData>(
    rows: readonly TData[],
    rowIdField: string | readonly string[] | undefined,
    gridApi: GridApi<TData>,
  ): SplitProviderRowsResult<TData>;
  applyTick<TData>(
    gridApi: GridApi<TData>,
    rows: readonly TData[],
    rowIdField: string | readonly string[] | undefined,
  ): ApplyProviderTickResult;
  applyTickWithResolver<TData>(
    gridApi: GridApi<TData>,
    rows: readonly TData[],
    resolveId: (row: TData) => string | null,
  ): ApplyProviderTickResult;
  /** Cancel pending rendered-row refreshes; call from the wiring effect's cleanup. */
  dispose(): void;
}

/** Clear pending-add bookkeeping after AG Grid applies an add transaction. */
export function clearPendingAddsFromTransaction(
  pendingAddIds: Set<string>,
  result: { add: IRowNode[] },
  knownRowIds?: Set<string>,
): void {
  for (const node of result.add) {
    const nodeId = node.id;
    if (typeof nodeId !== 'string') continue;
    pendingAddIds.delete(nodeId);
    knownRowIds?.add(nodeId);
  }
}

function classifyRow<TData>(
  row: TData,
  id: string,
  adds: TData[],
  updates: TData[],
  updateIds: string[],
  pendingAddIds: Set<string>,
  pendingAddLatest: Map<string, unknown> | undefined,
  knownRowIds: ReadonlySet<string> | undefined,
  gridApi: GridApi<TData>,
): number {
  if (knownRowIds && knownRowIds.size > 0) {
    if (knownRowIds.has(id)) {
      updates.push(row);
      updateIds.push(id);
      return 0;
    }
    if (pendingAddIds.has(id)) {
      pendingAddLatest?.set(id, row);
      return 1;
    }
    adds.push(row);
    pendingAddIds.add(id);
    return 0;
  }

  // Before the snapshot id index exists, fall back to AG Grid lookup.
  if (gridApi.getRowNode(id)) {
    updates.push(row);
    updateIds.push(id);
    return 0;
  }
  if (pendingAddIds.has(id)) {
    pendingAddLatest?.set(id, row);
    return 1;
  }
  adds.push(row);
  pendingAddIds.add(id);
  return 0;
}

/**
 * Classify provider rows into add vs update buckets.
 *
 * When `knownRowIds` is populated (via {@link markSnapshotLoaded}), uses O(1)
 * set membership instead of `getRowNode` per row on the live-tick hot path.
 */
export function splitProviderRowsForGrid<TData>(
  rows: readonly TData[],
  rowIdField: string | readonly string[] | undefined,
  gridApi: GridApi<TData>,
  pendingAddIds: Set<string>,
  pendingAddLatest?: Map<string, unknown>,
  knownRowIds?: ReadonlySet<string>,
): SplitProviderRowsResult<TData> {
  const adds: TData[] = [];
  const updates: TData[] = [];
  const updateIds: string[] = [];
  let coalescedPending = 0;

  for (const row of rows) {
    const id = composeRowId(row as Record<string, unknown>, rowIdField);
    if (id === null) continue;

    coalescedPending += classifyRow(
      row,
      id,
      adds,
      updates,
      updateIds,
      pendingAddIds,
      pendingAddLatest,
      knownRowIds,
      gridApi,
    );
  }

  return { adds, updates, updateIds, coalescedPending };
}

export function splitProviderRowsWithResolver<TData>(
  rows: readonly TData[],
  resolveId: (row: TData) => string | null,
  gridApi: GridApi<TData>,
  pendingAddIds: Set<string>,
  pendingAddLatest?: Map<string, unknown>,
  knownRowIds?: ReadonlySet<string>,
): SplitProviderRowsResult<TData> {
  const adds: TData[] = [];
  const updates: TData[] = [];
  const updateIds: string[] = [];
  let coalescedPending = 0;

  for (const row of rows) {
    const id = resolveId(row);
    if (id === null) continue;

    coalescedPending += classifyRow(
      row,
      id,
      adds,
      updates,
      updateIds,
      pendingAddIds,
      pendingAddLatest,
      knownRowIds,
      gridApi,
    );
  }

  return { adds, updates, updateIds, coalescedPending };
}

export function createApplyProviderToGridState(opts: RenderedRowUpdaterOptions = {}): ApplyProviderToGridState {
  const pendingAddIds = new Set<string>();
  const pendingAddLatest = new Map<string, unknown>();
  const knownRowIds = new Set<string>();
  const updater = createRenderedRowUpdater<unknown>(opts);

  const applyCoalescedAfterAdds = <TData>(gridApi: GridApi<TData>, added: IRowNode[]) => {
    if (pendingAddLatest.size === 0) return;
    const updates: TData[] = [];
    for (const node of added) {
      const nodeId = node.id;
      if (typeof nodeId !== 'string') continue;
      const latest = pendingAddLatest.get(nodeId);
      if (latest === undefined) continue;
      updates.push(latest as TData);
      pendingAddLatest.delete(nodeId);
    }
    if (updates.length > 0) {
      gridApi.applyTransactionAsync({ update: updates });
    }
  };

  /**
   * Adds (and the updates whose key column changed) ride one transaction;
   * every other update is a rendered-row refresh plus a bus note.
   */
  const commit = <TData>(
    gridApi: GridApi<TData>,
    adds: TData[],
    updates: TData[],
    updateIds: string[],
    coalescedPending: number,
  ): ApplyProviderTickResult => {
    const txUpdates = updater.apply(gridApi as GridApi<unknown>, updates, updateIds) as TData[];
    if (adds.length > 0 || txUpdates.length > 0) {
      gridApi.applyTransactionAsync({ add: adds, update: txUpdates }, (result) => {
        clearPendingAddsFromTransaction(pendingAddIds, result, knownRowIds);
        applyCoalescedAfterAdds(gridApi, result.add);
      });
    }
    return { coalescedPending, addCount: adds.length, updateCount: updates.length };
  };

  return {
    clearPendingAdds() {
      pendingAddIds.clear();
      pendingAddLatest.clear();
      knownRowIds.clear();
      updater.clear();
    },
    dispose() {
      updater.dispose();
    },
    getPendingAddCount() {
      return pendingAddIds.size;
    },
    markSnapshotLoaded(rows, rowIdField) {
      knownRowIds.clear();
      for (const row of rows) {
        const id = composeRowId(row as Record<string, unknown>, rowIdField);
        if (id !== null) knownRowIds.add(id);
      }
    },
    markSnapshotLoadedWithResolver(rows, resolveId) {
      knownRowIds.clear();
      for (const row of rows) {
        const id = resolveId(row);
        if (id !== null) knownRowIds.add(id);
      }
    },
    splitRows(rows, rowIdField, gridApi) {
      return splitProviderRowsForGrid(
        rows,
        rowIdField,
        gridApi,
        pendingAddIds,
        pendingAddLatest,
        knownRowIds,
      );
    },
    applyTick(gridApi, rows, rowIdField) {
      if (rows.length === 0) return { coalescedPending: 0, addCount: 0, updateCount: 0 };

      if (!rowIdField) {
        gridApi.applyTransactionAsync({ update: rows.slice() });
        return { coalescedPending: 0, addCount: 0, updateCount: rows.length };
      }

      const { adds, updates, updateIds, coalescedPending } = splitProviderRowsForGrid(
        rows,
        rowIdField,
        gridApi,
        pendingAddIds,
        pendingAddLatest,
        knownRowIds,
      );
      return commit(gridApi, adds, updates, updateIds, coalescedPending);
    },
    applyTickWithResolver(gridApi, rows, resolveId) {
      if (rows.length === 0) return { coalescedPending: 0, addCount: 0, updateCount: 0 };

      const { adds, updates, updateIds, coalescedPending } = splitProviderRowsWithResolver(
        rows,
        resolveId,
        gridApi,
        pendingAddIds,
        pendingAddLatest,
        knownRowIds,
      );
      return commit(gridApi, adds, updates, updateIds, coalescedPending);
    },
  };
}
