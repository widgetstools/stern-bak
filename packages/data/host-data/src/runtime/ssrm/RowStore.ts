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
  /** column → value → set of keys */
  private readonly uniques = new Map<string, Map<string, Set<string>>>();
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

  private indexRemove(key: string, row: Row): void {
    for (const [col, val] of Object.entries(row)) {
      const colMap = this.uniques.get(col);
      if (!colMap) continue;
      const vs = val == null ? "" : String(val);
      const set = colMap.get(vs);
      if (!set) continue;
      set.delete(key);
      if (set.size === 0) colMap.delete(vs);
    }
  }

  private indexAdd(key: string, row: Row): void {
    for (const [col, val] of Object.entries(row)) {
      this.columns.add(col);
      let colMap = this.uniques.get(col);
      if (!colMap) {
        colMap = new Map();
        this.uniques.set(col, colMap);
      }
      const vs = val == null ? "" : String(val);
      let set = colMap.get(vs);
      if (!set) {
        set = new Set();
        colMap.set(vs, set);
      }
      set.add(key);
    }
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
    this.uniques.clear();
    this.quickFilterCache.clear();
    this.columns.clear();
    this.revision++;
    this.emit({ type: "snapshot" });
  }

  replaceSnapshot(rows: Row[]): void {
    this.rows.clear();
    this.uniques.clear();
    this.quickFilterCache.clear();
    this.columns.clear();
    for (const raw of rows) {
      const row = this.project(raw);
      const key = row[this.keyColumn];
      if (key == null) continue;
      const ks = String(key);
      this.rows.set(ks, row);
      this.indexAdd(ks, row);
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
        this.indexRemove(key, prev);
      } else {
        next = incoming;
        for (const k of Object.keys(next)) changedCols.add(k);
      }
      this.rows.set(key, next);
      this.indexAdd(key, next);
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
      this.indexRemove(key, prev);
      this.rows.delete(key);
      this.quickFilterCache.delete(key);
      removed.push(key);
    }
    if (removed.length === 0) return;
    this.revision++;
    this.emit({ type: "rows", keys: removed });
  }

  /** Unique values for a column (for AG Grid set filter). */
  getUniqueValues(column: string): string[] {
    const colMap = this.uniques.get(column);
    if (!colMap) return [];
    return [...colMap.keys()].sort((a, b) => a.localeCompare(b));
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
