// ─── Dock + Registry persistence (backed by @wellsfargo-starui/host-config) ───
//
// This file is the single entry point for dock-editor and
// registry-editor persistence. Both save as `AppConfigRow` rows
// through the generic `ConfigManager.saveConfig()` API — mirroring
// MarketsGrid's `createConfigServiceStorage(...)` pattern in
// `packages/config-service/src/profileStorage.ts`.
//
// Shared invariants with MarketsGrid profile rows:
//   • `componentType` is a kebab-case domain discriminator
//     (e.g. `'dock-config'`, `'component-registry'`) matching the
//     canonical constants exported from `@wellsfargo-starui/types`.
//   • `(appId, userId, configId)` triple uniquely identifies a row
//     from a given owner's point of view. The Config Browser shows
//     dock + registry rows alongside MarketsGrid profile-set rows
//     with no special casing.
//   • `creationTime` is preserved across overwrites; `updatedTime`
//     is refreshed on every save.
//
// Back-compat: earlier versions wrote `componentType: "DOCK"` /
// `"REGISTRY"` via now-removed ConfigManager shim methods. The load
// functions below recognise those historical values and their
// configIds so existing Dexie rows continue to work after upgrade.
// The next save rewrites them in the canonical shape.

import { createConfigManager, type ConfigManager } from "@wellsfargo-starui/host-config";
import type { AppConfigRow } from "@wellsfargo-starui/host-config";
import { COMPONENT_TYPES } from "@wellsfargo-starui/types";
import type { DockEditorConfig } from './dockConfigTypes';
import { getConfigServiceRestUrlFromManifest } from './manifestConfig';
import type { RegistryEditorConfig } from './registryConfigTypes';
import { resolvePlatformBootstrapFromJson } from '@wellsfargo-starui/host-data';
import {
  resolveDeploymentIdentity,
  resolvePlatformBootstrapFromManifest,
} from './platformBootstrap';
import { resolveDefaultPlatformScope } from './platformScope';

// ─── Singleton management ────────────────────────────────────────────

/**
 * Module-level ConfigManager singleton.
 *
 * Set by `setConfigManager()` (called from workspace.ts during init).
 * If not set, a fallback instance is created on first use so that
 * the dock-editor window (which runs in a separate process) still
 * has access to the same Dexie database.
 */
let configManagerInstance: ConfigManager | undefined;

/**
 * Holds the in-progress init promise when the fallback ConfigManager
 * is being created. This prevents a race condition where two concurrent
 * callers both try to create separate instances before the first one
 * has finished initialising.
 */
let initPromise: Promise<ConfigManager> | undefined;

/**
 * Set the shared ConfigManager instance.
 *
 * Called once from workspace.ts after creating and initializing
 * the ConfigManager during platform startup. Once set, the
 * getConfigManager() fallback path is never used.
 */
export function setConfigManager(manager: ConfigManager): void {
  configManagerInstance = manager;
}

/** Synchronous peek — set by `setConfigManager` or `initWorkspace`. */
export function peekConfigManager(): ConfigManager | undefined {
  return configManagerInstance;
}

/**
 * Returns the ConfigManager instance, creating a fallback if needed.
 *
 * Why a fallback? Child OpenFin windows (dock editor, Config Browser,
 * registry editor) run in their own JS realm and can't see the
 * Provider window's in-memory `configManagerInstance`. The fallback
 * creates a per-window manager that still connects to the same Dexie
 * database on disk, AND reads the same manifest customSettings the
 * Provider read so REST mode stays consistent across windows. Without
 * this, dock-launched diagnostic UIs would silently run local-only
 * even after the Provider switched into REST mode.
 *
 * The promise guard (initPromise) ensures that even if this function
 * is called multiple times before the first init completes, only one
 * ConfigManager is ever created.
 */
