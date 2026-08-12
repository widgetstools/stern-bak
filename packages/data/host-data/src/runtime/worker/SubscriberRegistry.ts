/**
 * SubscriberRegistry — the hub's per-provider data/stats listener
 * bookkeeping, indexed by `subId` for O(1) ping / detach / evict.
 *
 * Heartbeats arrive per-subscription every 15s from EVERY window;
 * before the index, each ping scanned all listener maps, scaling with
 * total subscriber count squared across the fleet.
 *
 * The registry owns membership only. Delivery (broadcast loops),
 * provider lifecycle, and timers stay in the hub.
 */

import type { HubSubscriberIntrospectRow, SubscriberMeta } from '../protocol.js';
import {
  SUBSCRIBER_PING_TIMEOUT_MS,
  SUBSCRIBER_PING_TIMEOUT_HIDDEN_MS,
  type DataListener,
  type StatsListener,
  type PortLike,
} from './hubTypes.js';

export type SubscriberMode = 'data' | 'stats';

export interface RemovedSubscriber {
  providerId?: string;
  port?: PortLike;
  /** True when this removal emptied the provider's stats listener map. */
  statsEmptied?: boolean;
}

function pingTimeoutMs(l: DataListener | StatsListener): number {
  return l.hidden ? SUBSCRIBER_PING_TIMEOUT_HIDDEN_MS : SUBSCRIBER_PING_TIMEOUT_MS;
}

export class SubscriberRegistry {
  private readonly dataByProvider = new Map<string, Map<string, DataListener>>();
  private readonly statsByProvider = new Map<string, Map<string, StatsListener>>();
  /** subId → owning provider + mode. */
  private readonly subIndex = new Map<string, { providerId: string; mode: SubscriberMode }>();

  attach(providerId: string, subId: string, port: PortLike, mode: SubscriberMode): void {
    const byProvider = mode === 'data' ? this.dataByProvider : this.statsByProvider;
    const set = byProvider.get(providerId) ?? new Map<string, DataListener>();
    const now = Date.now();
    set.set(subId, { subId, port, attachedAt: now, lastPingAt: now });
    byProvider.set(providerId, set);
    this.subIndex.set(subId, { providerId, mode });
  }

  dataListeners(providerId: string): Map<string, DataListener> | undefined {
    return this.dataByProvider.get(providerId);
  }

  statsListeners(providerId: string): Map<string, StatsListener> | undefined {
    return this.statsByProvider.get(providerId);
  }

  dataCount(providerId: string): number {
    return this.dataByProvider.get(providerId)?.size ?? 0;
  }

  statsCount(providerId: string): number {
    return this.statsByProvider.get(providerId)?.size ?? 0;
  }

  /** Provider ids that currently have stats listeners (sampler targets). */
  statsProviderIds(): IterableIterator<string> {
    return this.statsByProvider.keys();
  }

  /** Total subscriptions across all providers and modes. */
  get size(): number {
    return this.subIndex.size;
  }

  /** Listener record for a subId via the O(1) index, or undefined. */
  listenerOf(subId: string): DataListener | StatsListener | undefined {
    const entry = this.subIndex.get(subId);
    if (!entry) return undefined;
    const byProvider = entry.mode === 'data' ? this.dataByProvider : this.statsByProvider;
    return byProvider.get(entry.providerId)?.get(subId);
  }

  /** Record a heartbeat (and optional meta / visibility update). */
  ping(subId: string, meta?: SubscriberMeta): void {
    const l = this.listenerOf(subId);
    if (!l) return;
    l.lastPingAt = Date.now();
    if (meta) {
      l.meta = meta;
      if (meta.hidden !== undefined) l.hidden = meta.hidden;
    }
  }

  /** @returns removed listener metadata when a row was deleted */
  remove(subId: string): RemovedSubscriber {
    const entry = this.subIndex.get(subId);
    if (!entry) return {};
    this.subIndex.delete(subId);
    const byProvider = entry.mode === 'data' ? this.dataByProvider : this.statsByProvider;
    const listeners = byProvider.get(entry.providerId);
    const l = listeners?.get(subId);
    if (!listeners || !l) return {};
    listeners.delete(subId);
    let statsEmptied = false;
    if (listeners.size === 0) {
      byProvider.delete(entry.providerId);
      statsEmptied = entry.mode === 'stats';
    }
    return { providerId: entry.providerId, port: l.port, statsEmptied };
  }

