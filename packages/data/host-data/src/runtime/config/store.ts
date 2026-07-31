/**
 * DataProviderConfigStore — thin wrapper over `ConfigManager` for
 * data-provider rows. Replaces v1's `dataProviderConfigService`
 * (which had its own REST mode + an "expectLocalBackend" gate that
 * caused a whole class of races). All persistence goes through
 * ConfigManager directly; mode-switching is its concern, not ours.
 *
 * Schema:
 *   - DataProvider:      `componentType: 'data-provider'`,
 *                        `componentSubType` = providerType.
 *   - AppDataProvider:   `componentType: 'appdata'` — see
 *                        `../providers/appdata/store.ts` for that
 *                        store. AppData persistence is split out
 *                        because it's a different *kind* of provider
 *                        (config-only, not a streaming source).
 *
 *   Visibility:
 *     - Public providers are stored with `userId: 'system'` so any
 *       user can pick them up.
 *     - Private providers store under the active userId.
 *
 * The store is intentionally framework-agnostic — React bindings
 * live in `@wellsfargo-starui/host-data-react`.
 */

import type { ConfigManager, AppConfigRow } from '@wellsfargo-starui/host-config';
import type { DataProviderConfig, ProviderConfig } from '@wellsfargo-starui/types';
import {
  COMPONENT_TYPE_APPDATA,
  COMPONENT_TYPE_DATA_PROVIDER,
  PUBLIC_USER_ID,
} from './componentTypes.js';

// Back-compat re-exports — these were defined here and are public API.
export { COMPONENT_TYPE_DATA_PROVIDER, PUBLIC_USER_ID } from './componentTypes.js';

export interface ListOptions {
  /**
   * Provider subtype filter. When set, only rows whose
   * `componentSubType` matches are returned (used to scope the
   * MarketsGrid live-provider picker to STOMP-only, etc.).
   */
  subtype?: ProviderConfig['providerType'];
  /**
   * Include AppData rows (`componentSubType: 'appdata'`) in the
   * result. Default `false` — the live-stream picker shouldn't show
   * AppData entries because they're a key/value store, not a stream
   * source. The DataProviderEditor's own sidebar passes `true` so
   * users can list / select / edit their AppData providers from the
   * same authoring surface where they create them.
   */
  includeAppData?: boolean;
}

/** Notify the worker hub to reload catalog rows after editor persistence. */
export type CatalogInvalidateFn = (providerId?: string) => void | Promise<void>;

export class DataProviderConfigStore {
  constructor(
    private readonly cm: ConfigManager,
    private readonly invalidateCatalog?: CatalogInvalidateFn,
  ) {}

  async list(userId: string, opts: ListOptions = {}): Promise<DataProviderConfig[]> {
    // DataProviders are GLOBAL to the platform: every registered
    // component (and every instance) can pick from the same provider
    // catalogue regardless of which user authored the row. Ownership
    // is still recorded on save (the row's `userId` reflects the
    // creator), but discovery via list() ignores user scope. This
    // matches the user-facing model where DataProviders are a
    // platform-level resource (a STOMP feed configured by one trader
    // is selectable by every other trader's blotters).
    void userId;
    // DataProviders are platform-global per the comment above — scan
    // every row regardless of the manager's app/owner scope. Visibility
    // is the wrong filter here because providers authored under any
    // app must be selectable from any other app's components.
    //
    // Read ONLY provider (+ AppData when asked) componentTypes via the
    // `[componentType+componentSubType]` index, rather than materialising the
    // whole appConfig table (every grid profile, etc.) and filtering in memory.
    const all = await this.cm.getConfigsByComponentTypesUnfiltered(
      opts.includeAppData
        ? [COMPONENT_TYPE_DATA_PROVIDER, COMPONENT_TYPE_APPDATA]
        : [COMPONENT_TYPE_DATA_PROVIDER],
    );
    const out: DataProviderConfig[] = [];
    for (const row of all) {
      if (row.componentType === COMPONENT_TYPE_APPDATA) {
        if (!opts.includeAppData) continue;
        out.push(legacyAppDataRowToProvider(row));
        continue;
      }
      if (row.componentType !== COMPONENT_TYPE_DATA_PROVIDER) continue;
      // AppData rows are routinely consumed via AppDataConfigStore for
      // {{name.key}} resolution. By default we hide them here so the
      // live-stream picker doesn't surface them as attachable streams
      // (they're not — they're a key/value store). The editor sidebar
      // overrides with `includeAppData: true` so authoring stays in
      // one unified list.
      if (row.componentSubType === 'appdata' && !opts.includeAppData) continue;
      if (opts.subtype && row.componentSubType !== opts.subtype) continue;
      out.push(rowToProvider(row));
    }
    return out;
  }

