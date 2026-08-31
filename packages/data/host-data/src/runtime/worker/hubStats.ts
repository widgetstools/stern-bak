/**
 * Provider-stats helpers for {@link SharedWorkerDataServicesHub}:
 * sliding-window bucket rotation, `ProviderStats` snapshots, and the
 * serialized-cache footprint estimate. Pure functions over
 * {@link ProviderSlot} — no hub state.
 */

import type { ProviderStats } from '../protocol.js';
import { MIN_WINDOW, type ProviderSlot } from './hubTypes.js';
import { replayFootprintBytes } from './replayCache.js';

/**
 * Rotate one slot's sliding-window buckets (called once per sampler
 * tick). The bucket being overwritten holds the oldest second.
 */
export function rotateStatsBuckets(slot: ProviderSlot): void {
  slot.bucketIdx = (slot.bucketIdx + 1) % slot.msgsByBucket.length;
  slot.msgsByBucket[slot.bucketIdx] = 0;
  slot.pubsByBucket[slot.bucketIdx] = 0;
  slot.minBucketIdx = (slot.minBucketIdx + 1) % slot.pubsByMinBucket.length;
  slot.pubsByMinBucket[slot.minBucketIdx] = 0;
  if (slot.snapshotReady) {
    slot.publishWindowSeconds = Math.min(MIN_WINDOW, slot.publishWindowSeconds + 1);
  }
}

/**
 * Serialized cache footprint in bytes. Exact when every replay bucket
 * is encoded (sum of the pre-encoded chunk lengths); otherwise
 * estimated from ONE sampled row × rowCount — the 1 Hz stats sampler
 * must not force a cache re-encode.
 */
export function cacheFootprintBytes(slot: ProviderSlot): number {
  // Sub-worker slots: the cache lives in the worker; use what it reports.
  if (slot.remote) return slot.remote.cacheBytes ?? 0;
  const exact = replayFootprintBytes(slot.replay);
  if (exact !== null) return exact;
  if (slot.cache.size === 0) return 0;
  const sample = slot.cache.values().next().value;
  try {
    return JSON.stringify(sample).length * slot.cache.size;
  } catch {
    return 0;
  }
}

/** Point-in-time `ProviderStats` snapshot for one slot. */
export function snapshotProviderStats(slot: ProviderSlot, subscriberCount: number): ProviderStats {
  const sumBuckets = slot.msgsByBucket.reduce((a, b) => a + b, 0);
  const msgPerSec = sumBuckets / slot.msgsByBucket.length;
  const pubSumBuckets = slot.pubsByBucket.reduce((a, b) => a + b, 0);
  const publishPerSec = pubSumBuckets / slot.pubsByBucket.length;
  const rollingMinTotal = slot.pubsByMinBucket.reduce((a, b) => a + b, 0);
  const minWindow = Math.max(1, Math.min(slot.publishWindowSeconds, MIN_WINDOW));
  const publishPerMin = (rollingMinTotal / minWindow) * 60;
  return {
    rowCount: slot.remote?.cacheSize ?? slot.cache.size,
    byteCount: slot.byteCount,
    cacheBytes: cacheFootprintBytes(slot),
    msgCount: slot.msgCount,
    msgPerSec,
    snapshotFetchMs: slot.snapshotFetchMs,
    restartRequestMs: slot.restartRequestMs,
    firstMessageMs: slot.firstMessageMs,
    publishCount: slot.publishCount,
    publishPerSec,
    publishPerMin,
    subscriberCount,
    startedAt: slot.startedAt,
    lastMessageAt: slot.lastMessageAt,
    errorCount: slot.errorCount,
    lastError: slot.lastError,
  };
}

/** All-zero stats snapshot — emitted when a provider is stopped. */
export function zeroedStats(): ProviderStats {
  return {
    rowCount: 0,
    byteCount: 0,
    cacheBytes: 0,
    msgCount: 0,
    msgPerSec: 0,
    snapshotFetchMs: null,
    restartRequestMs: null,
    firstMessageMs: null,
    publishCount: 0,
    publishPerSec: 0,
    publishPerMin: 0,
    subscriberCount: 0,
    startedAt: 0,
    lastMessageAt: null,
    errorCount: 0,
  };
}
