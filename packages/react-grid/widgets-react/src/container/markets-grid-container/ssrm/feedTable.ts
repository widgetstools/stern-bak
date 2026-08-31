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
 * The tick path is the main-thread hot path — at 20k rows/s it competes with
 * keyboard navigation for the event loop — so it flattens through the
 * COMPILED plan (`compileFlattenPlan`: a trie that visits only the schema's
 * paths, ~3.6µs/row on wide nested rows vs ~20µs for a generic recursive
 * walk), and grid-ready rows for the live-patch path are materialised
 * LAZILY, per visible row, never per tick.
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
}

/*
 * Rows per write while loading a snapshot. One write of the whole snapshot is
 * the slowest way to do it — an indexed write gets more expensive per row as
 * the batch grows. Chunking also means the grid has rows to show after the
 * first write rather than after the last, and gives the engine a gap between
 * writes in which it can answer the grid's own view requests.
 */
const SNAPSHOT_CHUNK_ROWS = 2000;

export function createSsrmFeedTable(opts: SsrmFeedTableOptions): SsrmFeedTable {
  const columns = new Set(Object.keys(opts.schema));
  /*
   * The compiled trie visits ONLY these paths inside each nested row — the
   * difference between the feed costing ~45% of the main thread and ~7% at
   * 20k rows/s. The index column is synthesised, not read from the row.
   */
  const plan = compileFlattenPlan(Object.keys(opts.schema).filter((c) => c !== INDEX_COLUMN));
  const listeners = new Set<(event: FeedTableEvent) => void>();
  /** RAW rows that ticked since the last snapshot, by index value. */
  let latest = new Map<string, Record<string, unknown>>();
  let disposed = false;
  let warnedNullKey = false;

  const table: Promise<Table> = opts.client.then((client) =>
    client.table(opts.schema as Parameters<Client['table']>[0], { index: INDEX_COLUMN }),
  );

  /*
   * Perspective applies writes asynchronously and a later `update` must not
   * overtake an earlier one, so every write goes through one promise chain.
   * The feed is conflated upstream, so this queue stays shallow.
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
      /*
       * Column-oriented on purpose: a row-oriented update against an indexed
       * table degrades badly with batch size (see `flattenRowsColumnar`).
       * Safe here because a snapshot's rows are whole rows by definition.
       */
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
      enqueue(async () => {
        if (disposed) return;
        await loadSnapshot(await table, rows);
      });
    },

    applyTicks(rows) {
      if (disposed || rows.length === 0) return;
      /*
       * Row-oriented on purpose: a tick batch may not carry every column
       * (thin-delta providers), and a column array would write nulls over
       * fields an update never mentioned. The plan flattener only emits the
       * fields a row actually has, so sparse rows stay sparse. (One shape
       * nuance vs the columnar snapshot path: an array-valued column arrives
       * as JSON text here, `join(', ')` there — both render as strings.)
       */
      const flat: Record<string, unknown>[] = [];
      const ids = new Set<string>();
      const raw = new Map<string, Record<string, unknown>>();
      for (const row of rows) {
        const id = indexOf(row);
        if (id === null) continue;
        flat.push(toGridRow(id, row));
        ids.add(id);
        raw.set(id, row);
      }
      if (flat.length === 0) return;
      enqueue(async () => {
        if (disposed) return;
        await (await table).update(flat as Parameters<Table['update']>[0]);
        for (const [id, row] of raw) latest.set(id, row);
        emit({ type: 'update', ids });
      });
    },

    getRow(id) {
      const raw = latest.get(id);
      return raw ? toGridRow(id, raw) : undefined;
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