export async function getConfigManager(): Promise<ConfigManager> {
  if (configManagerInstance) return configManagerInstance;
  if (!initPromise) {
    initPromise = (async () => {
      const configServiceRestUrl = await getConfigServiceRestUrlFromManifest();
      let seedConfigUrl: string | undefined;
      try {
        const bootstrap = typeof globalThis !== 'undefined' && (globalThis as { fin?: unknown }).fin
          ? await resolvePlatformBootstrapFromManifest()
          : await resolvePlatformBootstrapFromJson('/app-config.json');
        seedConfigUrl = bootstrap.seedConfigUrl;
      } catch {
        seedConfigUrl = undefined;
      }
      const deployment = await resolveDeploymentIdentity();
      const manager = createConfigManager({
        appId: deployment.appId,
        identity: { userId: deployment.userId, displayName: deployment.userId },
        configServiceRestUrl,
        seedConfigUrl,
      });
      await manager.init();
      const scope = await resolveDefaultPlatformScope(manager, deployment);
      setPlatformDefaultScope(scope);
      configManagerInstance = manager;
      initPromise = undefined;
      return manager;
    })();
  }
  return initPromise;
}

// ─── Scoping options (shared by dock + registry) ─────────────────────

/**
 * Scope under which a dock / registry config is stored.
 *
 * The defaults (`appId: 'system'`, `userId: 'system'`) preserve the
 * pre-refactor global-singleton behaviour — existing call-sites that
 * don't pass scope continue to save to the same rows they did before.
 * Hosting apps that want per-user or per-app separation pass real
 * values.
 */
export interface ConfigScope {
  appId?: string;
  userId?: string;
}

/**
 * Hard-coded fallback scope used before the platform calls
 * `setPlatformDefaultScope()`. Kept distinct from `currentPlatformScope`
 * (mutable) so the legacy back-compat fallback in `loadDockConfig` and
 * `loadRegistryConfig` always knows what the original "system/system"
 * shape was.
 */
const LEGACY_DEFAULT_SCOPE: Required<ConfigScope> = { appId: 'system', userId: 'system' };

/**
 * Live default scope. Platform shells call `setPlatformDefaultScope()`
 * during `initWorkspace()` so that all save/load calls in this module
 * default to the platform's own `(appId, userId)` — keeping dock,
 * registry, MarketsGrid profiles, and any other per-app config under
 * one scope key. Until the platform sets it, we behave like the legacy
 * `system/system` default for bit-for-bit back-compat with rows
 * written before this refactor.
 */
let currentPlatformScope: Required<ConfigScope> = { ...LEGACY_DEFAULT_SCOPE };

/**
 * Set the default `(appId, userId)` for every save/load call that
 * doesn't pass an explicit scope. Idempotent — safe to call on every
 * platform boot.
 */
export function setPlatformDefaultScope(scope: ConfigScope): void {
  currentPlatformScope = {
    appId: scope.appId ?? currentPlatformScope.appId,
    userId: scope.userId ?? currentPlatformScope.userId,
  };
}

/**
 * Read the currently-active platform default scope. Returns the
 * `LEGACY_DEFAULT_SCOPE` snapshot before `setPlatformDefaultScope` has
 * been called. Useful for callers that need to forward the platform's
 * scope into child windows (e.g. the Config Browser's `appId` chip).
 */
export function getPlatformDefaultScope(): Required<ConfigScope> {
  return { ...currentPlatformScope };
}

function resolveScope(scope: ConfigScope | undefined): Required<ConfigScope> {
  return {
    appId: scope?.appId ?? currentPlatformScope.appId,
    userId: scope?.userId ?? currentPlatformScope.userId,
  };
}

/**
 * The userId stamped on rows that are GLOBAL within an app — shared by
 * every user. The component registry is the canonical example: every
 * user of the app sees the same catalog. Per-user data (dock layout,
 * per-instance configs, saved workspaces) keeps its real userId.
 */
const GLOBAL_USER_ID = 'system';

/**
 * Force the userId portion of the resolved scope to GLOBAL_USER_ID. The
 * appId still derives from the caller or platform default, so different
 * apps get different global registries (matching the locked
 * "componentType+componentSubType unique within an app" rule).
 *
 * Used by the registry CRUD so all calls — regardless of which user is
 * signed in — read and write the same row.
 */
function resolveGlobalScope(scope: ConfigScope | undefined): Required<ConfigScope> {
  return {
    appId: scope?.appId ?? currentPlatformScope.appId,
    userId: GLOBAL_USER_ID,
  };
}

