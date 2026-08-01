/**
 * Worker-side in-memory cache of data-provider catalog rows.
 * Preloaded after ConfigManager init so attach can resolve cfg by id.
 */

import type { ConfigManager } from '@wellsfargo-starui/core/host/config';
import type { DataProviderConfig, ProviderConfig } from '@wellsfargo-starui/types';
import {
  DataProviderConfigStore,
  type ListOptions,
} from '../runtime/config/store.js';

export class ConfigCatalogCache {
  private readonly store: DataProviderConfigStore;
  private readonly byId = new Map<string, DataProviderConfig>();
  private loaded = false;
  private loadPromise: Promise<void> | null = null;

  constructor(configManager: ConfigManager) {
    this.store = new DataProviderConfigStore(configManager);
  }

  /** True after the first successful {@link loadAll}. */
  isReady(): boolean {
    return this.loaded;
  }

  /** Preload all data-provider rows from ConfigManager (platform-global list). */
  async loadAll(): Promise<void> {
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = this.reloadAll();
    return this.loadPromise;
  }

  private async reloadAll(): Promise<void> {
    const providers = await this.store.list('system', { includeAppData: true });
    this.byId.clear();
    for (const provider of providers) {
      if (provider.providerId) {
        this.byId.set(provider.providerId, provider);
      }
    }
    this.loaded = true;
  }

  get(providerId: string): DataProviderConfig | null {
    return this.byId.get(providerId) ?? null;
  }

  /**
   * Resolve a single provider row on demand — cached value if present, else a
   * one-row ConfigManager read (no full {@link loadAll}). Phase 3: a grid that
   * needs exactly one provider doesn't wait on the whole catalog preload.
   * The fetched row is cached so the synchronous {@link getProviderConfig} /
   * {@link handleAttach} lookups that follow find it.
   */
  async ensure(providerId: string): Promise<DataProviderConfig | null> {
    const cached = this.byId.get(providerId);
    if (cached) return cached;
    const fresh = await this.store.get(providerId);
    if (fresh && fresh.providerId) this.byId.set(fresh.providerId, fresh);
    return fresh;
  }

  /** Resolved transport cfg for provider attach. */
  getProviderConfig(providerId: string): ProviderConfig | null {
    return this.byId.get(providerId)?.config ?? null;
  }

  list(opts: ListOptions = {}): DataProviderConfig[] {
    const out: DataProviderConfig[] = [];
    for (const provider of this.byId.values()) {
      if (provider.providerType === 'appdata' && !opts.includeAppData) continue;
      if (opts.subtype && provider.providerType !== opts.subtype) continue;
      out.push(provider);
    }
    return out;
  }

  /** Reload one row or the full catalog from ConfigManager. */
  async invalidate(providerId?: string): Promise<void> {
    if (providerId) {
      const fresh = await this.store.get(providerId);
      if (fresh) this.byId.set(providerId, fresh);
      else this.byId.delete(providerId);
      return;
    }
    this.loadPromise = null;
    await this.loadAll();
  }

  /** Merge a row into the cache without a ConfigManager round-trip. */
  upsert(provider: DataProviderConfig): void {
    if (!provider.providerId) return;
    this.byId.set(provider.providerId, provider);
    this.loaded = true;
  }
}
