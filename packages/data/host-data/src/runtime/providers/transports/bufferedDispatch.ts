/**
 * bufferedDispatch — wrap a fanout sink with conflate-by-key and/or
 * trailing-edge throttle.
 *
 * Two knobs, both optional:
 *   • conflateKeyFn — when set, the buffer is keyed by `conflateKeyFn(row)`.
 *     A second update for the same key within the same throttle window
 *     replaces the first (last-write-wins upsert). Maps cleanly onto
 *     AG-Grid's `applyTransactionAsync({ update })`. Rows whose key
 *     resolves to `null`/`undefined` are kept un-conflated (appended).
 *   • throttleMs   — flush window in milliseconds. 0 / undefined →
 *     immediate flush (effectively a passthrough). When set, calls fill
 *     the buffer; a single timer scheduled on the first call of each
 *     window flushes everything at the trailing edge.
 *
 * Restored from the v1 data-plane fanout (commit 76c5113c); generalised
 * from `conflateByKey: string` to a key function so composite-key
 * providers can conflate via `composeRowId(row, keyColumn)`.
 *
 * A third knob bounds the BATCH, not the memory:
 *   • maxBufferedRows — flush immediately (timer cancelled) the moment
 *     the buffer holds this many entries. Timers starve on a saturated
 *     thread: measured live, a worker at ~91% CPU delivered its 100ms
 *     conflation timer every ~1.4s, so ~3,800-row mega-batches reached
 *     the grid as single giant flushes (100-200ms main-thread tasks)
 *     instead of ten small ones. `push()` runs on every incoming frame
 *     regardless of timer health, so a size cap preserves batch
 *     granularity precisely when the timer cannot. Unset → timer-only
 *     flushing (the buffer is then unbounded by design; conflation
 *     bounds memory by unique keys).
 */

export interface BufferedDispatchOpts<TRow> {
  /** Resolve a row's conflation key. Omit to disable conflation (order-preserving). */
  conflateKeyFn?: (row: TRow) => unknown;
  throttleMs?: number;
  /**
   * Flush as soon as the buffer holds this many entries, without waiting
   * for the throttle timer — see the module doc for why (timer
   * starvation under CPU saturation). Only meaningful with `throttleMs`
   * set; ignored in immediate mode. Unset → no cap.
   */
  maxBufferedRows?: number;
  /** Receives the flushed batch. Called with at least one row. */
  flush: (rows: TRow[]) => void;
  /** Optional clock injection for tests. Defaults to global setTimeout/clearTimeout. */
  setTimer?: (cb: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface BufferedDispatchHandle<TRow> {
  /** Push rows into the buffer. Triggers an immediate flush if no throttle is set. */
  push: (rows: readonly TRow[]) => void;
  /** Force-flush any pending rows now. */
  flushNow: () => void;
  /** Cancel any pending flush + drop the buffer. Idempotent. */
  teardown: () => void;
}

export function bufferedDispatch<TRow>(
  opts: BufferedDispatchOpts<TRow>,
): BufferedDispatchHandle<TRow> {
  const { conflateKeyFn, throttleMs, flush, maxBufferedRows } = opts;
  const setTimer = opts.setTimer ?? ((cb, ms) => setTimeout(cb, ms));
  const clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));

  // Conflated mode keeps a Map keyed by conflateKeyFn(row); non-conflated
  // mode keeps an ordered list. Rows with a null/undefined key (or no
  // conflation at all) fall back to the ordered list.
  const conflated = typeof conflateKeyFn === 'function';
  const map = conflated ? new Map<unknown, TRow>() : null;
  const list: TRow[] = [];

  let timer: unknown = null;

  const drainAndFlush = (): void => {
    const payload: TRow[] = conflated && map ? [...map.values(), ...list] : [...list];
    if (payload.length === 0) return;
    if (map) map.clear();
    list.length = 0;
    flush(payload);
  };

  const scheduleFlush = (): void => {
    if (timer != null) return;
    timer = setTimer(() => {
      timer = null;
      drainAndFlush();
    }, throttleMs ?? 0);
  };

  const push = (rows: readonly TRow[]): void => {
    if (rows.length === 0) return;

    if (!throttleMs) {
      // Immediate-mode fast path: skip buffering entirely.
      flush([...rows]);
      return;
    }

    if (conflated && map && conflateKeyFn) {
      for (const row of rows) {
        const key = conflateKeyFn(row);
        // null/undefined keys can't be conflated — keep them in order.
        if (key == null) list.push(row);
        else map.set(key, row); // last write wins (upsert)
      }
    } else {
      // Indexed push — arg-spread copies the batch onto the call stack
      // and overflows past ~65k rows.
      for (let i = 0; i < rows.length; i++) list.push(rows[i]);
    }

    // Size cap: a starved timer must not turn the window into one
    // mega-batch — flush synchronously the moment the buffer is full.
    // Runs from the producer's own call stack, so it fires even when
    // the event loop can't service timers on schedule.
    if (
      maxBufferedRows !== undefined &&
      (map ? map.size : 0) + list.length >= maxBufferedRows
    ) {
      flushNow();
      return;
    }
    scheduleFlush();
  };

  const flushNow = (): void => {
    if (timer != null) {
      clearTimer(timer);
      timer = null;
    }
    drainAndFlush();
  };

  const teardown = (): void => {
    if (timer != null) {
      clearTimer(timer);
      timer = null;
    }
    if (map) map.clear();
    list.length = 0;
  };

  return { push, flushNow, teardown };
}
