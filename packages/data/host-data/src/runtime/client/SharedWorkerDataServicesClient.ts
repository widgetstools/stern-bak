/**
 * SharedWorkerDataServicesClient — main-thread client. Owns the MessagePort to the
 * SharedWorker (or in-process Hub for tests), routes incoming events
 * to the right per-subscription listener, and exposes a small
 * surface to the rest of the app.
 *
 * Three methods cover everything:
 *   • `attach(providerId, cfg, listener, opts?)` — subscribe to data.
 *     Returns a subId. The first emit is always the cache replace +
 *     current status (Hub guarantees), so the consumer never starts
 *     in an "I haven't seen anything yet" state.
 *   • `attachStats(providerId, listener)` — subscribe to live stats.
 *   • `stop(providerId)` — explicit teardown of the upstream
 *     connection. The Hub also auto-stops providers when the last
 *     subscriber detaches or misses heartbeats.
 *
 * No request/response correlation — attach + detach + stop are all
 * fire-and-forget. The port either delivers events back or it
 * doesn't (in which case `useProviderStream` shows status: 'loading'
 * forever, which surfaces the issue).
 */

import type {
  AppDataAckEvent,
  AppDataDeltaEvent,
  AppDataRequest,
  AppDataSnapshotEvent,
  AttachRequest,
  CatalogChangeDetail,
  CatalogEvent,
  ConfigInvalidateRequest,
  ConfigSnapshotEvent,
  DeltaPatchEvent,
  DetachRequest,
  Event,
  ExpressionRule,
  GetConfigRequest,
  HubIntrospectRequest,
  HubIntrospectSnapshot,
  HubReadyRequest,
  ListConfigsRequest,
  ProviderRunningRequest,
  ProviderStats,
  ProviderStatus,
  Request,
  RowPatch,
  SetFilterValuesRequest,
  SsrmGetRowsRequest,
  SsrmGetRowsResult,
  SsrmRpcEvent,
  SsrmTickEvent,
  StatusBarRequest,
  StatusBarSummary,
  StopRequest,
  SubscriberMeta,
} from '../protocol.js';
import { SUBSCRIBER_PING_INTERVAL_MS } from '../worker/hubTypes.js';
import { isCatalogEvent, isEvent, isAppDataEvent } from '../protocol.js';
import { composeRowId, type DataProviderConfig, type TransportConfig } from '@wellsfargo-starui/types';
import { decodeColumnar } from '../wire/columnarCodec.js';
import type { ListOptions } from '../config/store.js';
import { AppDataMirror } from '../mirror/AppDataMirror.js';
import { SnapshotReassembler } from '../../hub/SnapshotReassembler.js';

/**
 * Gate for hot-path diagnostic logs. Flip to `true` locally when debugging
 * the worker handshake — the per-delta `console.log` measurably hurts CPU
 * at high message rates even with DevTools closed.
 */
const DEBUG = false;

/** Shared decoder for pre-serialized snapshot replay chunks (`delta-bin`). */
const SNAPSHOT_DECODER = new TextDecoder();

export type SubId = string;

export interface DataListener<T = unknown> {
  onDelta(rows: readonly T[], replace: boolean): void;
  onStatus(status: ProviderStatus, error?: string): void;
  /** Upstream snapshot buffer progress (wire `rows-received`). */
  onRowsReceived?(count: number): void;
}

export interface StatsListener {
  onStats(stats: ProviderStats): void;
}

export interface AttachOpts {
  /**
   * Restart payload. When the provider is already running, the Hub
   * forwards this to `provider.restart(extra)`. Common uses:
   *   - `{ asOfDate: '...' }` for historical mode.
   *   - `{ __refresh: Date.now() }` for a manual refresh.
   */
  extra?: Record<string, unknown>;
  /** Optional label surfaced in hub introspect (`HubSubscriberIntrospectRow`). */
  meta?: SubscriberMeta;
}

/**
 * Two-phase subscription handle returned by `client.subscribe(...)`.
 *
 * The two phases match the natural reload-time flow:
 *   1. await `snapshot` — single Promise that resolves with the full
 *      cache (or rejects if the provider can't deliver one).
 *   2. register `onUpdate` — receive live ticks from now on.
 *
 * Updates that arrive between the snapshot resolving and `onUpdate`
 * being registered are buffered, then flushed on registration as ONE
 * coalesced batch (arrival order preserved) — nothing is silently
 * dropped, and a window booting under a live firehose applies its
 * catch-up in a single grid transaction.
 *
 * `onReset` fires when a `replace: true` delta arrives AFTER the
 * initial snapshot has settled — i.e. the provider re-snapshotted
 * (typically because a peer subscriber clicked "refresh", which
 * makes the worker call `provider.restart` and clears the Hub
 * cache). All connected subscribers receive this signal so every
 * grid wipes + repopulates with the fresh snapshot rather than
 * keeping stale rows on screen.
 */
export interface SubscribeHandle<T = unknown> {
  /** Subscription id used for detach and `refresh-provider` RPC. */
  subId: SubId;
  /** Resolves with the fully assembled snapshot (chunk0 + tail chunks). */
  snapshot: Promise<readonly T[]>;
  onUpdate(cb: (rows: readonly T[]) => void): void;
  onReset(cb: (rows: readonly T[]) => void): void;
  onStatus(cb: (status: ProviderStatus, error?: string) => void): void;
  /** In-flight snapshot row count while status is `loading`. */
  onRowsReceived(cb: (count: number) => void): void;
  /**
   * Fires on every loading→ready snapshot assembly, including the
   * initial one and hub-triggered restarts on an existing subId.
   */
  onSnapshotCommit(cb: (rows: readonly T[]) => void): void;
  /** Replay hub cache to this subscriber without upstream I/O. */
  refresh(): Promise<readonly T[]>;
  unsubscribe(): void;
}