/**
 * Primary-key composition. MarketsGrid uses `configId === instanceId`
 * because it owns a separate row per (appId, userId, instanceId)
 * triple. DockEditor + Registry have a single "logical" config per
 * scope, so we encode the scope into `configId` when it differs from
 * the platform default — this keeps each owner's row distinct under
 * the primary-key-is-configId invariant.
 *
 * When scope matches the live platform default, we keep the bare
 * configIds (`dock-config`, `component-registry`) — same row, just
 * tagged with whichever `(appId, userId)` the platform configured.
 */
function scopedConfigId(base: string, scope: Required<ConfigScope>): string {
  if (scope.appId === currentPlatformScope.appId && scope.userId === currentPlatformScope.userId) {
    return base;
  }
  return `${base}::${scope.appId}::${scope.userId}`;
}

// ─── Dock config ─────────────────────────────────────────────────────

const DOCK_CONFIG_BASE_ID = 'dock-config';
const DOCK_DISPLAY = 'Dock Configuration';
/** Back-compat componentType written by pre-refactor saves. */
const LEGACY_DOCK_COMPONENT_TYPE = 'DOCK';

/** Save the dock button configuration. Overwrites any previous save in the same scope. */
export async function saveDockConfig(
  config: DockEditorConfig,
  scope?: ConfigScope,
): Promise<void> {
  const resolved = resolveScope(scope);
  const configId = scopedConfigId(DOCK_CONFIG_BASE_ID, resolved);
  const manager = await getConfigManager();
  const existing = await manager.getConfig(configId);
  const now = new Date().toISOString();

  const row: AppConfigRow = {
    configId,
    appId: resolved.appId,
    userId: resolved.userId,
    displayText: DOCK_DISPLAY,
    componentType: COMPONENT_TYPES.DOCK_CONFIG,
    componentSubType: '',
    isTemplate: false,
    payload: config,
    createdBy: existing?.createdBy ?? resolved.userId,
    updatedBy: resolved.userId,
    creationTime: existing?.creationTime ?? now,
    updatedTime: now,
  };
  await manager.saveConfig(row);
}

/** Load the saved dock button configuration. Returns null if none. */
export async function loadDockConfig(
  scope?: ConfigScope,
): Promise<DockEditorConfig | null> {
  const resolved = resolveScope(scope);
  const manager = await getConfigManager();
  const scoped = await manager.getConfig(scopedConfigId(DOCK_CONFIG_BASE_ID, resolved));
  if (scoped) return scoped.payload as DockEditorConfig;
  // Back-compat fallback: the bare legacy row (configId='dock-config',
  // componentType='DOCK', appId='', userId='system') still loads even
  // after we've re-scoped new saves.
  if (resolved.appId === LEGACY_DEFAULT_SCOPE.appId && resolved.userId === LEGACY_DEFAULT_SCOPE.userId) {
    const legacy = await manager.getConfig(DOCK_CONFIG_BASE_ID);
    if (legacy && (legacy.componentType === LEGACY_DOCK_COMPONENT_TYPE ||
                   legacy.componentType === COMPONENT_TYPES.DOCK_CONFIG)) {
      return legacy.payload as DockEditorConfig;
    }
  }
  return null;
}

/** Clear the saved dock configuration. */
export async function clearDockConfig(scope?: ConfigScope): Promise<void> {
  const resolved = resolveScope(scope);
  const manager = await getConfigManager();
  await manager.deleteConfig(scopedConfigId(DOCK_CONFIG_BASE_ID, resolved));
}

// ─── Registry config ─────────────────────────────────────────────────

const REGISTRY_CONFIG_BASE_ID = 'component-registry';
const REGISTRY_DISPLAY = 'Component Registry';
/** Back-compat componentType written by pre-refactor saves. */
const LEGACY_REGISTRY_COMPONENT_TYPE = 'REGISTRY';

/**
 * Save the component registry configuration.
 *
 * The registry is GLOBAL within an app (see `resolveGlobalScope`). The
 * `userId` portion of the passed scope is intentionally ignored — every
 * user of the app reads and writes the same row. This matches the
 * locked design: catalogue is shared, per-user data is per-user.
 */
