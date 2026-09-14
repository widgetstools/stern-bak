/**
 * HubStatsSampler — the 1 Hz diagnostics sampler of
 * {@link SharedWorkerDataServicesHub}: rotates every slot's sliding-window
 * buckets and pushes a stats snapshot to each provider's stats listeners.
 *
 * Extracted from the hub as-is (worker-split W1c) so the orchestration
 * class stays under the file ceiling; the hub lends slot + subscriber
 * access through {@link StatsSamplerContext} and keeps ownership of both.
 */

import type { Event, ProviderStats } from '../protocol.js';
import type { PortLike, ProviderSlot, StatsListener } from './hubTypes.js';
import { rotateStatsBuckets, snapshotProviderStats, zeroedStats } from './hubStats.js';
import type { SubscriberRegistry } from './SubscriberRegistry.js';

/** What the hub lends the sampler. */
export interface StatsSamplerContext {
  providers: ReadonlyMap<string, ProviderSlot>;
  subscribers: SubscriberRegistry;
  setTimer(cb: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  /** Drop stats listeners whose port threw during fan-out. */
  pruneDeadStatsListeners(providerId: string, deadSubIds: readonly string[]): void;
}

export class HubStatsSampler {
  private timer: unknown = null;

  constructor(
    private readonly ctx: StatsSamplerContext,
    private readonly intervalMs: number,
  ) {}

  /** Arm the sampler (idempotent). Called on every provider start / stats attach. */
  ensure(): void {
    if (this.timer !== null) return;
    this.timer = this.ctx.setTimer(() => this.tick(), this.intervalMs);
  }

  /**
   * Keep rotating sliding-window buckets while any provider is running,
   * even with no stats listeners — otherwise publish/min buckets stall
   * and accumulate unbounded counts in a single slot.
   */
  maybeStop(): void {
    if (this.ctx.providers.size === 0 && this.timer !== null) {
      this.ctx.clearTimer(this.timer);
      this.timer = null;
    }
  }

  /** Push a fresh snapshot now (loading / timing events) instead of waiting for the next tick. */
  flush(providerId: string): void {
    const listeners = this.ctx.subscribers.statsListeners(providerId);
    const slot = this.ctx.providers.get(providerId);
    if (!listeners || !slot) return;
    const stats = snapshotProviderStats(slot, this.ctx.subscribers.dataCount(providerId));
    this.post(providerId, listeners, stats);
  }

  /** Push a single zeroed stats snapshot to a stopped provider's stats listeners. */
  emitStopped(providerId: string): void {
    const listeners = this.ctx.subscribers.statsListeners(providerId);
    if (!listeners) return;
    const stats = zeroedStats();
    for (const l of listeners.values()) {
      l.port.postMessage({ subId: l.subId, kind: 'stats', stats } satisfies Event);
    }
  }

  private post(
    providerId: string,
    listeners: Map<string, StatsListener>,
    stats: ProviderStats,
  ): void {
    const dead: string[] = [];
    for (const l of listeners.values()) {
      try {
        (l.port as PortLike).postMessage({ subId: l.subId, kind: 'stats', stats } satisfies Event);
      } catch {
        dead.push(l.subId);
      }
    }
    this.ctx.pruneDeadStatsListeners(providerId, dead);
  }

  private tick(): void {
    // Rotate sliding-window buckets first: the slot we're about to
    // overwrite holds the oldest second of activity.
    for (const slot of this.ctx.providers.values()) {
      rotateStatsBuckets(slot);
    }

    for (const providerId of [...this.ctx.subscribers.statsProviderIds()]) {
      const slot = this.ctx.providers.get(providerId);
      const listeners = this.ctx.subscribers.statsListeners(providerId);
      if (!slot || !listeners) continue;
      const stats = snapshotProviderStats(slot, this.ctx.subscribers.dataCount(providerId));
      this.post(providerId, listeners, stats);
    }
  }
}
