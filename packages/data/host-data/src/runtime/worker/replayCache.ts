/**
 * Bucketed replay-snapshot cache for {@link SharedWorkerDataServicesHub}.
 *
 * The hub replays its per-provider row cache to every late-joining
 * window as pre-encoded `delta-bin` chunks. The previous design
 * memoized one flat chunk array and invalidated it wholesale on ANY
 * cache mutation — so with live ticks flowing, every attach re-encoded
 * the ENTIRE cache (O(rows) serialization per window). Opening N
 * blotters against a ticking provider cost N full-cache encodes,
 * all serialized on the single hub thread.
 *
 * This structure buckets the cache by insertion order into
 * `LATE_JOIN_CHUNK_SIZE`-row groups and invalidates per bucket:
 *
 *   - every row key lives in EXACTLY ONE bucket (client snapshot
 *     assembly is plain concatenation — duplicate keys across chunks
 *     would corrupt the grid), assigned on first upsert, stable until
 *     the next `replace` resets everything;
 *   - a live tick nulls only the encoded chunks of the buckets it
 *     touches;
 *   - replay re-encodes just the dirty buckets (each O(chunk-size))
 *     and reuses every clean buffer.
 *
 * Steady state — ticks touching a bounded working set — leaves most
 * buckets clean, so attach cost is proportional to *recent churn*,
 * not cache size. Deletes don't exist in this protocol (deltas are
 * upserts; full state arrives via `replace`), which is what makes
 * append-only bucket membership sound.
 */

import { LATE_JOIN_CHUNK_SIZE, type EncodedChunk } from './hubTypes.js';
import { encodeChunk } from './hubEncoding.js';

export interface ReplaySnapshotCache {
  /** Encoded chunk per bucket; `null` = dirty, re-encode on demand. */
  chunks: Array<EncodedChunk | null>;
  /** Row keys per bucket, cache insertion order. Append-only between replaces. */
  buckets: string[][];
  /** Bucket index by row key. */
  bucketOfKey: Map<string, number>;
}

export function newReplayCache(): ReplaySnapshotCache {
  return { chunks: [], buckets: [], bucketOfKey: new Map() };
}

/** Full reset — call whenever the provider cache is cleared (`replace`). */
export function resetReplayCache(rc: ReplaySnapshotCache): void {
  rc.chunks.length = 0;
  rc.buckets.length = 0;
  rc.bucketOfKey.clear();
}

/**
 * Record one cache upsert. Existing key → dirty its bucket. New key →
 * append to the tail bucket (or open a new one) and dirty that.
 * Call EXACTLY ONCE per `slot.cache.set(...)` so bucket membership
 * stays aligned with cache insertion order.
 */
export function markReplayUpsert(rc: ReplaySnapshotCache, key: string): void {
  const existing = rc.bucketOfKey.get(key);
  if (existing !== undefined) {
    rc.chunks[existing] = null;
    return;
  }
  let bi = rc.buckets.length - 1;
  if (bi < 0 || rc.buckets[bi].length >= LATE_JOIN_CHUNK_SIZE) {
    rc.buckets.push([]);
    rc.chunks.push(null);
    bi += 1;
  }
  rc.buckets[bi].push(key);
  rc.chunks[bi] = null;
  rc.bucketOfKey.set(key, bi);
}

/**
 * Adopt broadcast-encoded chunks as the replay encoding after a
 * `replace` — the replace broadcast is byte-identical to a fresh
 * replay (same rows, same order, same chunking), so the encode work
 * is shared for free. No-op when the shapes don't align (defensive:
 * a mismatch just leaves buckets dirty for lazy rebuild).
 */
export function seedReplayChunks(rc: ReplaySnapshotCache, bufs: readonly EncodedChunk[]): void {
  if (bufs.length !== rc.buckets.length) return;
  for (let i = 0; i < bufs.length; i++) rc.chunks[i] = bufs[i];
}

/**
 * Adopt broadcast chunks for an APPEND batch (all keys new) that
 * started on a bucket boundary — the STOMP streamed-snapshot shape
 * (replace head + `LATE_JOIN_CHUNK_SIZE`-aligned tail flushes). Each
 * broadcast slice then covers exactly one bucket, so the encode is
 * shared with replay for free. Caller verifies alignment (batch was
 * clean, every key new, prior cache size was a bucket multiple);
 * the length guard here keeps a mismatch harmless (buckets just stay
 * dirty for lazy rebuild).
 */
export function seedAppendedReplayChunks(
  rc: ReplaySnapshotCache,
  bufs: readonly EncodedChunk[],
  firstBucket: number,
): void {
  if (firstBucket + bufs.length !== rc.buckets.length) return;
  for (let i = 0; i < bufs.length; i++) rc.chunks[firstBucket + i] = bufs[i];
}

/**
 * Return the full replay chunk list, re-encoding only dirty buckets
 * from the live cache. Synchronous with respect to cache mutation —
 * the worker is single-threaded, so the returned chunks are always
 * consistent with the delta stream that follows on the same port.
 */
export function ensureReplayChunks(
  rc: ReplaySnapshotCache,
  cache: ReadonlyMap<string, unknown>,
  columnar: boolean,
): readonly EncodedChunk[] {
  const out: EncodedChunk[] = new Array(rc.buckets.length);
  const scratch: unknown[] = [];
  for (let i = 0; i < rc.buckets.length; i++) {
    const existing = rc.chunks[i];
    if (existing) {
      out[i] = existing;
      continue;
    }
    scratch.length = 0;
    for (const key of rc.buckets[i]) scratch.push(cache.get(key));
    const chunk = encodeChunk(scratch, columnar);
    rc.chunks[i] = chunk;
    out[i] = chunk;
  }
  return out;
}

/**
 * Exact serialized footprint when every bucket is encoded; `null`
 * when any bucket is dirty (caller falls back to a sampled estimate —
 * the 1 Hz stats sampler must never force a full re-encode).
 */
export function replayFootprintBytes(rc: ReplaySnapshotCache): number | null {
  if (rc.buckets.length === 0) return 0;
  let total = 0;
  for (const chunk of rc.chunks) {
    if (!chunk) return null;
    total += chunk.buf.byteLength;
  }
  return total;
}
