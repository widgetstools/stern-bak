/**
 * DataProvider Configuration Service
 *
 * Wrapper around fetch for managing DataProvider configurations.
 * Providers are stored as UnifiedConfig with componentType='data-provider'.
 *
 * Two backends, switched at runtime via `configure()` / `configureLocal()`:
 *
 *   1. **REST mode** (default) — talks to a UnifiedConfig REST API at
 *      `<apiBase>/api/v1/configurations`. Suitable when the platform
 *      runs against a shared backend (matches the star contract).
 *
 *   2. **Local mode** — routes every CRUD op through an injected
 *      `DataProviderLocalBackend`. Useful when the consumer ships an
 *      IndexedDB / Dexie persistence layer (`@wellsfargo-starui/host-config`'s
 *      `ConfigManager` is the canonical implementation) and doesn't
 *      want to require a running config server.
 *
 * Both modes preserve the same `DataProviderConfig` <-> `UnifiedConfig`
 * mapping; the local backend just sees the unified-shaped row directly
 * and decides where to put it. When a local backend is set it wins
 * over REST — `configureLocal(undefined)` explicitly returns to REST.
 */

import type { UnifiedConfig } from '@wellsfargo-starui/types';
import {
  COMPONENT_TYPES,
  PROVIDER_TYPE_TO_COMPONENT_SUBTYPE,
  COMPONENT_SUBTYPE_TO_PROVIDER_TYPE,
} from '@wellsfargo-starui/types';
import type { DataProviderConfig, ProviderConfig } from '@wellsfargo-starui/types';

const DEFAULT_API_URL = 'http://localhost:3001';

/**
 * Pluggable persistence backend. Consumers wire one of these via
 * `dataProviderConfigService.configureLocal(...)` to opt out of REST
 * mode entirely. The shape mirrors what the service does over HTTP —
 * the unified-config envelope is built/decoded by the service, the
 * backend just stores and retrieves rows.
 */
export interface DataProviderLocalBackend {
  /** Insert or update a row. The backend assigns / preserves
   *  `configId` / timestamps / createdBy as appropriate. */
  upsert(row: UnifiedConfig): Promise<UnifiedConfig>;
  delete(configId: string): Promise<void>;
  getById(configId: string): Promise<UnifiedConfig | null>;
  /** Return every row owned by `userId`. The service applies
   *  `componentType === data-provider` filtering on top. */
  listByUser(userId: string): Promise<UnifiedConfig[]>;
}

export class DataProviderConfigService {
  private apiBase = `${DEFAULT_API_URL}/api/v1/configurations`;
  private local: DataProviderLocalBackend | undefined;

  /**
   * Pending local-backend wiring. When the app calls
   * `expectLocalBackend()` at boot (typically from
   * `ensureDataProvidersLocalBackend()` in the consuming app), this
   * promise is created and every CRUD method awaits it before
   * dispatching. `configureLocal(backend)` resolves the promise.
   *
   * This means components are oblivious to wiring order — they call
   * the service whenever they want, and the service either:
   *   • dispatches immediately if the local backend is already set;
   *   • waits if the app declared "I'm bringing a local backend, hold
   *     on" but the resolution is still in flight;
   *   • falls through to REST if the app never opted into local mode.
   *
   * Apps without a local backend (REST-only) skip
   * `expectLocalBackend()` entirely; the service's behaviour matches
   * the original "fetch immediately" path exactly.
   */
  private localPending: Promise<void> | null = null;
  private resolveLocalPending: (() => void) | null = null;

  /**
   * Configure the service with a custom API base URL.
   * Should be called once at app startup (e.g., from manifest customData).
   */
  configure(options: { apiUrl: string }): void {
    const base = options.apiUrl.replace(/\/+$/, '');
    this.apiBase = `${base}/api/v1/configurations`;
  }

  /**
   * Declare that a local backend is being set up asynchronously.
   * Subsequent CRUD calls will wait for `configureLocal()` instead of
   * silently falling through to REST. Idempotent.
   *
   * Apps call this synchronously at boot — typically from a helper
   * like `ensureDataProvidersLocalBackend()` that ALSO kicks off the
   * async work to build the backend. Components stay oblivious to
   * wiring order.
   */
  expectLocalBackend(): void {
    if (this.localPending) return;
    this.localPending = new Promise<void>((resolve) => {
      this.resolveLocalPending = resolve;
    });
  }

  /**
   * Switch into local-backend mode. Pass a backend to enable, pass
   * `undefined` to revert to REST.
   *
   * The reference app wires `@wellsfargo-starui/host-config`'s `ConfigManager`
   * as the backend so DataProviders persist into the same IndexedDB
   * the rest of the platform's config rows live in — no separate
   * server required for dev.
   */
  configureLocal(backend: DataProviderLocalBackend | undefined): void {
    this.local = backend;
    // Release any CRUD calls that were waiting via `expectLocalBackend`.
    if (this.resolveLocalPending) {
      this.resolveLocalPending();
      this.resolveLocalPending = null;
      this.localPending = null;
    }
  }

