import type { Client, Table } from '@perspective-dev/client';
import { composeRowId } from '@wellsfargo-starui/types/shared';
import { compileFlattenPlan, flattenRow as flattenRowByPlan } from '@wellsfargo-starui/data';
import { INDEX_COLUMN, flattenRowsColumnar, type PerspectiveSchema } from './schema.js';

/*
 * The per-window Perspective table behind a server-side-row-model grid: a
 * replica of the provider's row set, fed by the SAME hub subscription the
 * client-side row model reads (snapshot replace + keyed ticks), queried by the
 * SSRM datasource through views. The provider sub-worker stays the transport
 * authority; this table is a local, disposable projection of it.
 *
 * Two disciplines keep this safe at feed rates the engine cannot match:
 *
 * 1. BACKPRESSURE. Ticks are never queued as writes — they conflate into one
 *    pending map (last write per row id wins, so it can never exceed the book
 *    size) and at most ONE tick write is in flight; each ack drains whatever
 *    accumulated meanwhile. An unbounded write queue was the original sin
 *    here: at 20k rows/s the engine fell behind, every queued update retained
 *    its row arrays, and the renderer died of an "Aw, Snap!" OOM.
 *
 * 2. CHEAP MAIN-THREAD WORK. Arrival is a Map.set; flattening happens at
 *    drain time through the COMPILED plan (`compileFlattenPlan`: a trie that
 *    visits only the schema's paths, ~3.6µs/row), and grid-ready rows for the
 *    live-patch path materialise LAZILY, per visible row, never per tick.
 */

export type FeedTableEvent =
  /**
   * Rows changed in place. `ids` names them; a consumer showing one calls
   * `getRow(id)` for its grid-ready values — flattened on demand, so the
   * cost scales with what is on screen, not with the feed.
   */
  | { type: 'update'; ids: ReadonlySet<string> }
  /** The whole table was replaced; any cached row counts are stale. */
  | { type: 'snapshot' };

export interface SsrmFeedTable {
  /** The Perspective table, resolving once the engine has booted. */
  readonly table: Promise<Table>;
  /** Replace the table's contents with a fresh provider snapshot. */
  applySnapshot(rows: readonly Record<string, unknown>[]): void;
  /** Apply keyed live ticks (whole or sparse rows, as the hub broadcasts them). */
  applyTicks(rows: readonly Record<string, unknown>[]): void;
  /**
   * Latest grid-ready (flattened, index-stamped) values for a row that has
   * ticked since the last snapshot, or undefined when it has not (its block
   * data is then current). Flattens on demand — call it for visible rows.
   */
  getRow(id: string): Record<string, unknown> | undefined;
  subscribe(listener: (event: FeedTableEvent) => void): () => void;
  /** Deletes the table. Idempotent; writes after dispose are dropped. */
  dispose(): void;
}

export interface SsrmFeedTableOptions {
  client: Promise<Client>;
  schema: PerspectiveSchema;
  /** The provider's key column(s) — the same shape `getRowId` composes from. */
  rowIdField: string | readonly string[];
  /**
   * The provider sends thin field-level deltas, so tick rows may be SPARSE.
   * Drains then stay row-oriented (a column array would write nulls over
   * fields an update never mentioned). Default false: tick rows are whole
   * rows and drains go column-oriented, which is roughly an order of
   * magnitude cheaper for the engine against an indexed table.
   */
  sparseTicks?: boolean;
}

/*
 * Rows per write while loading a snapshot. One write of the whole snapshot is
 * the slowest way to do it — an indexed write gets more expensive per row as
 * the batch grows. Chunking also means the grid has rows to show after the
 * first write rather than after the last, and gives the engine a gap between
 * writes in which it can answer the grid's own view requests.
 */
const SNAPSHOT_CHUNK_ROWS = 2000;

/**
 * Conflated rows per tick drain. Caps both the flatten task on the main
 * thread (~5k × ~3.6µs ≈ 20ms) and the engine's per-write cost; the rest of
 * the backlog drains on the next ack.
 */
const TICK_DRAIN_CHUNK_ROWS = 5000;

