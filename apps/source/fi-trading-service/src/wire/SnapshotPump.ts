/**
 * Drains a dataset's snapshot to one subscriber, paced by backpressure.
 *
 * Three things it must get right:
 *
 *  - **Batch size.** Frames carry `SNAPSHOT_CHUNK_SIZE` rows so the wire
 *    frame, the client's flush chunk and the hub's replay bucket share one
 *    boundary. See the note on that constant.
 *  - **Backpressure.** When the socket is backed up it stops pulling from
 *    the source and waits, rather than queueing frames in memory.
 *  - **Cancellation.** A second trigger must abandon the in-flight pump
 *    before starting the next one, which is exactly what `restart()` on the
 *    client does. Cancellation is checked between every batch, so an
 *    abandoned pump stops within one batch rather than running to completion
 *    and interleaving its frames with the new one's.
 */

import type { RowSource } from '../datasets/RowSource.js';
import type { OutboundQueue } from './OutboundQueue.js';

export interface SnapshotPumpDeps {
  source: RowSource;
  queue: OutboundQueue;
  batchSize: number;
  /** Emit one batch. Throwing aborts the pump. */
  sendBatch(rows: readonly unknown[], batchNumber: number): void;
  /** Emit the completion sentinel. Not called when cancelled. */
  sendComplete(rowCount: number): void;
  /** Checked between batches. */
  isCancelled(): boolean;
  /** Injected in tests; defaults to `setImmediate`. */
  yieldToEventLoop?(): Promise<void>;
}

export interface SnapshotPumpResult {
  rowsSent: number;
  batchesSent: number;
  cancelled: boolean;
}

function defaultYield(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

export async function pumpSnapshot(deps: SnapshotPumpDeps): Promise<SnapshotPumpResult> {
  const { source, queue, batchSize, sendBatch, sendComplete, isCancelled } = deps;
  const yieldToEventLoop = deps.yieldToEventLoop ?? defaultYield;

  let rowsSent = 0;
  let batchesSent = 0;

  for await (const batch of source.snapshot(batchSize)) {
    if (isCancelled()) return { rowsSent, batchesSent, cancelled: true };

    // Pause before producing, not after — the point is to avoid building a
    // frame we would then have to hold.
    if (queue.backedUp()) {
      await queue.waitForDrain();
      if (isCancelled()) return { rowsSent, batchesSent, cancelled: true };
    }

    if (batch.length > 0) {
      sendBatch(batch, batchesSent);
      rowsSent += batch.length;
      batchesSent += 1;
    }

    // Let other sessions and the live loop interleave.
    await yieldToEventLoop();
  }

  if (isCancelled()) return { rowsSent, batchesSent, cancelled: true };
  sendComplete(rowsSent);
  return { rowsSent, batchesSent, cancelled: false };
}
