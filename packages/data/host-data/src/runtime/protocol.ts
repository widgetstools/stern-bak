/**
 * Wire protocol — v2 (clean rewrite).
 *
 * Three message kinds in each direction. There is no separate
 * `configure` step: `attach` is configure-or-attach. The Hub creates
 * the provider on first attach for a given providerId; subsequent
 * attaches with the same id reuse the running instance and ignore
 * the cfg payload. The Hub immediately replies with a
 * `delta { replace: true, rows: [...currentCache] }` followed by a
 * `status` event — that single guaranteed first-emit eliminates the
 * late-joiner race that v1 needed cache replay to patch over.
 */

import type { DataProviderConfig, TransportConfig, ProviderStatus, ProviderType } from '@wellsfargo-starui/types';
import type {
  ExpressionRule,
  SetFilterValuesRequest,
  SsrmGetRowsRequest,
  SsrmGetRowsResult,
  TickEvent,
} from './ssrm/types.js';
import type { StatusBarRequest, StatusBarSummary } from './ssrm/statusBar.js';
import type { SsrmStats } from './ssrm/SsrmServer.js';

// ─── AppData row shape (mirrors AppDataConfig from probes/appdata) ─

/**
 * Wire-shape for an AppData row crossing the port. Identical to
 * `AppDataConfig` from `runtime/providers/appdata/store.ts` but
 * inlined here so the protocol module has no internal-package
 * coupling other than `@wellsfargo-starui/types`.
 */
export interface AppDataRow {
  configId: string;
  name: string;
  description?: string;
  isPublic: boolean;
  values: Record<string, unknown>;
  /** Owner user id — `'system'` for public rows. */
  userId: string;
}

// ─── Provider stats ─────────────────────────────────────────────────

export interface ProviderStats {
  /** Live row count = cache.size. */
  rowCount: number;
  /** Cumulative bytes received from upstream (raw frame bodies). */
  byteCount: number;
  /**
   * Serialized footprint of the worker cache (UTF-8 JSON bytes of the
   * cached rows). Exact when the memoized replay snapshot exists (sum
   * of its chunk lengths); otherwise estimated from one sampled row ×
   * rowCount. This is the number `projectFields` shrinks — `byteCount`
   * measures upstream wire bytes, which client-side projection cannot
   * reduce.
   */
  cacheBytes: number;
  /** Cumulative messages parsed. */
  msgCount: number;
  /** Sliding-window upstream throughput (last 5s). */
  msgPerSec: number;
  /** Milliseconds from start/restart until first `ready` status. Null while snapshot in flight. */
  snapshotFetchMs: number | null;
  /**
   * Milliseconds from the user's Restart click until the upstream
   * request was actually sent to the server (e.g. the STOMP trigger
   * frame publish — includes WebSocket dial + STOMP handshake). Null
   * until the request goes out, or when there was no Restart click to
   * measure against (plain cold start).
   */
  restartRequestMs: number | null;
  /**
   * Milliseconds from the upstream request being sent until the first
   * message arrived back from the server. Null until the first message
   * lands for the current cycle.
   */
  firstMessageMs: number | null;
  /** Cumulative fan-out delta posts to data subscribers after snapshot ready. */
  publishCount: number;
  /** Sliding-window publish throughput to subscribers (last 5s avg). */
  publishPerSec: number;
  /** Rolling 60s average publish rate to subscribers (msg/min). */
  publishPerMin: number;
  /** Number of attached data-mode listeners. */
  subscriberCount: number;
  /** Epoch ms — when start() was first called. */
  startedAt: number;
  /** Epoch ms — last successful upstream message. */
  lastMessageAt: number | null;
  /** Cumulative parse / network errors. */
  errorCount: number;
  /** Most recent error message, if any. */
  lastError?: string;
}

// ─── Status enum ────────────────────────────────────────────────────

// Moved to the foundation layer so UI packages (e.g. @wellsfargo-starui/grid's
// event-handler types) can use it without an undeclared dependency on
// this package's dist — re-exported here so every existing consumer
// keeps its import path.
export type { ProviderStatus };

