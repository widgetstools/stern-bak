import type { SsrmGetRowsRequest, SsrmGetRowsResult } from '@wellsfargo-starui/data/runtime';

type Row = Record<string, unknown>;

/**
 * Everything in a block request that decides WHICH rows a block holds — sort,
 * column filters, quick filter, expanded group path, value / pivot columns.
 * The row window itself is the block address, not part of the key.
 */
export function ssrmViewKey(req: SsrmGetRowsRequest): string {
  const filter = req.filterModel
    ? Object.keys(req.filterModel).sort().map((col) => [col, req.filterModel![col]])
    : null;
  return JSON.stringify([
    req.sortModel ?? [],
    filter,
    req.quickFilterText ?? '',
    (req.rowGroupCols ?? []).map((c) => c.id),
    req.groupKeys ?? [],
    (req.valueCols ?? []).map((c) => [c.id, c.aggFunc ?? '']),
    req.pivotMode ? (req.pivotCols ?? []).map((c) => c.id) : null,
  ]);
}

interface Entry {
  result: SsrmGetRowsResult & { rowData: Row[] };
  /** row id → index into rowData, so a tick can patch one row in place. */
  ids: Map<string, number>;
  at: number;
}

export interface SsrmBlockCacheOptions {
  /** Blocks held before the least recently used is dropped. Default 64. */
  maxBlocks?: number;
  /** Age after which a block is treated as a miss. Default 10 000 ms. */
  ttlMs?: number;
  now?: () => number;
}

/**
 * Client-side block cache for the SSRM datasource.
 *
 * AG Grid creates stub rows the moment they scroll into view and only then
 * asks for the block, so even a 5 ms worker round trip paints a blank frame
 * and renders the rows twice. Serving a warm block synchronously paints them
 * once, with data. Contents stay live because ticks patch rows by id; the
 * cache is cleared whenever positions can move (refresh, purge, removals) —
 * it is a cache of a fixed view, never a second source of truth.
 */
export class SsrmBlockCache {
  private readonly blocks = new Map<string, Entry>();
  private readonly rowIndex = new Map<string, Set<string>>();
  private readonly maxBlocks: number;
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(options: SsrmBlockCacheOptions = {}) {
    this.maxBlocks = Math.max(1, options.maxBlocks ?? 64);
    this.ttlMs = options.ttlMs ?? 10_000;
    this.now = options.now ?? (() => Date.now());
  }

  get size(): number {
    return this.blocks.size;
  }

  has(viewKey: string, start: number): boolean {
    return this.get(viewKey, start) !== undefined;
  }

  get(viewKey: string, start: number): SsrmGetRowsResult | undefined {
    const key = blockKey(viewKey, start);
    const entry = this.blocks.get(key);
    if (!entry) return undefined;
    if (this.now() - entry.at > this.ttlMs) {
      this.drop(key, entry);
      return undefined;
    }
    // LRU touch.
    this.blocks.delete(key);
    this.blocks.set(key, entry);
    return entry.result;
  }

  set(
    viewKey: string,
    start: number,
    result: SsrmGetRowsResult,
    idOf: (row: Row) => string | undefined,
  ): void {
    const key = blockKey(viewKey, start);
    const existing = this.blocks.get(key);
    if (existing) this.drop(key, existing);
    const rowData = [...result.rowData] as Row[];
    const ids = new Map<string, number>();
    rowData.forEach((row, i) => {
      const id = idOf(row);
      if (id === undefined) return;
      ids.set(id, i);
      let owners = this.rowIndex.get(id);
      if (!owners) {
        owners = new Set();
        this.rowIndex.set(id, owners);
      }
      owners.add(key);
    });
    this.blocks.set(key, { result: { ...result, rowData }, ids, at: this.now() });
    while (this.blocks.size > this.maxBlocks) {
      const oldest = this.blocks.keys().next().value as string;
      this.drop(oldest, this.blocks.get(oldest)!);
    }
  }

  /** Overwrite cached copies of these rows (by id). Returns how many were patched. */
  patchRows(rows: readonly Row[], idOf: (row: Row) => string | undefined): number {
    let patched = 0;
    for (const row of rows) {
      const id = idOf(row);
      if (id === undefined) continue;
      const owners = this.rowIndex.get(id);
      if (!owners) continue;
      for (const key of owners) {
        const entry = this.blocks.get(key);
        const index = entry?.ids.get(id);
        if (entry && index !== undefined) {
          entry.result.rowData[index] = row;
          patched += 1;
        }
      }
    }
    return patched;
  }

  clear(): void {
    this.blocks.clear();
    this.rowIndex.clear();
  }

  private drop(key: string, entry: Entry): void {
    this.blocks.delete(key);
    for (const id of entry.ids.keys()) {
      const owners = this.rowIndex.get(id);
      owners?.delete(key);
      if (owners && owners.size === 0) this.rowIndex.delete(id);
    }
  }
}

function blockKey(viewKey: string, start: number): string {
  return `${viewKey}#${start}`;
}
