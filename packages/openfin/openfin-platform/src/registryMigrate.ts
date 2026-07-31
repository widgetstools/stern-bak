/**
 * Registry v1 → v2 migrator. Runs once on read in `loadRegistryConfig()`
 * (or equivalent editor-side fetch paths); the on-disk record is
 * permanently upgraded to v2 on the first subsequent save.
 *
 * v1 entries had no concept of `type`, `usesHostConfig`, `singleton`,
 * or per-entry `appId`/`configServiceUrl`. We default them:
 *
 *   - type             = 'internal'       (v1 only supported in-app components)
 *   - usesHostConfig   = true             (v1 implicitly used the host's ConfigService)
 *   - singleton        = false            (v1 had no singleton concept; safer default)
 *   - appId            = hostEnv.appId    (passed in at migration time)
 *   - configServiceUrl = hostEnv.configServiceUrl
 *
 * `configId` is preserved — v1 users may have customized it; we do NOT
 * re-derive singleton ids on migration (defaulting `singleton: false`
 * means the derived-id rule doesn't apply).
 */
import type { RegistryEditorConfig, RegistryEntry } from './registryConfigTypes';
import { REGISTRY_CONFIG_VERSION, deriveTemplateConfigId } from './registryConfigTypes';

/** The v1 entry shape — same as v2 minus the new fields. */
export interface RegistryEntryV1 {
  id: string;
  hostUrl: string;
  iconId: string;
  componentType: string;
  componentSubType: string;
  configId: string;
  displayName: string;
  createdAt: string;
}

export interface RegistryEditorConfigV1 {
  version: 1;
  entries: RegistryEntryV1[];
}

export interface HostEnv {
  appId: string;
  /**
   * Optional — the migrator doesn't read it, but the structurally-shared
   * `HostEnv` returned by `readHostEnv()` always carries a userId so
   * child windows can forward the platform scope. Optional here for
   * back-compat with v1 callers that only ever passed appId + url.
   */
  userId?: string;
  configServiceUrl: string;
}

/**
 * Upgrade a v1 config (or a loose object with no version) to v2.
 * Idempotent: if the input is already v2, returns it unchanged.
 */
export function migrateRegistryToV2(
  config: RegistryEditorConfig | RegistryEditorConfigV1 | null | undefined,
  hostEnv: HostEnv,
): RegistryEditorConfig {
  if (!config) {
    return { version: REGISTRY_CONFIG_VERSION, entries: [] };
  }

  if ((config.version ?? 1) >= 2) {
    // Already v2 — return as-is but normalize shape in case some
    // fields are missing (defensive; handles partial data).
    return {
      version: REGISTRY_CONFIG_VERSION,
      entries: (config.entries as RegistryEntry[]).map((e) => fillMissingV2Fields(e, hostEnv)),
    };
  }

  return {
    version: REGISTRY_CONFIG_VERSION,
    entries: (config.entries as RegistryEntryV1[]).map((e) => ({
      ...e,
      type: 'internal',
      usesHostConfig: true,
      singleton: false,
      appId: hostEnv.appId,
      configServiceUrl: hostEnv.configServiceUrl,
    })),
  };
}

/** Fill in any v2 fields that might be missing (e.g., partial write). */
function fillMissingV2Fields(entry: Partial<RegistryEntry>, hostEnv: HostEnv): RegistryEntry {
  // Canonical id derivation — same as the Workspace Setup inspector
  // and the Registry Editor add-entry path. Falls back to whatever
  // the entry already had only when type+subtype are both empty
  // (the genuinely partial case where we have nothing to derive
  // from); a UUID would be wrong now that the registry contract
  // ties id to type/subtype.
  const componentType = entry.componentType ?? '';
  const componentSubType = entry.componentSubType ?? '';
  const derivedId = (componentType || componentSubType)
    ? deriveTemplateConfigId(componentType, componentSubType)
    : '';
  return {
    id: entry.id || derivedId,
    hostUrl: entry.hostUrl ?? '',
    iconId: entry.iconId ?? 'lucide:box',
    componentType,
    componentSubType,
    configId: entry.configId || derivedId,
    displayName: entry.displayName ?? '',
    createdAt: entry.createdAt ?? new Date().toISOString(),
    type: entry.type ?? 'internal',
    usesHostConfig: entry.usesHostConfig ?? true,
    singleton: entry.singleton ?? false,
    appId: entry.appId ?? hostEnv.appId,
    configServiceUrl: entry.configServiceUrl ?? hostEnv.configServiceUrl,
  };
}