  async get(configId: string): Promise<DataProviderConfig | null> {
    const row = await this.cm.getConfig(configId);
    if (!row) return null;
    if (row.componentType === COMPONENT_TYPE_APPDATA) {
      return legacyAppDataRowToProvider(row);
    }
    if (row.componentType !== COMPONENT_TYPE_DATA_PROVIDER) return null;
    return rowToProvider(row);
  }

  async save(provider: DataProviderConfig, callerUserId: string): Promise<DataProviderConfig> {
    const ownerUserId = provider.public ? PUBLIC_USER_ID : callerUserId;
    const configId = provider.providerId ?? generateProviderId();
    const now = new Date().toISOString();
    const existing = await this.cm.getConfig(configId);

    const row: AppConfigRow = {
      configId,
      appId: this.cm.getAppId(),
      userId: ownerUserId,
      componentType: COMPONENT_TYPE_DATA_PROVIDER,
      componentSubType: provider.providerType,
      isTemplate: false,
      displayText: provider.name,
      payload: providerToPayload(provider),
      createdBy: existing?.createdBy ?? callerUserId,
      updatedBy: callerUserId,
      creationTime: existing?.creationTime ?? now,
      updatedTime: now,
    };
    await this.cm.saveConfig(row);
    this.notifyCatalogInvalidate(configId);
    return { ...provider, providerId: configId, userId: ownerUserId, public: ownerUserId === PUBLIC_USER_ID };
  }

  async remove(configId: string): Promise<void> {
    await this.cm.deleteConfig(configId);
    this.notifyCatalogInvalidate(configId);
  }

  private notifyCatalogInvalidate(providerId?: string): void {
    if (!this.invalidateCatalog) return;
    void Promise.resolve(this.invalidateCatalog(providerId)).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn('[DataProviderConfigStore] hub catalog invalidate failed', err);
    });
  }
}

// ─── helpers ───────────────────────────────────────────────────────

function legacyAppDataRowToProvider(row: AppConfigRow): DataProviderConfig {
  const payload = (row.payload ?? {}) as Record<string, unknown>;
  const values = (payload.values as Record<string, unknown>) ?? {};
  const variables: Record<string, { key: string; value: unknown; type: 'string'; durability: 'volatile' }> = {};
  for (const [key, value] of Object.entries(values)) {
    variables[key] = { key, value, type: 'string', durability: 'volatile' };
  }
  return {
    providerId: row.configId,
    name: row.displayText,
    description: payload.description as string | undefined,
    providerType: 'appdata',
    config: { providerType: 'appdata', variables } as ProviderConfig,
    userId: row.userId,
    public: row.userId === PUBLIC_USER_ID,
  };
}

function rowToProvider(row: AppConfigRow): DataProviderConfig {
  const payload = (row.payload ?? {}) as Record<string, unknown>;
  const meta = (payload.__providerMeta ?? {}) as Record<string, unknown>;
  const { __providerMeta: _, ...config } = payload;
  return {
    providerId: row.configId,
    name: row.displayText,
    description: (meta.description as string | undefined) ?? undefined,
    providerType: row.componentSubType as DataProviderConfig['providerType'],
    config: config as unknown as ProviderConfig,
    tags: (meta.tags as string[] | undefined) ?? undefined,
    isDefault: Boolean(meta.isDefault),
    userId: row.userId,
    public: row.userId === PUBLIC_USER_ID,
  };
}

function providerToPayload(p: DataProviderConfig): Record<string, unknown> {
  return {
    ...(p.config as unknown as Record<string, unknown>),
    __providerMeta: {
      description: p.description,
      tags: p.tags ?? [],
      isDefault: Boolean(p.isDefault),
      public: Boolean(p.public),
    },
  };
}

function generateProviderId(): string {
  return `dp-${crypto.randomUUID()}`;
}
