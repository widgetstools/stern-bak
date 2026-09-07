/**
 * What a dataset must provide to be servable.
 *
 * Deliberately narrow, because the sources behind it are very different: the
 * live book is a columnar in-memory store, the security master is a streaming
 * DuckDB cursor, and the historical positions path is a point-in-time query.
 * The wire layer only needs "give me the snapshot in batches" and "give me
 * what changed".
 */

import type { DatasetId } from '../wire/destinations.js';

export interface RowSource {
  readonly dataset: DatasetId;
  /** Row identity. The hub silently drops rows that don't resolve this. */
  readonly keyColumn: string;

  /** Rows the snapshot will deliver, or null when not known up front. */
  size(): number | null;

  /**
   * The snapshot, in batches of at most `batchSize`. Async because cold
   * datasets stream out of DuckDB; hot ones just yield slices of memory.
   */
  snapshot(batchSize: number): AsyncIterable<readonly unknown[]>;

  /**
   * Up to `max` rows that changed since the last call, as FULL rows.
   *
   * Full rows, not partials: the hub does a whole-row `cache.set(key, row)`
   * on every branch of `applyRows`, so a partial row would wipe every field
   * it omitted. `cfg.thinDeltas` thins the hub-to-window hop only — the hub
   * computes those patches itself by diffing against a complete row.
   *
   * Rows are unique by `keyColumn` within a call, which puts the hub on its
   * `uniqueKeys` fast branch (no per-batch dedupe Set).
   */
  drainLive(max: number): readonly unknown[];

  /** Rows currently waiting to be drained. */
  pendingLive(): number;
}
