/**
 * Internal data structures, listener shapes, options, and tuning
 * constants for {@link SharedWorkerDataServicesHub}. Extracted from the
 * hub module so the orchestration class reads as behaviour, not type
 * boilerplate. No runtime logic lives here.
 */

import type { ProviderConfig } from '@wellsfargo-starui/types';
import type { ProviderStatus, WireEncoding, AppDataEvent, SubscriberMeta } from '../protocol.js';
import type { ProviderHandle } from '../providers/Provider.js';
import type { ConfigManager } from '@wellsfargo-starui/core/host/config';
import type { ConfigCatalogCache } from '../../hub/ConfigCatalogCache.js';

/**
 * Maximum rows shipped in a single late-join replay `postMessage`.
 * Same rationale as `SNAPSHOT_CHUNK_SIZE` in `providers/stomp.ts` —
 * keeps each main-thread message handler under Chromium's 50ms
 * long-task threshold. Late-joiners (popouts, hot reloads) hit this
 * path; without chunking they receive the entire cache in one frame.
 */
export const LATE_JOIN_CHUNK_SIZE = 500;

/**
 * Post-ready live delta batches at or above this row count broadcast
 * as pre-encoded `delta-bin` instead of plain object deltas. A plain
 * delta costs one object-graph structured clone PER LISTENER per
 * frame; a high-rate sweep feed (e.g. stomp-view-server's full-set
 * coverage stream) ships thousands of distinct-key rows per frame
 * that conflation cannot shrink, and with several windows on one
 * provider the per-listener clones saturated the worker thread —
 * stalling late-joiner snapshot replays behind the backlog. Encoding
 * once and byte-copying per port makes fan-out cost ~flat in listener
 * count. Small conflated ticks stay as plain deltas (the encode
 * round-trip doesn't repay itself below this size).
 */
export const LIVE_BIN_MIN_ROWS = 64;

/** Sliding-window length for upstream + publish /s averages. */
export const SEC_WINDOW = 5;
/** Sliding-window length for publish /min rolling total. */
export const MIN_WINDOW = 60;

/** Client heartbeat interval (main thread). */
export const SUBSCRIBER_PING_INTERVAL_MS = 15_000;
/** Hub evicts subscribers with no ping within this window (visible windows). */
export const SUBSCRIBER_PING_TIMEOUT_MS = 45_000;
/** Extended grace for hidden windows — main-thread heartbeats are throttled. */
export const SUBSCRIBER_PING_TIMEOUT_HIDDEN_MS = 180_000;
/** How often the hub scans for stale subscribers. */
export const SUBSCRIBER_SWEEP_INTERVAL_MS = 10_000;

/**
 * Minimum gap between AppData IndexedDB resyncs triggered by mirror
 * attach. Editor saves resync eagerly via `config-invalidate`; the
 * attach-time resync only guards against out-of-band writers, so a
 * burst of opening windows must not serialize one Dexie table scan
 * per window in front of its snapshot reply.
 */
export const APPDATA_RESYNC_MIN_INTERVAL_MS = 5_000;

/**
 * Minimal port surface the hub posts to.
 *
 * CONTRACT: `postMessage` must consume (serialize/copy) the message
 * synchronously before returning — real `MessagePort`s structured-clone
 * during the call, per spec. AppData fan-out still reuses one event
 * object (mutating `subId` between posts). Data-provider fan-out posts
 * a shallow copy per listener because OpenFin multi-window can defer
 * clone — reusing one envelope there mis-delivers or drops ticks.
 */
export interface PortLike {
  /**
   * `transfer` exists for exactly one message: the Perspective attach
   * reply, which hands the window its end of a freshly minted
   * `MessageChannel`. Every other post leaves it undefined, and a
   * `PortLike` that ignores the argument entirely still satisfies every
   * other path.
   */
  postMessage(message: unknown, transfer?: readonly Transferable[]): void;
  /**
   * Optional teardown for raw `MessagePort` listeners. Called from
   * {@link SharedWorkerDataServicesHub.onPortClosed}.
   */
  dispose?: () => void;
}

/**
 * One pre-encoded broadcast/replay chunk plus the codec it used.
 * `enc` is per-chunk (not per-slot) because the columnar encoder can
 * decline a frame (non-object rows) and fall back to JSON, so chunks
 * of mixed encodings may coexist within one replay snapshot.
 */
export interface EncodedChunk {
  buf: Uint8Array;
  enc: WireEncoding;
}

