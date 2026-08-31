/**
 * SharedWorkerDataServicesHub — single-process state machine that fans
 * incoming requests to provider factories and outgoing events to
 * subscriber ports. Lives inside the SharedWorker.
 *
 * Providers lazy-create on first `attach` (later attaches reuse the
 * running instance), auto-stop when the last data + stats subscriber
 * leaves, and evict stale subscribers on missed heartbeats. The
 * per-provider cache (`Map<rowKey, row>` by `cfg.keyColumn`) IS the
 * snapshot — late joiners replay it on attach. `attach.extra`
 * triggers `provider.restart(extra)` (historical date picker /
 * refresh button paths).
 *
 * The subsystems live in sibling modules; this class is orchestration:
 *   - {@link SubscriberRegistry} — listener membership, subId index
 *   - {@link HubAppDataService} — AppData store + RPC + persistence
 *   - `providerEmit.ts` — upstream event application + encode
 *   - `replayCache.ts` — bucketed late-join replay encoding
 *   - `hubCatalogRpc.ts` — config/catalog request handlers
 *   - `hubIntrospect.ts` / `hubStats.ts` — diagnostics snapshots
 */

import type { ProviderConfig, StompProviderConfig } from '@wellsfargo-starui/types';
import type {
  AttachRequest,
  DetachRequest,
  Event,
  ProviderStats,
  Request,
  StopRequest,
  AppDataRequest,
  CatalogEvent,
  RefreshProviderRequest,
  HubIntrospectSnapshot,
} from '../protocol.js';
import { startProvider } from '../providers/registry.js';
import type { ProviderEmit, ProviderEmitEvent, ProviderHandle } from '../providers/Provider.js';
import { ConfigCatalogCache } from '../../hub/ConfigCatalogCache.js';
import {
  traceStompProviderCfg,
  traceWorkerAppDataSnapshot,
} from '../template/templateTrace.js';
import {
  LATE_JOIN_CHUNK_SIZE,
  SEC_WINDOW,
  MIN_WINDOW,
  type PortLike,
  type ProviderSlot,
  type StatsListener,
  type SharedWorkerDataServicesHubOpts,
  SUBSCRIBER_SWEEP_INTERVAL_MS,
} from './hubTypes.js';
import { restartClickLatency, restartExtrasEqual } from './hubHelpers.js';
import { newReplayCache, ensureReplayChunks } from './replayCache.js';
import { rotateStatsBuckets, snapshotProviderStats, zeroedStats } from './hubStats.js';
import { applyProviderEmit, type ProviderEmitContext } from './providerEmit.js';
import { buildIntrospectSnapshot, type IntrospectSources } from './hubIntrospect.js';
import {
  handleHubReady,
  handleHubIntrospect,
  handleProviderRunning,
  handleGetConfig,
  handleListConfigs,
  handleConfigInvalidate,
  type CatalogRpcContext,
} from './hubCatalogRpc.js';
import { HubAppDataService } from './HubAppDataService.js';
import { SubscriberRegistry } from './SubscriberRegistry.js';
import {
  startProviderInWorker,
  type ProviderWorkerControl,
  type ProviderWorkerPort,
} from './providerWorkerHost.js';
import type { ProviderWorkerBatchMeta } from './providerWorkerProtocol.js';
import type { EncodedChunk } from '../providers/Provider.js';
import { createDeferredProviderHandle, type DeferredProviderHandle } from './deferredProviderHandle.js';
import type { DataPlane } from '@wellsfargo-starui/types';
import type { ProviderPortRequest } from '../protocol.js';

/** Default wait for a window's `provider-port` answer before the hub-thread fallback. */
const PROVIDER_PORT_TIMEOUT_MS = 4000;
/** Spare provider-worker ports kept per provider for fail-over / re-create. */
const MAX_SPARE_PROVIDER_PORTS = 4;

/** A provider whose transport is waiting for a window to supply a sub-worker port. */
interface PendingProviderPort {
  slot: ProviderSlot;
  cfg: ProviderConfig;
  emit: ProviderEmit;
  deferred: DeferredProviderHandle;
  timer: ReturnType<typeof setTimeout>;
}

// Re-exported for back-compat with `worker/index.ts` consumers.
export type { PortLike, SharedWorkerDataServicesHubOpts } from './hubTypes.js';

/**
 * Gate for hot-path diagnostic logs. Flip to `true` locally when
 * debugging provider lifecycle or fan-out — per-broadcast logging
 * measurably hurts CPU at high message rates even with DevTools closed.
 */
const DEBUG = false;

export class SharedWorkerDataServicesHub {
  private readonly providers = new Map<string, ProviderSlot>();
  private readonly subscribers = new SubscriberRegistry();
  private readonly appDataSvc: HubAppDataService;
  private readonly configCatalog: ConfigCatalogCache | null;
  private readonly connectedPorts = new Set<PortLike>();

