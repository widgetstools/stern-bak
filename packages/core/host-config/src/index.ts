// ─── @wellsfargo-starui/core/host/config ───────────────────────────────────────
//
// A dual-mode configuration service for MarketsUI applications.
//
// In dev mode (default), all data is stored in Dexie/IndexedDB — no
// backend required. When a REST URL is provided, writes sync to a
// remote backend with Dexie as a local cache.
//
// Usage:
//
//   import { createConfigManager } from "@wellsfargo-starui/core/host/config";
//
//   const configManager = createConfigManager({
//     seedConfigUrl: "http://localhost:5174/seed-config.json",
//   });
//   await configManager.init();
//
//   const config = await configManager.getConfig("my-component-1");

// ─── ConfigManager — the single config-service API ──────────────────
// One class for fetch/update/save of every config row, the auth tables
// (appRegistry / userProfile / roles / permissions), and the `profiles`
// namespace. Local Dexie by default; REST-synced when
// `configServiceRestUrl` is supplied.
export { createConfigManager, ConfigManager } from './ConfigManager';
export type {
  CreateConfigInput,
  ImpersonatedUser,
  ResetToSeedResult,
  SaveConfigOptions,
  UpdateConfigOptions,
} from './ConfigManager';

// ─── Errors ──────────────────────────────────────────────────────────
export { ConfigNotFoundError, OptimisticLockError } from './errors';

// ─── Database (for advanced use cases only) ──────────────────────────
export { ConfigDatabase } from './db';

// ─── Visibility (Session 4) ──────────────────────────────────────────
// Pure predicate exposed for hosts that want to mirror the framework's
// visibility rule on row arrays they assembled themselves (e.g. a
// remote import).
export { isVisible } from './visibility';
export type { VisibilityContext } from './visibility';

// ─── Effective user / impersonation (Session 8) ──────────────────────
// `getEffectiveUser(ctx)` is the single source of truth for "who am I
// acting as right now": the impersonated user when one is set on
// ApplicationContext, otherwise the real signed-in user. Hosts that
// want to apply the same rule outside ConfigManager (e.g. a "what
// would alice see?" admin preview) call this helper.
export { getEffectiveUser } from './effectiveUser';

// ─── Types ───────────────────────────────────────────────────────────
export type {
  AppConfigRow,
  AppDataMirrorHandle,
  AppIdentity,
  AppRegistryRow,
  ApplicationContext,
  ConfigManagerInitOptions,
  ConfigManagerOptions,
  DataServicesHandle,
  PermissionRow,
  PendingSyncRow,
  RoleRow,
  SeedData,
  SeedConfigReloadMode,
  UserProfileRow,
} from './types';

export {
  computeSeedDigest,
  seedDigestStorageKey,
  simpleSeedDigest,
} from './seedDigest';

// ─── MarketsGrid profile storage (StorageAdapter factory) ───────────
// ConfigService-backed persistence for <MarketsGrid>. Pass the factory
// to MarketsGrid's `storage` prop to opt-in to cross-device profile
// sync scoped by (appId, userId, instanceId).
// The one profile surface (the StorageAdapter factory) plus the bundle
// RMW helper live in `profileBundle.ts`; row change events route through
// `ConfigManager.onRowChanged`.
export {
  readProfileSetPayload,
  createConfigServiceStorage,
  migrateProfilesToConfigService,
  ProfileSetVersionConflictError,
  MARKETS_GRID_PROFILE_SET_COMPONENT_TYPE,
  /** @deprecated alias for `MARKETS_GRID_PROFILE_SET_COMPONENT_TYPE` — same value */
  MARKETS_GRID_PROFILE_COMPONENT_TYPE,
  CONFIG_SERVICE_ADAPTER_BRAND,
  getConfigServiceAdapterBrand,
  type ConfigServiceStorageOptions,
  type ProfileStorageFactory,
  type ProfileStorageFactoryOpts,
  type ProfileSnapshot,
  type RegisteredComponentIdentity,
  type StorageAdapter,
} from './profileBundle';

export {
  CONFIG_BROWSER_TABLES,
  TABLES,
  type ConfigBrowserTableKey,
  type ConfigBrowserTableMeta,
  type TableKey,
  type TableMeta,
} from './configBrowserTables';

// ─── Deploy export (scoped seed bundle) ─────────────────────────────
export {
  buildDeployExport,
  validateDeployExport,
  collectReferencedInstanceIds,
  instanceIdsFromOpenFinSnapshot,
  type DeployExportInput,
  type DeployExportResult,
  type DeployExportWarning,
  type DeployExportSeverity,
  type DeployExportStats,
} from './deployExport';

export {
  activeAppIdFromSeed,
  activeUserIdFromSeed,
  canonicalAppIdFromSeed,
  canonicalUserIdFromSeed,
  normalizeImportedAppConfigRow,
  normalizeImportedAppConfigRows,
  coerceDeploySeedBundle,
  normalizeSeedData,
  parseSeedJson,
  resolveActiveIdentityFromSeedUrl,
  isSeedIdentityCached,
  type ActiveIdentity,
  type FetchLike as SeedFetchLike,
} from './normalizeSeedData';
