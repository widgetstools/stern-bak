/**
 * createRateBudgetBatcher — real-world publication shape: an exact
 * aggregate update rate delivered as bursty, skewed arrivals with
 * key conflation inside each frame window.
 *
 * The trigger rate segment (`/snapshot/positions/{clientId}/{rate}`) is
 * the target GENERATED UPDATES PER SECOND. The live loop ticks on a
 * fixed cadence (`LIVE_TICK_MS`); each tick this batcher:
 *
 *   1. Mints budget from real elapsed time (`rate × elapsed / 1000`,
 *      integer milli-updates, fractional remainder carried) — the
 *      long-run generated rate is exact regardless of timer jitter.
 *   2. Spends a BURSTY slice of the accumulated budget: the nominal
 *      per-tick spend is scaled by an exponential factor (mean 1,
 *      clamped [0.25, 4]), so quiet ticks bank budget and heavy ticks
 *      drain it — like market arrivals, unlike a metronome.
 *   3. Draws that many updates WITH REPLACEMENT from a Zipf-like
 *      distribution over a per-batcher random permutation: a few hot
 *      instruments tick constantly, the tail rarely, and the hot set
 *      is arbitrary rather than "the first rows".
 *   4. CONFLATES same-row draws within the frame: `tickRow` runs per
 *      generated update (state advances every time), but one payload
 *      ships per row — last wins, or `mergePayloads` unions sparse
 *      deltas. `updatesGenerated` vs `payloads.length` is the
 *      conflation the wire can report.
 *
 * Bounds: carried budget caps at ONE second's worth (a stall replays at
 * most 1 s); each frame caps at `maxRowsPerFrame` GENERATED updates.
 */
export interface LiveBatch<TPayload> {
  payloads: TPayload[];
  /** Updates generated this frame; `- payloads.length` were conflated. */
  updatesGenerated: number;
}

export interface RateBudgetBatcherOptions<TPayload> {
  /** Delivered-set size — row indices are drawn from [0, rowCount). */
  rowCount: number;
  /** Target aggregate generated updates per second (the trigger `rate`). */
  rowsPerSec: number;
  /** Hard cap on generated updates in a single live frame. */
  maxRowsPerFrame: number;
  /**
   * Mutate the row at `index` and return its wire payload (full row or
   * sparse delta). Runs once per GENERATED update, including duplicate
   * draws of the same row. `null` skips that update's payload.
   */
  tickRow: (index: number) => TPayload | null;
  /**
   * Combine payloads when one row is drawn more than once in a frame.
   * Default: last non-null payload wins (correct for full-row wire).
   * Sparse wire should union fields: `(a, b) => ({ ...a, ...b })`.
   */
  mergePayloads?: (prev: TPayload, next: TPayload) => TPayload;
  /** Skew exponent (>1 concentrates on hot rows). Default 3. */
  skew?: number;
  /** Optional RNG for tests. */
  random?: () => number;
  /** Optional clock for tests. */
  now?: () => number;
}

export function createRateBudgetBatcher<TPayload>(
  options: RateBudgetBatcherOptions<TPayload>,
): () => LiveBatch<TPayload> {
  const {
    rowCount,
    rowsPerSec,
    maxRowsPerFrame,
    tickRow,
    mergePayloads,
    skew = 3,
    random = Math.random,
    now = Date.now,
  } = options;

  // Hot-rank permutation: rank r (0 = hottest) → row index. Built once
  // per batcher so the hot set is stable for the subscription's life
  // but different across restarts / subscriptions.
  let hotRank: Uint32Array | null = null;
  const rankToIndex = (): Uint32Array => {
    if (hotRank) return hotRank;
    const p = new Uint32Array(rowCount);
    for (let i = 0; i < rowCount; i++) p[i] = i;
    for (let i = rowCount - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      const t = p[i]!; p[i] = p[j]!; p[j] = t;
    }
    hotRank = p;
    return p;
  };

  let budgetMilli = 0;
  let lastTick = now();

  return () => {
    if (rowCount === 0 || rowsPerSec <= 0) {
      return { payloads: [], updatesGenerated: 0 };
    }
    const t = now();
    const elapsedMs = Math.max(0, Math.min(1000, t - lastTick));
    lastTick = t;
    budgetMilli = Math.min(
      rowsPerSec * 1000,
      budgetMilli + rowsPerSec * elapsedMs,
    );

    const available = Math.floor(budgetMilli / 1000);
    if (available < 1) return { payloads: [], updatesGenerated: 0 };

    // Bursty spend: exponential factor with mean 1, clamped so a frame
    // is never silent for long nor 10x the nominal. The factor decides
    // how much of the AVAILABLE budget to spend — it never mints.
    const nominal = (rowsPerSec * Math.max(elapsedMs, 1)) / 1000;
    const factor = Math.min(4, Math.max(0.25, -Math.log(1 - random())));
    // Backlog pressure: everything banked beyond this tick's own mint is
    // drained on top of the bursty slice, so holdback from quiet ticks
    // reappears within a tick or two instead of accumulating into the
    // 1-second clamp and silently deflating the long-run rate.
    const pressure = Math.max(0, available - Math.ceil(nominal));
    const desired = Math.max(1, Math.round(nominal * factor)) + pressure;
    const generate = Math.min(available, desired, maxRowsPerFrame);
    budgetMilli -= generate * 1000;

    const perm = rankToIndex();
    const merged = new Map<number, TPayload>();
    for (let u = 0; u < generate; u++) {
      // Zipf-ish: u^skew concentrates draws on low ranks (hot rows).
      const rank = Math.floor(rowCount * Math.pow(random(), skew));
      const index = perm[Math.min(rank, rowCount - 1)]!;
      const payload = tickRow(index);
      if (payload === null) continue;
      const prev = merged.get(index);
      merged.set(
        index,
        prev !== undefined && mergePayloads ? mergePayloads(prev, payload) : payload,
      );
    }
    return { payloads: [...merged.values()], updatesGenerated: generate };
  };
}