// ─── Client → Worker requests ──────────────────────────────────────

export interface AttachRequest {
  kind: 'attach';
  /** Per-subscription identifier. Client picks; Hub uses for fan-out + detach. */
  subId: string;
  providerId: string;
  /**
   * `'data'` (default) — listener receives `delta` + `status` events.
   * `'stats'` — listener receives a `stats` event at 1 Hz.
   */
  mode: 'data' | 'stats';
  /**
   * Required on FIRST attach when `providerId` is not in the hub catalog.
   * Optional when the worker has preloaded the provider row via
   * `ConfigCatalogCache`. Ignored on subsequent attaches (the running
   * provider keeps its existing cfg).
   * Templates (`{{appdata.key}}`) are resolved on the client side
   * before the request is sent.
   */
  cfg?: TransportConfig;
  /**
   * Optional restart payload. When provided AND the provider is
   * already running, the Hub calls `provider.restart(extra)` so
   * upstream re-fetches with this overlay (used by the historical-
   * mode date picker via `{ asOfDate }` and the toolbar refresh
   * button via `{ __refresh: ts }`).
   */
  extra?: Record<string, unknown>;
}

export interface DetachRequest {
  kind: 'detach';
  subId: string;
}

/**
 * Explicit port goodbye, sent by `SharedWorkerDataServicesClient.close()`.
 * Without it the hub can never learn a window closed CLEANLY:
 * `postMessage` to a disentangled MessagePort does not throw (it
 * serializes, then silently discards) and `messageerror` only fires on
 * deserialization failures — so `connectedPorts` (and AppData
 * listeners, which have no heartbeat) grew forever across a day of
 * window open/close cycles, and every catalog broadcast was cloned
 * once per dead port.
 */
export interface PortCloseRequest {
  kind: 'port-close';
}

/** Optional client metadata carried on subscriber heartbeats (introspect only). */
export interface SubscriberMeta {
  /** Human-readable attach site, e.g. component or hook name. */
  label?: string;
  /**
   * True when the subscribing window is not visible. The hub extends
   * the ping grace window so background OpenFin views are not evicted
   * when the browser throttles `setInterval` heartbeats.
   */
  hidden?: boolean;
}

/** Subscriber liveness ping — hub uses this to detect crashed / closed windows. */
export interface PingRequest {
  kind: 'ping';
  subId: string;
  meta?: SubscriberMeta;
}

export interface StopRequest {
  kind: 'stop';
  providerId: string;
}

/** Query whether the worker catalog preload has completed. */
export interface HubReadyRequest {
  kind: 'hub-ready';
  reqId: string;
}

/** Fetch one data-provider row from the worker catalog. */
export interface GetConfigRequest {
  kind: 'get-config';
  reqId: string;
  providerId: string;
}

/** List data-provider rows from the worker catalog. */
export interface ListConfigsRequest {
  kind: 'list-configs';
  reqId: string;
  subtype?: ProviderType;
  includeAppData?: boolean;
}

/** Reload one row or the full catalog after editor save/remove. */
export interface ConfigInvalidateRequest {
  kind: 'config-invalidate';
  reqId: string;
  providerId?: string;
}

/** Replay hub row cache to one subscriber without upstream I/O. */
export interface RefreshProviderRequest {
  kind: 'refresh-provider';
  subId: string;
  providerId: string;
}

/** One attached hub subscriber (data or stats mode). */
export interface HubSubscriberIntrospectRow {
  subId: string;
  mode: 'data' | 'stats';
  attachedAt: number;
  lastPingAt: number;
  /** True when `lastPingAt` is older than the hub ping timeout. */
  stale: boolean;
  meta?: SubscriberMeta;
}

