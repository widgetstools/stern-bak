/**
 * Provider emit pipeline — applies upstream transport events (rows /
 * status / byteSize / rowsReceived / timing) to a {@link ProviderSlot}
 * and hands broadcast-ready wire events back to the hub.
 *
 * Extracted from `SharedWorkerDataServicesHub.applyEmit` verbatim; the
 * hub supplies delivery + listener-count callbacks via
 * {@link ProviderEmitContext} so this module stays free of hub state.
 */

import type { Event, RowPatch } from '../protocol.js';
import type { ProviderEmitEvent } from '../providers/Provider.js';
import { diffTopLevel } from '../wire/rowDiff.js';
import {
  LATE_JOIN_CHUNK_SIZE,
  LIVE_BIN_MIN_ROWS,
  type EncodedChunk,
  type ProviderSlot,
} from './hubTypes.js';
import { encodeChunk, SNAPSHOT_ENCODER } from './hubEncoding.js';
import { resetProviderStats, keyOf } from './hubHelpers.js';
import {
  resetReplayCache,
  markReplayUpsert,
  seedReplayChunks,
  seedAppendedReplayChunks,
} from './replayCache.js';

/** Hub callbacks the emit pipeline delivers through. */
export interface ProviderEmitContext {
  /** Data-mode listener count for a provider (0 → skip encode + broadcast). */
  dataListenerCount(providerId: string): number;
  /** Fan one event template out to every data listener. */
  broadcast(providerId: string, slot: ProviderSlot, eventTemplate: Event): void;
  /** Push a fresh stats snapshot to stats listeners (loading / timing). */
  flushStats(providerId: string): void;
}

/**
 * Apply one upstream emit to the slot: cache upsert + replay-bucket
 * marking + stats accounting + broadcast. The caller has already
 * verified the slot is the currently-registered one for `providerId`.
 */
export function applyProviderEmit(
  ctx: ProviderEmitContext,
  providerId: string,
  slot: ProviderSlot,
  event: ProviderEmitEvent,
): void {
  if ('rows' in event) {
    applyRows(ctx, providerId, slot, event);
    return;
  }

  if ('status' in event) {
    if (event.status === 'loading') {
      resetProviderStats(slot);
      ctx.flushStats(providerId);
    } else if (event.status === 'ready' && !slot.snapshotReady) {
      slot.snapshotFetchMs = Date.now() - slot.snapshotFetchStartedAt;
      slot.snapshotReady = true;
      slot.publishWindowSeconds = 0;
    }
    slot.status = event.status;
    if (event.status === 'error') {
      slot.errorCount += 1;
      slot.lastError = event.error;
    }
    ctx.broadcast(providerId, slot, {
      kind: 'status',
      status: event.status,
      error: event.error,
      subId: '',
    });
    return;
  }

  if ('byteSize' in event) {
    slot.byteCount += event.byteSize;
    // Byte-only events also count as messages received from upstream
    // (they're typically end-of-snapshot tokens or heartbeats).
    slot.msgCount += 1;
    slot.msgsByBucket[slot.bucketIdx] += 1;
    slot.lastMessageAt = Date.now();
    return;
  }

  if ('rowsReceived' in event) {
    if (!slot.snapshotReady) {
      ctx.broadcast(providerId, slot, {
        kind: 'rows-received',
        count: event.rowsReceived,
        subId: '',
      });
    }
    return;
  }

  if ('timing' in event) {
    // Connection-latency samples for the diagnostics pane. Either
    // field is optional; flush so the pane updates without waiting
    // for the next 1 Hz sampler tick.
    if (typeof event.timing.requestSentMs === 'number') {
      slot.restartRequestMs = event.timing.requestSentMs;
    }
    if (typeof event.timing.firstMessageMs === 'number') {
      slot.firstMessageMs = event.timing.firstMessageMs;
    }
    ctx.flushStats(providerId);
  }
}

