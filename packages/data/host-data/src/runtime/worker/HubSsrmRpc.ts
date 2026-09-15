/**
 * HubSsrmRpc — the SSRM slice of {@link SharedWorkerDataServicesHub}: block
 * RPC dispatch (`ssrm-get-rows` and friends), per-session engine
 * attach / detach, provider boot / drop on the WASM plane, and the tick
 * loop that drains group / view deltas to subscribers.
 *
 * Extracted from the hub as-is (worker-split W1c) so the orchestration
 * class stays under the file ceiling; the hub lends slot + subscriber
 * access through {@link SsrmRpcContext} and keeps ownership of both.
 */

import { composeRowId, isSsrmProviderType } from '@wellsfargo-starui/types';
import type { ProviderConfig, SsrmProviderConfig } from '@wellsfargo-starui/types';
import type {
  Request,
  SsrmApplyEditsWireRequest,
  SsrmColumnValuesWireRequest,
  SsrmGetRowsWireRequest,
  SsrmAggregatesWireRequest,
  SsrmRowCountWireRequest,
  SsrmRpcEvent,
  SsrmTickEvent,
  SsrmUnwatchPredicateWireRequest,
  SsrmWatchGroupsWireRequest,
  SsrmWatchPredicateWireRequest,
} from '../protocol.js';
import type { RustHubFactory } from '../ssrm/RustHubHost.js';
import { SsrmWasmPlane, publishWindowMsOf, type SsrmEngineStats } from '../ssrm/SsrmWasmPlane.js';
import type { SsrmGetRowsResult } from '../ssrm/ssrmTypes.js';
import { SsrmSessionWindows } from './SsrmSessionWindows.js';
import type { HubSsrmIntrospect, SsrmRpcTiming } from '../protocol.js';
import type { PortLike, ProviderSlot } from './hubTypes.js';
import { LatencyReservoir } from './latencyReservoir.js';
import type { SubscriberRegistry } from './SubscriberRegistry.js';

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const NO_KEYS: readonly (string | null)[] = [];

/** What the hub lends the SSRM slice. */
export interface SsrmRpcContext {
  providers: ReadonlyMap<string, ProviderSlot>;
  subscribers: SubscriberRegistry;
  setTimer(cb: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  /** Drop data listeners whose port threw during fan-out. */
  pruneDeadDataListeners(providerId: string, deadSubIds: readonly string[]): void;
}

export class HubSsrmRpc {
  private readonly plane: SsrmWasmPlane;
  private tickTimer: unknown = null;
  /** Loaded keys per session — ticks are trimmed to what each grid holds. */
  private readonly windows = new SsrmSessionWindows();
  // Hub-thread accounting (`hub-introspect.ssrm`): where the data worker's
  // thread goes when N grids share one provider.
  private readonly startedAt = now();
  private readonly getRowsQueue = new LatencyReservoir();
  private readonly getRowsEngine = new LatencyReservoir();
  private readonly otherQueue = new LatencyReservoir();
  private readonly otherEngine = new LatencyReservoir();
  private readonly tickFlushMs = new LatencyReservoir();
  private tickSessions = 0;
  private ticksPosted = 0;
  private upsertsPosted = 0;
  private upsertsWithheld = 0;
  private readonly ingestMs = new LatencyReservoir();

  constructor(
    private readonly ctx: SsrmRpcContext,
    createRustHub?: RustHubFactory,
  ) {
    this.plane = new SsrmWasmPlane(createRustHub);
  }

  /**
   * Engine-side counts for one provider, for the Diagnostics tab. Null when
   * the WASM hub has not booted or does not know this datasource — the caller
   * then reports the CSRM cache figures, which is correct for a CSRM slot.
   */
  engineStats(providerId: string): SsrmEngineStats | null {
    return this.plane.engineStats(providerId);
  }

  /** Dispatch an `ssrm-*` request. Returns false for any other kind. */
  handleRequest(port: PortLike, req: Request): boolean {
    if (req.kind.startsWith('ssrm-')) this.recordQueueWait(req as SsrmRpcTiming & { kind: string });
    switch (req.kind) {
      case 'ssrm-get-rows': void this.getRows(port, req); return true;
      case 'ssrm-column-values': void this.columnValues(port, req); return true;
      case 'ssrm-row-count': void this.rowCount(port, req); return true;
      case 'ssrm-aggregates': void this.aggregates(port, req); return true;
      case 'ssrm-watch-groups': void this.watchGroups(port, req); return true;
      case 'ssrm-watch-predicate': void this.watchPredicate(port, req); return true;
      case 'ssrm-unwatch-predicate': void this.unwatchPredicate(port, req); return true;
      case 'ssrm-apply-edits': void this.applyEdits(port, req); return true;
      default: return false;
    }
  }

  /** Flattened upstream rows → engine cache (no CSRM cache). */
  ingest(providerId: string, rows: readonly unknown[], replace: boolean): void {
    const t0 = now();
    void this.plane.ingest(providerId, rows, replace).then(
      () => this.ingestMs.record(now() - t0),
      () => this.ingestMs.record(now() - t0),
    );
  }