/** Snapshot of SharedWorker hub runtime state (providers, AppData, ports). */
export interface HubProviderIntrospectRow {
  providerId: string;
  /** Human-readable label from catalog (`displayText` / `DataProviderConfig.name`). */
  name?: string;
  providerType: string;
  /** False when the row exists in catalog but has no runtime slot. */
  running: boolean;
  status?: ProviderStatus;
  subscriberCount?: number;
  statsListenerCount?: number;
  rowCount?: number;
  msgPerSec?: number;
  publishPerSec?: number;
  publishCount?: number;
  lastMessageAt?: number | null;
  startedAt?: number;
  errorCount?: number;
  lastError?: string;
  /**
   * Rows dropped because the configured `keyColumn` didn't resolve a value
   * (name/case mismatch). Non-zero here with `rowCount: 0` is the signature
   * of "provider fetched data but the grid is empty".
   */
  keyDropCount?: number;
  /** Transport cfg held in the worker (runtime slot or catalog cache). */
  cfg?: TransportConfig;
  /** Live subscriber registry for this provider (empty when not running). */
  subscribers?: readonly HubSubscriberIntrospectRow[];
  /** SSRM query-plane stats (`stomp-ssrm`/`mock-ssrm` providers only). */
  ssrm?: SsrmStats;
}

export interface HubAppDataIntrospectRow {
  configId: string;
  name: string;
  keyCount: number;
  values: Record<string, unknown>;
}

export interface HubIntrospectSnapshot {
  connectedPorts: number;
  catalogReady: boolean;
  catalogProviderCount: number;
  runningProviderCount: number;
  providers: readonly HubProviderIntrospectRow[];
  appData: {
    listenerCount: number;
    rows: readonly HubAppDataIntrospectRow[];
  };
}

/** Query live hub diagnostics (providers, subscribers, cache sizes). */
export interface HubIntrospectRequest {
  kind: 'hub-introspect';
  reqId: string;
}

/**
 * Scalar "is this provider running?" probe. Answers with a boolean
 * only — unlike `hub-introspect`, which serializes the ENTIRE hub
 * state (every provider cfg, every subscriber row, all AppData
 * values). Window-open flows poll this while waiting for a peer
 * window's attach to land, so it must stay O(1) on the hub thread.
 */
export interface ProviderRunningRequest {
  kind: 'provider-running';
  reqId: string;
  providerId: string;
}

// ─── Client → Worker AppData requests ──────────────────────────────
//
// Separate union so existing provider request handling stays
// untouched. Hub routes by top-level `kind` prefix (`appdata-*`).

/**
 * Attach a port to AppData broadcasts. The hub returns a snapshot
 * event immediately, then delta events on every subsequent mutation
 * (from any window). subId scopes the broadcast back to a single
 * mirror so multiple mirrors per port (e.g. tests) stay separable.
 *
 * `seed` is the legacy back-compat field — the hub now hydrates
 * itself from IndexedDB at boot and ignores any seed sent by mirrors.
 * Kept on the wire as optional so older mirrors still type-check
 * against the protocol.
 */
export interface AppDataAttachRequest {
  kind: 'appdata-attach';
  subId: string;
  seed?: readonly AppDataRow[];
}

export interface AppDataDetachRequest {
  kind: 'appdata-detach';
  subId: string;
}

/**
 * Set a single key on a named AppData provider. Creates the row if
 * it doesn't exist. The hub broadcasts the resulting full row to
 * every attached subscriber after applying.
 *
 * Persistence (writing to ConfigManager) happens on the originating
 * window's main thread BEFORE the request is posted — see Step 2
 * plan §Persistence ("fan-out bus" shape). The hub fans out the
 * already-persisted row.
 */
export interface AppDataSetRequest {
  kind: 'appdata-set';
  reqId: string;
  row: AppDataRow;
}

/** Replace an entire AppData row. Same flow as set. */
export interface AppDataUpsertRequest {
  kind: 'appdata-upsert';
  reqId: string;
  row: AppDataRow;
}

/** Delete an AppData row by configId. */
export interface AppDataRemoveRequest {
  kind: 'appdata-remove';
  reqId: string;
  configId: string;
}

export type AppDataRequest =
  | AppDataAttachRequest
  | AppDataDetachRequest
  | AppDataSetRequest
  | AppDataUpsertRequest
  | AppDataRemoveRequest;