export function createSsrmFeedTable(opts: SsrmFeedTableOptions): SsrmFeedTable {
  const columns = new Set(Object.keys(opts.schema));
  const planColumns = Object.keys(opts.schema).filter((c) => c !== INDEX_COLUMN);
  const plan = compileFlattenPlan(planColumns);
  const sparseTicks = opts.sparseTicks ?? false;
  const listeners = new Set<(event: FeedTableEvent) => void>();
  /**
   * GRID-READY (flat, index-stamped) rows that ticked since the last
   * snapshot, by index value. Flat on purpose: the raw feed rows are wide
   * nested objects, and retaining them for a whole ticked book costs several
   * times the memory of the schema's flat projection — this map can grow to
   * book size under a sweeping feed, so its per-row shape IS the footprint.
   */
  let latest = new Map<string, Record<string, unknown>>();
  /** Conflated raw ticks awaiting their engine write (last write wins). */
  let pendingTicks = new Map<string, Record<string, unknown>>();
  let tickDrainQueued = false;
  let disposed = false;
  let warnedNullKey = false;

  const table: Promise<Table> = opts.client.then((client) =>
    client.table(opts.schema as Parameters<Client['table']>[0], { index: INDEX_COLUMN }),
  );

  /*
   * Perspective applies writes asynchronously and a later `update` must not
   * overtake an earlier one, so every write goes through one promise chain.
   * The chain's depth is bounded: one snapshot load plus at most one queued
   * tick drain (see BACKPRESSURE above).
   */
  let writeQueue: Promise<unknown> = Promise.resolve();
  function enqueue<T>(work: () => Promise<T>): void {
    const next = writeQueue.then(work, work);
    writeQueue = next.catch((error) => {
      console.error('[markets-grid ssrm] Perspective write failed:', error);
    });
  }

  function emit(event: FeedTableEvent): void {
    for (const listener of listeners) listener(event);
  }

  function indexOf(row: Record<string, unknown>): string | null {
    const id = composeRowId(row, opts.rowIdField);
    if (id === null && !warnedNullKey) {
      warnedNullKey = true;
      console.warn(
        '[markets-grid ssrm] dropped row(s) with a null/missing key column — ' +
          'an indexed Perspective table cannot hold them.',
      );
    }
    return id;
  }

  function toGridRow(id: string, raw: Record<string, unknown>): Record<string, unknown> {
    const flat = flattenRowByPlan(raw, plan);
    flat[INDEX_COLUMN] = id;
    return flat;
  }

  /**
   * Column arrays from already-flat rows. A column no row in the batch
   * carries is left out entirely — emitting it would write nulls over values
   * the batch never mentioned.
   */
  function columnarFromFlat(flatRows: readonly Record<string, unknown>[]): Record<string, unknown[]> {
    const out: Record<string, unknown[]> = {};
    for (const key of [...planColumns, INDEX_COLUMN]) {
      let seen = false;
      for (const row of flatRows) {
        if (key in row) {
          seen = true;
          break;
        }
      }
      if (!seen) continue;
      out[key] = flatRows.map((row) => (key in row ? row[key] : null));
    }
    return out;
  }

  /** Drains up to one chunk of the conflated backlog; at most one in flight. */
  function drainTicks(): void {
    if (disposed || tickDrainQueued || pendingTicks.size === 0) return;
    tickDrainQueued = true;
    enqueue(async () => {
      try {
        if (disposed) return;
        const entries: [string, Record<string, unknown>][] = [];
        for (const entry of pendingTicks) {
          pendingTicks.delete(entry[0]);
          entries.push(entry);
          if (entries.length >= TICK_DRAIN_CHUNK_ROWS) break;
        }
        if (entries.length === 0) return;
        const ids = new Set<string>();
        const flatRows: Record<string, unknown>[] = [];
        for (const [id, row] of entries) {
          ids.add(id);
          const flat = toGridRow(id, row);
          flatRows.push(flat);
          latest.set(id, flat);
        }
        const payload = sparseTicks ? flatRows : columnarFromFlat(flatRows);
        await (await table).update(payload as Parameters<Table['update']>[0]);
        emit({ type: 'update', ids });
      } finally {
        tickDrainQueued = false;
        if (!disposed && pendingTicks.size > 0) drainTicks();
      }
    });
  }

  /**
   * Replaces the table's contents a chunk at a time, announcing each one so
   * the grid fills in as the snapshot lands instead of waiting for all of it.
   * `clear` keeps the schema, the index and every open view, so the views the
   * grid is already reading from survive.
   */
  async function loadSnapshot(target: Table, rows: readonly Record<string, unknown>[]): Promise<void> {
    latest = new Map();
    await target.clear();
    const keyed: { row: Record<string, unknown>; id: string }[] = [];
    for (const row of rows) {
      const id = indexOf(row);
      if (id !== null) keyed.push({ row, id });
    }
    for (let start = 0; start < keyed.length; start += SNAPSHOT_CHUNK_ROWS) {
      const chunk = keyed.slice(start, start + SNAPSHOT_CHUNK_ROWS);
      const columnar = flattenRowsColumnar(
        chunk.map((entry) => entry.row),
        columns,
      );
      columnar[INDEX_COLUMN] = chunk.map((entry) => entry.id);
      await target.update(columnar as Parameters<Table['update']>[0]);
      emit({ type: 'snapshot' });
    }
  }

  return {
    table,

    applySnapshot(rows) {
      if (disposed) return;
      // Ticks conflated before this call describe the PREVIOUS table
      // contents; the snapshot supersedes them. Ticks arriving after this
      // call are post-snapshot by stream order and stay pending.
      pendingTicks = new Map();
      enqueue(async () => {
        if (disposed) return;
        await loadSnapshot(await table, rows);
      });
    },

    applyTicks(rows) {
      if (disposed || rows.length === 0) return;
      // Arrival is a Map.set per row — all real work happens at drain time.
      for (const row of rows) {
        const id = indexOf(row);
        if (id !== null) pendingTicks.set(id, row);
      }
      drainTicks();
    },

    getRow(id) {
      // A tick still waiting to drain is the freshest value; it is raw and
      // flattens here (visible-row cadence). Drained values are stored flat.
      const pending = pendingTicks.get(id);
      if (pending) return toGridRow(id, pending);
      return latest.get(id);
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      listeners.clear();
      latest = new Map();
      pendingTicks = new Map();
      enqueue(async () => {
        try {
          await (await table).delete();
        } catch {
          // The engine is gone or the table never built; nothing to reclaim.
        }
      });
    },
  };
}
