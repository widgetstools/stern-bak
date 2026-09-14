/**
 * ProviderLifecycleReads — the data hub's ONLY remaining coupling to config
 * and AppData after the worker split (plan W1c).
 *
 * The data hub no longer serves catalog RPCs or AppData; those live in the
 * platform-services worker. What it still has to do is resolve a provider's
 * transport cfg (cfg-free attach) and the `{{name.key}}` AppData tokens in
 * that cfg at provider LIFECYCLE moments — create, restart, reconfigure.
 * Those are rare events, so each one re-reads the shared IndexedDB on demand
 * through a READ-ONLY ConfigManager. A fresh read at start time is correct
 * by construction: there is no invalidation channel into the data hub and no
 * worker↔worker bridge, so nothing can go stale between reads.
 *
 * The AppData snapshot from the last read stays in memory for the
 * synchronous `appDataLookup` contract the transports expect (STOMP resolves
 * templates inside `onConnect`), and for diagnostics (`hub-introspect`).
 */

import type { ConfigManager } from '@wellsfargo-starui/core/host/config';
import type { ProviderConfig } from '@wellsfargo-starui/types';
import type { AppDataRow } from '../protocol.js';
import type { AppDataLookup } from '../template/resolver.js';
import { DataProviderConfigStore } from '../config/store.js';
import { AppDataConfigStore, type AppDataConfig } from '../providers/appdata/store.js';

export class ProviderLifecycleReads {
  private readonly providers: DataProviderConfigStore | null;
  private readonly appData: AppDataConfigStore | null;
  private rows: readonly AppDataRow[] = [];
  private byName = new Map<string, AppDataRow>();
  private inFlight: Promise<void> | null = null;

  constructor(configManager?: ConfigManager) {
    this.providers = configManager ? new DataProviderConfigStore(configManager) : null;
    this.appData = configManager ? new AppDataConfigStore(configManager) : null;
  }

  /** True when a ConfigManager backs the reads (production installs). */
  get hasStore(): boolean {
    return this.providers !== null;
  }

  /**
   * The reads one lifecycle moment needs, in parallel: the provider row when
   * the attach carried no cfg (`resolveProviderId`), and a fresh AppData
   * snapshot always — the provider starts against current rows.
   */
  async prepare(resolveProviderId: string | null): Promise<ProviderConfig | null> {
    const [cfg] = await Promise.all([
      resolveProviderId ? this.resolveProviderConfig(resolveProviderId) : Promise.resolve(null),
      this.refreshAppData(),
    ]);
    return cfg;
  }

  /** One-row IndexedDB read of a provider's transport cfg, or null. */
  async resolveProviderConfig(providerId: string): Promise<ProviderConfig | null> {
    if (!this.providers) return null;
    const row = await this.providers.get(providerId);
    return row?.config ?? null;
  }

  /** Re-read every AppData row from IndexedDB. Concurrent callers share one read. */
  refreshAppData(): Promise<void> {
    if (!this.appData) return Promise.resolve();
    if (this.inFlight) return this.inFlight;
    const store = this.appData;
    this.inFlight = (async () => {
      try {
        const configs = await store.list('worker');
        this.adopt(configs.map(toAppDataRow));
      } finally {
        this.inFlight = null;
      }
    })();
    return this.inFlight;
  }

  /** Synchronous `{{name.key}}` lookup against the last read — the transports' `appDataLookup`. */
  readonly lookup: AppDataLookup = (name, key) => this.byName.get(name)?.values[key];

  /** Rows from the last read (introspect + STOMP cfg tracing). */
  snapshotRows(): readonly AppDataRow[] {
    return this.rows;
  }

  private adopt(rows: readonly AppDataRow[]): void {
    this.rows = rows;
    const next = new Map<string, AppDataRow>();
    for (const row of rows) next.set(row.name, row);
    this.byName = next;
  }
}

function toAppDataRow(c: AppDataConfig): AppDataRow {
  return {
    configId: c.configId,
    name: c.name,
    description: c.description,
    isPublic: c.isPublic,
    values: c.values,
    userId: c.userId,
  };
}