export async function saveRegistryConfig(
  config: RegistryEditorConfig,
  scope?: ConfigScope,
): Promise<void> {
  const resolved = resolveGlobalScope(scope);
  const configId = scopedConfigId(REGISTRY_CONFIG_BASE_ID, resolved);
  const manager = await getConfigManager();
  const existing = await manager.getConfig(configId);
  const now = new Date().toISOString();

  const row: AppConfigRow = {
    configId,
    appId: resolved.appId,
    userId: resolved.userId,
    displayText: REGISTRY_DISPLAY,
    componentType: COMPONENT_TYPES.COMPONENT_REGISTRY,
    componentSubType: '',
    isTemplate: false,
    payload: config,
    createdBy: existing?.createdBy ?? resolved.userId,
    updatedBy: resolved.userId,
    creationTime: existing?.creationTime ?? now,
    updatedTime: now,
  };
  await manager.saveConfig(row);
}

/**
 * Load the saved component registry configuration. Returns null if none.
 *
 * Read order (first hit wins):
 *   1. The new GLOBAL location ((appId, 'system')) — Phase 4 onward
 *   2. The pre-Phase-4 platform-default-scoped row — for unmigrated
 *      installs. Removed once Phase 5's migration has run on all clients.
 *   3. The very-legacy bare-`component-registry` row — for v1 installs.
 */
export async function loadRegistryConfig(
  scope?: ConfigScope,
): Promise<RegistryEditorConfig | null> {
  const manager = await getConfigManager();

  // (1) New global location
  const global = resolveGlobalScope(scope);
  const globalRow = await manager.getConfig(scopedConfigId(REGISTRY_CONFIG_BASE_ID, global));
  if (globalRow) return globalRow.payload as RegistryEditorConfig;

  // (2) Pre-Phase-4 location: stored under the calling user's scope
  const perUser = resolveScope(scope);
  const perUserRow = await manager.getConfig(scopedConfigId(REGISTRY_CONFIG_BASE_ID, perUser));
  if (perUserRow) return perUserRow.payload as RegistryEditorConfig;

  // (3) v1 legacy bare-id row at the legacy 'system'/'system' default
  if (perUser.appId === LEGACY_DEFAULT_SCOPE.appId && perUser.userId === LEGACY_DEFAULT_SCOPE.userId) {
    const legacy = await manager.getConfig(REGISTRY_CONFIG_BASE_ID);
    if (legacy && (legacy.componentType === LEGACY_REGISTRY_COMPONENT_TYPE ||
                   legacy.componentType === COMPONENT_TYPES.COMPONENT_REGISTRY)) {
      return legacy.payload as RegistryEditorConfig;
    }
  }
  return null;
}

/** Clear the saved component registry configuration (the GLOBAL one). */
export async function clearRegistryConfig(scope?: ConfigScope): Promise<void> {
  const resolved = resolveGlobalScope(scope);
  const manager = await getConfigManager();
  await manager.deleteConfig(scopedConfigId(REGISTRY_CONFIG_BASE_ID, resolved));
}

// ─── One-shot legacy-scope migration ─────────────────────────────────

/**
 * Re-tag pre-platform `appId='system' / userId='system'` dock + registry
 * rows so they carry the live `currentPlatformScope` instead. Idempotent,
 * cheap to call on every platform boot.
 *
 * Why this matters: the Config Browser filters App Config rows by the
 * runtime `appId` (typically `fin.me.identity.uuid`). Rows still carrying
 * the legacy `'system'` appId are invisible to the browser even though
 * they live in the same Dexie database. After this runs once, the dock
 * and registry rows show up in the browser alongside everything else
 * the platform writes under its own scope.
 *
 * Only operates on rows whose `configId` is the bare `dock-config` /
 * `component-registry` (i.e. originally written under the legacy default
 * scope). Suffixed configIds (`dock-config::someApp::someUser`) are left
 * untouched — they were already explicitly scoped.
 */
