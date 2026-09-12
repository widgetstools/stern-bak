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

import { isSsrmProviderType } from '@wellsfargo-starui/types';
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
import { SsrmWasmPlane, publishWindowMsOf } from '../ssrm/SsrmWasmPlane.js';
import type { PortLike, ProviderSlot } from './hubTypes.js';
import type { SubscriberRegistry } from './SubscriberRegistry.js';

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

  constructor(
    private readonly ctx: SsrmRpcContext,
    createRustHub?: RustHubFactory,
  ) {
    this.plane = new SsrmWasmPlane(createRustHub);
  }

  /** Dispatch an `ssrm-*` request. Returns false for any other kind. */
  handleRequest(port: PortLike, req: Request): boolean {
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
    void this.plane.ingest(providerId, rows, replace);
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
    // One engine drain per flush: `tick()` returns every session's group
    // deltas at once, so polling per provider handed provider B's deltas to
    // whichever provider polled first.
    for (const [providerId, ticks] of this.plane.pollAllTicks()) {
      const slot = this.ctx.providers.get(providerId);
      if (!slot || !isSsrmProviderType(slot.cfg.providerType)) continue;
      if (ticks.length === 0) continue;
      const listeners = this.ctx.subscribers.dataListeners(providerId);
      if (!listeners) continue;
      const dead: string[] = [];
      for (const tick of ticks) {
        for (const l of listeners.values()) {
          // A viewDelta belongs to the ONE subscriber whose rule it is —
          // broadcasting it would fire the same alert once per window.
          if (tick.kind === 'viewDelta' && tick.watchSubId && tick.watchSubId !== l.subId) continue;
          const event: SsrmTickEvent = { kind: 'ssrm-tick', subId: l.subId, payload: tick };
          try {
            l.port.postMessage(event);
          } catch {
            dead.push(l.subId);
          }
        }
      }
      this.ctx.pruneDeadDataListeners(providerId, dead);
    }
  }

  /** Run one SSRM RPC and post its `ssrm-rpc` reply, ok or error. */
  private async reply(
    port: PortLike,
    req: { reqId: string; subId: string },
    run: () => Promise<unknown>,
  ): Promise<void> {
    try {
      const result = await run();
      port.postMessage({
        kind: 'ssrm-rpc',
        reqId: req.reqId,
        subId: req.subId,
        ok: true,
        result,
      } satisfies SsrmRpcEvent);
    } catch (err) {
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
    return this.reply(port, req, () => this.plane.getRows(req.subId, req.providerId, req.request));
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