interface DataSub {
  kind: 'data';
  listener: DataListener;
  attach: {
    providerId: string;
    cfg?: TransportConfig;
    extra?: Record<string, unknown>;
    meta?: SubscriberMeta;
  };
}
interface StatsSub {
  kind: 'stats';
  listener: StatsListener;
  attach: {
    providerId: string;
    meta?: SubscriberMeta;
  };
}
type Sub = DataSub | StatsSub;

/**
 * Per-subscription full-row mirror for thin-delta (`delta-patch`)
 * subscriptions. Created when the hub posts `sub-init` (providers with
 * `cfg.thinDeltas`); absent otherwise, so non-thin subscriptions pay
 * nothing. Keyed by `composeRowId(row, keyColumn)` — byte-identical to
 * the keys the hub patches against. Row references are shared with
 * whatever the consumer received, never mutated: a patch merge builds
 * a NEW row object, preserving the rows-are-immutable-values contract.
 */
interface ThinSubState {
  keyColumn?: string | readonly string[];
  rows: Map<string, unknown>;
}

export interface SharedWorkerDataServicesClientOpts {
  /** Inject for tests. Default: `() => crypto.randomUUID()`. */
  generateSubId?: () => string;
  /** Disable window `pagehide` → `close()` wiring (tests). Default false. */
  disablePageHideClose?: boolean;
  /**
   * How long an SSRM RPC waits for its hub reply before rejecting.
   * Without a deadline a lost reply leaves the AG Grid block on "Loading…"
   * forever — the datasource never gets to call `params.fail()`, and AG Grid
   * will not re-request a block it believes is still in flight.
   * Default {@link DEFAULT_SSRM_RPC_TIMEOUT_MS}. Set `0` to disable.
   */
  ssrmRpcTimeoutMs?: number;
}

/** Generous enough for a cold worker start + a large block query. */
export const DEFAULT_SSRM_RPC_TIMEOUT_MS = 30_000;

export class SharedWorkerDataServicesClient {
  private readonly port: MessagePort;
  private readonly subs = new Map<SubId, Sub>();
  private readonly thinSubs = new Map<SubId, ThinSubState>();
  private readonly generateSubId: () => string;
  private closed = false;

  // ─── AppData (Step 2) ───────────────────────────────────────────
  // The client owns a per-subId map of attached mirrors. Snapshot
  // and delta events are routed by `subId`; ack events route by
  // `reqId` to whichever mirror has that pending request — the
  // mirror tracks its own pending acks, so we just iterate.
  private readonly appDataMirrors = new Map<string, AppDataMirror>();
  private readonly catalogPending = new Map<
    string,
    { resolve: (event: ConfigSnapshotEvent) => void; reject: (err: Error) => void }
  >();
  private readonly ssrmPending = new Map<
    string,
    {
      resolve: (event: SsrmRpcEvent) => void;
      reject: (err: Error) => void;
      timer?: ReturnType<typeof setTimeout>;
    }
  >();
  private readonly ssrmRpcTimeoutMs: number;
  private readonly ssrmTickListeners = new Map<
    string,
    Set<(payload: { event: SsrmTickEvent['event']; interestedKeys: string[] }) => void>
  >();
  private readonly catalogReadyWaiters: Array<() => void> = [];
  private readonly catalogChangeListeners = new Set<(detail: CatalogChangeDetail) => void>();
  private readonly heartbeatTimers = new Map<SubId, ReturnType<typeof setInterval>>();
  private readonly heartbeatMeta = new Map<SubId, SubscriberMeta | undefined>();
  private pageHideHandler: ((ev: PageTransitionEvent) => void) | null = null;
  private visibilityHandler: (() => void) | null = null;