/** Deployment fields the SharedWorker's ConfigManager is constructed from. */
export interface WorkerBootstrapPayload {
  appId: string;
  userId: string;
  seedConfigUrl?: string;
  seedConfigReload?: 'empty-only' | 'when-changed';
  configServiceRestUrl?: string;
}

/**
 * First message a client posts on its port — carries the deployment fields
 * the worker's ConfigManager is constructed from.
 *
 * Deliberately NOT part of {@link Request}: it is consumed by the worker
 * *entry* before the hub exists (the hub cannot be built until its
 * ConfigManager is, and that needs this payload). The hub therefore never
 * sees it, and `isRequest` must stay false for it.
 */
export interface WorkerBootstrapRequest {
  kind: 'worker-bootstrap';
  payload: WorkerBootstrapPayload;
}

// ─── SSRM query RPCs (stomp-ssrm plane) ─────────────────────────────

export type {
  ExpressionRule,
  SetFilterValuesRequest,
  SsrmGetRowsRequest,
  SsrmGetRowsResult,
  TickEvent,
  StatusBarRequest,
  StatusBarSummary,
};

/** SSRM getRows against the provider's query plane. */
export interface SsrmGetRowsRpcRequest {
  kind: 'ssrm-get-rows';
  reqId: string;
  providerId: string;
  /** Viewport / session id — usually the data attach subId. */
  sessionId: string;
  request: SsrmGetRowsRequest;
}

export interface SsrmSetViewportRequest {
  kind: 'ssrm-set-viewport';
  providerId: string;
  sessionId: string;
  keys: string[];
  /**
   * Which block of which query `keys` came from. Optional so an older client
   * still gets the previous replace-wholesale behaviour.
   */
  scope?: { blockKey: string; queryId: string; hasFilter?: boolean };
}

export interface SsrmConfigureExpressionsRequest {
  kind: 'ssrm-configure-expressions';
  reqId: string;
  providerId: string;
  rules: ExpressionRule[];
  /** Viewport / session id — omitted configures the GLOBAL rule set (today's behaviour). */
  sessionId?: string;
}

/**
 * A session's pending edits. Keyed by session because the plane is shared: an
 * edit made in one window is that window's private view of a row every other
 * window also holds. See `SessionOverlay`.
 */
export interface SsrmSetSessionPatchesRequest {
  kind: 'ssrm-set-session-patches';
  reqId: string;
  providerId: string;
  sessionId: string;
  patches: Array<{ key: string; fields: Record<string, unknown> }>;
}

/**
 * A session's row-exclusion rule, as an EXPRESSION rather than a predicate —
 * a function does not survive a structured clone, and the plane already holds
 * an expression engine. `null` clears it. Meaning is `evaluateRowExclusion`
 * in `@wellsfargo-starui/core`, the same one the client-side external filter
 * uses.
 */
export interface SsrmSetSessionExcludeRequest {
  kind: 'ssrm-set-session-exclude';
  reqId: string;
  providerId: string;
  sessionId: string;
  expression: string | null;
}

export interface SsrmStatusBarRpcRequest {
  kind: 'ssrm-status-bar';
  reqId: string;
  providerId: string;
  request?: StatusBarRequest;
}

export interface SsrmSetFilterValuesRpcRequest {
  kind: 'ssrm-set-filter-values';
  reqId: string;
  providerId: string;
  request: SetFilterValuesRequest;
}

export type SsrmRequest =
  | SsrmGetRowsRpcRequest
  | SsrmSetViewportRequest
  | SsrmConfigureExpressionsRequest
  | SsrmSetSessionPatchesRequest
  | SsrmSetSessionExcludeRequest
  | SsrmStatusBarRpcRequest
  | SsrmSetFilterValuesRpcRequest;

/** Correlated RPC response for SSRM plane calls. */
export interface SsrmRpcEvent {
  kind: 'ssrm-rpc';
  reqId: string;
  ok: boolean;
  error?: string;
  getRows?: SsrmGetRowsResult;
  statusBar?: StatusBarSummary;
  setFilterValues?: string[];
}

