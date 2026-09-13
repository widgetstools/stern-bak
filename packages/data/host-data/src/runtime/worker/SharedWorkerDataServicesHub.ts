/**
 * SharedWorkerDataServicesHub — the DATA-PLANE brain of the data-services
 * SharedWorker: fans incoming requests to provider factories and outgoing
 * events to subscriber ports.
 *
 * Providers lazy-create on first `attach` (later attaches reuse the
 * running instance), auto-stop when the last data + stats subscriber
 * leaves, and evict stale subscribers on missed heartbeats. The
 * per-provider cache (`Map<rowKey, row>` by `cfg.keyColumn`) IS the
 * snapshot — late joiners replay it on attach. `attach.extra`
 * triggers `provider.restart(extra)` (historical date picker /
 * refresh button paths).
 *
 * Since the worker split (plan W1c) this hub serves NO config catalog and
 * NO AppData: those RPCs live in {@link PlatformServicesHost} on the
 * platform-services worker, whose event loop never carries ingest. The
 * one config/AppData coupling left here is {@link ProviderLifecycleReads}
 * — an on-demand IndexedDB read at provider lifecycle moments (create /
 * restart / reconfigure) that resolves the provider cfg and the
 * `{{name.key}}` tokens in it.
 *
 * The subsystems live in sibling modules; this class is orchestration:
 *   - {@link SubscriberRegistry} — listener membership, subId index
 *   - {@link ProviderLifecycleReads} — cfg + AppData reads at lifecycle moments
 *   - {@link HubSsrmRpc} — SSRM block RPCs, engine sessions, the tick loop
 *   - {@link HubStatsSampler} — the 1 Hz diagnostics sampler
 *   - {@link ReplayScheduler} — round-robin late-join replay fan-out
 *   - `providerEmit.ts` — upstream event application + encode
 *   - `replayCache.ts` — bucketed late-join replay encoding
 *   - `hubIntrospect.ts` / `hubStats.ts` — diagnostics snapshots
 */