  /**
   * Internal: every CRUD method awaits this. No-op fast-path when no
   * local-backend wiring is in flight (REST-only apps pay nothing).
   */
  private awaitBackendReady(): Promise<void> | undefined {
    return this.localPending ?? undefined;
  }

  /** True when a local backend is active. Useful for callers that
   *  want to surface a "running locally" indicator. */
  get isLocal(): boolean {
    return Boolean(this.local);
  }

  /** Sentinel userId for public (system-scope) rows. */
  static readonly PUBLIC_USER_ID = 'system';

  private resolveStorageUserId(provider: DataProviderConfig, callerUserId: string): string {
    return provider.public ? DataProviderConfigService.PUBLIC_USER_ID : callerUserId;
  }

  private toUnifiedConfig(provider: DataProviderConfig, callerUserId: string): Partial<UnifiedConfig> {
    const componentSubType = PROVIDER_TYPE_TO_COMPONENT_SUBTYPE[provider.providerType];
    if (!componentSubType) {
      throw new Error(`Unknown provider type: ${provider.providerType}`);
    }
    const storageUserId = this.resolveStorageUserId(provider, callerUserId);

    // Extra per-provider fields (description, tags, isDefault) don't have
    // first-class columns in the unified schema, so we stash them inside
    // the opaque `payload`. Visibility (`public`) IS expressed via the
    // userId column ('system' = public) — that's the load-bearing
    // signal; we mirror it inside __providerMeta so the round-trip
    // preserves it even when reading the row back through `getById`
    // without filtering through `userId === 'system'`.
    const payload: Record<string, unknown> = {
      ...(provider.config as unknown as Record<string, unknown>),
      __providerMeta: {
        description: provider.description,
        tags: provider.tags ?? [],
        isDefault: Boolean(provider.isDefault),
        public: Boolean(provider.public),
      },
    };
    return {
      configId: provider.providerId,
      appId: 'star-platform',
      userId: storageUserId,
      componentType: COMPONENT_TYPES.DATA_PROVIDER,
      componentSubType,
      isTemplate: false,
      displayText: provider.name,
      payload,
      createdBy: callerUserId,
      updatedBy: callerUserId,
    };
  }

  private fromUnifiedConfig(config: UnifiedConfig): DataProviderConfig {
    const providerType = COMPONENT_SUBTYPE_TO_PROVIDER_TYPE[config.componentSubType || ''];
    if (!providerType) {
      throw new Error(`Unknown component subtype: ${config.componentSubType}`);
    }
    const payload = (config.payload ?? {}) as Record<string, unknown>;
    const { __providerMeta, ...rest } = payload;
    const meta = (__providerMeta ?? {}) as Record<string, unknown>;
    // Public iff the row is stored under the system sentinel. The meta
    // mirror in the payload is informational only — the userId column
    // is authoritative.
    const isPublic = config.userId === DataProviderConfigService.PUBLIC_USER_ID;
    return {
      providerId: config.configId,
      name: config.displayText,
      description: (meta.description as string | undefined) ?? undefined,
      providerType,
      config: rest as unknown as ProviderConfig,
      tags: (meta.tags as string[] | undefined) ?? undefined,
      isDefault: Boolean(meta.isDefault),
      userId: config.userId,
      public: isPublic,
    };
  }

