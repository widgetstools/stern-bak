import { buildQuickFilterText } from "./quickFilter.js";
import type { CacheStats, ICacheIngest, Row, TickEvent } from "./types.js";

export type TickListener = (event: TickEvent) => void;

export interface RowStoreOptions {
  keyColumn: string;
  /** Optional allow-list of fields to retain (projection). */
  projectFields?: string[];
  /**
   * Columns included in the CSRM-style quick-filter cache.
   * Defaults to all primitive fields on each row (skipping `__*`).
   */
  quickFilterColumns?: string[];
}

/**
 * Keyed in-memory row cache with revision tracking, set-filter indexes,
 * and a CSRM-parity quick-filter text cache.
 * Transport-agnostic — populate via {@link ICacheIngest}.
 */
export class RowStore implements ICacheIngest {
  readonly keyColumn: string;
  private readonly projectFields: string[] | null;
  private readonly quickFilterColumns: string[] | null;
  private readonly rows = new Map<string, Row>();
  /** key → precomputed lowercase quick-filter aggregate (CSRM cacheQuickFilter). */
  private readonly quickFilterCache = new Map<string, string>();
  private revision = 0;
  private columns = new Set<string>();
  private listeners = new Set<TickListener>();

  constructor(options: RowStoreOptions) {
    this.keyColumn = options.keyColumn;
    this.projectFields = options.projectFields ?? null;
    this.quickFilterColumns = options.quickFilterColumns ?? null;
  }

  onTick(listener: TickListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: Omit<TickEvent, "revision">): void {
    const full: TickEvent = { ...event, revision: this.revision };
    for (const l of this.listeners) l(full);
  }

  private project(row: Row): Row {
    if (!this.projectFields) return row;
    const out: Row = {};
    for (const f of this.projectFields) {
      if (f in row) out[f] = row[f];
    }
    const key = row[this.keyColumn];
    if (key != null) out[this.keyColumn] = key;
    return out;
  }

  /**
   * Track which columns exist, for `getStats`.
   *
   * This replaced a full `column → value → Set<key>` inverted index that was
   * maintained on every snapshot row and every tick. Its only reader,
   * `getUniqueValues`, had no callers — set-filter values go through
   * `getUniqueValuesFiltered`, which scans the live row map because the index
   * could be stale mid-snapshot. At 100k rows x 130 columns the index cost
   * ~1.7 GB of heap, ~3.8x on snapshot ingest and ~4x on every tick, and
   * nothing ever read it. See `npm run bench:ssrm`.
   */
  private trackColumns(row: Row): void {
    for (const col in row) this.columns.add(col);
  }

  get size(): number {
    return this.rows.size;
  }

  getRevision(): number {
    return this.revision;
  }

  getStats(): CacheStats {
    return {
      rowCount: this.rows.size,
      revision: this.revision,
      keyColumn: this.keyColumn,
      columns: [...this.columns],
    };
  }

  getRow(key: string): Row | undefined {
    return this.rows.get(key);
  }

  /** Iterate all rows (generator — avoids materialising 500k arrays when possible). */
  *iterate(): Generator<Row> {
    for (const row of this.rows.values()) yield row;
  }

  /** Iterate `[key, row]` pairs (for quick-filter cache lookups during scans). */
  *iterateEntries(): Generator<[string, Row]> {
    for (const entry of this.rows) yield entry;
  }

  getAllRows(): Row[] {
    return [...this.rows.values()];
  }

  getKeys(): string[] {
    return [...this.rows.keys()];
  }

  /** CSRM-style cached quick-filter aggregate for a row key. */
  getQuickFilterText(key: string): string {
    return this.quickFilterCache.get(key) ?? "";
  }

  private setQuickFilterCache(key: string, row: Row): void {
    this.quickFilterCache.set(
      key,
      buildQuickFilterText(row, this.quickFilterColumns ?? undefined),
    );
  }

  clear(): void {
    this.rows.clear();
    this.quickFilterCache.clear();
    this.columns.clear();
    this.revision++;
    this.emit({ type: "snapshot" });
  }

  replaceSnapshot(rows: Row[]): void {
    this.rows.clear();
    this.quickFilterCache.clear();
    this.columns.clear();
    for (const raw of rows) {
      const row = this.project(raw);
      const key = row[this.keyColumn];
      if (key == null) continue;
      const ks = String(key);
      this.rows.set(ks, row);
      this.trackColumns(row);
      this.setQuickFilterCache(ks, row);
    }
    this.revision++;
    this.emit({ type: "snapshot" });
  }

  upsert(rows: Row[]): void {
    if (rows.length === 0) return;
    const changed: string[] = [];
    const changedRows: Row[] = [];
    const changedCols = new Set<string>();
    for (const raw of rows) {
      const incoming = this.project(raw);
      const keyVal = incoming[this.keyColumn];
      if (keyVal == null) continue;
      const key = String(keyVal);
      const prev = this.rows.get(key);
      let next: Row;
      if (prev) {
        // Sparse merge: only overwrite provided fields.
        next = { ...prev };
        for (const [k, v] of Object.entries(incoming)) {
          if (v !== undefined) {
            next[k] = v;
            changedCols.add(k);
          }
        }
      } else {
        next = incoming;
        for (const k of Object.keys(next)) changedCols.add(k);
      }
      this.rows.set(key, next);
      this.trackColumns(next);
      this.setQuickFilterCache(key, next);
      changed.push(key);
      changedRows.push(next);
    }
    if (changed.length === 0) return;
    this.revision++;
    this.emit({
      type: "rows",
      keys: changed,
      columns: [...changedCols],
      rows: changedRows,
    });
  }

  remove(keys: string[]): void {
    const removed: string[] = [];
    for (const key of keys) {
      const prev = this.rows.get(key);
      if (!prev) continue;
      this.rows.delete(key);
      this.quickFilterCache.delete(key);
      removed.push(key);
    }
    if (removed.length === 0) return;
    this.revision++;
    this.emit({ type: "rows", keys: removed });
  }

  /**
   * Unique values for a column (for AG Grid set filter).
   * Scans the live row map — same source of truth as
   * {@link getUniqueValuesFiltered}, which is what the query engine calls.
   */
  getUniqueValues(column: string): string[] {
    // An unknown column yields `[]`, not `['']`. Scanning would map every
    // row's `undefined` to the empty string; the index this replaced simply
    // had no entry for the column.
    if (!this.columns.has(column)) return [];
    return this.getUniqueValuesFiltered(column);
  }

  /**
   * Unique values among rows that pass an optional filter predicate.
   * Always scans the live row map (source of truth after snapshot/upserts).
   */
  getUniqueValuesFiltered(
    column: string,
    predicate?: (row: Row) => boolean,
  ): string[] {
    const seen = new Set<string>();
    for (const row of this.rows.values()) {
      if (predicate && !predicate(row)) continue;
      const v = row[column];
      seen.add(v == null ? "" : String(v));
    }
    return [...seen].sort((a, b) => a.localeCompare(b));
  }
}