export async function migrateLegacyPlatformScope(): Promise<{ migrated: number }> {
  const manager = await getConfigManager();
  let migrated = 0;
  for (const baseId of [DOCK_CONFIG_BASE_ID, REGISTRY_CONFIG_BASE_ID] as const) {
    const row = await manager.getConfig(baseId);
    if (!row) continue;
    const onLegacyScope =
      row.appId === LEGACY_DEFAULT_SCOPE.appId &&
      row.userId === LEGACY_DEFAULT_SCOPE.userId;
    const onPlatformScope =
      row.appId === currentPlatformScope.appId &&
      row.userId === currentPlatformScope.userId;
    if (!onLegacyScope || onPlatformScope) continue;
    const now = new Date().toISOString();
    await manager.saveConfig({
      ...row,
      appId: currentPlatformScope.appId,
      userId: currentPlatformScope.userId,
      updatedBy: currentPlatformScope.userId,
      updatedTime: now,
    });
    migrated += 1;
  }
  return { migrated };
}

/**
 * Broad sweep: re-stamp EVERY row in the `appConfig` table so its
 * `appId` and `userId` columns match the current platform default scope.
 *
 * Stronger than `migrateLegacyPlatformScope()` — that only touches the
 * legacy `'system'/'system'` dock + registry rows. This walks every row
 * regardless of original scope. Rows whose scope columns already match
 * the platform default are skipped (idempotent).
 *
 * `configId` (the primary key) is preserved — the row keeps its identity
 * and payload; only the scope columns + `updatedBy`/`updatedTime` change.
 *
 * Use this when you want the entire local Dexie store to collapse onto
 * a single canonical `(appId, userId)` — e.g. after seeding TestApp /
 * dev1 and you want every pre-existing row visible under that chip.
 */
export async function realignAllConfigsToPlatformScope(): Promise<{ realigned: number; total: number }> {
  const manager = await getConfigManager();
  // Cross-app re-stamping migration: the visibility filter (Session 4)
  // would hide rows whose `appId` doesn't match the manager's scope —
  // exactly the rows we need to realign. Use the unfiltered read.
  const rows = await manager.getAllConfigsUnfiltered();
  const now = new Date().toISOString();
  let realigned = 0;
  for (const row of rows) {
    if (
      row.appId === currentPlatformScope.appId &&
      row.userId === currentPlatformScope.userId
    ) continue;
    await manager.saveConfig({
      ...row,
      appId: currentPlatformScope.appId,
      userId: currentPlatformScope.userId,
      updatedBy: currentPlatformScope.userId,
      updatedTime: now,
    });
    realigned += 1;
  }
  return { realigned, total: rows.length };
}

/**
 * Phase-5 migration: relocate the component registry from per-user scope
 * to the new GLOBAL scope (appId, 'system').
 *
 * Phase 4 promoted the registry to global storage. Pre-Phase-4 installs
 * still have their registry row at the platform-default `(appId, userId)`
 * — `loadRegistryConfig`'s back-compat fallback finds them but never
 * relocates. This function does the relocation: copy payload to the
 * global location, delete the old row.
 *
 * Idempotent: if the global row already exists OR no per-user row is
 * present, it's a no-op. Safe to invoke on every platform boot.
 *
 * Returns the number of registry rows migrated (0 or 1 in normal
 * operation; could be >1 if multiple per-user rows somehow accumulated).
 */