  async create(provider: DataProviderConfig, userId: string): Promise<DataProviderConfig> {
    await this.awaitBackendReady();
    const unifiedConfig = this.toUnifiedConfig(provider, userId);

    if (this.local) {
      // Local backends accept the full UnifiedConfig — they handle id
      // assignment + timestamps internally. Cast to UnifiedConfig: the
      // service's `toUnifiedConfig` returns Partial<> only because the
      // REST server fills in server-managed fields; the local backend
      // does the same fill-in deterministically.
      const created = await this.local.upsert(unifiedConfig as UnifiedConfig);
      return this.fromUnifiedConfig(created);
    }

    const res = await fetch(this.apiBase, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(unifiedConfig),
    });
    if (!res.ok) throw new Error(`Failed to create provider (${res.status})`);
    return this.fromUnifiedConfig(await res.json());
  }

  async update(providerId: string, updates: Partial<DataProviderConfig>, userId: string): Promise<DataProviderConfig> {
    await this.awaitBackendReady();
    const payload: Record<string, unknown> = {
      ...((updates.config as unknown as Record<string, unknown>) ?? {}),
      __providerMeta: {
        description: updates.description,
        tags: updates.tags ?? [],
        isDefault: Boolean(updates.isDefault),
        public: Boolean(updates.public),
      },
    };
    const body: Partial<UnifiedConfig> = {
      configId: providerId,
      displayText: updates.name,
      payload,
      updatedBy: userId,
    };
    if (updates.providerType) {
      body.componentSubType = PROVIDER_TYPE_TO_COMPONENT_SUBTYPE[updates.providerType];
    }

    if (this.local) {
      // Read-merge-write so the backend doesn't lose immutable fields
      // (createdBy, creationTime, appId, isTemplate, etc.) that the
      // PUT body deliberately omits.
      const existing = await this.local.getById(providerId);
      if (!existing) {
        throw new Error(`Failed to update provider (not found: ${providerId})`);
      }
      // Visibility rule mirrors REST: a `public` flip changes the
      // owning userId between 'system' and the caller.
      const nextUserId = updates.public === undefined
        ? existing.userId
        : (updates.public ? DataProviderConfigService.PUBLIC_USER_ID : userId);
      const merged: UnifiedConfig = {
        ...existing,
        ...body,
        userId: nextUserId,
        // payload fully overrides — `body.payload` already carries the
        // entire new config + meta block.
        payload: body.payload ?? existing.payload,
      };
      const written = await this.local.upsert(merged);
      return this.fromUnifiedConfig(written);
    }

    const res = await fetch(`${this.apiBase}/${providerId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Failed to update provider (${res.status})`);
    return this.fromUnifiedConfig(await res.json());
  }

  async delete(providerId: string): Promise<void> {
    await this.awaitBackendReady();
    if (this.local) {
      await this.local.delete(providerId);
      return;
    }
    const res = await fetch(`${this.apiBase}/${providerId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`Failed to delete provider (${res.status})`);
  }

  async getById(providerId: string): Promise<DataProviderConfig | null> {
    await this.awaitBackendReady();
    if (this.local) {
      const row = await this.local.getById(providerId);
      return row ? this.fromUnifiedConfig(row) : null;
    }
    const res = await fetch(`${this.apiBase}/${providerId}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Failed to fetch provider (${res.status})`);
    return this.fromUnifiedConfig(await res.json());
  }

  async getByUser(userId: string): Promise<DataProviderConfig[]> {
    await this.awaitBackendReady();
    if (this.local) {
      const rows = await this.local.listByUser(userId);
      return rows
        .filter(c => {
          const type = c.componentType?.toLowerCase();
          return type === 'data-provider' || type === 'dataprovider' || type === 'datasource';
        })
        .map(c => this.fromUnifiedConfig(c));
    }
    const params = new URLSearchParams({ includeDeleted: 'false' });
    const res = await fetch(`${this.apiBase}/by-user/${userId}?${params}`);
    if (!res.ok) throw new Error(`Failed to fetch providers (${res.status})`);

    const configs: UnifiedConfig[] = await res.json();

    // Filter componentType case-insensitively for backward compatibility.
    return configs
      .filter(c => {
        const type = c.componentType?.toLowerCase();
        return type === 'data-provider' || type === 'dataprovider' || type === 'datasource';
      })
      .map(c => this.fromUnifiedConfig(c));
  }

  async search(query: string, userId: string): Promise<DataProviderConfig[]> {
    const all = await this.getByUser(userId);
    const term = query.toLowerCase();
    return all.filter(
      p =>
        p.name.toLowerCase().includes(term) ||
        p.description?.toLowerCase().includes(term) ||
        p.tags?.some(t => t.toLowerCase().includes(term))
    );
  }

  /**
   * Return every DataProvider visible to the given user — both public
   * (stored under userId='system') and the user's own private rows.
   * Used by the MarketsGrid customizer dropdowns and any UI that
   * surfaces "providers I can pick from".
   *
   * Optionally filter by provider subtype (e.g. only STOMP providers
   * for the MarketsGrid Data section).
   */
  async listVisible(userId: string, opts?: { subtype?: ProviderConfig['providerType'] }): Promise<DataProviderConfig[]> {
    const [publicProviders, userProviders] = await Promise.all([
      this.getByUser(DataProviderConfigService.PUBLIC_USER_ID),
      userId === DataProviderConfigService.PUBLIC_USER_ID
        ? Promise.resolve<DataProviderConfig[]>([])
        : this.getByUser(userId),
    ]);

    // Dedupe by providerId: a private row with the same id as a public
    // one would shadow it, but in practice the IDs are uniformly unique.
    const seen = new Set<string>();
    const merged: DataProviderConfig[] = [];
    for (const p of [...publicProviders, ...userProviders]) {
      const id = p.providerId ?? `${p.name}::${p.providerType}`;
      if (seen.has(id)) continue;
      seen.add(id);
      if (opts?.subtype && p.providerType !== opts.subtype) continue;
      merged.push(p);
    }
    return merged;
  }
}

export const dataProviderConfigService = new DataProviderConfigService();