import type { ProviderConfig, StompProviderConfig } from '@wellsfargo-starui/types';
import type {
  AttachRequest,
  DetachRequest,
  Event,
  Request,
  StopRequest,
  RefreshProviderRequest,
  HubIntrospectSnapshot,
} from '../protocol.js';
import { startProvider } from '../providers/registry.js';
import type { ProviderEmit, ProviderEmitEvent, ProviderHandle } from '../providers/Provider.js';
import {
  traceStompProviderCfg,
  traceWorkerAppDataSnapshot,
} from '../template/templateTrace.js';
import {
  SEC_WINDOW,
  MIN_WINDOW,
  type PortLike,
  type ProviderSlot,
  type SharedWorkerDataServicesHubOpts,
  SUBSCRIBER_SWEEP_INTERVAL_MS,
} from './hubTypes.js';
import { restartClickLatency, restartExtrasEqual } from './hubHelpers.js';
import { newReplayCache } from './replayCache.js';
import { ReplayScheduler } from './ReplayScheduler.js';
import { yieldToMacrotask } from './yieldToMacrotask.js';
import { snapshotProviderStats } from './hubStats.js';
import { applyProviderEmit, type ProviderEmitContext } from './providerEmit.js';
import { buildIntrospectSnapshot } from './hubIntrospect.js';
import {
  handleHubIntrospect,
  handleProviderRunning,
  type IntrospectRpcContext,
} from './hubCatalogRpc.js';
import { HubSsrmRpc } from './HubSsrmRpc.js';
import { HubStatsSampler } from './HubStatsSampler.js';
import { ProviderLifecycleReads } from './ProviderLifecycleReads.js';
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
  private readonly subscribers = new SubscriberRegistry();
  private readonly lifecycle: ProviderLifecycleReads;
  private readonly connectedPorts = new Set<PortLike>();
  /**
   * Attaches whose lifecycle read (cfg / AppData from IndexedDB) is still in
   * flight, by subId → port. A detach, port close or dispose that lands
   * meanwhile removes the entry, and the read's continuation then drops
   * the attach instead of registering a listener nobody owns.
   */
  private readonly pendingAttaches = new Map<string, PortLike>();

  private readonly setTimer: (cb: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private subscriberSweepTimer: unknown = null;

  private readonly emitCtx: ProviderEmitContext;
  private readonly introspectCtx: IntrospectRpcContext;
  private readonly ssrm: HubSsrmRpc;
  private readonly stats: HubStatsSampler;
  private readonly replay: ReplayScheduler;

  constructor(opts: SharedWorkerDataServicesHubOpts = {}) {
    this.setTimer = opts.setTimer ?? ((cb, ms) => setInterval(cb, ms));
    this.clearTimer = opts.clearTimer ?? ((h) => clearInterval(h as ReturnType<typeof setInterval>));
    this.lifecycle = new ProviderLifecycleReads(opts.configManager);

    this.replay = new ReplayScheduler(
      {
        isCurrentSlot: (providerId, slot) => this.providers.get(providerId) === slot,
        isHidden: (subId) => Boolean(this.subscribers.listenerOf(subId)?.hidden),
        post: (job, event) => this.postDataEvent(job, event),
        recordPublish: (slot, count) => this.recordPublish(slot, count),
        yieldThen: opts.yieldToMacrotask ?? yieldToMacrotask,
        now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
      },
      opts.replayPassBudgetMs,
    );

    this.stats = new HubStatsSampler(
      {
        providers: this.providers,
        subscribers: this.subscribers,
        setTimer: this.setTimer,
        clearTimer: this.clearTimer,
        pruneDeadStatsListeners: (providerId, dead) => this.pruneDeadStatsListeners(providerId, dead),
      },
      opts.statsIntervalMs ?? 1000,
    );
    this.ssrm = new HubSsrmRpc(
      {
        providers: this.providers,
        subscribers: this.subscribers,
        setTimer: this.setTimer,
        clearTimer: this.clearTimer,
        pruneDeadDataListeners: (providerId, dead) => this.pruneDeadDataListeners(providerId, dead),
      },
      opts.createRustHub,
    );
    this.emitCtx = {
      dataListenerCount: (providerId) => this.subscribers.dataCount(providerId),
      broadcast: (providerId, slot, eventTemplate) =>
        this.broadcastData(providerId, slot, eventTemplate),
      flushStats: (providerId) => this.stats.flush(providerId),
      ingestSsrm: (providerId, rows, replace) => this.ssrm.ingest(providerId, rows, replace),
      warmSsrm: (providerId) => this.ssrm.warmSessions(providerId),
    };
    this.introspectCtx = {
      buildIntrospect: () => this.buildIntrospectSnapshot(),
      isProviderRunning: (providerId) => this.providers.has(providerId),
    };
  }

  // ─── Public surface ────────────────────────────────────────────

  handleRequest(port: PortLike, req: Request): void {
    this.connectedPorts.add(port);
    switch (req.kind) {
      case 'attach':  this.handleAttach(port, req); return;
      case 'detach':  this.handleDetach(req); return;
      // Clean window close: postMessage to a dead port never throws and
      // messageerror never fires, so this explicit goodbye is the ONLY
      // way connectedPorts gets released.
      case 'port-close': this.onPortClosed(port); return;
      case 'ping':    this.subscribers.ping(req.subId, req.meta); return;
      case 'stop':    this.handleStop(req); return;
      case 'refresh-provider': this.handleRefreshProvider(req); return;
      case 'hub-introspect': handleHubIntrospect(this.introspectCtx, port, req); return;
      case 'provider-running': handleProviderRunning(this.introspectCtx, port, req); return;
      default:
        // Config catalog + AppData RPCs no longer live here (worker-split
        // W1c) — the platform-services worker answers them and nothing
        // routes them to this port. Anything else is an SSRM RPC.
        this.ssrm.handleRequest(port, req);
    }
  }

  /** Live hub diagnostics for operator / dev tooling. */
  buildIntrospectSnapshot(): HubIntrospectSnapshot {
    return buildIntrospectSnapshot({
      providers: this.providers,
      subscribers: this.subscribers,
      configCatalog: null,
      connectedPortCount: this.connectedPorts.size,
      appDataListenerCount: 0,
      appDataRows: this.lifecycle.snapshotRows(),
      fanout: this.replay.snapshotStats(),
      ssrm: this.ssrm.snapshotStats(),
    });
  }

  /** Drop every subscription owned by this port. Called on disconnect. */
  onPortClosed(port: PortLike): void {
    try {
      port.dispose?.();
    } catch {
      /* port already torn down */
    }
    this.connectedPorts.delete(port);
    for (const [subId, owner] of this.pendingAttaches) {
      if (owner === port) this.pendingAttaches.delete(subId);
    }
    const { idleCandidates, subIds, statsEmptied } = this.subscribers.removeByPort(port);
    for (const subId of subIds) this.replay.cancel(subId);
    if (statsEmptied) this.stats.maybeStop();
    // A reload closes the port without ever sending `detach`, and the worker
    // outlives the page. Without this the dead page's engine session and its
    // open views stay live, and every reload leaves another generation of
    // them for the engine to maintain on every tick.
    for (const subId of subIds) this.ssrm.detachSession(subId);
    for (const providerId of idleCandidates) {
      this.maybeStopProviderIfIdle(providerId);
    }
    this.ssrm.maybeStopTicker();
  }

  /** Stop every provider + cancel sampler. For shutdown only. */
  async dispose(): Promise<void> {
    this.pendingAttaches.clear();
    for (const [, slot] of this.providers) await slot.handle.stop();
    this.providers.clear();
    this.subscribers.clear();
    this.connectedPorts.clear();
    if (this.subscriberSweepTimer !== null) {
      this.clearTimer(this.subscriberSweepTimer);
      this.subscriberSweepTimer = null;
    }
    this.stats.maybeStop();
  }

  // ─── Attach: lifecycle reads, then create / restart / late-join ──

  private handleAttach(port: PortLike, req: AttachRequest): void {
    const slot = this.providers.get(req.providerId);
    if (slot && !isLifecycleMoment(slot, req)) {
      // Late joiner — nothing to read; attach synchronously.
      this.attachListener(port, req, slot, false);
      return;
    }
    if (!this.lifecycle.hasStore) {
      // No persistence behind this hub (tests, bespoke installs): there is
      // nothing to read, so create / restart stay synchronous.
      this.attachAfterLifecycleRead(port, req, null);
      return;
    }
    // A lifecycle moment with a store behind us: resolve the provider row
    // (cfg-free attach) and refresh the AppData snapshot from IndexedDB
    // FIRST, so the provider starts against current rows — the data hub
    // receives no catalog invalidations any more (worker-split W1c).
    this.pendingAttaches.set(req.subId, port);
    void this.lifecycle.prepare(!slot && !req.cfg ? req.providerId : null).then(
      (catalogCfg) => {
        if (!this.pendingAttaches.delete(req.subId)) return;
        this.attachAfterLifecycleRead(port, req, catalogCfg);
      },
      (err: unknown) => {
        if (!this.pendingAttaches.delete(req.subId)) return;
        this.postAttachError(port, req.subId, err instanceof Error ? err.message : String(err));
      },
    );
  }

  private attachAfterLifecycleRead(
    port: PortLike,
    req: AttachRequest,
    catalogCfg: ProviderConfig | null,
  ): void {
    let slot = this.providers.get(req.providerId);
    let isRestartAttach = false;
    if (!slot) {
      const created = this.createForAttach(port, req, req.cfg ?? catalogCfg ?? undefined);
      if (!created) return;
      slot = created;
    } else if (req.extra) {
      ({ slot, isRestartAttach } = this.restartForAttach(req, slot));
    }
    this.attachListener(port, req, slot, isRestartAttach);
  }

  /** First attach for a provider id: build the slot (and apply a first-attach `extra`). */
  private createForAttach(
    port: PortLike,
    req: AttachRequest,
    cfg: ProviderConfig | undefined,
  ): ProviderSlot | null {
    if (!cfg) {
      // eslint-disable-next-line no-console
      if (DEBUG) console.log(`[v2/hub] attach REJECTED subId=${req.subId} provider=${req.providerId}: not running and no cfg`);
      this.postAttachError(
        port,
        req.subId,
        `Provider '${req.providerId}' not in catalog and no cfg supplied to start it.`,
      );
      return null;
    }
    this.traceStompAttachCfg('hub.attach CREATE (catalog cfg → worker)', req.providerId, cfg, req.extra);
    // eslint-disable-next-line no-console
    if (DEBUG) console.log(`[v2/hub] attach CREATE subId=${req.subId} provider=${req.providerId}`);
    let slot: ProviderSlot;
    try {
      slot = this.createProvider(req.providerId, cfg);
    } catch (err) {
      this.postAttachError(port, req.subId, err instanceof Error ? err.message : String(err));
      return null;
    }
    // createProvider registered the slot (pre-start, so synchronous
    // emissions broadcast).
    this.stats.ensure();
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
    return slot;
  }

  /**
   * Running provider + restart payload. When the caller supplies a cfg
   * (the provider editor's Restart button always sends the current
   * draft), the connection / column / behaviour settings may have been
   * edited since the slot was created — the running provider captured
   * the OLD cfg, so a plain restart() would reconnect with stale values.
   * Rebuild the slot from the new cfg first. Normal grid subscribers omit
   * cfg and just get a plain restart(extra) (e.g. the historical
   * `asOfDate` overlay), which keeps the existing config.
   */
  private restartForAttach(
    req: AttachRequest,
    slot: ProviderSlot,
  ): { slot: ProviderSlot; isRestartAttach: boolean } {
    const extra = req.extra!;
    if (req.cfg) {
      this.traceStompAttachCfg('hub.attach RESTART+RECONFIG (running provider)', req.providerId, req.cfg, extra);
      // eslint-disable-next-line no-console
      console.log(`[v2/hub][trace] attach RESTART+RECONFIG provider=${req.providerId} extra=${JSON.stringify(extra)} ${restartClickLatency(extra)}`);
      const fresh = this.recreateProvider(req.providerId, req.cfg);
      void fresh.handle.restart(extra);
      fresh.activeRestartExtra = extra;
      return { slot: fresh, isRestartAttach: true };
    }
    if (!restartExtrasEqual(slot.activeRestartExtra, extra)) {
      this.traceStompAttachCfg('hub.attach RESTART (running provider)', req.providerId, slot.cfg, extra);
      // eslint-disable-next-line no-console
      console.log(`[v2/hub][trace] attach RESTART provider=${req.providerId} extra=${JSON.stringify(extra)} ${restartClickLatency(extra)}`);
      void slot.handle.restart(extra);
      slot.activeRestartExtra = extra;
      return { slot, isRestartAttach: true };
    }
    // eslint-disable-next-line no-console
    if (DEBUG) console.log(`[v2/hub] attach LATE-JOINER (same extra) subId=${req.subId} provider=${req.providerId} cacheSize=${slot.cache.size} status=${slot.status}`);
    return { slot, isRestartAttach: false };
  }

  private attachListener(
    port: PortLike,
    req: AttachRequest,
    slot: ProviderSlot,
    isRestartAttach: boolean,
  ): void {
    if (req.mode === 'ssrm') {
      this.attachSsrmListener(req.providerId, req.subId, port, slot);
    } else if (req.mode === 'data') {
      this.attachDataListener(req.providerId, req.subId, port, slot, {
        skipCacheReplay: isRestartAttach,
      });
    } else {
      this.attachStatsListener(req.providerId, req.subId, port);
    }
  }

  private postAttachError(port: PortLike, subId: string, error: string): void {
    try {
      port.postMessage({ subId, kind: 'status', status: 'error', error } satisfies Event);
    } catch {
      /* port already dead */
    }
  }

  // ─── Detach / stop / refresh ───────────────────────────────────

  private handleDetach(req: DetachRequest): void {
    this.pendingAttaches.delete(req.subId);
    this.replay.cancel(req.subId);
    this.ssrm.detachSession(req.subId);
    const removed = this.subscribers.remove(req.subId);
    if (removed.statsEmptied) this.stats.maybeStop();
    if (removed.providerId) this.maybeStopProviderIfIdle(removed.providerId);
    this.ssrm.maybeStopTicker();
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
    if (removed.statsEmptied) this.stats.maybeStop();
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

  private async stopProvider(providerId: string): Promise<void> {
    const slot = this.providers.get(providerId);
    if (!slot) return;

    // Drop from the registry first so late STOMP frames cannot fan-out
    // while deactivate() is still in flight.
    this.providers.delete(providerId);
    this.replay.cancelProvider(providerId);

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
    this.stats.emitStopped(providerId);
    this.stats.maybeStop();

    const stopResult = slot.handle.stop();
    this.ssrm.dropProvider(providerId, slot.cfg);
    this.maybeStopSubscriberSweeper();
    if (stopResult instanceof Promise) await stopResult;
  }

  // ─── Provider lifecycle ────────────────────────────────────────

  private traceStompAttachCfg(
    phase: string,
    providerId: string,
    cfg: ProviderConfig | undefined,
    extra?: Record<string, unknown>,
  ): void {
    if (!cfg || (cfg.providerType !== 'stomp' && cfg.providerType !== 'stomp-ssrm')) return;
    traceWorkerAppDataSnapshot(
      `${phase} · worker AppData`,
      this.lifecycle.snapshotRows().map((r) => ({ name: r.name, values: r.values })),
    );
    traceStompProviderCfg(phase, cfg as StompProviderConfig, {
      providerId,
      extra,
      lookup: this.lifecycle.lookup,
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
      providerId,
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
      slot.handle = startProvider(cfg, emit, {
        appDataLookup: this.lifecycle.lookup,
      });
      this.ssrm.bootProvider(providerId, cfg);
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
    if (old) void old.handle.stop();
    // createProvider registers the fresh slot before starting it, so its
    // synchronous `loading` emission reaches every existing listener.
    const fresh = this.createProvider(providerId, cfg);
    this.stats.ensure();
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

  private attachSsrmListener(
    providerId: string,
    subId: string,
    port: PortLike,
    slot: ProviderSlot,
  ): void {
    this.subscribers.attach(providerId, subId, port, 'ssrm');
    this.ensureSubscriberSweeper();
    this.ssrm.attachSession(providerId, subId, slot);
    port.postMessage({ subId, kind: 'status', status: slot.status, error: slot.lastError } satisfies Event);
  }

  /**
   * Cache replay to a single port (late-join attach or refresh-provider):
   * `loading`, pre-encoded `delta-bin` chunks through the
   * {@link ReplayScheduler} (round-robin across every replaying port — W4;
   * same byte buffers to every port, a flat memcpy each), then `ready`.
   * An attach replay of an EMPTY cache must NOT settle the client snapshot
   * (upstream still owes rows + ready); a refresh always ends with `ready`.
   */
  private replayCacheToPort(
    subId: string,
    port: PortLike,
    slot: ProviderSlot,
    mode: 'attach' | 'refresh',
  ): void {
    // eslint-disable-next-line no-console
    if (DEBUG) console.log(`[v2/hub] → subId=${subId}: replay rows=${slot.cache.size}, status=${slot.status}`);
    port.postMessage({ subId, kind: 'status', status: 'loading' } satisfies Event);
    if (slot.cache.size > 0) {
      this.replay.enqueue({ providerId: slot.providerId, subId, port, slot, mode });
      return;
    }
    port.postMessage({ subId, kind: 'delta', rows: [], replace: true } satisfies Event);
    this.recordPublish(slot, 1);
    if (mode === 'refresh') {
      port.postMessage({ subId, kind: 'status', status: 'ready', error: undefined } satisfies Event);
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

    this.stats.ensure();
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
      this.stats.maybeStop();
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
      // A port still owing replay chunks must not see a live frame inside
      // its snapshot — hold it; the scheduler flushes after that port's
      // `ready` (W4).
      if (this.replay.isReplaying(l.subId)) {
        this.replay.defer(l.subId, eventTemplate);
        continue;
      }
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
}

/**
 * A running slot + an attach that must reconnect upstream: a new cfg (editor
 * reconnect) or a different `extra` overlay (historical date). Same overlay
 * = late joiner, no lifecycle read.
 */
function isLifecycleMoment(slot: ProviderSlot, req: AttachRequest): boolean {
  if (!req.extra) return false;
  return Boolean(req.cfg) || !restartExtrasEqual(slot.activeRestartExtra, req.extra);
}