export async function migrateRegistryToGlobalScope(): Promise<{ migrated: number }> {
  const manager = await getConfigManager();
  const targetAppId = currentPlatformScope.appId;
  const globalScope: Required<ConfigScope> = { appId: targetAppId, userId: GLOBAL_USER_ID };
  const globalConfigId = scopedConfigId(REGISTRY_CONFIG_BASE_ID, globalScope);

  // If the global row already exists, nothing to do
  const existingGlobal = await manager.getConfig(globalConfigId);
  if (existingGlobal) return { migrated: 0 };

  // Find every registry row for this app at any non-global userId.
  // Bypass the visibility filter — this migration walks rows owned by
  // every user, including private rows owned by other users that we
  // need to relocate.
  const all = await manager.getAllConfigsUnfiltered();
  const candidates = all.filter((r) =>
    r.appId === targetAppId &&
    r.userId !== GLOBAL_USER_ID &&
    (r.componentType === COMPONENT_TYPES.COMPONENT_REGISTRY ||
     r.componentType === LEGACY_REGISTRY_COMPONENT_TYPE),
  );

  if (candidates.length === 0) {
    // Also handle the very-legacy bare-id row at 'system'/'system'
    const veryLegacy = await manager.getConfig(REGISTRY_CONFIG_BASE_ID);
    if (
      veryLegacy &&
      veryLegacy.appId === LEGACY_DEFAULT_SCOPE.appId &&
      veryLegacy.userId === LEGACY_DEFAULT_SCOPE.userId &&
      (veryLegacy.componentType === COMPONENT_TYPES.COMPONENT_REGISTRY ||
       veryLegacy.componentType === LEGACY_REGISTRY_COMPONENT_TYPE)
    ) {
      const now = new Date().toISOString();
      await manager.saveConfig({
        ...veryLegacy,
        configId: globalConfigId,
        appId: globalScope.appId,
        userId: globalScope.userId,
        componentType: COMPONENT_TYPES.COMPONENT_REGISTRY,
        updatedBy: globalScope.userId,
        updatedTime: now,
      });
      try { await manager.deleteConfig(veryLegacy.configId); } catch { /* ignore */ }
      return { migrated: 1 };
    }
    return { migrated: 0 };
  }

  // Pick the most-recently-updated candidate as the source of truth.
  // Multiple per-user registry rows shouldn't normally exist, but if
  // they do (e.g., the user opened the app under different userIds
  // before Phase 4 landed), the freshest wins.
  candidates.sort((a, b) => (b.updatedTime ?? '').localeCompare(a.updatedTime ?? ''));
  const source = candidates[0];
  const now = new Date().toISOString();

  await manager.saveConfig({
    ...source,
    configId: globalConfigId,
    appId: globalScope.appId,
    userId: globalScope.userId,
    componentType: COMPONENT_TYPES.COMPONENT_REGISTRY,
    updatedBy: globalScope.userId,
    updatedTime: now,
  });

  // Delete every per-user copy (the source plus any losers)
  for (const c of candidates) {
    try { await manager.deleteConfig(c.configId); } catch (err) {
      console.warn(`[migrateRegistryToGlobalScope] failed to delete legacy row '${c.configId}':`, err);
    }
  }

  return { migrated: candidates.length };
}

/**
 * One-shot migration: relocate component-registry rows stamped under a
 * stale `appId` (e.g. `TestApp` from the pre-manifest platform scope)
 * to `currentPlatformScope.appId` at the global registry location.
 */
export async function migrateRegistryAppIdDrift(): Promise<{ migrated: number }> {
  const manager = await getConfigManager();
  const targetAppId = currentPlatformScope.appId;
  const globalScope: Required<ConfigScope> = { appId: targetAppId, userId: GLOBAL_USER_ID };
  const targetConfigId = scopedConfigId(REGISTRY_CONFIG_BASE_ID, globalScope);

  const all = await manager.getAllConfigsUnfiltered();
  const registryRows = all.filter((r) =>
    r.componentType === COMPONENT_TYPES.COMPONENT_REGISTRY
    || r.componentType === LEGACY_REGISTRY_COMPONENT_TYPE,
  );

  const stale = registryRows.filter(
    (r) => r.configId !== targetConfigId || r.appId !== targetAppId,
  );
  if (stale.length === 0) return { migrated: 0 };

  const existingTarget = await manager.getConfig(targetConfigId);
  if (!existingTarget || existingTarget.appId !== targetAppId) {
    stale.sort((a, b) => (b.updatedTime ?? '').localeCompare(a.updatedTime ?? ''));
    const source = stale[0];
    const now = new Date().toISOString();
    await manager.saveConfig({
      ...source,
      configId: targetConfigId,
      appId: globalScope.appId,
      userId: globalScope.userId,
      componentType: COMPONENT_TYPES.COMPONENT_REGISTRY,
      updatedBy: globalScope.userId,
      updatedTime: now,
    });
  }

  let deleted = 0;
  for (const row of stale) {
    if (row.configId === targetConfigId) continue;
    try {
      await manager.deleteConfig(row.configId);
      deleted += 1;
    } catch (err) {
      console.warn(`[migrateRegistryAppIdDrift] failed to delete '${row.configId}':`, err);
    }
  }

  return { migrated: deleted + (existingTarget?.appId === targetAppId ? 0 : 1) };
}
