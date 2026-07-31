/**
 * In-memory store of last-seen cell values per (rowId, columnId). Used by
 * relativeChange evaluators to detect deltas between ticks.
 *
 * Lives in the runtime layer because it's per-grid mutable state — the
 * profile must not persist it (every reload should start with fresh
 * baselines, otherwise the first tick after a reload would falsely fire
 * an alert against a stale baseline).
 */

export interface PreviousValuesStore {
  get(rowId: string, colId: string): unknown;
  set(rowId: string, colId: string, value: unknown): void;
  deleteRow(rowId: string): void;
  clear(): void;
}

export function createPreviousValuesStore(): PreviousValuesStore {
  const store = new Map<string, Map<string, unknown>>();

  return {
    get(rowId, colId) {
      const cols = store.get(rowId);
      if (!cols) return undefined;
      return cols.has(colId) ? cols.get(colId) : undefined;
    },
    set(rowId, colId, value) {
      let cols = store.get(rowId);
      if (!cols) {
        cols = new Map();
        store.set(rowId, cols);
      }
      cols.set(colId, value);
    },
    deleteRow(rowId) {
      store.delete(rowId);
    },
    clear() {
      store.clear();
    },
  };
}