/** Viewport-filtered live tick from the SSRM plane. */
export interface SsrmTickEvent {
  kind: 'ssrm-tick';
  /** Data attach subId / session. */
  subId: string;
  providerId: string;
  event: TickEvent;
  interestedKeys: string[];
}

export type Request =
  | AttachRequest
  | DetachRequest
  | PortCloseRequest
  | PingRequest
  | StopRequest
  | HubReadyRequest
  | GetConfigRequest
  | ListConfigsRequest
  | ConfigInvalidateRequest
  | RefreshProviderRequest
  | HubIntrospectRequest
  | ProviderRunningRequest
  | SsrmRequest;

// ─── Worker → Client events ────────────────────────────────────────

export interface DeltaEvent {
  subId: string;
  kind: 'delta';
  /** Rows to upsert keyed by `cfg.keyColumn`. */
  rows: readonly unknown[];
  /**
   * When true, the consumer should replace its full row set with
   * `rows`. Fired on the initial attach (with the current cache) and
   * after a restart. Otherwise, `rows` is an incremental upsert.
   */
  replace?: boolean;
}

/**
 * Encoding of a {@link DeltaBinEvent} buffer.
 *   - `'json'` (default when absent) — UTF-8 `JSON.stringify` of the
 *     rows array; decoded with `JSON.parse`.
 *   - `'col'` — typed-array columnar frame (`columnarCodec`); numbers
 *     travel as raw Float64 and booleans as bitmaps, cutting the
 *     receiving window's per-frame decode several-fold on numeric
 *     feeds. This is the **default** for object feeds (it auto-falls-back
 *     to JSON per chunk for incompatible rows); opt out via
 *     `cfg.wireFormat: 'json'`.
 */
export type WireEncoding = 'json' | 'col';

/**
 * Binary sibling of {@link DeltaEvent} used for late-join cache replay.
 *
 * `buf` is the encoded form of what would otherwise be
 * `DeltaEvent.rows` (`enc` selects the codec — typed-array columnar by
 * default, UTF-8 JSON when `cfg.wireFormat: 'json'` or for non-columnar
 * rows). The hub encodes
 * each replay chunk ONCE per cache generation and posts the same
 * `Uint8Array` to every attaching port — cloning a typed array across
 * the port is a flat byte copy, whereas cloning a rows array walks
 * every row object's property graph per subscriber. With N windows
 * attaching at once this turns N full object-graph serializations into
 * N memcpys plus one shared encode.
 *
 * Constraint: rows must be JSON-serializable. This holds for every
 * transport — STOMP/REST rows are born from `JSON.parse`, and mock
 * rows are plain primitives. Live deltas keep using `DeltaEvent`
 * (structured clone) so this constraint never applies to tick paths.
 */
export interface DeltaBinEvent {
  subId: string;
  kind: 'delta-bin';
  /** Encoded rows array (same payload as `DeltaEvent.rows`). */
  buf: Uint8Array;
  /** Buffer codec. Absent = `'json'`. */
  enc?: WireEncoding;
  /** Same semantics as {@link DeltaEvent.replace}. */
  replace?: boolean;
}

/**
 * One row's worth of a thin field-level delta (`delta-patch`).
 *
 * Either `f` carries a FULL row (insert — key not in the hub cache —
 * or a non-diffable fallback), or `s`/`d` carry the top-level fields
 * that changed/disappeared relative to the previous version of the
 * row. The client merges `{...prev, ...s}` minus `d` into a NEW row
 * object, so consumers keep seeing immutable full-row values.
 */
export interface RowPatch {
  /** Composed row key (`composeRowId(row, keyColumn)`) — byte-identical to AG Grid's `getRowId`. */
  k: string;
  /** Changed or added top-level fields (new values). */
  s?: Record<string, unknown>;
  /** Top-level fields removed by the replacement row. */
  d?: readonly string[];
  /** Full row — insert or non-diffable fallback. Wins over `s`/`d`. */
  f?: unknown;
}

