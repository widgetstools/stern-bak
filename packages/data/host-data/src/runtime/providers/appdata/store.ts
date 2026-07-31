/**
 * AppDataConfigStore — persistence for AppData "providers".
 *
 * AppData is a kind of provider in the user-facing taxonomy
 * (`providerType: 'appdata'`) but doesn't ship rows through the
 * worker — it's a key/value bag whose values get inlined into other
 * providers' configs via `{{name.key}}` substitution upstream of the
 * worker. This store handles the ConfigManager-backed persistence.
 *
 * Two row shapes co-exist in storage and surface here:
 *   - legacy standalone rows (`componentType: 'appdata'`)
 *   - new unified-editor rows (`componentType: 'data-provider'`,
 *     `componentSubType: 'appdata'`)
 *
 * Both are flattened to the same `AppDataConfig` shape so callers
 * (mainly `AppDataStore` and `{{name.key}}` template resolution)
 * don't have to care which write path produced the row.
 */

import type { ConfigManager, AppConfigRow } from '@wellsfargo-starui/host-config';
import {
  COMPONENT_TYPE_APPDATA,
  COMPONENT_TYPE_DATA_PROVIDER,
  PUBLIC_USER_ID,
} from '../../config/componentTypes.js';

// Back-compat re-export — defined here historically, still public API.
export { COMPONENT_TYPE_APPDATA } from '../../config/componentTypes.js';

export interface AppDataConfig {
  configId: string;
  name: string;
  description?: string;
  isPublic: boolean;
  values: Record<string, unknown>;
  /** Owner user id — `'system'` for public rows. */
  userId: string;
}

export class AppDataConfigStore {
  constructor(private readonly cm: ConfigManager) {}

  async list(userId: string): Promise<AppDataConfig[]> {
    // AppData providers are GLOBAL like their sibling DataProviders —
    // see DataProviderConfigStore.list() for the rationale. The
    // userId param is retained on the API for back-compat, but no
    // longer narrows the result.
    void userId;
    // AppData providers are platform-global like their DataProvider
    // siblings — bypass the per-app/per-owner visibility filter so
    // rows authored under any app surface in {{name.key}} resolution
    // anywhere.
    //
    // Read ONLY the two componentTypes that can carry AppData (legacy
    // `appdata` rows + unified `data-provider` rows) via the
    // `[componentType+componentSubType]` index, rather than scanning every
    // row (grid profiles included) and filtering in memory.
    const all = await this.cm.getConfigsByComponentTypesUnfiltered([
      COMPONENT_TYPE_APPDATA,
      COMPONENT_TYPE_DATA_PROVIDER,
    ]);
    const seen = new Set<string>();
    const out: AppDataConfig[] = [];
    for (const row of all) {
      // Two shapes co-exist:
      //   - legacy standalone AppData rows (componentType: 'appdata')
      //   - new DataProvider rows authored via the unified editor
      //     (componentType: 'data-provider', componentSubType: 'appdata')
      // Both surface here so `{{name.key}}` resolution sees them either way.
      const isLegacy = row.componentType === COMPONENT_TYPE_APPDATA;
      const isProviderShape =
        row.componentType === COMPONENT_TYPE_DATA_PROVIDER &&
        row.componentSubType === 'appdata';
      if (!isLegacy && !isProviderShape) continue;
      if (seen.has(row.configId)) continue;
      seen.add(row.configId);
      out.push(isLegacy ? rowToAppData(row) : rowToAppDataFromProvider(row));
    }
    return out;
  }

  async get(configId: string): Promise<AppDataConfig | null> {
    const row = await this.cm.getConfig(configId);
    if (!row) return null;
    if (row.componentType === COMPONENT_TYPE_APPDATA) {
      return rowToAppData(row);
    }
    if (
      row.componentType === COMPONENT_TYPE_DATA_PROVIDER
      && row.componentSubType === 'appdata'
    ) {
      return rowToAppDataFromProvider(row);
    }
    return null;
  }

  async save(appData: AppDataConfig, callerUserId: string): Promise<AppDataConfig> {
    const ownerUserId = appData.isPublic ? PUBLIC_USER_ID : callerUserId;
    const configId = appData.configId || generateAppDataId();
    const now = new Date().toISOString();
    const existing = await this.cm.getConfig(configId);

    const row: AppConfigRow = {
      configId,
      appId: this.cm.getAppId(),
      userId: ownerUserId,
      componentType: COMPONENT_TYPE_APPDATA,
      componentSubType: 'appdata',
      isTemplate: false,
      displayText: appData.name,
      payload: { description: appData.description, values: appData.values },
      createdBy: existing?.createdBy ?? callerUserId,
      updatedBy: callerUserId,
      creationTime: existing?.creationTime ?? now,
      updatedTime: now,
    };
    await this.cm.saveConfig(row);
    return { ...appData, configId, userId: ownerUserId };
  }

  async remove(configId: string): Promise<void> {
    await this.cm.deleteConfig(configId);
  }
}

// ─── helpers ───────────────────────────────────────────────────────

function rowToAppData(row: AppConfigRow): AppDataConfig {
  const payload = (row.payload ?? {}) as Record<string, unknown>;
  return {
    configId: row.configId,
    name: row.displayText,
    description: payload.description as string | undefined,
    isPublic: row.userId === PUBLIC_USER_ID,
    values: (payload.values as Record<string, unknown>) ?? {},
    userId: row.userId,
  };
}

/**
 * Convert a DataProvider-shaped row (componentType='data-provider',
 * componentSubType='appdata') into the flat AppDataConfig shape that
 * `{{name.key}}` template resolution expects.
 *
 * The unified editor saves AppData providers with `variables:
 * Record<string, AppDataVariable>` in the payload. We unwrap each
 * variable to its `.value` so a template lookup of
 * `{{App1Data.userId}}` returns the scalar, not the variable wrapper.
 */
function rowToAppDataFromProvider(row: AppConfigRow): AppDataConfig {
  const payload = (row.payload ?? {}) as Record<string, unknown>;
  const meta = (payload.__providerMeta ?? {}) as Record<string, unknown>;
  const variables = (payload.variables ?? {}) as Record<string, { value?: unknown }>;
  const values: Record<string, unknown> = {};
  for (const [key, variable] of Object.entries(variables)) {
    values[key] = variable && typeof variable === 'object' && 'value' in variable
      ? variable.value
      : variable;
  }
  return {
    configId: row.configId,
    name: row.displayText,
    description: (meta.description as string | undefined) ?? undefined,
    isPublic: row.userId === PUBLIC_USER_ID,
    values,
    userId: row.userId,
  };
}

function generateAppDataId(): string {
  return `ad-${crypto.randomUUID()}`;
}