  /** Hub-thread accounting for `hub-introspect`. */
  snapshotStats(): HubSsrmIntrospect {
    return {
      windowSeconds: Math.round((now() - this.startedAt) / 1000),
      getRows: { queueMs: this.getRowsQueue.summary(), engineMs: this.getRowsEngine.summary() },
      otherRpc: { queueMs: this.otherQueue.summary(), engineMs: this.otherEngine.summary() },
      tickFlush: {
        ...this.tickFlushMs.summary(),
        sessions: this.tickSessions,
        ticksPosted: this.ticksPosted,
        upsertsPosted: this.upsertsPosted,
        upsertsWithheld: this.upsertsWithheld,
      },
      ingest: this.ingestMs.summary(),
    };
  }

  /** Queue wait: the client stamps `sentAt` (epoch ms); we are handling it now. */
  private recordQueueWait(req: SsrmRpcTiming & { kind: string }): void {
    if (typeof req.sentAt !== 'number') return;
    const wait = Math.max(0, Date.now() - req.sentAt);
    (req.kind === 'ssrm-get-rows' ? this.getRowsQueue : this.otherQueue).record(wait);
  }

  /** Boot the engine table for an SSRM provider (no-op for other types) and arm the ticker. */
  bootProvider(providerId: string, cfg: ProviderConfig): void {
    if (!isSsrmProviderType(cfg.providerType)) return;
    void this.plane.boot(providerId, cfg as SsrmProviderConfig);
    this.ensureTicker();
  }

  /**
   * Drop the engine's ingest retention pin with the provider — the table
   * then frees with its last session (T2 lifecycle).
   */
  dropProvider(providerId: string, cfg: ProviderConfig): void {
    if (isSsrmProviderType(cfg.providerType)) this.plane.dropTable(providerId);
    this.maybeStopTicker();
  }

  /** Engine session for one `ssrm`-mode subscriber; warms the root view when the snapshot already landed. */
  attachSession(providerId: string, subId: string, slot: ProviderSlot): void {
    void this.plane.attachSession(subId);
    if (!isSsrmProviderType(slot.cfg.providerType)) return;
    this.bootProvider(providerId, slot.cfg);
    // Late joiner on a snapshot that already landed: build its root view
    // now rather than on its first block read.
    if (slot.status === 'ready') {
      void this.plane.warmRootView(subId, providerId).catch(() => undefined);
    }
  }

  detachSession(subId: string): void {
    this.windows.drop(subId);
    void this.plane.detachSession(subId);
  }

  /** Build the root engine view for every attached session — snapshot just landed. */
  warmSessions(providerId: string): void {
    const listeners = this.ctx.subscribers.dataListeners(providerId);
    if (!listeners) return;
    for (const l of listeners.values()) {
      void this.plane.warmRootView(l.subId, providerId).catch(() => undefined);
    }
  }

  maybeStopTicker(): void {
    const providers = this.ctx.providers;
    const anySsrm = [...providers.values()].some((s) => isSsrmProviderType(s.cfg.providerType))
      && [...providers.keys()].some((id) => this.ctx.subscribers.dataCount(id) > 0);
    if (anySsrm || this.tickTimer === null) return;
    this.ctx.clearTimer(this.tickTimer);
    this.tickTimer = null;
  }

  // ─── Internals ─────────────────────────────────────────────────

  private ensureTicker(): void {
    if (this.tickTimer !== null) return;
    const windowMs = [...this.ctx.providers.values()].reduce((min, slot) => {
      if (!isSsrmProviderType(slot.cfg.providerType)) return min;
      return Math.min(min, publishWindowMsOf(slot.cfg as SsrmProviderConfig));
    }, 100);
    this.tickTimer = this.ctx.setTimer(() => this.flushTicks(), windowMs);
  }

  private flushTicks(): void {
    const t0 = now();
    let sessions = 0;
    let posted = 0;
    // One engine drain per flush: `tick()` returns every session's group
    // deltas at once, so polling per provider handed provider B's deltas to
    // whichever provider polled first.
    for (const [providerId, ticks] of this.plane.pollAllTicks()) {
      const slot = this.ctx.providers.get(providerId);
      if (!slot || !isSsrmProviderType(slot.cfg.providerType)) continue;
      if (ticks.length === 0) continue;
      const listeners = this.ctx.subscribers.dataListeners(providerId);
      if (!listeners) continue;
      const keyColumn = (slot.cfg as SsrmProviderConfig).keyColumn;
      const dead: string[] = [];
      for (const tick of ticks) {
        // Keyed once per tick, matched per session: the row delta is the whole
        // table's churn, and each grid holds only its loaded blocks of it.
        const upsertKeys = tick.kind === 'rowDelta' && tick.upserts
          ? tick.upserts.map((r) => composeRowId(r, keyColumn))
          : NO_KEYS;
        for (const l of listeners.values()) {
          // A viewDelta belongs to the ONE subscriber whose rule it is —
          // broadcasting it would fire the same alert once per window.
          if (tick.kind === 'viewDelta' && tick.watchSubId && tick.watchSubId !== l.subId) continue;
          const payload = this.windows.trim(l.subId, tick, upsertKeys);
          if (payload === null) continue;
          this.upsertsPosted += payload.upserts?.length ?? 0;
          this.upsertsWithheld += payload.unloaded?.upserts ?? 0;
          const event: SsrmTickEvent = { kind: 'ssrm-tick', subId: l.subId, payload };
          try {
            l.port.postMessage(event);
            posted += 1;
          } catch {
            dead.push(l.subId);
          }
        }
      }
      this.ctx.pruneDeadDataListeners(providerId, dead);
    }
    // Sessions the engine drained for, whether or not they produced ticks.
    for (const [providerId, slot] of this.ctx.providers) {
      if (isSsrmProviderType(slot.cfg.providerType)) sessions += this.ctx.subscribers.dataCount(providerId);
    }
    this.tickFlushMs.record(now() - t0);
    this.tickSessions = sessions;
    this.ticksPosted += posted;
  }

