/**
 * A row source over a fixed array, for exercising the wire without a book.
 *
 * The transport tests care about batching, dirty-set draining and backpressure
 * — none of which depend on what a row means. Driving them through the real
 * book would couple protocol tests to the factor model and make them slow for
 * no gain in what they actually assert.
 */

import type { DatasetId } from '../wire/destinations.js';
import type { RowSource } from './RowSource.js';

export interface StubRow extends Record<string, unknown> {
  positionId: string;
  midPrice: number;
  lastUpdate: number;
}

export interface StubRowSourceOptions {
  rowCount?: number;
  dataset?: DatasetId;
  keyColumn?: string;
}

export class StubRowSource implements RowSource {
  readonly dataset: DatasetId;
  readonly keyColumn: string;

  private readonly rows: StubRow[] = [];
  private readonly dirty = new Set<number>();
  private cursor = 0;

  constructor(options: StubRowSourceOptions = {}) {
    this.dataset = options.dataset ?? 'positions';
    this.keyColumn = options.keyColumn ?? 'positionId';
    const rowCount = options.rowCount ?? 5;
    for (let i = 0; i < rowCount; i++) {
      this.rows.push({ positionId: `P${i}`, midPrice: 100 + i / 100, lastUpdate: 0 });
    }
  }

  size(): number {
    return this.rows.length;
  }

  pendingLive(): number {
    return this.dirty.size;
  }

  async *snapshot(batchSize: number): AsyncIterable<readonly StubRow[]> {
    for (let i = 0; i < this.rows.length; i += batchSize) {
      yield this.rows.slice(i, i + batchSize);
    }
  }

  drainLive(max: number): readonly StubRow[] {
    if (max <= 0 || this.dirty.size === 0) return [];
    const out: StubRow[] = [];
    for (const index of this.dirty) {
      out.push(this.rows[index] as StubRow);
      this.dirty.delete(index);
      if (out.length >= max) break;
    }
    return out;
  }

  /** Mark `count` rows changed, walking the book so every row is reached. */
  tick(count: number): number {
    if (this.rows.length === 0) return 0;
    const touched = Math.min(count, this.rows.length);
    for (let i = 0; i < touched; i++) {
      const index = this.cursor++ % this.rows.length;
      const row = this.rows[index] as StubRow;
      this.rows[index] = { ...row, midPrice: row.midPrice + 0.01, lastUpdate: Date.now() };
      this.dirty.add(index);
    }
    return touched;
  }

  allRows(): readonly StubRow[] {
    return this.rows;
  }
}
