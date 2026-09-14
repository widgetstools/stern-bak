/**
 * Per-cell write-lifecycle store — the single source for what a cell's
 * border/background should say about it:
 *
 *   staged   — value applied to the grid (CSV import) but NOT sent to the
 *              server yet; amber background, cleared by Save or Discard.
 *   pending  — write sent, server has not acknowledged; yellow border.
 *              This is the state the trader watches after an edit or a
 *              500-row paste.
 *   failed   — the server refused it (unknown cusip, bad field) or the
 *              request itself failed; red border until re-edited/cleared.
 *
 * The store is deliberately grid-agnostic: `columns.ts` reads it from
 * `cellClassRules`, and `App` subscribes to schedule one throttled
 * `refreshCells` per change burst.
 */
export type CellWriteState = 'staged' | 'pending' | 'failed';

export interface CellEntry {
  state: CellWriteState;
  /** The value this state was recorded for (the staged/sent value). */
  value: unknown;
}

export interface StagedUpdate {
  cusip: string;
  fields: Record<string, unknown>;
}

export class CellStateStore {
  private readonly rows = new Map<string, Map<string, CellEntry>>();
  private readonly listeners = new Set<() => void>();

  stateOf(cusip: string, column: string): CellWriteState | undefined {
    return this.rows.get(cusip)?.get(column)?.state;
  }

  mark(cusip: string, fields: Record<string, unknown>, state: CellWriteState): void {
    let row = this.rows.get(cusip);
    if (!row) {
      row = new Map();
      this.rows.set(cusip, row);
    }
    for (const [column, value] of Object.entries(fields)) {
      row.set(column, { state, value });
    }
    this.emit();
  }

  /** Move every matching cell of the row out of the store (write confirmed). */
  clear(cusip: string, columns?: readonly string[]): void {
    const row = this.rows.get(cusip);
    if (!row) return;
    if (!columns) this.rows.delete(cusip);
    else {
      for (const c of columns) row.delete(c);
      if (row.size === 0) this.rows.delete(cusip);
    }
    this.emit();
  }

  /** Flip the state of every matching cell (e.g. staged → pending on Save). */
  transition(cusip: string, columns: readonly string[], next: CellWriteState): void {
    const row = this.rows.get(cusip);
    if (!row) return;
    for (const c of columns) {
      const entry = row.get(c);
      if (entry) row.set(c, { ...entry, state: next });
    }
    this.emit();
  }

  /** Every update currently in `state`, shaped for the server write path. */
  updates(state: CellWriteState): StagedUpdate[] {
    const out: StagedUpdate[] = [];
    for (const [cusip, row] of this.rows) {
      const fields: Record<string, unknown> = {};
      for (const [column, entry] of row) {
        if (entry.state === state) fields[column] = entry.value;
      }
      if (Object.keys(fields).length > 0) out.push({ cusip, fields });
    }
    return out;
  }

  counts(): Record<CellWriteState, number> {
    const counts: Record<CellWriteState, number> = { staged: 0, pending: 0, failed: 0 };
    for (const row of this.rows.values()) {
      for (const entry of row.values()) counts[entry.state] += 1;
    }
    return counts;
  }

  clearState(state: CellWriteState): void {
    for (const [cusip, row] of [...this.rows]) {
      for (const [column, entry] of [...row]) {
        if (entry.state === state) row.delete(column);
      }
      if (row.size === 0) this.rows.delete(cusip);
    }
    this.emit();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }
}