  /** Run one SSRM RPC and post its `ssrm-rpc` reply, ok or error. */
  private async reply(
    port: PortLike,
    req: { kind: string; reqId: string; subId: string },
    run: () => Promise<unknown>,
  ): Promise<void> {
    const engine = req.kind === 'ssrm-get-rows' ? this.getRowsEngine : this.otherEngine;
    const t0 = now();
    try {
      const result = await run();
      engine.record(now() - t0);
      port.postMessage({
        kind: 'ssrm-rpc',
        reqId: req.reqId,
        subId: req.subId,
        ok: true,
        result,
      } satisfies SsrmRpcEvent);
    } catch (err) {
      engine.record(now() - t0);
      port.postMessage({
        kind: 'ssrm-rpc',
        reqId: req.reqId,
        subId: req.subId,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      } satisfies SsrmRpcEvent);
    }
  }

  private getRows(port: PortLike, req: SsrmGetRowsWireRequest): Promise<void> {
    return this.reply(port, req, async () => {
      const result = await this.plane.getRows(req.subId, req.providerId, req.request);
      this.noteBlock(req, result);
      return result;
    });
  }

  /** Remember the block's leaf keys: this session's ticks are trimmed to rows it holds. */
  private noteBlock(req: SsrmGetRowsWireRequest, result: SsrmGetRowsResult): void {
    const slot = this.ctx.providers.get(req.providerId);
    if (!slot || !isSsrmProviderType(slot.cfg.providerType)) return;
    const keyColumn = (slot.cfg as SsrmProviderConfig).keyColumn;
    this.windows.noteBlock(req.subId, req.request, result.rowData.map((r) => composeRowId(r, keyColumn)));
  }

  private columnValues(port: PortLike, req: SsrmColumnValuesWireRequest): Promise<void> {
    return this.reply(port, req, () => this.plane.getColumnValues(req.subId, req.providerId, req.request));
  }

  private aggregates(port: PortLike, req: SsrmAggregatesWireRequest): Promise<void> {
    return this.reply(port, req, () => this.plane.getAggregates(req.subId, req.providerId, req.request));
  }

  private rowCount(port: PortLike, req: SsrmRowCountWireRequest): Promise<void> {
    return this.reply(port, req, () => this.plane.getRowCount(req.subId, req.providerId, req.request));
  }

  /**
   * Grid edits go into the engine cache like an upstream message: every
   * session sharing the datasource sees them on its next tick, and a block
   * refresh returns the edited values. The upstream feed is not written to;
   * the plane holds each edited column over whole-row upstream resends until
   * the upstream value itself changes (see `SsrmWasmPlane.applyEdits`).
   */
  private applyEdits(port: PortLike, req: SsrmApplyEditsWireRequest): Promise<void> {
    return this.reply(port, req, async () => {
      const slot = this.ctx.providers.get(req.providerId);
      if (!slot || !isSsrmProviderType(slot.cfg.providerType)) {
        throw new Error(`[ssrm] ${req.providerId} is not a running SSRM provider`);
      }
      if (req.rows.length === 0) return { applied: 0 };
      const applied = await this.plane.applyEdits(req.providerId, req.rows, req.editedColumns);
      return { applied };
    });
  }

  private watchGroups(port: PortLike, req: SsrmWatchGroupsWireRequest): Promise<void> {
    return this.reply(port, req, async () => {
      await this.plane.watchGroups(req.subId, req.providerId, {
        groupBy: req.groupBy,
        aggregates: req.aggregates,
      });
      return { ok: true };
    });
  }

  private watchPredicate(port: PortLike, req: SsrmWatchPredicateWireRequest): Promise<void> {
    return this.reply(port, req, async () => {
      await this.plane.watchPredicate(req.subId, req.providerId, {
        ruleId: req.ruleId,
        expr: req.expr,
      });
      return { ok: true };
    });
  }

  private unwatchPredicate(port: PortLike, req: SsrmUnwatchPredicateWireRequest): Promise<void> {
    return this.reply(port, req, async () => {
      this.plane.unwatchPredicate(req.subId, req.ruleId);
      return { ok: true };
    });
  }
}