export interface ProviderSlot {
  handle: ProviderHandle;
  cfg: ProviderConfig;
  cache: Map<string, unknown>;
  status: ProviderStatus;
  lastError?: string;
  // Stats counters
  byteCount: number;
  msgCount: number;
  msgsByBucket: number[]; // 5 1-second buckets, rotating
  bucketIdx: number;
  startedAt: number;
  lastMessageAt: number | null;
  errorCount: number;
  /** Epoch ms — start of the current snapshot fetch (reset on restart). */
  snapshotFetchStartedAt: number;
  /** Duration of the last completed snapshot fetch, or null while in flight. */
  snapshotFetchMs: number | null;
  /**
   * Ms from the user's Restart click until the upstream request was
   * sent (provider-reported via `emit({ timing })`). Null until the
   * request goes out, or when there was no click to measure against.
   */
  restartRequestMs: number | null;
  /**
   * Ms from the upstream request being sent until the first message
   * arrived back (provider-reported). Null until the first message of
   * the current cycle lands.
   */
  firstMessageMs: number | null;
  /** True once the provider has emitted `ready` for the current cycle. */
  snapshotReady: boolean;
  /** Fan-out delta posts to data subscribers after snapshot ready. */
  publishCount: number;
  pubsByBucket: number[];
  pubsByMinBucket: number[];
  minBucketIdx: number;
  /** Seconds elapsed since snapshot ready (capped at MIN_WINDOW). */
  publishWindowSeconds: number;
  /**
   * Count of rows dropped this cycle because `composeRowId(row, keyColumn)`
   * returned null — i.e. the configured `keyColumn` doesn't resolve a value
   * on the incoming rows (usually a name/case mismatch like `POSITIONID` vs
   * `positionId`). Dropped rows never reach the cache or any subscriber, so
   * the grid silently empties; this counter + the one-time warning surface
   * the misconfig instead. Reset on every (re)start via `resetProviderStats`.
   */
  keyDropCount: number;
  /** One-shot guard so the key-mismatch warning logs once per cycle, not per batch. */
  keyDropWarned: boolean;
  /**
   * Last `extra` overlay passed to `handle.restart` for this slot (e.g.
   * historical `asOfDate`). Used to late-join concurrent windows that
   * attach with the same overlay instead of reconnecting upstream again.
   */
  activeRestartExtra?: Record<string, unknown> | null;
  /**
   * Bucketed pre-encoded snapshot replay cache (see `replayCache.ts`).
   * Live ticks dirty only the buckets they touch; late-join replay
   * re-encodes dirty buckets and reuses every clean buffer, so attach
   * cost tracks recent churn instead of cache size.
   */
  replay: import('./replayCache.js').ReplaySnapshotCache;
  /**
   * `cfg.thinDeltas` — post-ready live frames broadcast as field-level
   * `delta-patch` events (changed top-level fields only) instead of
   * full rows. Requires `keyColumn`; precomputed at slot creation.
   */
  thinDeltas: boolean;
  /**
   * Binary frames use the typed-array columnar codec instead of UTF-8 JSON.
   * Default true (`cfg.wireFormat !== 'json'`); columnar auto-falls-back to
   * JSON per chunk for incompatible rows. Precomputed at slot creation.
   */
  columnar: boolean;
}

export interface DataListener {
  subId: string;
  port: PortLike;
  attachedAt: number;
  lastPingAt: number;
  meta?: SubscriberMeta;
  /** Last reported visibility from client heartbeats. */
  hidden?: boolean;
}

export interface StatsListener {
  subId: string;
  port: PortLike;
  attachedAt: number;
  lastPingAt: number;
  meta?: SubscriberMeta;
  hidden?: boolean;
}

export interface AppDataListenerEntry {
  subId: string;
  port: PortLike;
}

/** Fan-out scratch shape — `subId` is rewritten per listener. */
export type AppDataDeltaEventMutable = Extract<AppDataEvent, { kind: 'appdata-delta' }> & {
  subId: string;
};

export interface SharedWorkerDataServicesHubOpts {
  /**
   * ConfigManager backing AppData persistence. The hub becomes the
   * sole IndexedDB writer for AppData rows — main-thread mirrors no
   * longer touch ConfigManager. Optional only for back-compat with
   * tests that don't exercise the AppData path; production callers
   * (the SharedWorker entry script) MUST pass one.
   */
  configManager?: ConfigManager;

  /**
   * Preloaded data-provider catalog. When omitted but `configManager`
   * is set, the hub constructs one automatically.
   */
  configCatalog?: ConfigCatalogCache;

  /** Tick interval for the stats sampler (default 1000ms). */
  statsIntervalMs?: number;
  /** Inject the timer for tests. Default: setInterval. */
  setTimer?: (cb: () => void, ms: number) => unknown;
  /** Inject the timer cancel for tests. Default: clearInterval. */
  clearTimer?: (handle: unknown) => void;

  /**
   * Resolve the Perspective client module — usually
   * `() => import('@perspective-dev/client/inline')`. Omitted by the default
   * worker entry (see `defaultEntry.ts`); supplied only by
   * `perspectiveEntry.ts`, which is a separate worker asset for exactly this
   * reason: the inline build embeds its wasm as base64, so importing it
   * unconditionally would cost every app megabytes even when it never opens a
   * blotter. When present, the hub lazily builds one `PerspectiveHost` (one
   * engine, one Table per `stomp-perspective` / `mock-perspective` provider)
   * shared by every attached window.
   */
  loadPerspective?: () => Promise<import('../perspective/perspectiveHost.js').PerspectiveModuleLike>;
}