/**
 * Thin field-level delta. Opt-in via `cfg.thinDeltas`; emitted only
 * for POST-READY live frames (snapshot/replace frames are full rows by
 * definition). For touch updates that change a few fields out of
 * hundreds, this shrinks the hub→window wire by the touch ratio.
 *
 * Exactly one of `patches` (small frames, structured clone) or `buf`
 * (large frames — UTF-8 JSON of the patches array, encoded once and
 * byte-copied per port) is set.
 */
export interface DeltaPatchEvent {
  subId: string;
  kind: 'delta-patch';
  patches?: readonly RowPatch[];
  /** UTF-8 JSON-encoded `RowPatch[]` (large frames). */
  buf?: Uint8Array;
}

/**
 * Per-subscription handshake posted by the hub BEFORE the first replay
 * frame when the provider runs with `thinDeltas`. Carries the
 * provider's `keyColumn` so the client can mirror full rows by the
 * same composed key the hub patches against. Not sent for providers
 * without thin deltas (no mirror needed).
 */
export interface SubInitEvent {
  subId: string;
  kind: 'sub-init';
  keyColumn?: string | readonly string[];
}

export interface StatusEvent {
  subId: string;
  kind: 'status';
  status: ProviderStatus;
  error?: string;
}

export interface StatsEvent {
  subId: string;
  kind: 'stats';
  stats: ProviderStats;
}

/** Progressive snapshot row count while upstream is buffering (pre-cache). */
export interface RowsReceivedEvent {
  subId: string;
  kind: 'rows-received';
  count: number;
}

/**
 * Hub evicted this subscriber (missed heartbeats or dead port). The
 * client should re-attach with the same `subId` to resume delivery.
 */
export interface SubscriptionLostEvent {
  subId: string;
  kind: 'subscription-lost';
  reason: 'stale' | 'port-dead';
}

export type Event =
  | DeltaEvent
  | DeltaBinEvent
  | DeltaPatchEvent
  | SubInitEvent
  | StatusEvent
  | StatsEvent
  | RowsReceivedEvent
  | SubscriptionLostEvent
  | SsrmTickEvent
  | SsrmRpcEvent;

/** Detail payload for {@link CatalogReadyEvent} broadcasts. */
export interface CatalogChangeDetail {
  /** Single-row refresh — hooks should react only when this matches their provider. */
  providerId?: string;
  /** Full catalog reload (startup hydrate or `config-invalidate` without id). */
  full?: boolean;
}

/** Worker → client catalog events (no subId — routed by reqId or broadcast). */
export interface CatalogReadyEvent extends CatalogChangeDetail {
  kind: 'catalog-ready';
}

export interface ConfigSnapshotEvent {
  kind: 'config-snapshot';
  reqId: string;
  ok: boolean;
  error?: string;
  /** Response to `hub-ready`. */
  ready?: boolean;
  /** Response to `get-config`. Null when id is missing from catalog. */
  config?: DataProviderConfig | null;
  /** Response to `list-configs`. */
  configs?: readonly DataProviderConfig[];
  /** Response to `hub-introspect`. */
  introspect?: HubIntrospectSnapshot;
  /** Response to `provider-running`. */
  running?: boolean;
}

export type CatalogEvent = CatalogReadyEvent | ConfigSnapshotEvent;

// ─── Worker → Client AppData events ────────────────────────────────

/**
 * Initial snapshot delivered to a freshly-attached mirror.
 *
 * The mirror is allowed to render BEFORE the snapshot arrives (sync
 * `get` returns undefined for unknown keys), but tests typically
 * `await mirror.ready()` for determinism.
 */
export interface AppDataSnapshotEvent {
  kind: 'appdata-snapshot';
  subId: string;
  rows: readonly AppDataRow[];
}

/**
 * Delta event — fired AFTER the hub applied a mutation to its
 * authoritative state, broadcast to every attached subscriber
 * including the originator. `op` is `'remove'` for deletions
 * (`row.configId` identifies the removed row); otherwise the row
 * is an upsert.
 */