  private readonly statsIntervalMs: number;
  private readonly setTimer: (cb: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private statsTimer: unknown = null;
  private subscriberSweepTimer: unknown = null;

  private readonly emitCtx: ProviderEmitContext;
  private readonly catalogRpcCtx: CatalogRpcContext;

  /** Data plane for providers whose cfg doesn't choose one. */
  private readonly defaultDataPlane: DataPlane;
  private readonly providerPortTimeoutMs: number;
  /** Sub-worker ports windows handed over beyond the one in use (fail-over / re-create). */
  private readonly spareProviderPorts = new Map<string, ProviderWorkerPort[]>();
  /** Providers whose transport start is waiting for a window's `provider-port`. */
  private readonly pendingProviderPorts = new Map<string, PendingProviderPort>();
  /** In-flight sub-worker replay requests (late-join attach / refresh). */
  private readonly pendingReplays = new Map<string, {
    providerId: string;
    subId: string;
    port: PortLike;
    slot: ProviderSlot;
    mode: 'attach' | 'refresh';
  }>();
  /** Sub-ids held out of live broadcasts until their replay run lands. */
  private readonly pendingReplaySubIds = new Set<string>();
  private replayReqSeq = 0;

  constructor(opts: SharedWorkerDataServicesHubOpts = {}) {
    this.defaultDataPlane = opts.dataPlane ?? 'hub';
    this.providerPortTimeoutMs = opts.providerPortTimeoutMs ?? PROVIDER_PORT_TIMEOUT_MS;
    this.statsIntervalMs = opts.statsIntervalMs ?? 1000;
    this.setTimer = opts.setTimer ?? ((cb, ms) => setInterval(cb, ms));
    this.clearTimer = opts.clearTimer ?? ((h) => clearInterval(h as ReturnType<typeof setInterval>));
    this.appDataSvc = new HubAppDataService(opts.configManager);
    if (opts.configCatalog) {
      this.configCatalog = opts.configCatalog;
    } else if (opts.configManager) {
      this.configCatalog = new ConfigCatalogCache(opts.configManager);
    } else {
      this.configCatalog = null;
    }

    this.emitCtx = {
      dataListenerCount: (providerId) => this.subscribers.dataCount(providerId),
      broadcast: (providerId, slot, eventTemplate) =>
        this.broadcastData(providerId, slot, eventTemplate),
      flushStats: (providerId) => this.flushStatsToListeners(providerId),
    };
    this.catalogRpcCtx = {
      catalog: this.configCatalog,
      broadcastCatalogEvent: (event) => this.broadcastCatalogEvent(event),
      resyncAppData: () => this.appDataSvc.resync(),
      buildIntrospect: () => this.buildIntrospectSnapshot(),
      isProviderRunning: (providerId) => this.providers.has(providerId),
    };
  }

  // ─── Public surface ────────────────────────────────────────────

  /**
   * @param transferred MessagePorts that rode in the message's transfer
   *   list — a window handing over a provider sub-worker's port
   *   (`provider-port`). Ignored for every other request.
   */
  handleRequest(port: PortLike, req: Request, transferred?: readonly MessagePort[]): void {
    this.trackPort(port);
    switch (req.kind) {
      case 'provider-port': this.handleProviderPort(req, transferred?.[0]); return;
      case 'attach':  this.handleAttach(port, req); return;
      case 'detach':  this.handleDetach(req); return;
      // Clean window close: postMessage to a dead port never throws and
      // messageerror never fires, so this explicit goodbye is the ONLY
      // way connectedPorts / AppData listeners get released.
      case 'port-close': this.onPortClosed(port); return;
      case 'ping':    this.subscribers.ping(req.subId, req.meta); return;
      case 'stop':    this.handleStop(req); return;
      case 'hub-ready': handleHubReady(this.catalogRpcCtx, port, req); return;
      case 'get-config': void handleGetConfig(this.catalogRpcCtx, port, req); return;
      case 'list-configs': handleListConfigs(this.catalogRpcCtx, port, req); return;
      case 'config-invalidate': void handleConfigInvalidate(this.catalogRpcCtx, port, req); return;
      case 'refresh-provider': this.handleRefreshProvider(req); return;
      case 'hub-introspect': handleHubIntrospect(this.catalogRpcCtx, port, req); return;
      case 'provider-running': handleProviderRunning(this.catalogRpcCtx, port, req); return;
    }
  }

  /**
   * AppData request entry point — see {@link HubAppDataService}.
   * Routed by `isAppDataRequest` upstream of the hub (worker entry).
   */
  handleAppDataRequest(port: PortLike, req: AppDataRequest): void {
    this.trackPort(port);
    this.appDataSvc.handleRequest(port, req);
  }

  /**
   * Preload data-provider catalog rows from ConfigManager into the
   * in-memory cache. Production installs call this after
   * `configManager.init()` and before port attach traffic.
   *
   * Idempotent. No-op when no ConfigCatalogCache was constructed.
   */
  async hydrateCatalog(): Promise<void> {
    if (!this.configCatalog) return;
    if (this.configCatalog.isReady()) return;
    try {
      await this.configCatalog.loadAll();
      this.broadcastCatalogEvent({ kind: 'catalog-ready', full: true });
    } catch (err) {
      // Hydration failure is non-fatal — attach with inline cfg still
      // works; cfg-free attach will miss until a retry succeeds.
      // eslint-disable-next-line no-console
      console.error('[hub] Config catalog hydrate failed', err);
    }
  }

  /** Worker-side catalog cache, or null when no ConfigManager was supplied. */
  getConfigCatalog(): ConfigCatalogCache | null {
    return this.configCatalog;
  }

  /** Live hub diagnostics for operator / dev tooling. */
  buildIntrospectSnapshot(): HubIntrospectSnapshot {
    const sources: IntrospectSources = {
      providers: this.providers,
      subscribers: this.subscribers,
      configCatalog: this.configCatalog,
      connectedPortCount: this.connectedPorts.size,
      appDataListenerCount: this.appDataSvc.listenerCount,
      appDataRows: this.appDataSvc.snapshotRows(),
    };
    return buildIntrospectSnapshot(sources);
  }

  /** See {@link HubAppDataService.hydrate}. */
  async hydrateAppData(userId = 'worker'): Promise<void> {
    await this.appDataSvc.hydrate(userId);
  }

  /** See {@link HubAppDataService.resync}. */
  async resyncAppDataFromStore(userId = 'worker'): Promise<void> {
    await this.appDataSvc.resync(userId);
  }

  /** Drop every subscription owned by this port. Called on disconnect. */
  onPortClosed(port: PortLike): void {
    try {
      port.dispose?.();
    } catch {
      /* port already torn down */
    }
    this.connectedPorts.delete(port);
    const { idleCandidates, statsEmptied } = this.subscribers.removeByPort(port);
    if (statsEmptied) this.maybeStopStatsSampler();
    this.appDataSvc.onPortClosed(port);
    for (const providerId of idleCandidates) {
      this.maybeStopProviderIfIdle(providerId);
    }
  }

  /** Stop every provider + cancel sampler. For shutdown only. */
  async dispose(): Promise<void> {
    for (const providerId of [...this.pendingProviderPorts.keys()]) this.cancelPendingProviderPort(providerId);
    this.pendingReplays.clear();
    this.pendingReplaySubIds.clear();
    for (const [, slot] of this.providers) await slot.handle.stop();
    this.providers.clear();
    this.subscribers.clear();
    this.appDataSvc.clear();
    this.connectedPorts.clear();
    if (this.subscriberSweepTimer !== null) {
      this.clearTimer(this.subscriberSweepTimer);
      this.subscriberSweepTimer = null;
    }
    this.maybeStopStatsSampler();
  }

  // ─── Request handlers ──────────────────────────────────────────

  private trackPort(port: PortLike): void {
    this.connectedPorts.add(port);
  }

  private broadcastCatalogEvent(event: CatalogEvent): void {
    for (const port of this.connectedPorts) {
      try { port.postMessage(event); }
      catch { this.connectedPorts.delete(port); }
    }
  }

  private handleAttach(port: PortLike, req: AttachRequest): void {
    let slot = this.providers.get(req.providerId);
    let isRestartAttach = false;
    let createdHere = false;

    if (!slot) {
      const cfg = req.cfg ?? this.configCatalog?.getProviderConfig(req.providerId) ?? undefined;
      if (!cfg) {
        // eslint-disable-next-line no-console
        if (DEBUG) console.log(`[v2/hub] attach REJECTED subId=${req.subId} provider=${req.providerId}: not running and no cfg`);
        port.postMessage({
          subId: req.subId,
          kind: 'status',
          status: 'error',
          error: `Provider '${req.providerId}' not in catalog and no cfg supplied to start it.`,
        });
        return;
      }
      this.traceStompAttachCfg('hub.attach CREATE (catalog cfg → worker)', req.providerId, cfg, req.extra);
      // eslint-disable-next-line no-console
      if (DEBUG) console.log(`[v2/hub] attach CREATE subId=${req.subId} provider=${req.providerId}`);
      try {
        slot = this.createProvider(req.providerId, cfg, port);
        createdHere = true;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        port.postMessage({
          subId: req.subId,
          kind: 'status',
          status: 'error',
          error: message,
        } satisfies Event);
        return;
      }
      // createProvider registered the slot (pre-start, so synchronous
      // emissions broadcast).
      this.ensureStatsSampler();
      // First attach can carry `extra` (historical asOfDate). Without this,
      // `ProviderClientAdapter.restart()` on a fresh provider would create
      // the slot but drop the overlay — STOMP would publish unresolved
      // `{{positions.asOfDate}}` template paths.
      if (req.extra) {
        // eslint-disable-next-line no-console
        console.log(`[v2/hub][trace] attach CREATE+RESTART provider=${req.providerId} extra=${JSON.stringify(req.extra)} ${restartClickLatency(req.extra)}`);
        void slot.handle.restart(req.extra);
        slot.activeRestartExtra = req.extra;
      }
    } else if (req.extra) {
      // Existing provider + restart payload. When the caller supplies a
      // cfg (the provider editor's Restart button always sends the current
      // draft), the connection / column / behaviour settings may have been
      // edited since the slot was created — the running provider captured
      // the OLD cfg, so a plain restart() would reconnect with stale
      // values. Rebuild the slot from the new cfg first. Normal grid
      // subscribers omit cfg and just get a plain restart(extra) (e.g. the
      // historical `asOfDate` overlay), which keeps the existing config.
      if (req.cfg) {
        this.traceStompAttachCfg('hub.attach RESTART+RECONFIG (running provider)', req.providerId, req.cfg, req.extra);
        // eslint-disable-next-line no-console
        console.log(`[v2/hub][trace] attach RESTART+RECONFIG provider=${req.providerId} extra=${JSON.stringify(req.extra)} ${restartClickLatency(req.extra)}`);
        slot = this.recreateProvider(req.providerId, req.cfg, port);
        createdHere = true;
        void slot.handle.restart(req.extra);
        slot.activeRestartExtra = req.extra;
        isRestartAttach = true;
      } else if (!restartExtrasEqual(slot.activeRestartExtra, req.extra)) {
        this.traceStompAttachCfg('hub.attach RESTART (running provider)', req.providerId, slot.cfg, req.extra);
        // eslint-disable-next-line no-console
        console.log(`[v2/hub][trace] attach RESTART provider=${req.providerId} extra=${JSON.stringify(req.extra)} ${restartClickLatency(req.extra)}`);
        void slot.handle.restart(req.extra);
        slot.activeRestartExtra = req.extra;
        isRestartAttach = true;
      } else {
        // eslint-disable-next-line no-console
        if (DEBUG) console.log(`[v2/hub] attach LATE-JOINER (same extra) subId=${req.subId} provider=${req.providerId} cacheSize=${slot.cache.size} status=${slot.status}`);
      }
    } else {
      // eslint-disable-next-line no-console
      if (DEBUG) console.log(`[v2/hub] attach LATE-JOINER subId=${req.subId} provider=${req.providerId} cacheSize=${slot.cache.size} status=${slot.status}`);
    }

    // Every window on a sub-worker provider joins its SharedWorker (the
    // connection is what keeps the worker alive) and hands the hub a port
    // — the creating attach already asked inside `startTransport`.
    if (slot.dataPlane === 'subworker' && !createdHere) {
      this.requestProviderWorker(req.providerId, port);
    }

    if (req.mode === 'data') {
      this.attachDataListener(req.providerId, req.subId, port, slot, {
        skipCacheReplay: isRestartAttach,
      });
    } else {
      this.attachStatsListener(req.providerId, req.subId, port);
    }
  }

  // ─── Provider sub-workers (dataPlane: 'subworker') ──────────────

  /** Ask a window to construct / join the provider's SharedWorker and send its port. */
  private requestProviderWorker(providerId: string, port: PortLike): void {
    try {
      port.postMessage({ kind: 'provider-worker-needed', providerId, subId: '' } satisfies Event);
    } catch {
      /* dead port — cleanup happens via onPortClosed */
    }
  }

  /** A window answered `provider-worker-needed` (with a port, or `unavailable`). */
  private handleProviderPort(req: ProviderPortRequest, port: MessagePort | undefined): void {
    const pending = this.pendingProviderPorts.get(req.providerId);
    if (req.unavailable || !port) {
      if (pending) {
        this.cancelPendingProviderPort(req.providerId);
        this.fallBackToHubThread(pending.slot, req.providerId, pending.cfg, pending.emit, 'this window cannot provide a sub-worker', pending.deferred);
      }
      return;
    }
    if (pending) {
      this.cancelPendingProviderPort(req.providerId);
      // No start overlay here: an attach-time `extra` is queued on the
      // deferred handle and replays as a restart on resolve, exactly like
      // the in-thread CREATE+RESTART path.
      pending.deferred.resolve(this.startOnPort(req.providerId, pending.cfg, pending.emit, pending.slot, port));
      return;
    }
    const spares = this.spareProviderPorts.get(req.providerId) ?? [];
    if (spares.length >= MAX_SPARE_PROVIDER_PORTS) {
      try { port.close(); } catch { /* ignore */ }
      return;
    }
    spares.push(port);
    this.spareProviderPorts.set(req.providerId, spares);
  }

  private takeSpareProviderPort(providerId: string): ProviderWorkerPort | undefined {
    const spares = this.spareProviderPorts.get(providerId);
    const port = spares?.shift();
    if (spares && spares.length === 0) this.spareProviderPorts.delete(providerId);
    return port;
  }

  private cancelPendingProviderPort(providerId: string): void {
    const pending = this.pendingProviderPorts.get(providerId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pendingProviderPorts.delete(providerId);
  }

  private startOnPort(
    providerId: string,
    cfg: ProviderConfig,
    emit: ProviderEmit,
    slot: ProviderSlot,
    port: ProviderWorkerPort,
    extra?: Record<string, unknown>,
  ): ProviderHandle {
    const control = startProviderInWorker(cfg, {
      providerId,
      appData: this.appDataSvc,
      port,
      extra,
      dataListenerCount: this.subscribers.dataCount(providerId),
      emit,
      onBatch: (events, meta) => this.applyRemoteBatch(providerId, slot, events, meta),
      onReplayChunks: (reqId, chunks, cacheSize) => this.completeRemoteReplay(reqId, chunks, cacheSize),
      onDead: (reason) => this.onProviderWorkerDead(providerId, slot, cfg, emit, reason),
    });
    slot.remoteControl = control;
    slot.remote = { cacheSize: slot.remote?.cacheSize ?? 0, cacheBytes: slot.remote?.cacheBytes ?? null };
    return control.handle;
  }

  /**
   * One fully-processed rows batch from a sub-worker: fold the meta into
   * the slot's stats / introspection state and fan the worker-built wire
   * templates out verbatim. The hub never sees the rows themselves
   * (small `delta` templates excepted, mirroring its own broadcast rule).
   */
  private applyRemoteBatch(
    providerId: string,
    slot: ProviderSlot,
    events: readonly Event[],
    meta: ProviderWorkerBatchMeta,
  ): void {
    if (this.providers.get(providerId) !== slot) return;
    slot.msgCount += 1;
    slot.msgsByBucket[slot.bucketIdx] += 1;
    slot.lastMessageAt = Date.now();
    slot.keyDropCount = meta.keyDropCount;
    slot.remote = { cacheSize: meta.cacheSize, cacheBytes: meta.cacheBytes };
    for (const eventTemplate of events) {
      this.broadcastData(providerId, slot, eventTemplate);
    }
  }

  /** Keep the sub-worker's listener count current (0 lets it skip encode work). */
  private syncRemoteListenerCount(providerId: string): void {
    this.providers.get(providerId)?.remoteControl?.setDataListenerCount(
      this.subscribers.dataCount(providerId),
    );
  }

  /**
   * Late-join / refresh replay for a sub-worker slot. The snapshot lives
   * in the worker, so: post `loading`, ask the worker for its chunk run,
   * and (attach mode) hold the listener out of live broadcasts until the
   * run lands — the worker answers synchronously between upstream
   * batches, so every batch relayed before the answer is inside the
   * snapshot and every one after it follows the promotion, gap-free.
   */
  private replayRemoteToPort(
    subId: string,
    port: PortLike,
    slot: ProviderSlot,
    providerId: string,
    mode: 'attach' | 'refresh',
  ): void {
    port.postMessage({ subId, kind: 'status', status: 'loading' } satisfies Event);
    const reqId = `rp${++this.replayReqSeq}`;
    this.pendingReplays.set(reqId, { providerId, subId, port, slot, mode });
    if (mode === 'attach') this.pendingReplaySubIds.add(subId);
    slot.remoteControl?.requestReplay(reqId);
  }

  private completeRemoteReplay(reqId: string, chunks: readonly EncodedChunk[], cacheSize: number): void {
    const pending = this.pendingReplays.get(reqId);
    if (!pending) return;
    this.pendingReplays.delete(reqId);
    this.pendingReplaySubIds.delete(pending.subId);
    const { providerId, subId, port, slot, mode } = pending;
    if (this.providers.get(providerId) !== slot) return;
    if (!this.subscribers.dataListeners(providerId)?.has(subId)) return; // detached meanwhile
    if (cacheSize === 0) {
      port.postMessage({ subId, kind: 'delta', rows: [], replace: true } satisfies Event);
      this.recordPublish(slot, 1);
    } else {
      for (let i = 0; i < chunks.length; i++) {
        port.postMessage({
          subId,
          kind: 'delta-bin',
          buf: chunks[i]!.buf,
          enc: chunks[i]!.enc,
          replace: i === 0,
        } satisfies Event);
        this.recordPublish(slot, 1);
      }
    }
    if (mode === 'refresh' || cacheSize > 0) {
      port.postMessage({ subId, kind: 'status', status: 'ready', error: undefined } satisfies Event);
    }
  }

  /**
   * The slot's sub-worker is gone. Attach-mode replays that were in
   * flight re-issue against `next` (a fresh control) or, on the hub-thread
   * fallback, resolve from the hub cache (empty until the restarted
   * transport replaces it — the replace then reaches those listeners).
   */
  private settlePendingReplays(providerId: string, slot: ProviderSlot, next: ProviderWorkerControl | null): void {
    for (const [reqId, pending] of [...this.pendingReplays]) {
      if (pending.providerId !== providerId || pending.slot !== slot) continue;
      this.pendingReplays.delete(reqId);
      this.pendingReplaySubIds.delete(pending.subId);
      if (next) {
        this.replayRemoteToPort(pending.subId, pending.port, slot, providerId, pending.mode);
      } else {
        this.replayCacheToPort(pending.subId, pending.port, slot, pending.mode);
      }
    }
  }

  /**
   * The slot's sub-worker died (no start ack, missed heartbeat, fatal
   * start error). Fail over to a spare port another window handed us,
   * else run the transport on the hub thread. Either way the replacement
   * restarts with the slot's active overlay.
   */
  private onProviderWorkerDead(
    providerId: string,
    slot: ProviderSlot,
    cfg: ProviderConfig,
    emit: ProviderEmit,
    reason: string,
  ): void {
    if (this.providers.get(providerId) !== slot) return;
    slot.remoteControl = undefined;
    const spare = this.takeSpareProviderPort(providerId);
    if (spare) {
      // eslint-disable-next-line no-console
      console.warn(`[hub] provider '${providerId}' sub-worker ${reason} — failing over to a spare sub-worker port`);
      slot.handle = this.startOnPort(providerId, cfg, emit, slot, spare, slot.activeRestartExtra ?? undefined);
      this.settlePendingReplays(providerId, slot, slot.remoteControl ?? null);
      return;
    }
    this.fallBackToHubThread(slot, providerId, cfg, emit, reason);
  }

  /** Run (or re-run) the slot's transport on the hub thread and record that in the slot. */
  private fallBackToHubThread(
    slot: ProviderSlot,
    providerId: string,
    cfg: ProviderConfig,
    emit: ProviderEmit,
    reason: string,
    deferred?: DeferredProviderHandle,
  ): void {
    if (this.providers.get(providerId) !== slot) return;
    // eslint-disable-next-line no-console
    console.warn(`[hub] provider '${providerId}': ${reason} — running its transport on the hub thread`);
    slot.dataPlane = 'hub';
    slot.remoteControl = undefined;
    slot.remote = undefined;
    this.settlePendingReplays(providerId, slot, null);
    let real: ProviderHandle;
    try {
      real = startProvider(cfg, emit, {
        appDataLookup: (name, key) => this.appDataSvc.get(name, key),
      });
    } catch (err) {
      emit({ status: 'error', error: err instanceof Error ? err.message : String(err) });
      return;
    }
    if (deferred) {
      deferred.resolve(real);
    } else {
      slot.handle = real;
      if (slot.activeRestartExtra) void real.restart(slot.activeRestartExtra);
    }
  }

  private handleDetach(req: DetachRequest): void {
    const removed = this.subscribers.remove(req.subId);
    if (removed.statsEmptied) this.maybeStopStatsSampler();
    if (removed.providerId) this.maybeStopProviderIfIdle(removed.providerId);
  }

  private maybeStopProviderIfIdle(providerId: string): void {
    // Every listener-removal path funnels through here — keep the
    // sub-worker's data-listener count current before deciding on idling.
    this.syncRemoteListenerCount(providerId);
    if (
      this.subscribers.dataCount(providerId) === 0
      && this.subscribers.statsCount(providerId) === 0
      && this.providers.has(providerId)
    ) {
      void this.stopProvider(providerId);
    }
    this.maybeStopSubscriberSweeper();
  }

  private maybeStopSubscriberSweeper(): void {
    if (this.subscribers.size > 0 || this.subscriberSweepTimer === null) return;
    this.clearTimer(this.subscriberSweepTimer);
    this.subscriberSweepTimer = null;
  }

  private ensureSubscriberSweeper(): void {
    if (this.subscriberSweepTimer !== null) return;
    this.subscriberSweepTimer = this.setTimer(
      () => this.sweepStaleSubscribers(),
      SUBSCRIBER_SWEEP_INTERVAL_MS,
    );
  }

  private sweepStaleSubscribers(): void {
    const stale = this.subscribers.collectStale(Date.now());
    if (stale.length === 0) return;
    const idleCandidates = new Set<string>();
    for (const subId of stale) {
      const providerId = this.evictStaleSubscriber(subId);
      if (providerId) idleCandidates.add(providerId);
    }
    for (const providerId of idleCandidates) {
      this.maybeStopProviderIfIdle(providerId);
    }
  }

  /** Notify the client, then drop the subscription. */
  private evictStaleSubscriber(subId: string): string | undefined {
    const port = this.subscribers.listenerOf(subId)?.port;
    if (port) {
      try {
        port.postMessage({
          kind: 'subscription-lost',
          subId,
          reason: 'stale',
        } satisfies Event);
      } catch {
        /* port already dead */
      }
    }
    const removed = this.subscribers.remove(subId);
    if (removed.statsEmptied) this.maybeStopStatsSampler();
    return removed.providerId;
  }

  private handleStop(req: StopRequest): void {
    void this.stopProvider(req.providerId);
  }

  /** Replay hub cache to one subscriber — no upstream `restart`. */
  private handleRefreshProvider(req: RefreshProviderRequest): void {
    const slot = this.providers.get(req.providerId);
    if (!slot) return;
    const listener = this.subscribers.dataListeners(req.providerId)?.get(req.subId);
    if (!listener) return;
    if (slot.remoteControl) this.replayRemoteToPort(req.subId, listener.port, slot, req.providerId, 'refresh');
    else this.replayCacheToPort(req.subId, listener.port, slot, 'refresh');
  }

  private async stopProvider(providerId: string): Promise<void> {
    this.cancelPendingProviderPort(providerId);
    for (const [reqId, pending] of [...this.pendingReplays]) {
      if (pending.providerId !== providerId) continue;
      this.pendingReplays.delete(reqId);
      this.pendingReplaySubIds.delete(pending.subId);
    }
    const slot = this.providers.get(providerId);
    if (!slot) return;

    // Drop from the registry first so late STOMP frames cannot fan-out
    // while deactivate() is still in flight.
    this.providers.delete(providerId);

    for (const l of this.subscribers.removeDataListenersOf(providerId)) {
      try {
        l.port.postMessage({ subId: l.subId, kind: 'status', status: 'error', error: 'Provider stopped.' } satisfies Event);
      } catch { /* port dead — other windows must not be blocked */ }
    }
    // Keep stats listeners registered across a stop. The diagnostics pane
    // is a passive monitor subscribed via `useProviderStats`; that effect
    // doesn't re-run while mounted, so deleting the listeners here would
    // strand the client — it would never re-subscribe, and a subsequent
    // Restart would re-create the provider into a UI that's gone blind.
    // Instead push one final zeroed snapshot so the pane reflects the
    // stopped state; the sampler skips this provider (no slot) until a
    // Restart re-creates it, at which point the same subscription resumes.
    this.emitStoppedStats(providerId);
    this.maybeStopStatsSampler();

    const stopResult = slot.handle.stop();
    this.maybeStopSubscriberSweeper();
    if (stopResult instanceof Promise) await stopResult;
  }

  /** Push a single zeroed stats snapshot to a provider's stats listeners. */
  private emitStoppedStats(providerId: string): void {
    const listeners = this.subscribers.statsListeners(providerId);
    if (!listeners) return;
    const stats = zeroedStats();
    for (const l of listeners.values()) {
      l.port.postMessage({ subId: l.subId, kind: 'stats', stats } satisfies Event);
    }
  }

  // ─── Provider lifecycle ────────────────────────────────────────

  private traceStompAttachCfg(
    phase: string,
    providerId: string,
    cfg: ProviderConfig | undefined,
    extra?: Record<string, unknown>,
  ): void {
    if (!cfg || cfg.providerType !== 'stomp') return;
    traceWorkerAppDataSnapshot(
      `${phase} · worker AppData`,
      this.appDataSvc.snapshotRows().map((r) => ({ name: r.name, values: r.values })),
    );
    traceStompProviderCfg(phase, cfg as StompProviderConfig, {
      providerId,
      extra,
      lookup: (name, key) => this.appDataSvc.get(name, key),
    });
  }

  /**
   * @param requester the attaching window's port — asked for a sub-worker
   *   port when the slot's data plane is `'subworker'`. Absent (e.g.
   *   `refresh-provider`), an already-attached window is asked instead.
   */
  private createProvider(providerId: string, cfg: ProviderConfig, requester?: PortLike): ProviderSlot {
    const now = Date.now();
    const flags = cfg as {
      keyColumn?: string | readonly string[];
      thinDeltas?: boolean;
      wireFormat?: string;
      dataPlane?: string;
    };
    const slot: ProviderSlot = {
      handle: undefined as unknown as ProviderHandle, // set immediately below
      cfg,
      // Per-provider cfg wins over the hub default; `startTransport` may
      // still downgrade this to 'hub' if no sub-worker can be spawned.
      dataPlane:
        flags.dataPlane === 'subworker' || flags.dataPlane === 'hub'
          ? flags.dataPlane
          : this.defaultDataPlane,
      cache: new Map<string, unknown>(),
      status: 'loading',
      byteCount: 0,
      msgCount: 0,
      msgsByBucket: Array.from({ length: SEC_WINDOW }, () => 0),
      bucketIdx: 0,
      startedAt: now,
      lastMessageAt: null,
      errorCount: 0,
      snapshotFetchStartedAt: now,
      snapshotFetchMs: null,
      restartRequestMs: null,
      firstMessageMs: null,
      snapshotReady: false,
      publishCount: 0,
      pubsByBucket: Array.from({ length: SEC_WINDOW }, () => 0),
      pubsByMinBucket: Array.from({ length: MIN_WINDOW }, () => 0),
      minBucketIdx: 0,
      publishWindowSeconds: 0,
      keyDropCount: 0,
      keyDropWarned: false,
      activeRestartExtra: null,
      replay: newReplayCache(),
      // Thin deltas need a key to patch against — without keyColumn
      // every row would drop from the cache anyway, so gate on both.
      thinDeltas: flags.thinDeltas === true && flags.keyColumn !== undefined,
      // Default object feeds to the columnar wire format. It auto-falls-back to
      // JSON per chunk for non-object / incompatible rows (see encodeChunk), so
      // this is safe, and it ~halves snapshot decode on the page main thread for
      // wide/projected rows (≈ a plain structured-clone at N=1, faster at N>1).
      // Opt out with cfg.wireFormat: 'json'.
      columnar: flags.wireFormat !== 'json',
    };

    const emit: ProviderEmit = (event: ProviderEmitEvent) => {
      // Only the currently-registered slot may emit. A superseded slot
      // (after recreateProvider) or a stopped one (removed from the
      // map) is silently ignored, so stale frames never leak into the
      // new cache.
      if (this.providers.get(providerId) !== slot) return;
      applyProviderEmit(this.emitCtx, providerId, slot, event);
    };

    // Register BEFORE starting the provider: transports emit
    // `status: loading` synchronously inside the factory call, and
    // the emit guard drops events from unregistered slots. Registered
    // after-the-fact, that first loading vanished — peer windows never
    // learned a restart had begun (the old `restart()` path masked
    // this by re-emitting loading post-registration; the adopt-in-
    // flight restart path doesn't).
    this.providers.set(providerId, slot);
    try {
      slot.handle = this.startTransport(providerId, cfg, emit, slot, requester);
    } catch (err) {
      this.providers.delete(providerId);
      throw err;
    }
    return slot;
  }

  /**
   * Start `cfg`'s transport on the slot's data plane.
   *
   * `'subworker'`: use a spare sub-worker port if a window already handed
   * one over; otherwise ask a window (`provider-worker-needed`) and hand
   * back a deferred handle — listeners see `loading` now, the transport
   * starts when the port arrives, and the hub thread takes over if no
   * port arrives within `providerPortTimeoutMs` (recorded on the slot,
   * so introspection shows where the transport really runs).
   */
  private startTransport(
    providerId: string,
    cfg: ProviderConfig,
    emit: ProviderEmit,
    slot: ProviderSlot,
    requester?: PortLike,
  ): ProviderHandle {
    if (slot.dataPlane === 'subworker') {
      const spare = this.takeSpareProviderPort(providerId);
      if (spare) return this.startOnPort(providerId, cfg, emit, slot, spare);

      const asker = requester ?? this.anyListenerPort(providerId);
      if (asker) {
        const deferred = createDeferredProviderHandle();
        this.pendingProviderPorts.set(providerId, {
          slot,
          cfg,
          emit,
          deferred,
          timer: setTimeout(() => {
            const pending = this.pendingProviderPorts.get(providerId);
            if (!pending) return;
            this.pendingProviderPorts.delete(providerId);
            this.fallBackToHubThread(slot, providerId, cfg, emit, 'no window supplied a sub-worker port in time', pending.deferred);
          }, this.providerPortTimeoutMs),
        });
        // In-thread transports emit `loading` synchronously from start;
        // keep that contract while the port is in flight.
        applyProviderEmit(this.emitCtx, providerId, slot, { status: 'loading' });
        this.requestProviderWorker(providerId, asker);
        return deferred.handle;
      }
      slot.dataPlane = 'hub';
      // eslint-disable-next-line no-console
      console.warn(`[hub] provider '${providerId}' asked for dataPlane 'subworker' but no window is attached to supply a sub-worker — running its transport on the hub thread`);
    }
    return startProvider(cfg, emit, {
      appDataLookup: (name, key) => this.appDataSvc.get(name, key),
    });
  }

  /** Any window port currently subscribed (data or stats) to a provider. */
  private anyListenerPort(providerId: string): PortLike | undefined {
    for (const l of this.subscribers.dataListeners(providerId)?.values() ?? []) return l.port;
    for (const l of this.subscribers.statsListeners(providerId)?.values() ?? []) return l.port;
    return undefined;
  }

  /**
   * Tear down a running provider's upstream connection and rebuild the
   * slot from a (possibly changed) cfg, keeping the provider id and all
   * existing data / stats listeners intact. Used when the editor's
   * Restart button reconnects after the connection / column / behaviour
   * settings were edited: the running slot was created with the old cfg,
   * so a plain `restart()` would reconnect with stale values.
   */
  private recreateProvider(providerId: string, cfg: ProviderConfig, requester?: PortLike): ProviderSlot {
    const old = this.providers.get(providerId);
    this.cancelPendingProviderPort(providerId);
    // Drop the old slot from the registry first. The emit guard keys on
    // the currently-registered slot, so any in-flight frames from the
    // old connection are ignored the moment it stops being that slot.
    this.providers.delete(providerId);
    if (old) void old.handle.stop();
    // createProvider registers the fresh slot before starting it, so its
    // synchronous `loading` emission reaches every existing listener.
    const fresh = this.createProvider(providerId, cfg, requester);
    this.ensureStatsSampler();
    return fresh;
  }

  // ─── Listener attach + fan-out ─────────────────────────────────

  private attachDataListener(
    providerId: string,
    subId: string,
    port: PortLike,
    slot: ProviderSlot,
    opts?: { skipCacheReplay?: boolean },
  ): void {
    this.subscribers.attach(providerId, subId, port, 'data');
    this.ensureSubscriberSweeper();
    this.syncRemoteListenerCount(providerId);

    // Thin-delta subscriptions need the provider's keyColumn so the
    // client can mirror full rows under the same composed key the hub
    // patches against. Posted BEFORE any replay frame.
    if (slot.thinDeltas) {
      port.postMessage({
        subId,
        kind: 'sub-init',
        keyColumn: (slot.cfg as { keyColumn?: string | readonly string[] }).keyColumn,
      } satisfies Event);
    }

    if (opts?.skipCacheReplay) {
      // Restart attach must not replay the hub cache — stale rows +
      // `ready` would settle the client's snapshot promise before the
      // upstream restart completes, leaving reload overlays stuck.
      port.postMessage({ subId, kind: 'status', status: 'loading' } satisfies Event);
      return;
    }

    if (slot.remoteControl) this.replayRemoteToPort(subId, port, slot, providerId, 'attach');
    else this.replayCacheToPort(subId, port, slot, 'attach');
  }

  /**
   * Chunked cache replay to a single port (late-join attach or
   * refresh-provider).
   *
   * Ships pre-encoded `delta-bin` chunks (see {@link DeltaBinEvent}):
   * the replay cache re-encodes only the buckets dirtied since the
   * last replay and posts the SAME byte buffers to every replaying
   * port. Cloning a Uint8Array across the port is a flat memcpy — no
   * per-row object graph walk per subscriber, which is what made
   * simultaneous multi-window attaches GC-storm the worker.
   */
  private replayCacheToPort(
    subId: string,
    port: PortLike,
    slot: ProviderSlot,
    mode: 'attach' | 'refresh',
  ): void {
    // eslint-disable-next-line no-console
    if (DEBUG) console.log(
      `[v2/hub] → subId=${subId}: replay rows=${slot.cache.size} in ${
        Math.max(1, Math.ceil(slot.cache.size / LATE_JOIN_CHUNK_SIZE))
      } chunk(s), status=${slot.status}`,
    );
    port.postMessage({ subId, kind: 'status', status: 'loading' } satisfies Event);
    if (slot.cache.size === 0) {
      port.postMessage({ subId, kind: 'delta', rows: [], replace: true } satisfies Event);
      this.recordPublish(slot, 1);
    } else {
      const chunks = ensureReplayChunks(slot.replay, slot.cache, slot.columnar);
      for (let i = 0; i < chunks.length; i++) {
        port.postMessage({
          subId,
          kind: 'delta-bin',
          buf: chunks[i].buf,
          enc: chunks[i].enc,
          replace: i === 0,
        } satisfies Event);
        this.recordPublish(slot, 1);
      }
    }
    // Refresh always ends with `ready` so the busy overlay clears. Attach
    // replay on an empty cache must NOT settle the client snapshot — the
    // upstream provider still owes rows + ready.
    const emitReady = mode === 'refresh' || slot.cache.size > 0;
    if (emitReady) {
      port.postMessage({
        subId,
        kind: 'status',
        // Replay succeeded — surface `ready` so the grid clears any stale
        // banner even if the upstream transport is still recovering.
        status: 'ready',
        error: undefined,
      } satisfies Event);
    }
  }

  private attachStatsListener(providerId: string, subId: string, port: PortLike): void {
    this.subscribers.attach(providerId, subId, port, 'stats');
    this.ensureSubscriberSweeper();

    // Send one stats snapshot immediately so the consumer doesn't
    // have to wait for the first sampler tick.
    const slot = this.providers.get(providerId);
    if (slot) {
      port.postMessage({
        subId,
        kind: 'stats',
        stats: snapshotProviderStats(slot, this.subscribers.dataCount(providerId)),
      } satisfies Event);
    }

    this.ensureStatsSampler();
  }

  /**
   * Post one data event to a single listener. Returns false when the port
   * is dead (caller should prune). Uses a shallow copy with the
   * listener's `subId` so each `postMessage` owns its envelope — reusing
   * one object across the fan-out loop is unsafe when structured-clone
   * is deferred (observed under OpenFin multi-window).
   */
  private postDataEvent(l: { subId: string; port: PortLike }, event: Event): boolean {
    try {
      l.port.postMessage({ ...event, subId: l.subId });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Drop listeners whose port threw on `postMessage` (closed window
   * without `detach`, dev HMR, etc.). Without pruning, one zombie port
   * blocks delivery to listeners that appear later in the loop.
   */
  private pruneDeadDataListeners(providerId: string, deadSubIds: readonly string[]): void {
    if (deadSubIds.length === 0) return;
    this.subscribers.pruneDead(providerId, 'data', deadSubIds);
    this.maybeStopProviderIfIdle(providerId);
  }

  private pruneDeadStatsListeners(providerId: string, deadSubIds: readonly string[]): void {
    if (deadSubIds.length === 0) return;
    if (this.subscribers.pruneDead(providerId, 'stats', deadSubIds)) {
      this.maybeStopStatsSampler();
    }
    this.maybeStopProviderIfIdle(providerId);
  }

  private broadcastData(providerId: string, slot: ProviderSlot, eventTemplate: Event): void {
    const listeners = this.subscribers.dataListeners(providerId);
    if (!listeners) return;
    const countPublish =
      slot.snapshotReady
      && (
        eventTemplate.kind === 'delta'
        || eventTemplate.kind === 'delta-bin'
        || eventTemplate.kind === 'delta-patch'
      );
    if (DEBUG) {
      // eslint-disable-next-line no-console
      if (eventTemplate.kind === 'delta') {
        const tpl = eventTemplate as Event & { kind: 'delta'; rows: readonly unknown[]; replace?: boolean };
        console.log(`[v2/hub] broadcast provider=${providerId} kind=delta replace=${Boolean(tpl.replace)} rows=${tpl.rows.length} → ${listeners.size} listener(s)`);
      } else if (eventTemplate.kind === 'status') {
        const tpl = eventTemplate as Event & { kind: 'status'; status: string; error?: string };
        console.log(`[v2/hub] broadcast provider=${providerId} kind=status status=${tpl.status}${tpl.error ? ' error=' + JSON.stringify(tpl.error) : ''} → ${listeners.size} listener(s)`);
      }
    }
    const dead: string[] = [];
    let live = 0;
    for (const l of listeners.values()) {
      // Held back until its sub-worker replay run lands (gap-free join).
      if (this.pendingReplaySubIds.has(l.subId)) continue;
      if (!this.postDataEvent(l, eventTemplate)) {
        dead.push(l.subId);
        continue;
      }
      live += 1;
    }
    this.pruneDeadDataListeners(providerId, dead);
    if (countPublish && live > 0) this.recordPublish(slot, live);
  }

  /** Count one fan-out delta post to a data subscriber (post-snapshot only). */
  private recordPublish(slot: ProviderSlot, count: number): void {
    if (!slot.snapshotReady) return;
    slot.publishCount += count;
    slot.pubsByBucket[slot.bucketIdx] += count;
    slot.pubsByMinBucket[slot.minBucketIdx] += count;
  }

  // ─── Stats sampler ─────────────────────────────────────────────

  private ensureStatsSampler(): void {
    if (this.statsTimer !== null) return;
    this.statsTimer = this.setTimer(() => this.tickStats(), this.statsIntervalMs);
  }

  private maybeStopStatsSampler(): void {
    // Keep rotating sliding-window buckets while any provider is running,
    // even with no stats listeners — otherwise publish/min buckets stall
    // and accumulate unbounded counts in a single slot.
    if (this.providers.size === 0 && this.statsTimer !== null) {
      this.clearTimer(this.statsTimer);
      this.statsTimer = null;
    }
  }

  private flushStatsToListeners(providerId: string): void {
    const listeners = this.subscribers.statsListeners(providerId);
    const slot = this.providers.get(providerId);
    if (!listeners || !slot) return;
    const stats = snapshotProviderStats(slot, this.subscribers.dataCount(providerId));
    this.postStatsToListeners(providerId, listeners, stats);
  }

  private postStatsToListeners(
    providerId: string,
    listeners: Map<string, StatsListener>,
    stats: ProviderStats,
  ): void {
    const dead: string[] = [];
    for (const l of listeners.values()) {
      try {
        l.port.postMessage({ subId: l.subId, kind: 'stats', stats } satisfies Event);
      } catch {
        dead.push(l.subId);
      }
    }
    this.pruneDeadStatsListeners(providerId, dead);
  }

  private tickStats(): void {
    // Rotate sliding-window buckets first: the slot we're about to
    // overwrite holds the oldest second of activity.
    for (const slot of this.providers.values()) {
      rotateStatsBuckets(slot);
    }

    for (const providerId of [...this.subscribers.statsProviderIds()]) {
      const slot = this.providers.get(providerId);
      const listeners = this.subscribers.statsListeners(providerId);
      if (!slot || !listeners) continue;
      const stats = snapshotProviderStats(slot, this.subscribers.dataCount(providerId));
      this.postStatsToListeners(providerId, listeners, stats);
    }
  }
}