function applyRows(
  ctx: ProviderEmitContext,
  providerId: string,
  slot: ProviderSlot,
  event: Extract<ProviderEmitEvent, { rows: readonly unknown[] }>,
): void {
  const keyColumn = (slot.cfg as { keyColumn?: string | readonly string[] }).keyColumn;
  const replay = slot.replay;
  if (event.replace) {
    slot.cache.clear();
    resetReplayCache(replay);
  }
  const cacheSizeBefore = slot.cache.size;

  // Thin field-level deltas (`cfg.thinDeltas`): post-ready live
  // frames ship only the top-level fields that actually changed
  // per row. Replace frames and the pre-ready snapshot phase stay
  // full-row (they're full state by definition). Handles its own
  // cache upsert, key-drop accounting and broadcast.
  if (slot.thinDeltas && slot.snapshotReady && !event.replace) {
    applyThinDelta(ctx, providerId, slot, event.rows, keyColumn);
    return;
  }

  // Upsert into the cache and detect (a) rows whose key doesn't
  // resolve (dropped) and (b) intra-batch duplicate keys. In the
  // common case — every row keyed, no duplicates, which upstream
  // conflation (`bufferedDispatch`) already guarantees for live
  // ticks — we broadcast `event.rows` AS-IS, with no dedup Map and
  // no copied array. The slow paths below only run when the batch
  // actually contains drops or duplicates.
  //
  // Every `cache.set` is paired with `markReplayUpsert` so the
  // bucketed replay cache dirties only the buckets this batch
  // touches (see replayCache.ts).
  let dropped = 0;
  let droppedSample: unknown;
  let dupKeys = false;
  if (event.replace) {
    // Cache was just cleared, so every distinct key grows it by
    // exactly one — a size shortfall vs (rows − dropped) means the
    // batch carried intra-batch duplicates. No Set needed.
    for (const row of event.rows) {
      const k = keyOf(row, keyColumn);
      if (k === null) {
        if (dropped === 0) droppedSample = row;
        dropped += 1;
        continue;
      }
      slot.cache.set(k, row);
      markReplayUpsert(replay, k);
    }
    dupKeys = slot.cache.size !== event.rows.length - dropped;
  } else if (event.rows.length === 1) {
    const row = event.rows[0];
    const k = keyOf(row, keyColumn);
    if (k === null) {
      droppedSample = row;
      dropped = 1;
    } else {
      slot.cache.set(k, row);
      markReplayUpsert(replay, k);
    }
  } else if (event.uniqueKeys) {
    // Transport-conflated batch: upstream's conflation map already
    // guarantees per-batch key uniqueness — no dup-detection Set on
    // the live hot path (this branch runs per flush at streaming
    // rates).
    for (const row of event.rows) {
      const k = keyOf(row, keyColumn);
      if (k === null) {
        if (dropped === 0) droppedSample = row;
        dropped += 1;
        continue;
      }
      slot.cache.set(k, row);
      markReplayUpsert(replay, k);
    }
  } else {
    // Incremental batch: a key already present in the cache is a
    // legit update (size doesn't grow), so the size trick can't
    // spot intra-batch duplicates — track keys seen in THIS batch.
    const seen = new Set<string>();
    for (const row of event.rows) {
      const k = keyOf(row, keyColumn);
      if (k === null) {
        if (dropped === 0) droppedSample = row;
        dropped += 1;
        continue;
      }
      if (seen.has(k)) dupKeys = true;
      else seen.add(k);
      slot.cache.set(k, row);
      markReplayUpsert(replay, k);
    }
  }
  if (dropped > 0) reportKeyDrops(providerId, slot, keyColumn, dropped, droppedSample);
  slot.msgCount += 1;
  slot.msgsByBucket[slot.bucketIdx] += 1;
  slot.lastMessageAt = Date.now();

  // No data listeners (e.g. a stats-only diagnostics subscriber is
  // keeping the provider alive) → cache and stats are updated, the
  // replay buckets stay dirty for lazy rebuild on the next attach,
  // and the encode + broadcast below is skipped entirely.
  if (ctx.dataListenerCount(providerId) === 0) return;

  // Broadcast contract: rows are ALWAYS unique by `keyColumn`.
  //
  // - Clean batch (no drops, no intra-batch duplicates — the
  //   overwhelmingly common case): broadcast `event.rows` by
  //   reference. postMessage doesn't mutate it and nothing
  //   retains it, so sharing is safe and allocation-free.
  //
  // - `replace: true` with drops/dups → broadcast the full cache.
  //   Provider snapshot buffers (notably STOMP's snapshot-phase
  //   accumulator) can carry the same row twice; AG-Grid emits
  //   warning #2 ("Duplicate node id") on `setRowData` if two rows
  //   share a `getRowId(...)`. `cache.values()` collapses
  //   duplicates by keyColumn (last-write-wins).
  //
  // - `replace: false` with drops/dups → rebuild a deduped batch
  //   (last-write-wins, insertion-ordered) so the consumer's
  //   `applyTransactionAsync` never sees duplicate ids either.
  //
  // Rows lacking the keyColumn are dropped from the broadcast
  // entirely; the cache also skips them, and they couldn't be
  // routed by the consumer's `getRowId` either.
  let broadcastRows: readonly unknown[];
  if (!dupKeys && dropped === 0) {
    broadcastRows = event.rows;
  } else if (event.replace) {
    broadcastRows = [...slot.cache.values()];
  } else {
    const batch = new Map<string, unknown>();
    for (const row of event.rows) {
      const k = keyOf(row, keyColumn);
      if (k !== null) batch.set(k, row);
    }
    broadcastRows = [...batch.values()];
  }

  // Snapshot-phase chunks (pre-ready: initial load AND restarts —
  // `resetProviderStats` clears `snapshotReady` on every `loading`)
  // broadcast as pre-encoded `delta-bin`: one serialization, then a
  // flat byte copy per port, instead of N object-graph structured
  // clones. With many windows on one provider, the restart snapshot
  // fan-out was the worker's biggest remaining allocation burst.
  // Post-ready live ticks ALSO go binary once they reach
  // LIVE_BIN_MIN_ROWS (see its doc): big sweep frames × many
  // windows otherwise saturate the worker with per-listener
  // clones. Small conflated ticks stay as plain object deltas.
  const binary =
    !slot.snapshotReady || broadcastRows.length >= LIVE_BIN_MIN_ROWS;
  if (binary && broadcastRows.length > 0) {
    // Encode in ≤ LATE_JOIN_CHUNK_SIZE slices so each port message
    // decodes under the receiver's long-task budget (STOMP already
    // flushes 500-row chunks and hits the single-slice path; REST /
    // mock one-shot replaces get sliced here).
    const bufs: EncodedChunk[] = [];
    for (let i = 0; i < broadcastRows.length; i += LATE_JOIN_CHUNK_SIZE) {
      bufs.push(encodeChunk(
        broadcastRows.slice(i, i + LATE_JOIN_CHUNK_SIZE),
        slot.columnar,
      ));
    }
    if (event.replace) {
      // A replace broadcast always equals the cache contents
      // (clean rows by reference, or the deduped cache itself) in
      // the same order and chunking as the replay buckets, so the
      // encoded slices double as the replay encoding for free.
      seedReplayChunks(replay, bufs);
    } else if (
      dropped === 0
      && !dupKeys
      && slot.cache.size === cacheSizeBefore + event.rows.length
      && cacheSizeBefore % LATE_JOIN_CHUNK_SIZE === 0
    ) {
      // Clean bucket-aligned append (every key new, starting on a
      // bucket boundary — the STOMP streamed-snapshot shape): each
      // slice covers exactly one new bucket.
      seedAppendedReplayChunks(replay, bufs, cacheSizeBefore / LATE_JOIN_CHUNK_SIZE);
    }
    for (let i = 0; i < bufs.length; i++) {
      ctx.broadcast(providerId, slot, {
        kind: 'delta-bin',
        buf: bufs[i].buf,
        enc: bufs[i].enc,
        replace: event.replace && i === 0,
        subId: '', // rewritten per listener in broadcast
      });
    }
    return;
  }

  ctx.broadcast(providerId, slot, {
    kind: 'delta',
    rows: broadcastRows,
    replace: event.replace,
    subId: '', // rewritten per listener in broadcast
  });
}

