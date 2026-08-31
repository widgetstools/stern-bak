import type { Client, Table } from '@perspective-dev/client';
import { composeRowId } from '@wellsfargo-starui/types/shared';
import { INDEX_COLUMN, flattenRow, flattenRowsColumnar, type PerspectiveSchema } from './schema.js';

/*
 * The per-window Perspective table behind a server-side-row-model grid: a
 * replica of the provider's row set, fed by the SAME hub subscription the
 * client-side row model reads (snapshot replace + keyed ticks), queried by the
 * SSRM datasource through views. The provider sub-worker stays the transport
 * authority; this table is a local, disposable projection of it.
 */

export type FeedTableEvent =
  /**
   * Rows changed in place. `rows` carries the new grid-ready (flattened,
   * index-stamped) values keyed by index, so a consumer can rewrite a row it
   * is already showing without asking the engine for anything.
   */
  | { type: 'update'; rows: Map<string, Record<string, unknown>> }
  /** The whole table was replaced; any cached row counts are stale. */
  | { type: 'snapshot' };

export interface SsrmFeedTable {
  /** The Perspective table, resolving once the engine has booted. */
  readonly table: Promise<Table>;
  /** Replace the table's contents with a fresh provider snapshot. */
  applySnapshot(rows: readonly Record<string, unknown>[]): void;
  /** Apply keyed live ticks (whole rows, as the hub broadcasts them). */
  applyTicks(rows: readonly Record<string, unknown>[]): void;
  /**
   * Latest grid-ready values for a row that has ticked since the last
   * snapshot, or undefined when it has not (its block data is then current).
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
  const listeners = new Set<(event: FeedTableEvent) => void>();
  /** Grid-ready rows that ticked since the last snapshot, by index value. */
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
       * fields an update never mentioned. The flat rows built for the engine
       * write double as the grid-ready rows the patch path reads — one
       * materialisation, two consumers.
       */
      const flat: Record<string, unknown>[] = [];
      const merged = new Map<string, Record<string, unknown>>();
      for (const row of rows) {
        const id = indexOf(row);
        if (id === null) continue;
        const flatRow = flattenRow(row, columns);
        flatRow[INDEX_COLUMN] = id;
        flat.push(flatRow);
        merged.set(id, flatRow);
      }
      if (flat.length === 0) return;
      enqueue(async () => {
        if (disposed) return;
        await (await table).update(flat as Parameters<Table['update']>[0]);
        for (const [id, row] of merged) latest.set(id, row);
        emit({ type: 'update', rows: merged });
      });
    },

    getRow(id) {
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