export interface AppDataDeltaEvent {
  kind: 'appdata-delta';
  subId: string;
  op: 'upsert' | 'remove';
  row: AppDataRow;
}

/** Acknowledgement for set/upsert/remove. Mirrors the reqId. */
export interface AppDataAckEvent {
  kind: 'appdata-ack';
  reqId: string;
  ok: boolean;
  error?: string;
}

export type AppDataEvent =
  | AppDataSnapshotEvent
  | AppDataDeltaEvent
  | AppDataAckEvent;

// ─── Type guards ───────────────────────────────────────────────────

/**
 * Validates the entry-level bootstrap handshake. Strict on `appId`/`userId`
 * because a blank identity would silently boot the worker anonymous — the
 * exact failure this handshake replaced.
 */
export function isWorkerBootstrapRequest(value: unknown): value is WorkerBootstrapRequest {
  if (!value || typeof value !== 'object') return false;
  if ((value as { kind?: string }).kind !== 'worker-bootstrap') return false;
  const payload = (value as { payload?: unknown }).payload;
  if (!payload || typeof payload !== 'object') return false;
  const { appId, userId } = payload as Partial<WorkerBootstrapPayload>;
  return (
    typeof appId === 'string'
    && appId.trim().length > 0
    && typeof userId === 'string'
    && userId.trim().length > 0
  );
}

export function isRequest(value: unknown): value is Request {
  if (!value || typeof value !== 'object') return false;
  const k = (value as { kind?: string }).kind;
  return (
    k === 'attach' ||
    k === 'detach' ||
    k === 'port-close' ||
    k === 'ping' ||
    k === 'stop' ||
    k === 'hub-ready' ||
    k === 'get-config' ||
    k === 'list-configs' ||
    k === 'config-invalidate' ||
    k === 'refresh-provider' ||
    k === 'hub-introspect' ||
    k === 'provider-running' ||
    k === 'ssrm-get-rows' ||
    k === 'ssrm-set-viewport' ||
    k === 'ssrm-configure-expressions' ||
    k === 'ssrm-status-bar' ||
    k === 'ssrm-set-filter-values'
  );
}

export function isEvent(value: unknown): value is Event {
  if (!value || typeof value !== 'object') return false;
  const v = value as { kind?: string; subId?: unknown; reqId?: unknown };
  if (v.kind === 'ssrm-rpc' && typeof v.reqId === 'string') return true;
  if (typeof v.subId !== 'string') return false;
  return (
    v.kind === 'delta' ||
    v.kind === 'delta-bin' ||
    v.kind === 'delta-patch' ||
    v.kind === 'sub-init' ||
    v.kind === 'status' ||
    v.kind === 'stats' ||
    v.kind === 'rows-received' ||
    v.kind === 'subscription-lost' ||
    v.kind === 'ssrm-tick'
  );
}

export function isCatalogEvent(value: unknown): value is CatalogEvent {
  if (!value || typeof value !== 'object') return false;
  const k = (value as { kind?: string }).kind;
  return k === 'catalog-ready' || k === 'config-snapshot';
}

export function isAppDataRequest(value: unknown): value is AppDataRequest {
  if (!value || typeof value !== 'object') return false;
  const k = (value as { kind?: string }).kind;
  return (
    k === 'appdata-attach' ||
    k === 'appdata-detach' ||
    k === 'appdata-set' ||
    k === 'appdata-upsert' ||
    k === 'appdata-remove'
  );
}

export function isAppDataEvent(value: unknown): value is AppDataEvent {
  if (!value || typeof value !== 'object') return false;
  const k = (value as { kind?: string }).kind;
  return (
    k === 'appdata-snapshot' ||
    k === 'appdata-delta' ||
    k === 'appdata-ack'
  );
}

// ─── Re-exports for ergonomics ─────────────────────────────────────

export type { DataProviderConfig, TransportConfig, ProviderType };
