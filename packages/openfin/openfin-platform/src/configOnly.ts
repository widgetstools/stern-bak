/**
 * Side-effect-free config entry point for @wellsfargo-starui/openfin-platform.
 *
 * Why this file exists:
 *   @openfin/workspace-platform performs module-top-level work that
 *   reads properties off the global `fin` object. In plain browser
 *   contexts (Vite dev server on localhost, standalone test harnesses,
 *   SSR), `fin` is undefined and the import throws
 *   `Cannot read properties of undefined (reading 'uuid')` before any
 *   user code runs.
 *
 *   The main package barrel (`./index`) re-exports from `workspace.ts`
 *   and `dock.ts`, which top-level-import workspace-platform. Tree-
 *   shaking can eliminate unused named exports at build time, but
 *   Vite's dev server evaluates the full module graph — so anyone who
 *   does `import { setConfigManager } from '@wellsfargo-starui/openfin-platform'`
 *   in a non-OpenFin dev environment triggers the crash.
 *
 *   This file re-exports ONLY the items that don't drag in workspace-
 *   platform: the ConfigManager singleton accessor, the host-env
 *   reader, the registry schema utilities. Consumers whose code runs
 *   outside OpenFin (the Config Browser mounted in a plain browser,
 *   the demo apps) import from `@wellsfargo-starui/openfin-platform/config`
 *   instead of the main barrel.
 *
 *   The main `./index` barrel continues to re-export these same
 *   symbols for backward compat with OpenFin-hosted consumers.
 */

// ── ConfigManager singleton (delegates to ./db) ─────────────────────
export {
  getConfigManager,
  peekConfigManager,
  setConfigManager,
  setPlatformDefaultScope,
  migrateLegacyPlatformScope,
  realignAllConfigsToPlatformScope,
  saveDockConfig,
  loadDockConfig,
  clearDockConfig,
  saveRegistryConfig,
  loadRegistryConfig,
  clearRegistryConfig,
} from './db';
export type { ConfigScope } from './db';

// ── Bulk import of an exported config bundle ────────────────────────
export {
  importConfigBundle,
  type ImportBundle,
  type ImportConfigBundleOptions,
  type ImportConfigBundleResult,
  type ImportTableResult,
  type ImportMode,
} from './configImport';

// ── IAB topic + action-ID constants (pure strings, no runtime deps) ──
export {
  IAB_DOCK_CONFIG_UPDATE,
  IAB_RELOAD_AFTER_IMPORT,
  IAB_THEME_CHANGED,
  IAB_REGISTRY_CONFIG_UPDATE,
  ACTION_LAUNCH_APP,
  ACTION_TOGGLE_THEME,
  ACTION_OPEN_DOCK_EDITOR,
  ACTION_RELOAD_DOCK,
  ACTION_SHOW_DEVTOOLS,
  ACTION_EXPORT_CONFIG,
  ACTION_IMPORT_CONFIG,
  ACTION_TOGGLE_PROVIDER,
  ACTION_OPEN_REGISTRY_EDITOR,
  ACTION_OPEN_CONFIG_BROWSER,
  ACTION_LAUNCH_COMPONENT,
} from './iabTopics';

// ── Dock config types (pure TS shapes; serializable) ────────────────
export {
  toDock3Favorites,
  toDock3UserContentMenu,
  appsToEditorConfig,
  type DockEditorConfig,
  type DockButtonConfig,
  type DockActionButtonConfig,
  type DockDropdownButtonConfig,
  type DockMenuItemConfig,
  type Dock3Entry,
  type Dock3ItemEntry,
  type Dock3FolderEntry,
  type DockEntryIcon,
  type ContentMenuEntryType,
  type ContentMenuItemEntry,
  type ContentMenuFolderEntry,
} from './dockConfigTypes';

// ── Host-env reader + registry schema utilities ─────────────────────
// (all pure TS, no workspace-platform transitively)
export {
  readHostEnv,
  isHostEnvMissing,
  encodeHostEnvForQueryString,
  DEFAULT_USER_ID,
} from './registryHostEnv';
export {
  deriveTemplateConfigId,
  mintRegisteredInstanceId,
  REGISTRY_CONFIG_VERSION,
  type RegistryEditorConfig,
  type RegistryEntry,
} from './registryConfigTypes';
export {
  cloneRegistryTemplateConfig,
  type CloneRegistryTemplateConfigOptions,
} from './registryClone';
export {
  validateEntry,
  validateSingletonUniqueness,
  type ValidationError,
} from './registryValidate';
export {
  migrateRegistryToV2,
  type RegistryEntryV1,
  type RegistryEditorConfigV1,
  type HostEnv,
} from './registryMigrate';

// ── Host URL normaliser (pure DOM, no workspace-platform) ───────────
export { resolveHostUrl } from './hostUrl';

// ── Manifest-driven config service settings ─────────────────────────
// Read by both the platform Provider (`initWorkspace`) and view-route
// `<ConfigServiceProvider>` hosts so a manifest edit cannot put the two
// halves of the app into conflicting REST/local modes.
export {
  resolveRestUrl,
  getConfigServiceRestUrlFromManifest,
} from './manifestConfig';

// ── Platform bootstrap (manifest → PlatformBootstrapConfig) ─────────
export {
  DEFAULT_MANIFEST_USER_ID,
  resolveBootstrapManifestScope,
  resolveDeploymentIdentity,
  resolvePlatformBootstrapFromCustomSettings,
  resolvePlatformBootstrapFromManifest,
} from './platformBootstrap';
export type { PlatformBootstrapConfig } from '@wellsfargo-starui/data';
