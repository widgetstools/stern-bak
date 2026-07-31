/**
 * Stateless helpers for {@link SharedWorkerDataServicesHub}: stats
 * reset, row keying, and restart-overlay comparison. No hub state.
 */
import { composeRowId } from '@wellsfargo-starui/types';
import type { ProviderSlot } from './hubTypes.js';

/** Reset every diagnostics counter when a provider (re)starts. */
export function resetProviderStats(slot: ProviderSlot, now = Date.now()): void {
  slot.byteCount = 0;
  slot.msgCount = 0;
  slot.msgsByBucket.fill(0);
  slot.bucketIdx = 0;
  slot.startedAt = now;
  slot.lastMessageAt = null;
  slot.errorCount = 0;
  slot.lastError = undefined;
  slot.snapshotFetchStartedAt = now;
  slot.snapshotFetchMs = null;
  slot.restartRequestMs = null;
  slot.firstMessageMs = null;
  slot.snapshotReady = false;
  slot.publishCount = 0;
  slot.pubsByBucket.fill(0);
  slot.pubsByMinBucket.fill(0);
  slot.minBucketIdx = 0;
  slot.publishWindowSeconds = 0;
  slot.keyDropCount = 0;
  slot.keyDropWarned = false;
}

/**
 * Extract the row-id key from a row using `cfg.keyColumn`. Rows
 * lacking the field (or with null/undefined values) are skipped —
 * surfacing them as cached entries with stringified `null` would
 * silently corrupt the cache.
 *
 * `keyColumn` may be a single string (one column) OR an array of
 * column names (composite key, joined with `-`). Delegates to
 * `composeRowId` so the cache key matches AG-Grid's `getRowId`
 * byte-for-byte.
 */
export function keyOf(
  row: unknown,
  keyColumn: string | readonly string[] | undefined,
): string | null {
  return composeRowId(row, keyColumn);
}

/**
 * Click-to-hub latency annotation for restart-attach trace logs.
 * `extra.__refresh` carries Date.now() at the user's Restart click,
 * so the delta is the port + main-thread latency before the hub
 * even started the restart.
 */
export function restartClickLatency(extra: Record<string, unknown>): string {
  const clickAt = typeof extra.__refresh === 'number' ? extra.__refresh : null;
  return clickAt === null ? '' : `sinceClick=+${Date.now() - clickAt}ms`;
}

/** Stable compare for restart overlay payloads (e.g. `{ asOfDate }`). */
export function restartExtrasEqual(
  active: Record<string, unknown> | null | undefined,
  incoming: Record<string, unknown>,
): boolean {
  if (!active) return false;
  return JSON.stringify(active) === JSON.stringify(incoming);
}
