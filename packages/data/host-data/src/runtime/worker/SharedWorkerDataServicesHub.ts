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
  SsrmRequest,
  SsrmRpcEvent,
  SsrmTickEvent,
} from '../protocol.js';
import { startProvider } from '../providers/registry.js';
import type { ProviderEmit, ProviderEmitEvent, ProviderHandle } from '../providers/Provider.js';
import { isSsrmProviderType, SsrmPlane } from '../ssrm/index.js';
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
  /** SSRM query planes for `stomp-ssrm` providers (keyed by providerId). */
  private readonly ssrmPlanes = new Map<
    string,
    { plane: SsrmPlane; offTick: () => void }
  >();
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

  constructor(opts: SharedWorkerDataServicesHubOpts = {}) {
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

  handleRequest(port: PortLike, req: Request): void {
    this.trackPort(port);
    switch (req.kind) {
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
      case 'ssrm-get-rows':
      case 'ssrm-set-viewport':
      case 'ssrm-configure-expressions':
      case 'ssrm-status-bar':
      case 'ssrm-set-filter-values':
        this.handleSsrmRequest(port, req);
        return;
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
    for (const [, slot] of this.providers) await slot.handle.stop();
    this.providers.clear();
    for (const [, entry] of this.ssrmPlanes) entry.offTick();
    this.ssrmPlanes.clear();
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
        slot = this.createProvider(req.providerId, cfg);
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
        slot = this.recreateProvider(req.providerId, req.cfg);
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

    if (req.mode === 'data') {
      this.attachDataListener(req.providerId, req.subId, port, slot, {
        skipCacheReplay: isRestartAttach,
      });
    } else {
      this.attachStatsListener(req.providerId, req.subId, port);
    }
  }

  private handleDetach(req: DetachRequest): void {
    const removed = this.subscribers.remove(req.subId);
    if (removed.statsEmptied) this.maybeStopStatsSampler();
    if (removed.providerId) this.maybeStopProviderIfIdle(removed.providerId);
  }

  private maybeStopProviderIfIdle(providerId: string): void {
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
    this.replayCacheToPort(req.subId, listener.port, slot, 'refresh');
  }

  private disposeSsrmPlane(providerId: string): void {
    const entry = this.ssrmPlanes.get(providerId);
    if (!entry) return;
    entry.offTick();
    this.ssrmPlanes.delete(providerId);
  }

  private ensureSsrmPlane(providerId: string, cfg: ProviderConfig): SsrmPlane | null {
    if (!isSsrmProviderType(cfg.providerType)) return null;
    const existing = this.ssrmPlanes.get(providerId);
    if (existing) return existing.plane;
    const plane = new SsrmPlane(cfg);
    const offTick = plane.onTick((event) => {
      this.fanSsrmTick(providerId, plane, event);
    });
    this.ssrmPlanes.set(providerId, { plane, offTick });
    return plane;
  }

  private syncSsrmFromEmit(
    providerId: string,
    slot: ProviderSlot,
    event: ProviderEmitEvent,
  ): void {
    if (!('rows' in event)) return;
    const plane =
      this.ssrmPlanes.get(providerId)?.plane ??
      this.ensureSsrmPlane(providerId, slot.cfg);
    if (!plane) return;
    if (event.replace) {
      plane.syncFromCache(slot.cache);
    } else {
      plane.upsertRows(event.rows);
    }
  }

  private fanSsrmTick(
    providerId: string,
    plane: SsrmPlane,
    event: import('../ssrm/types.js').TickEvent,
  ): void {
    const listeners = this.subscribers.dataListeners(providerId);
    if (!listeners?.size) return;
    for (const [subId, listener] of listeners) {
      const interestedKeys = plane.interestedKeys(subId, event.keys);
      let rows = event.rows;
      if (event.type === 'rows' && rows?.length && interestedKeys.length) {
        const want = new Set(interestedKeys);
        const keyCol = plane.keyColumn;
        rows = plane.enrichRows(
          rows.filter((r) => want.has(String(r[keyCol] ?? ''))),
        );
      } else if (event.type === 'rows' && rows?.length) {
        rows = plane.enrichRows(rows);
      }
      const msg: SsrmTickEvent = {
        kind: 'ssrm-tick',
        subId,
        providerId,
        event: { ...event, rows },
        interestedKeys,
      };
      try {
        listener.port.postMessage(msg);
      } catch {
        /* port dead */
      }
    }
  }

  private handleSsrmRequest(port: PortLike, req: SsrmRequest): void {
    const reply = (event: SsrmRpcEvent): void => {
      try {
        port.postMessage(event);
      } catch {
        /* port dead */
      }
    };

    if (req.kind === 'ssrm-set-viewport') {
      const plane = this.ssrmPlanes.get(req.providerId)?.plane;
      plane?.setViewportInterest(req.sessionId, req.keys);
      return;
    }

    const reqId = 'reqId' in req ? req.reqId : '';
    try {
      let slot = this.providers.get(req.providerId);
      const cfg =
        slot?.cfg ??
        this.configCatalog?.getProviderConfig(req.providerId) ??
        undefined;
      if (!cfg || !isSsrmProviderType(cfg.providerType)) {
        reply({
          kind: 'ssrm-rpc',
          reqId,
          ok: false,
          error: `No SSRM plane for provider '${req.providerId}'`,
        });
        return;
      }
      const plane =
        this.ssrmPlanes.get(req.providerId)?.plane ??
        this.ensureSsrmPlane(req.providerId, cfg);
      if (!plane) {
        reply({
          kind: 'ssrm-rpc',
          reqId,
          ok: false,
          error: `Failed to create SSRM plane for '${req.providerId}'`,
        });
        return;
      }
      // Late RPC before first emit — seed from hub cache if present.
      if (slot && slot.cache.size > 0 && plane.getStats().rowCount === 0) {
        plane.syncFromCache(slot.cache);
      }

      if (req.kind === 'ssrm-get-rows') {
        const getRows = plane.getRows(req.request);
        reply({ kind: 'ssrm-rpc', reqId, ok: true, getRows });
        return;
      }
      if (req.kind === 'ssrm-configure-expressions') {
        plane.configureExpressions(req.rules);
        reply({ kind: 'ssrm-rpc', reqId, ok: true });
        return;
      }
      if (req.kind === 'ssrm-status-bar') {
        const statusBar = plane.getStatusBar(req.request);
        reply({ kind: 'ssrm-rpc', reqId, ok: true, statusBar });
        return;
      }
      if (req.kind === 'ssrm-set-filter-values') {
        const setFilterValues = plane.getSetFilterValues(req.request);
        reply({ kind: 'ssrm-rpc', reqId, ok: true, setFilterValues });
      }
    } catch (err) {
      reply({
        kind: 'ssrm-rpc',
        reqId,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async stopProvider(providerId: string): Promise<void> {
    const slot = this.providers.get(providerId);
    if (!slot) return;

    // Drop from the registry first so late STOMP frames cannot fan-out
    // while deactivate() is still in flight.
    this.providers.delete(providerId);
    this.disposeSsrmPlane(providerId);

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

  private createProvider(providerId: string, cfg: ProviderConfig): ProviderSlot {
    const now = Date.now();
    const flags = cfg as {
      keyColumn?: string | readonly string[];
      thinDeltas?: boolean;
      wireFormat?: string;
    };
    const slot: ProviderSlot = {
      handle: undefined as unknown as ProviderHandle, // set immediately below
      cfg,
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
      this.syncSsrmFromEmit(providerId, slot, event);
    };

    // Register BEFORE starting the provider: transports emit
    // `status: loading` synchronously inside the factory call, and
    // the emit guard drops events from unregistered slots. Registered
    // after-the-fact, that first loading vanished — peer windows never
    // learned a restart had begun (the old `restart()` path masked
    // this by re-emitting loading post-registration; the adopt-in-
    // flight restart path doesn't).
    this.providers.set(providerId, slot);
    // Attach SSRM plane early so getRows can land during snapshot load.
    this.ensureSsrmPlane(providerId, cfg);
    try {
      slot.handle = startProvider(cfg, emit, {
        appDataLookup: (name, key) => this.appDataSvc.get(name, key),
      });
    } catch (err) {
      this.providers.delete(providerId);
      throw err;
    }
    return slot;
  }

  /**
   * Tear down a running provider's upstream connection and rebuild the
   * slot from a (possibly changed) cfg, keeping the provider id and all
   * existing data / stats listeners intact. Used when the editor's
   * Restart button reconnects after the connection / column / behaviour
   * settings were edited: the running slot was created with the old cfg,
   * so a plain `restart()` would reconnect with stale values.
   */
  private recreateProvider(providerId: string, cfg: ProviderConfig): ProviderSlot {
    const old = this.providers.get(providerId);
    // Drop the old slot from the registry first. The emit guard keys on
    // the currently-registered slot, so any in-flight frames from the
    // old connection are ignored the moment it stops being that slot.
    this.providers.delete(providerId);
    this.disposeSsrmPlane(providerId);
    if (old) void old.handle.stop();
    // createProvider registers the fresh slot before starting it, so its
    // synchronous `loading` emission reaches every existing listener.
    const fresh = this.createProvider(providerId, cfg);
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

    this.replayCacheToPort(subId, port, slot, 'attach');
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