/**
 * Thin field-level delta path (`cfg.thinDeltas`, post-ready live
 * frames only). For each row: upsert the full row into the cache
 * (replay/late-join still need full state), diff it against the
 * previous cached version, and broadcast only the changed top-level
 * fields as a `RowPatch`. New keys (inserts) and non-diffable rows
 * ship full under `f`. Rows that didn't observably change are
 * skipped entirely — a free extra layer of conflation.
 *
 * Large patch batches are encoded to UTF-8 JSON ONCE and byte-copied
 * per port (same rationale as `delta-bin`); small batches go as
 * plain object events.
 */
function applyThinDelta(
  ctx: ProviderEmitContext,
  providerId: string,
  slot: ProviderSlot,
  rows: readonly unknown[],
  keyColumn: string | readonly string[] | undefined,
): void {
  // With no data listeners the diff work is pure waste — upsert the
  // cache (replay/late-join still need full state) and skip patch
  // construction + broadcast.
  const hasListeners = ctx.dataListenerCount(providerId) > 0;
  let dropped = 0;
  let droppedSample: unknown;
  const patches: RowPatch[] = [];
  for (const row of rows) {
    const k = keyOf(row, keyColumn);
    if (k === null) {
      if (dropped === 0) droppedSample = row;
      dropped += 1;
      continue;
    }
    const prev = slot.cache.get(k);
    slot.cache.set(k, row);
    markReplayUpsert(slot.replay, k);
    if (!hasListeners) continue;
    if (prev === undefined) {
      patches.push({ k, f: row });
      continue;
    }
    const diff = diffTopLevel(prev, row);
    if (diff === 'identical') continue;
    if (diff === 'opaque') {
      patches.push({ k, f: row });
      continue;
    }
    patches.push({ k, ...diff });
  }
  if (dropped > 0) reportKeyDrops(providerId, slot, keyColumn, dropped, droppedSample);
  slot.msgCount += 1;
  slot.msgsByBucket[slot.bucketIdx] += 1;
  slot.lastMessageAt = Date.now();
  if (patches.length === 0) return;

  if (patches.length >= LIVE_BIN_MIN_ROWS) {
    ctx.broadcast(providerId, slot, {
      kind: 'delta-patch',
      buf: SNAPSHOT_ENCODER.encode(JSON.stringify(patches)),
      subId: '', // rewritten per listener in broadcast
    });
  } else {
    ctx.broadcast(providerId, slot, {
      kind: 'delta-patch',
      patches,
      subId: '', // rewritten per listener in broadcast
    });
  }
}

