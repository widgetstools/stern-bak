/**
 * Dataset id to row source.
 *
 * Phase 1 registers a synthetic positions book. Later phases swap in the
 * columnar hot store and the DuckDB-backed cold streams behind the same
 * `RowSource` interface, so nothing above this file changes.
 */

import type { DatasetId, SubscribeTarget } from '../wire/destinations.js';
import type { SourceResolver } from '../wire/StompSession.js';
import type { RowSource } from './RowSource.js';

export class DatasetRegistry implements SourceResolver {
  private readonly live = new Map<DatasetId, RowSource>();

  register(source: RowSource): void {
    this.live.set(source.dataset, source);
  }

  has(dataset: DatasetId): boolean {
    return this.live.has(dataset);
  }

  resolve(target: SubscribeTarget): RowSource | null {
    // Historical as-of-date streams are served from the corpus, which does
    // not exist yet. Returning null makes that an explicit protocol error
    // rather than silently handing back today's live rows.
    if (target.asOfDate !== null) return null;
    return this.live.get(target.dataset) ?? null;
  }

  /** Every registered source, for the tick loop. */
  sources(): readonly RowSource[] {
    return [...this.live.values()];
  }
}
