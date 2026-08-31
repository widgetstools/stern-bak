/**
 * Provider primitive — three free functions, no class hierarchy.
 *
 * The Hub owns the cache; providers just emit. Three event shapes:
 *
 *   • `{ rows, replace? }` — keyed upserts (or full reset on restart).
 *     Hub merges into its cache by `cfg.keyColumn` then broadcasts.
 *   • `{ status, error? }` — lifecycle transition (loading → ready →
 *     error). Hub stashes + broadcasts.
 *   • `{ byteSize }` — increment the stats byte counter without
 *     emitting a row event. Lets providers track raw frame size for
 *     bandwidth monitoring even on no-op messages (heartbeats, end
 *     tokens, etc.).
 *   • `{ rowsReceived }` — cumulative in-flight snapshot row count
 *     while the hub cache is still empty (STOMP snapshot buffer).
 *     Hub fans this out as wire `rows-received` events so consumers
 *     can drive loading overlays before the first chunked delta.
 *   • `{ timing }` — connection-latency samples for the diagnostics
 *     pane: `requestSentMs` (Restart click → upstream request sent)
 *     and `firstMessageMs` (request sent → first upstream message).
 *     Either field is optional; the Hub stores whichever is present.
 *
 * Keeping these as plain functions has two upsides over a Provider
 * class:
 *   1. There's no `state` object to leak through the contract — the
 *      Hub's cache is the single source of truth.
 *   2. Adding a new transport is one file with one function, no
 *      base class to extend.
 */

import type { ProviderStatus, WireEncoding } from '../protocol.js';

/**
 * One pre-encoded broadcast/replay chunk plus the codec it used (`json`
 * UTF-8 or the typed-array `col` codec). `enc` is per chunk because the
 * columnar encoder can decline a slice (non-object rows) and fall back
 * to JSON, so chunks of mixed encodings may coexist.
 */
export interface EncodedChunk {
  buf: Uint8Array;
  enc: WireEncoding;
}

export interface ProviderHandle {
  /** Idempotent. Disconnects upstream + releases resources. */
  stop(): void | Promise<void>;
  /** Re-fetches with optional overlay. Implementations clear local
   *  state, re-emit `replace: true`, and re-run their lifecycle. */
  restart(extra?: Record<string, unknown>): void | Promise<void>;
}

export type ProviderEmit = (event: ProviderEmitEvent) => void;

export type ProviderEmitEvent =
  /**
   * `uniqueKeys: true` asserts the batch's rows are already unique by
   * the provider's key column — set by transports whose conflation map
   * (bufferedDispatch with a conflate key) produced the batch. Lets the
   * hub skip its per-batch duplicate-key Set on the live hot path.
   */
  | { rows: readonly unknown[]; replace?: boolean; uniqueKeys?: boolean }
  | { status: ProviderStatus; error?: string }
  | { byteSize: number }
  | { rowsReceived: number }
  | { timing: ProviderTimingSample };

/**
 * Connection-latency sample for the diagnostics pane. Emitted by
 * streaming transports on lifecycle transitions, not per-frame.
 */
export interface ProviderTimingSample {
  /** Ms from the user's Restart click until the upstream request was sent. */
  requestSentMs?: number;
  /** Ms from the upstream request until the first message arrived. */
  firstMessageMs?: number;
}