/**
 * Record + surface rows dropped because the configured `keyColumn`
 * doesn't resolve a value on the incoming rows. This is the single
 * most confusing failure mode in the pipeline: the provider fetches
 * the full snapshot, the worker logs "flushSnapshot: N rows", but the
 * grid stays empty because every row's `composeRowId(...)` returns null
 * (e.g. `keyColumn: "POSITIONID"` against rows keyed `positionId`).
 *
 * We warn ONCE per (re)start cycle — never per batch — with the
 * configured key and the actual top-level field names on a sample row,
 * so the mismatch (usually name/case) is obvious in the SharedWorker
 * console. `keyDropCount` accumulates for the hub introspector.
 */
function reportKeyDrops(
  providerId: string,
  slot: ProviderSlot,
  keyColumn: string | readonly string[] | undefined,
  dropped: number,
  sample: unknown,
): void {
  slot.keyDropCount += dropped;
  if (slot.keyDropWarned) return;
  slot.keyDropWarned = true;
  const sampleFields =
    sample && typeof sample === 'object' && !Array.isArray(sample)
      ? Object.keys(sample as Record<string, unknown>)
      : [];
   
  console.warn(
    `[hub] provider '${providerId}' dropped ${dropped} row(s): keyColumn ` +
      `${JSON.stringify(keyColumn ?? null)} did not resolve a value on the incoming rows. ` +
      `These rows never reach the cache or the grid (it will appear empty). ` +
      `Fix the provider's Key Column to match an actual field — sample row fields: ` +
      `[${sampleFields.join(', ')}].`,
  );
}