  /**
   * Drop every subscription owned by `port` (window closed).
   * @returns provider ids that may now be idle, and whether any stats
   * listener map was emptied (caller may stop the sampler).
   */
  removeByPort(port: PortLike): {
    idleCandidates: Set<string>;
    statsEmptied: boolean;
    /** (providerId, subId) pairs dropped — callers release per-session state. */
    released: Array<{ providerId: string; subId: string }>;
  } {
    const idleCandidates = new Set<string>();
    const released: Array<{ providerId: string; subId: string }> = [];
    let statsEmptied = false;
    for (const [providerId, listeners] of this.dataByProvider) {
      for (const [subId, l] of listeners) {
        if (l.port !== port) continue;
        listeners.delete(subId);
        this.subIndex.delete(subId);
        idleCandidates.add(providerId);
        released.push({ providerId, subId });
      }
      if (listeners.size === 0) this.dataByProvider.delete(providerId);
    }
    for (const [providerId, listeners] of this.statsByProvider) {
      for (const [subId, l] of listeners) {
        if (l.port !== port) continue;
        listeners.delete(subId);
        this.subIndex.delete(subId);
        idleCandidates.add(providerId);
      }
      if (listeners.size === 0) {
        this.statsByProvider.delete(providerId);
        statsEmptied = true;
      }
    }
    return { idleCandidates, statsEmptied, released };
  }

  /**
   * Drop a batch of dead subIds for one provider+mode (ports that threw
   * on `postMessage`). @returns whether the stats map was emptied.
   */
  pruneDead(providerId: string, mode: SubscriberMode, deadSubIds: readonly string[]): boolean {
    const byProvider = mode === 'data' ? this.dataByProvider : this.statsByProvider;
    const listeners = byProvider.get(providerId);
    if (!listeners) return false;
    for (const subId of deadSubIds) {
      listeners.delete(subId);
      this.subIndex.delete(subId);
    }
    if (listeners.size === 0) {
      byProvider.delete(providerId);
      return mode === 'stats';
    }
    return false;
  }

  /**
   * Detach every DATA listener for a provider (provider stopped).
   * Stats listeners intentionally survive a stop — see the hub's
   * `stopProvider` for the rationale. @returns the removed listeners.
   */
  removeDataListenersOf(providerId: string): DataListener[] {
    const listeners = this.dataByProvider.get(providerId);
    if (!listeners) return [];
    const removed = [...listeners.values()];
    for (const l of removed) this.subIndex.delete(l.subId);
    this.dataByProvider.delete(providerId);
    return removed;
  }

  /** SubIds whose last ping is older than their visibility-aware timeout. */
  collectStale(now: number): string[] {
    const stale: string[] = [];
    const collect = (listeners: Map<string, DataListener | StatsListener>) => {
      for (const [subId, l] of listeners) {
        if (now - l.lastPingAt > pingTimeoutMs(l)) stale.push(subId);
      }
    };
    for (const listeners of this.dataByProvider.values()) collect(listeners);
    for (const listeners of this.statsByProvider.values()) collect(listeners);
    return stale;
  }

  /** Introspect rows for one provider (both modes). */
  introspectRows(providerId: string): HubSubscriberIntrospectRow[] {
    const now = Date.now();
    const rows: HubSubscriberIntrospectRow[] = [];
    const push = (l: DataListener | StatsListener, mode: SubscriberMode) => {
      rows.push({
        subId: l.subId,
        mode,
        attachedAt: l.attachedAt,
        lastPingAt: l.lastPingAt,
        stale: now - l.lastPingAt > pingTimeoutMs(l),
        meta: l.meta,
      });
    };
    for (const l of this.dataByProvider.get(providerId)?.values() ?? []) push(l, 'data');
    for (const l of this.statsByProvider.get(providerId)?.values() ?? []) push(l, 'stats');
    return rows;
  }

  clear(): void {
    this.dataByProvider.clear();
    this.statsByProvider.clear();
    this.subIndex.clear();
  }
}
