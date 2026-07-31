/**
 * createRateBudgetBatcher — honours the trigger's requested aggregate
 * update rate EXACTLY, independent of timer resolution.
 *
 * The trigger rate segment (`/snapshot/positions/{clientId}/{rate}`) is
 * the target ROW-UPDATES PER SECOND. The live loop ticks on a fixed
 * cadence (`LIVE_TICK_MS`); each tick this batcher converts real
 * elapsed time into a row budget (`rowsPerSec × elapsed / 1000`,
 * fractional remainder carried), draws that many DISTINCT ROWS
 * UNIFORMLY AT RANDOM from the delivered set, and applies `tickRow`
 * to each — so 10 000 updates/sec means 10 000 row-updates/sec spread
 * randomly across all rows, exactly, whether the timer fires at 40 ms
 * or gets delayed by the event loop.
 *
 * This replaces the old parity-wave sweep + coverage floor, which
 * inflated the published rate far past what the trigger asked for
 * (full-set coverage every second regardless of `rate`) — the
 * "sweep firehose" shape that key conflation cannot compress and that
 * no real feed produces.
 *
 * Bounds:
 *   - the carried budget is capped at ONE second's worth, so a
 *     backpressure stall replays at most 1 s of updates when the
 *     socket drains instead of an unbounded burst;
 *   - each frame is capped at `maxRowsPerFrame` rows (receiver decode
 *     budget); leftover budget carries to the next tick.
 */
export interface RateBudgetBatcherOptions<TPayload> {
  /** Delivered-set size — row indices are drawn from [0, rowCount). */
  rowCount: number;
  /** Target aggregate row-updates per second (the trigger `rate`). */
  rowsPerSec: number;
  /** Hard cap on rows in a single live frame. */
  maxRowsPerFrame: number;
  /**
   * Mutate the row at `index` and return its wire payload (full row or
   * sparse delta). `null` skips the row for this tick.
   */
  tickRow: (index: number) => TPayload | null;
  /** Optional RNG for tests. */
  random?: () => number;
  /** Optional clock for tests. */
  now?: () => number;
}

export function createRateBudgetBatcher<TPayload>(
  options: RateBudgetBatcherOptions<TPayload>,
): () => TPayload[] {
  const {
    rowCount,
    rowsPerSec,
    maxRowsPerFrame,
    tickRow,
    random = Math.random,
    now = Date.now,
  } = options;

  // Budget in integer MILLI-ROWS (rowsPerSec × elapsedMs is exact for
  // integer inputs) — float accumulation of fractional rows/tick
  // otherwise drifts below the requested rate over time.
  let budgetMilli = 0;
  let lastTick = now();

  return () => {
    if (rowCount === 0 || rowsPerSec <= 0) return [];
    const t = now();
    const elapsedMs = Math.max(0, Math.min(1000, t - lastTick));
    lastTick = t;
    budgetMilli = Math.min(
      rowsPerSec * 1000,
      budgetMilli + rowsPerSec * elapsedMs,
    );

    let target = Math.floor(budgetMilli / 1000);
    if (target < 1) return [];
    target = Math.min(target, maxRowsPerFrame, rowCount);

    // Distinct random rows. The attempts cap keeps dense draws (target
    // close to rowCount) from spinning on collisions — emitting a few
    // fewer rows on such a tick is fine; the budget only pays for what
    // was actually drawn.
    const indices = new Set<number>();
    const maxAttempts = target * 4;
    let attempts = 0;
    while (indices.size < target && attempts < maxAttempts) {
      indices.add(Math.floor(random() * rowCount));
      attempts++;
    }
    budgetMilli -= indices.size * 1000;

    const batch: TPayload[] = [];
    for (const index of indices) {
      const payload = tickRow(index);
      if (payload !== null) batch.push(payload);
    }
    return batch;
  };
}
