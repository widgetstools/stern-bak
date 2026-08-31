import type { Table, View, ViewConfigUpdate } from '@perspective-dev/client';
import { viewCacheKey } from './query/viewConfig.js';

type Entry = {
  key: string;
  view: Promise<View>;
  /** Readers currently inside `withView`; a view is only deleted at zero. */
  uses: number;
  evicted: boolean;
};

/**
 * Perspective views are live: once built, a view keeps its aggregate tree up to
 * date as the table changes, so scrolling a group open and shut, or paging
 * through blocks, should reuse one view rather than rebuild it per request.
 * They also hold engine memory until deleted, hence the cap and the LRU.
 */
export class ViewCache {
  private readonly entries = new Map<string, Entry>();
  private readonly table: Promise<Table>;
  private readonly limit: number;

  constructor(table: Promise<Table>, limit = 24) {
    this.table = table;
    this.limit = limit;
  }

  /**
   * Runs `read` against the view for `config`, holding the view open for the
   * duration so eviction cannot delete it mid-read.
   */
  async withView<T>(config: ViewConfigUpdate, read: (view: View) => Promise<T>): Promise<T> {
    const key = viewCacheKey(config);
    let entry = this.entries.get(key);
    if (entry) {
      // Re-inserting moves the entry to the end, which is the LRU ordering.
      this.entries.delete(key);
      this.entries.set(key, entry);
    } else {
      entry = {
        key,
        view: this.table.then((table) => table.view(config)),
        uses: 0,
        evicted: false,
      };
      this.entries.set(key, entry);
    }
    entry.uses++;
    try {
      const view = await entry.view;
      return await read(view);
    } catch (error) {
      // A view that failed to build must not stay cached, or every later
      // request for the same config replays the same failure.
      if (this.entries.get(key) === entry) this.entries.delete(key);
      entry.evicted = true;
      throw error;
    } finally {
      entry.uses--;
      void this.disposeIfDone(entry);
      this.evict();
    }
  }

  /** Deletes every view, waiting for any read still in flight to finish. */
  async clear(): Promise<void> {
    const entries = [...this.entries.values()];
    this.entries.clear();
    for (const entry of entries) entry.evicted = true;
    await Promise.all(entries.map((entry) => this.disposeIfDone(entry)));
  }

  get size(): number {
    return this.entries.size;
  }

  private evict(): void {
    if (this.entries.size <= this.limit) return;

    for (const entry of this.entries.values()) {
      if (this.entries.size <= this.limit) break;
      // Skip anything a reader is inside; it will come up for eviction again.
      if (entry.uses > 0) continue;
      this.entries.delete(entry.key);
      entry.evicted = true;
      void this.disposeIfDone(entry);
    }
  }

  private async disposeIfDone(entry: Entry): Promise<void> {
    if (!entry.evicted || entry.uses > 0) return;
    try {
      const view = await entry.view;
      await view.delete();
    } catch {
      // The view either never built or is already gone; either way there is
      // nothing left to reclaim.
    }
  }
}