  constructor(port: MessagePort, opts: SharedWorkerDataServicesClientOpts = {}) {
    this.port = port;
    this.generateSubId = opts.generateSubId ?? (() => crypto.randomUUID());
    this.ssrmRpcTimeoutMs =
      opts.ssrmRpcTimeoutMs ?? DEFAULT_SSRM_RPC_TIMEOUT_MS;
    this.port.addEventListener('message', this.handleMessage);
    this.port.start();
    if (!opts.disablePageHideClose && typeof globalThis.addEventListener === 'function') {
      this.pageHideHandler = (ev: PageTransitionEvent) => {
        if (ev.persisted) return;
        this.close();
      };
      globalThis.addEventListener('pagehide', this.pageHideHandler);
    }
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      this.visibilityHandler = () => {
        if (document.hidden) return;
        this.sendVisibilityPings();
      };
      document.addEventListener('visibilitychange', this.visibilityHandler);
    }
  }

  // ─── public surface ───────────────────────────────────────────

  /**
   * @deprecated For providers saved in the hub catalog, omit `cfg` and let the
   * worker resolve from {@link getProviderConfig}. Pass `cfg` only for inline
   * editor drafts not yet persisted. Prefer {@link subscribe} or
   * `ProviderClientAdapter` / `useDataProvider` in React apps.
   */
  attach<T = unknown>(
    providerId: string,
    cfg: TransportConfig | undefined,
    listener: DataListener<T>,
    opts: AttachOpts = {},
  ): SubId {
    if (this.closed) throw new Error('[SharedWorkerDataServicesClient] client is closed');
    const subId = this.generateSubId();
    this.subs.set(subId, {
      kind: 'data',
      listener: listener as DataListener,
      attach: {
        providerId,
        cfg,
        extra: opts.extra,
        meta: opts.meta,
      },
    });
    this.send({
      kind: 'attach',
      subId,
      providerId,
      cfg,
      mode: 'data',
      extra: opts.extra,
    });
    this.startHeartbeat(subId, opts.meta);
    return subId;
  }

  /**
   * Two-phase subscription that matches the natural mental model:
   *
   *   1. Reload → connect to (or create) the SharedWorker.
   *   2. Grid requests the snapshot.
   *   3. Worker delivers the snapshot — either from its cache, or by
   *      starting the provider and waiting for its snapshot phase to
   *      complete.
   *   4. Grid applies the snapshot.
   *   5. Grid subscribes for live updates.
   *
   * Returns a handle with:
   *   • `snapshot: Promise<T[]>` — resolves with the full snapshot
   *     once. Awaiting it is step 4 of the flow above.
   *   • `onUpdate(cb)` — registers the live-tick callback. Called only
   *     for post-snapshot updates. If updates arrive between snapshot
   *     resolution and onUpdate registration, they're buffered and
   *     flushed in order on registration.
   *   • `onStatus(cb)` — provider status changes (loading/ready/error).
   *   • `unsubscribe()` — tear down the subscription.
   *
   * Internally this rides the same wire protocol as `attach`: the
   * Hub's first emit is always `{replace: true}` carrying the snapshot,
   * subsequent emits are live deltas. The handle simply unbundles
   * those two phases for the consumer so the snapshot can be awaited
   * and the live-update path doesn't have to also know about
   * `replace: true`.
   */
  /**
   * @deprecated When the provider exists in the hub catalog, call
   * `subscribe(providerId)` without `cfg`. Passing `cfg` for catalogued
   * providers duplicates main-thread config and bypasses hub cache invalidation.
   * Keep `cfg` only for unsaved editor drafts. Prefer `ProviderClientAdapter` or
   * `useDataProvider` in React apps.
   */
  subscribe<T = unknown>(
    providerId: string,
    cfg: TransportConfig | undefined,
    opts: AttachOpts = {},
  ): SubscribeHandle<T> {
    if (this.closed) throw new Error('[SharedWorkerDataServicesClient] client is closed');

    const subId = this.generateSubId();
    if (DEBUG) {
      // eslint-disable-next-line no-console
      console.log(
        `[data-services/client] %csubscribe→worker%c subId=%s provider=%s cfgPassed=%s${opts.extra ? ' extra=' + JSON.stringify(opts.extra) : ''}`,
        'color:#3b82f6', '', subId, providerId, Boolean(cfg),
      );
    }

    let snapshotResolve!: (rows: readonly T[]) => void;
    let snapshotReject!: (err: Error) => void;
    const snapshot = new Promise<readonly T[]>((resolve, reject) => {
      snapshotResolve = resolve;
      snapshotReject = reject;
    });

    let snapshotSettled = false; // true after resolve OR reject
    let snapshotCommitCb: ((rows: readonly T[]) => void) | null = null;
    let updateCb: ((rows: readonly T[]) => void) | null = null;
    let resetCb: ((rows: readonly T[]) => void) | null = null;
    let statusCb: ((status: ProviderStatus, error?: string) => void) | null = null;
    let rowsReceivedCb: ((count: number) => void) | null = null;
    /** STOMP upstream buffer count before hub cache exists. */
    let upstreamRowCount = 0;
    const bufferedUpdates: ReadonlyArray<T>[] = [];
    /** Replace=true deltas that arrived after the snapshot settled but
     *  before the consumer registered `onReset`. Flushed in order on
     *  registration (last one wins for the visible state, but firing
     *  each lets observability hooks see the full sequence). */
    const bufferedResets: ReadonlyArray<T>[] = [];

    let refreshResolve!: (rows: readonly T[]) => void;
    let refreshReject!: (err: Error) => void;
    let refreshPending: Promise<readonly T[]> | null = null;

    const flushBuffered = () => {
      if (!updateCb || bufferedUpdates.length === 0) return;
      // Coalesce the whole backlog into ONE callback (→ one grid
      // transaction) instead of one per buffered batch. Arrival order
      // is preserved within the merged array, so keyed last-write-wins
      // application produces the same final state — but a window that
      // booted under a live firehose applies its catch-up in a single
      // pass instead of N transactions.
      if (bufferedUpdates.length === 1) {
        const only = bufferedUpdates.shift()!;
        updateCb(only);
        return;
      }
      const merged: T[] = [];
      // Indexed push — arg-spread copies each batch onto the call
      // stack and overflows past ~65k rows (catch-up batches after a
      // hidden boot can be full-snapshot sized).
      for (const batch of bufferedUpdates) {
        for (let i = 0; i < batch.length; i++) merged.push(batch[i]);
      }
      bufferedUpdates.length = 0;
      updateCb(merged);
    };

    const emitRowsReceived = (reassemblerCount: number) => {
      rowsReceivedCb?.(Math.max(upstreamRowCount, reassemblerCount));
    };

    const reassembler = new SnapshotReassembler<T>({
      onRowsReceived: (count) => emitRowsReceived(count),
      onSnapshotReady: (rows) => {
        if (!snapshotSettled) {
          snapshotSettled = true;
          snapshotResolve(rows);
        }
        snapshotCommitCb?.(rows);
      },
      onTick: (rows) => {
        if (updateCb) updateCb(rows);
        else bufferedUpdates.push(rows);
      },
      onReset: (rows) => {
        if (resetCb) resetCb(rows);
        else bufferedResets.push(rows);
      },
      onCacheRefresh: (rows) => {
        if (refreshPending) {
          refreshPending = null;
          refreshResolve(rows);
        }
      },
    });

    const listener: DataListener<T> = {
      onDelta: (rows, replace) => {
        if (DEBUG) {
          // eslint-disable-next-line no-console
          console.log(
            `[data-services/client] %cdelta←worker%c subId=%s rows=%d replace=%s settled=%s`,
            replace ? 'color:#10b981' : 'color:#f59e0b', '',
            subId, rows.length, replace, snapshotSettled,
          );
        }
        reassembler.onDelta(rows, replace);
      },
      onStatus: (status, error) => {
        if (DEBUG) {
          // eslint-disable-next-line no-console
          console.log(
            `[data-services/client] %cstatus←worker%c subId=%s status=%s%s`,
            'color:#a855f7', '', subId, status, error ? ` error=${JSON.stringify(error)}` : '',
          );
        }
        if (status === 'loading') upstreamRowCount = 0;
        if (status === 'error' && !snapshotSettled) {
          snapshotSettled = true;
          snapshotReject(new Error(error ?? 'Provider error'));
        }
        if (status === 'error' && refreshPending) {
          const err = new Error(error ?? 'Provider error');
          refreshPending = null;
          refreshReject(err);
        }
        reassembler.onStatus(status, error);
        statusCb?.(status, error);
      },
      onRowsReceived: (count) => {
        upstreamRowCount = count;
        emitRowsReceived(reassembler.getRowCount());
      },
    };

    this.subs.set(subId, {
      kind: 'data',
      listener: listener as DataListener,
      attach: {
        providerId,
        cfg,
        extra: opts.extra,
        meta: opts.meta,
      },
    });
    this.send({
      kind: 'attach',
      subId,
      providerId,
      cfg,
      mode: 'data',
      extra: opts.extra,
    });
    this.startHeartbeat(subId, opts.meta);

    return {
      subId,
      snapshot,
      onUpdate: (cb) => {
        updateCb = cb;
        flushBuffered();
      },
      onReset: (cb) => {
        resetCb = cb;
        while (bufferedResets.length > 0) {
          const rows = bufferedResets.shift()!;
          cb(rows);
        }
      },
      onStatus: (cb) => {
        statusCb = cb;
      },
      onRowsReceived: (cb) => {
        rowsReceivedCb = cb;
        cb(Math.max(upstreamRowCount, reassembler.getRowCount()));
      },
      onSnapshotCommit: (cb) => {
        snapshotCommitCb = cb;
      },
      refresh: () => {
        if (refreshPending) return refreshPending;
        if (!snapshotSettled) {
          return Promise.reject(
            new Error('Cannot refresh before the initial snapshot has settled'),
          );
        }
        refreshPending = new Promise<readonly T[]>((resolve, reject) => {
          refreshResolve = resolve;
          refreshReject = reject;
        });
        reassembler.beginCacheRefresh();
        this.send({ kind: 'refresh-provider', subId, providerId });
        return refreshPending;
      },
      unsubscribe: () => {
        if (!this.subs.delete(subId)) return;
        this.thinSubs.delete(subId);
        this.stopHeartbeat(subId);
        if (this.closed) return;
        this.send({ kind: 'detach', subId });
        // Reject the snapshot promise if it's still pending so awaiters
        // don't hang on unmount.
        if (!snapshotSettled) {
          snapshotSettled = true;
          snapshotReject(new Error('Subscription cancelled before snapshot arrived'));
        }
        if (refreshPending) {
          refreshPending = null;
          refreshReject(new Error('Subscription cancelled during cache refresh'));
        }
      },
    };
  }

  attachStats(providerId: string, listener: StatsListener): SubId {
    if (this.closed) throw new Error('[SharedWorkerDataServicesClient] client is closed');
    const subId = this.generateSubId();
    this.subs.set(subId, {
      kind: 'stats',
      listener,
      attach: { providerId },
    });
    this.send({
      kind: 'attach',
      subId,
      providerId,
      mode: 'stats',
    });
    this.startHeartbeat(subId);
    return subId;
  }

  detach(subId: SubId): void {
    if (!this.subs.delete(subId)) return;
    this.thinSubs.delete(subId);
    this.stopHeartbeat(subId);
    if (this.closed) return;
    this.send({ kind: 'detach', subId });
  }

  stop(providerId: string): void {
    if (this.closed) return;
    this.send({ kind: 'stop', providerId });
  }

  /**
   * Subscribe to worker catalog refresh broadcasts (`catalog-ready`).
   * Fires after startup hydrate and after every `invalidateConfig`.
   * `detail.providerId` is set for single-row refresh; `detail.full` for
   * whole-catalog reload.
   */
  onCatalogChange(listener: (detail: CatalogChangeDetail) => void): () => void {
    this.catalogChangeListeners.add(listener);
    return () => {
      this.catalogChangeListeners.delete(listener);
    };
  }

  /**
   * True when the hub already has a running slot for `providerId`.
   * Scalar RPC — O(1) on the hub thread. Never rides `hub-introspect`,
   * which serializes the entire hub state and is far too heavy for the
   * window-open path that polls this.
   */
  async isProviderRunning(providerId: string): Promise<boolean> {
    try {
      const snap = await this.rpcCatalog({ kind: 'provider-running', providerId });
      return Boolean(snap.running);
    } catch {
      return false;
    }
  }

  /**
   * Poll until the hub reports a running slot for `providerId`, or until
   * `timeoutMs`. Used when several windows open at once so late joiners
   * wait for the first attach instead of cold-starting a second connection.
   */
  async waitForProviderRunning(
    providerId: string,
    opts: { timeoutMs?: number; intervalMs?: number } = {},
  ): Promise<boolean> {
    if (await this.isProviderRunning(providerId)) return true;
    const timeoutMs = opts.timeoutMs ?? 2_000;
    const intervalMs = opts.intervalMs ?? 50;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      if (await this.isProviderRunning(providerId)) return true;
    }
    return false;
  }

  /** True when the worker catalog finished its startup hydrate. */
  async isCatalogReady(): Promise<boolean> {
    try {
      const snap = await this.rpcCatalog({ kind: 'hub-ready' });
      return Boolean(snap.ready);
    } catch {
      return false;
    }
  }

  /** Await worker catalog preload (`hub-ready` + optional `catalog-ready`). */
  async waitForCatalogReady(): Promise<void> {
    if (await this.isCatalogReady()) return;
    await new Promise<void>((resolve) => {
      this.catalogReadyWaiters.push(resolve);
    });
  }

  /** Read one provider row from the worker catalog (no main-thread Dexie). */
  async getProviderConfig(providerId: string): Promise<DataProviderConfig | null> {
    const snap = await this.rpcCatalog({ kind: 'get-config', providerId });
    return snap.config ?? null;
  }

  /** List provider rows from the worker catalog. */
  async listProviderConfigs(opts: ListOptions = {}): Promise<DataProviderConfig[]> {
    const snap = await this.rpcCatalog({
      kind: 'list-configs',
      subtype: opts.subtype,
      includeAppData: opts.includeAppData,
    });
    return [...(snap.configs ?? [])];
  }

  /** Reload one row or the full catalog in the worker after editor save/remove. */
  async invalidateConfig(providerId?: string): Promise<void> {
    await this.rpcCatalog({ kind: 'config-invalidate', providerId });
  }

  /** Live SharedWorker hub diagnostics (providers, subscribers, cache sizes). */
  async getHubIntrospect(): Promise<HubIntrospectSnapshot> {
    const snap = await this.rpcCatalog({ kind: 'hub-introspect' });
    if (!snap.ok || !snap.introspect) {
      throw new Error(snap.error ?? '[SharedWorkerDataServicesClient] hub-introspect failed');
    }
    return snap.introspect;
  }

  // ─── SSRM query plane RPCs ─────────────────────────────────────

  async ssrmGetRows(
    providerId: string,
    sessionId: string,
    request: SsrmGetRowsRequest,
  ): Promise<SsrmGetRowsResult> {
    const event = await this.rpcSsrm({
      kind: 'ssrm-get-rows',
      providerId,
      sessionId,
      request,
    });
    if (!event.ok || !event.getRows) {
      throw new Error(event.error ?? '[SharedWorkerDataServicesClient] ssrm-get-rows failed');
    }
    return event.getRows;
  }

  async ssrmSetViewport(
    providerId: string,
    sessionId: string,
    keys: string[],
    scope?: { blockKey: string; queryId: string; hasFilter?: boolean },
  ): Promise<void> {
    if (this.closed) {
      return Promise.reject(new Error('[SharedWorkerDataServicesClient] client is closed'));
    }
    this.send({
      kind: 'ssrm-set-viewport',
      providerId,
      sessionId,
      keys,
      ...(scope ? { scope } : {}),
    });
  }

  async ssrmConfigureExpressions(
    providerId: string,
    rules: ExpressionRule[],
    sessionId?: string,
  ): Promise<void> {
    const event = await this.rpcSsrm({
      kind: 'ssrm-configure-expressions',
      providerId,
      rules,
      ...(sessionId !== undefined ? { sessionId } : {}),
    });
    if (!event.ok) {
      throw new Error(
        event.error ?? '[SharedWorkerDataServicesClient] ssrm-configure-expressions failed',
      );
    }
  }

  async ssrmGetStatusBar(
    providerId: string,
    request?: StatusBarRequest,
  ): Promise<StatusBarSummary> {
    const event = await this.rpcSsrm({
      kind: 'ssrm-status-bar',
      providerId,
      request,
    });
    if (!event.ok || !event.statusBar) {
      throw new Error(event.error ?? '[SharedWorkerDataServicesClient] ssrm-status-bar failed');
    }
    return event.statusBar;
  }

  async ssrmGetSetFilterValues(
    providerId: string,
    request: SetFilterValuesRequest,
  ): Promise<string[]> {
    const event = await this.rpcSsrm({
      kind: 'ssrm-set-filter-values',
      providerId,
      request,
    });
    if (!event.ok || !Array.isArray(event.setFilterValues)) {
      throw new Error(
        event.error ?? '[SharedWorkerDataServicesClient] ssrm-set-filter-values failed',
      );
    }
    return event.setFilterValues;
  }

  /**
   * Subscribe to viewport-filtered SSRM ticks for a data attach session
   * (`subId` / sessionId).
   */
  onSsrmTick(
    sessionId: string,
    handler: (payload: { event: SsrmTickEvent['event']; interestedKeys: string[] }) => void,
  ): () => void {
    let set = this.ssrmTickListeners.get(sessionId);
    if (!set) {
      set = new Set();
      this.ssrmTickListeners.set(sessionId, set);
    }
    set.add(handler);
    return () => {
      set!.delete(handler);
      if (set!.size === 0) this.ssrmTickListeners.delete(sessionId);
    };
  }

  /**
   * Attach a fresh `AppDataMirror` to the hub. The mirror is a
   * pure RPC client — it sends operations to the hub and receives
   * snapshot/delta events back. The hub owns IndexedDB persistence;
   * the mirror never touches Dexie.
   *
   *   const mirror = client.attachAppData({ userId });
   *   await mirror.attach();
   *   await mirror.ready();
   *   mirror.get('positions', 'asOfDate'); // sync read
   *   await mirror.set('positions', 'asOfDate', '2026-05-08');
   *
   * The caller owns the mirror's lifetime — `client.detachAppData(mirror)`
   * or `client.close()` releases the worker-side listener.
   */
  attachAppData(opts: {
    userId: string;
    /** Override the auto-generated subId (used in tests for determinism). */
    subId?: string;
  }): AppDataMirror {
    const subId = opts.subId ?? this.generateSubId();
    const mirror = new AppDataMirror({
      subId,
      userId: opts.userId,
      send: (req: AppDataRequest) => this.sendAppData(req),
    });
    this.appDataMirrors.set(subId, mirror);
    return mirror;
  }

  /** Detach + remove a previously-attached AppData mirror. */
  detachAppData(mirror: AppDataMirror): void {
    for (const [subId, m] of this.appDataMirrors) {
      if (m === mirror) {
        this.appDataMirrors.delete(subId);
        if (!this.closed) this.sendAppData({ kind: 'appdata-detach', subId });
        return;
      }
    }
  }

  /** True when this client still has an active hub subscription for `subId`. */
  hasDataSubscription(subId: SubId): boolean {
    return this.subs.has(subId);
  }

  close(): void {
    if (this.closed) return;
    this.stopAllHeartbeats();
    if (this.pageHideHandler && typeof globalThis.removeEventListener === 'function') {
      globalThis.removeEventListener('pagehide', this.pageHideHandler);
      this.pageHideHandler = null;
    }
    if (this.visibilityHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
    // Tell the hub to drop our subscriptions before the port closes.
    // Otherwise zombie listeners make postMessage throw during fan-out
    // and every other window on the same provider stops getting ticks.
    for (const [subId] of this.subs) {
      try {
        this.send({ kind: 'detach', subId });
      } catch { /* port may already be dead */ }
    }
    for (const [subId] of this.appDataMirrors) {
      try {
        this.sendAppData({ kind: 'appdata-detach', subId });
      } catch { /* port may already be dead */ }
    }
    // Explicit port goodbye — the hub cannot otherwise detect a clean
    // close (dead-port postMessage is a silent no-op, messageerror only
    // fires on deserialization failures), so without this the worker
    // retains this window's PortLike + closures forever and clones every
    // catalog broadcast into the void per dead port.
    try {
      this.send({ kind: 'port-close' });
    } catch { /* port may already be dead */ }
    this.closed = true;
    this.subs.clear();
    this.thinSubs.clear();
    this.appDataMirrors.clear();
    for (const [, pending] of this.catalogPending) {
      pending.reject(new Error('[SharedWorkerDataServicesClient] client closed'));
    }
    this.catalogPending.clear();
    for (const [, pending] of this.ssrmPending) {
      if (pending.timer !== undefined) clearTimeout(pending.timer);
      pending.reject(new Error('[SharedWorkerDataServicesClient] client closed'));
    }
    this.ssrmPending.clear();
    this.ssrmTickListeners.clear();
    for (const resolve of this.catalogReadyWaiters) resolve();
    this.catalogReadyWaiters.length = 0;
    this.catalogChangeListeners.clear();
    this.port.removeEventListener('message', this.handleMessage);
    try { this.port.close(); } catch { /* MessagePort.close is fine to call twice */ }
  }

  // ─── internals ────────────────────────────────────────────────

  private startHeartbeat(subId: SubId, meta?: SubscriberMeta): void {
    this.stopHeartbeat(subId);
    this.heartbeatMeta.set(subId, meta);
    const tick = () => {
      if (this.closed) return;
      const base = this.heartbeatMeta.get(subId);
      const hidden = typeof document !== 'undefined' && document.hidden;
      this.send({
        kind: 'ping',
        subId,
        meta: { ...base, hidden },
      });
    };
    tick();
    this.heartbeatTimers.set(
      subId,
      setInterval(tick, SUBSCRIBER_PING_INTERVAL_MS),
    );
  }

  /** Immediate pings when a hidden window becomes visible again. */
  private sendVisibilityPings(): void {
    if (this.closed) return;
    for (const subId of this.subs.keys()) {
      const base = this.heartbeatMeta.get(subId);
      this.send({
        kind: 'ping',
        subId,
        meta: { ...base, hidden: false },
      });
    }
  }

  /**
   * Hub evicted our subscription (missed heartbeats). Re-attach with the
   * same subId so delivery resumes without tearing down consumer handlers.
   */
  private handleSubscriptionLost(subId: SubId): void {
    const sub = this.subs.get(subId);
    if (!sub || this.closed) return;
    if (sub.kind === 'data') {
      this.send({
        kind: 'attach',
        subId,
        providerId: sub.attach.providerId,
        cfg: sub.attach.cfg,
        mode: 'data',
        extra: sub.attach.extra,
      });
      this.startHeartbeat(subId, sub.attach.meta);
      return;
    }
    this.send({
      kind: 'attach',
      subId,
      providerId: sub.attach.providerId,
      mode: 'stats',
    });
    this.startHeartbeat(subId, sub.attach.meta);
  }

  private stopHeartbeat(subId: SubId): void {
    const timer = this.heartbeatTimers.get(subId);
    if (timer !== undefined) {
      clearInterval(timer);
      this.heartbeatTimers.delete(subId);
    }
    this.heartbeatMeta.delete(subId);
  }

  private stopAllHeartbeats(): void {
    for (const timer of this.heartbeatTimers.values()) clearInterval(timer);
    this.heartbeatTimers.clear();
    this.heartbeatMeta.clear();
  }

  private send(req: Request): void {
    try {
      this.port.postMessage(req);
    } catch (err) {
      // postMessage can throw on dead ports / structured-clone failures.
      // Surface via the affected listener if we can identify it.
      const subId = (req as { subId?: string }).subId;
      if (subId) {
        const sub = this.subs.get(subId);
        if (sub?.kind === 'data') {
          sub.listener.onStatus('error', err instanceof Error ? err.message : String(err));
        }
      }
    }
  }

  private sendAppData(req: AppDataRequest): void {
    if (this.closed) return;
    try {
      this.port.postMessage(req);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[SharedWorkerDataServicesClient] AppData postMessage failed', err);
    }
  }

  private rpcCatalog(
    req: Omit<HubReadyRequest, 'reqId'>
      | Omit<GetConfigRequest, 'reqId'>
      | Omit<ListConfigsRequest, 'reqId'>
      | Omit<ConfigInvalidateRequest, 'reqId'>
      | Omit<HubIntrospectRequest, 'reqId'>
      | Omit<ProviderRunningRequest, 'reqId'>,
  ): Promise<ConfigSnapshotEvent> {
    if (this.closed) {
      return Promise.reject(new Error('[SharedWorkerDataServicesClient] client is closed'));
    }
    const reqId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      this.catalogPending.set(reqId, { resolve, reject });
      this.send({ ...req, reqId } as Request);
    });
  }

  private rpcSsrm(
    req:
      | Omit<import('../protocol.js').SsrmGetRowsRpcRequest, 'reqId'>
      | Omit<import('../protocol.js').SsrmConfigureExpressionsRequest, 'reqId'>
      | Omit<import('../protocol.js').SsrmStatusBarRpcRequest, 'reqId'>
      | Omit<import('../protocol.js').SsrmSetFilterValuesRpcRequest, 'reqId'>,
  ): Promise<SsrmRpcEvent> {
    if (this.closed) {
      return Promise.reject(new Error('[SharedWorkerDataServicesClient] client is closed'));
    }
    const reqId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer =
        this.ssrmRpcTimeoutMs > 0
          ? setTimeout(() => {
              this.ssrmPending.delete(reqId);
              reject(
                new Error(
                  `[SharedWorkerDataServicesClient] ${req.kind} timed out after `
                    + `${this.ssrmRpcTimeoutMs}ms`,
                ),
              );
            }, this.ssrmRpcTimeoutMs)
          : undefined;
      this.ssrmPending.set(reqId, { resolve, reject, timer });
      this.send({ ...req, reqId } as Request);
    });
  }

  private handleMessage = (ev: MessageEvent): void => {
    if (isCatalogEvent(ev.data)) {
      this.routeCatalogEvent(ev.data);
      return;
    }
    if (isAppDataEvent(ev.data)) {
      this.routeAppDataEvent(ev.data);
      return;
    }
    if (!isEvent(ev.data)) return;
    const event: Event = ev.data;
    if (event.kind === 'ssrm-rpc') {
      const pending = this.ssrmPending.get(event.reqId);
      if (!pending) return;
      this.ssrmPending.delete(event.reqId);
      if (pending.timer !== undefined) clearTimeout(pending.timer);
      // Always resolve — callers inspect `ok` / payload (same as success path).
      pending.resolve(event);
      return;
    }
    if (event.kind === 'ssrm-tick') {
      const listeners = this.ssrmTickListeners.get(event.subId);
      if (!listeners) return;
      const payload = {
        event: event.event,
        interestedKeys: event.interestedKeys,
      };
      for (const handler of listeners) {
        try {
          handler(payload);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn('[SharedWorkerDataServicesClient] ssrm-tick listener threw', err);
        }
      }
      return;
    }
    const sub = this.subs.get(event.subId);
    if (!sub) return; // listener detached before this event landed; drop.
    switch (event.kind) {
      case 'delta':
        if (sub.kind === 'data') {
          this.trackThinRows(event.subId, event.rows, Boolean(event.replace));
          sub.listener.onDelta(event.rows, Boolean(event.replace));
        }
        return;
      case 'delta-bin':
        // Pre-encoded replay chunk: the hub serialized the cache once
        // and shipped bytes; decode back into rows and ride the same
        // delta path. The decoded array is freshly owned by this
        // client, exactly like a structured-clone `delta.rows`.
        if (sub.kind === 'data') {
          try {
            const rows = event.enc === 'col'
              ? decodeColumnar(event.buf)
              : JSON.parse(SNAPSHOT_DECODER.decode(event.buf)) as unknown[];
            this.trackThinRows(event.subId, rows, Boolean(event.replace));
            sub.listener.onDelta(rows, Boolean(event.replace));
          } catch (err) {
            // eslint-disable-next-line no-console
            console.error(
              '[SharedWorkerDataServicesClient] delta-bin decode failed subId=%s enc=%s',
              event.subId,
              event.enc ?? 'json',
              err,
            );
          }
        }
        return;
      case 'sub-init':
        // Thin-delta handshake: the hub will patch by composed row key,
        // so start mirroring full rows under the same keys.
        this.thinSubs.set(event.subId, { keyColumn: event.keyColumn, rows: new Map() });
        return;
      case 'delta-patch':
        if (sub.kind === 'data') {
          const rows = this.mergeThinPatches(event);
          if (rows.length > 0) sub.listener.onDelta(rows, false);
        }
        return;
      case 'status':
        if (sub.kind === 'data') {
          sub.listener.onStatus(event.status, event.error);
        }
        return;
      case 'stats':
        if (sub.kind === 'stats') {
          sub.listener.onStats(event.stats);
        }
        return;
      case 'rows-received':
        if (sub.kind === 'data') {
          sub.listener.onRowsReceived?.(event.count);
        }
        return;
      case 'subscription-lost':
        this.handleSubscriptionLost(event.subId);
        return;
    }
  };

  /**
   * Mirror full rows for a thin-delta subscription. No-op for
   * subscriptions without a `sub-init` handshake (the common case).
   */
  private trackThinRows(subId: SubId, rows: readonly unknown[], replace: boolean): void {
    const state = this.thinSubs.get(subId);
    if (!state) return;
    if (replace) state.rows.clear();
    for (const row of rows) {
      const k = composeRowId(row, state.keyColumn);
      if (k !== null) state.rows.set(k, row);
    }
  }

  /**
   * Apply a `delta-patch` frame: merge each patch into the mirrored
   * previous row, producing NEW full-row objects (the previous row is
   * never mutated — consumers may still hold it). Full rows under `f`
   * (inserts / fallbacks) pass through as-is. Returns the merged rows
   * in patch order, ready for the ordinary `onDelta` path.
   */
  private mergeThinPatches(event: DeltaPatchEvent): unknown[] {
    const state = this.thinSubs.get(event.subId);
    // The hub only sends patches after the sub-init + full replay it
    // posts on attach, so a missing mirror can't happen in practice;
    // returning no rows (rather than corrupt ones) keeps it safe.
    if (!state) return [];
    const patches: readonly RowPatch[] = event.patches
      ?? (event.buf
        ? JSON.parse(SNAPSHOT_DECODER.decode(event.buf)) as RowPatch[]
        : []);
    const out: unknown[] = [];
    for (const p of patches) {
      if (p.f !== undefined) {
        state.rows.set(p.k, p.f);
        out.push(p.f);
        continue;
      }
      const prev = state.rows.get(p.k);
      if (!prev || typeof prev !== 'object') continue;
      const next: Record<string, unknown> = { ...(prev as Record<string, unknown>), ...(p.s ?? {}) };
      if (p.d) for (const name of p.d) delete next[name];
      state.rows.set(p.k, next);
      out.push(next);
    }
    return out;
  }

  private routeCatalogEvent(event: CatalogEvent): void {
    if (event.kind === 'catalog-ready') {
      for (const resolve of this.catalogReadyWaiters) resolve();
      this.catalogReadyWaiters.length = 0;
      const detail: CatalogChangeDetail = {
        providerId: event.providerId,
        full: event.full ?? !event.providerId,
      };
      for (const listener of this.catalogChangeListeners) {
        try {
          listener(detail);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn('[SharedWorkerDataServicesClient] catalog change listener threw', err);
        }
      }
      return;
    }
    const pending = this.catalogPending.get(event.reqId);
    if (!pending) return;
    this.catalogPending.delete(event.reqId);
    if (event.ok) pending.resolve(event);
    else pending.reject(new Error(event.error ?? 'Catalog request failed'));
  }

  private routeAppDataEvent(event: AppDataSnapshotEvent | AppDataDeltaEvent | AppDataAckEvent): void {
    if (event.kind === 'appdata-ack') {
      // Ack events don't carry a subId — every mirror is asked to
      // resolve its pending request matching reqId. Mirrors with no
      // such reqId are no-ops, so this is safe.
      for (const mirror of this.appDataMirrors.values()) mirror.handleEvent(event);
      return;
    }
    const mirror = this.appDataMirrors.get(event.subId);
    if (!mirror) return; // mirror detached before this event landed; drop.
    mirror.handleEvent(event);
  }
}

/**
 * Test helper: build a SharedWorkerDataServicesClient wired to an in-process Hub via a
 * MessageChannel. Saves every consumer from rebuilding this in their
 * own tests.
 *
 * Usage:
 *   const { client } = createInPageWiring(attachPort);
 *   client.attach(...)
 *   ... hub.handleRequest fires ... events stream back to the client
 */
export interface InPageWiring {
  client: SharedWorkerDataServicesClient;
  /** Disconnect both ends. */
  close(): void;
}

export function createInPageWiring(
  attachToHub: (clientPort: MessagePort) => void,
  opts?: SharedWorkerDataServicesClientOpts,
): InPageWiring {
  const channel = new MessageChannel();
  attachToHub(channel.port2);
  const client = new SharedWorkerDataServicesClient(channel.port1, opts);
  return {
    client,
    close: () => {
      client.close();
      try { channel.port2.close(); } catch { /* idempotent */ }
    },
  };
}
