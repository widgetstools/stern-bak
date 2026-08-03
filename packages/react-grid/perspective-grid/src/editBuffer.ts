/**
 * The write path: committed cell edits, coalesced into Table upserts.
 *
 * The write goes DIRECT from this window to the worker-held Table, not back
 * out through the provider. Three reasons, in order of weight:
 *
 *   - There is nowhere else for it to go. The STOMP provider is one-way:
 *     `startStomp` publishes only a subscribe frame, and `StompProviderConfig`
 *     carries no write channel at all. "Through the provider" would mean a new
 *     hub RPC whose entire body is the same `table.update()` one process later,
 *     with an extra hop and a new way to fail.
 *   - The Table IS the shared book. One write updates the single copy every
 *     window reads, and each peer's View notifies it — so an edit propagates to
 *     other blotters for free, which the push path never managed.
 *   - It matches the client-side surface, which writes into the row node it
 *     renders from. Both put the edit into the store that supplies the grid,
 *     and here that store lives in the worker.
 *
 * What this is NOT: the Table is not a system of record. A provider snapshot
 * arrives as a `replace` and discards local edits — the same lifetime a
 * client-side edit has when the next full row for that key ticks in.
 */
import { coerceEditedValue } from './cellEdits.js';
import type { PerspectiveTableLike } from './viewManager.js';

export interface EditBufferOpts {
  table: PerspectiveTableLike;
  /** The Table's index column. Rewriting it is refused, not written. */
  keyColumn: string;
  /**
   * Declared column types, or null when the Table cannot report them — in
   * which case values are written as the grid produced them. Shared with the
   * engine rather than fetched again, so a window pays for one `schema()`.
   */
  schema(): Promise<Record<string, string> | null>;
  /** Coalesce edits made within this window into one Table write. */
  flushMs?: number;
  onError?(error: unknown): void;
}

export interface EditBuffer {
  /** Stage one committed cell edit. Fire and forget. */
  add(key: unknown, field: string, value: unknown): void;
  /** Write anything staged now. Resolves once the Table has it. */
  flush(): Promise<void>;
  /** Write anything staged, then refuse further writes. */
  close(): Promise<void>;
}

export function createEditBuffer(opts: EditBufferOpts): EditBuffer {
  const { table, keyColumn, schema, flushMs = 0, onError } = opts;

  /** Edited rows awaiting a write, keyed by index value so repeated touches of
   *  the same row merge into one sparse row rather than N writes. */
  const pending = new Map<string, Record<string, unknown>>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let chain: Promise<void> = Promise.resolve();
  let closed = false;

  async function write(): Promise<void> {
    if (pending.size === 0) return;
    const staged = [...pending.values()];
    pending.clear();

    if (typeof table.update !== 'function') {
      onError?.(new Error('perspective: this Table is read-only — edit discarded'));
      return;
    }

    const types = await schema();
    const rows: Record<string, unknown>[] = [];
    for (const staging of staged) {
      const row: Record<string, unknown> = {};
      let usable = true;
      for (const field of Object.keys(staging)) {
        const coerced = coerceEditedValue(types?.[field], staging[field]);
        if (!coerced.ok) {
          // Refuse the whole row: writing the columns that did coerce would
          // half-apply an edit the user made as one action.
          onError?.(new Error(`perspective: cannot write ${field} — ${coerced.reason}`));
          usable = false;
          break;
        }
        row[field] = coerced.value;
      }
      if (usable) rows.push(row);
    }
    if (rows.length === 0) return;

    try {
      await table.update(rows);
    } catch (error) {
      onError?.(error);
    }
  }

  function drainNow(): Promise<void> {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    chain = chain.then(write);
    return chain;
  }

  return {
    add(key, field, value) {
      if (closed) return;
      if (key === null || key === undefined || !field) return;
      // Rewriting the index column is not an edit, it is a re-key: the upsert
      // would insert a second row and leave the original behind, and every
      // `getRowId` in the grid still points at the old one.
      if (field === keyColumn) {
        onError?.(
          new Error(`perspective: "${keyColumn}" is the index column and cannot be edited`),
        );
        return;
      }

      const id = String(key);
      const staged = pending.get(id) ?? { [keyColumn]: key };
      staged[field] = value;
      pending.set(id, staged);

      if (timer !== null) return;
      timer = setTimeout(() => {
        timer = null;
        chain = chain.then(write);
      }, flushMs);
    },

    flush: drainNow,

    async close() {
      // Flush BEFORE sealing: a buffer is closed whenever the Table is swapped
      // or the grid unmounts, and a cell committed in the last frame before
      // that would otherwise be dropped without a trace.
      await drainNow();
      closed = true;
    },
  };
}
