// ─── View-tab rename ("Save Tab As…") ───────────────────────────────
// Shared between every WorkspacePlatformOverrideCallback in the repo so
// the menu wiring + action handler aren't duplicated per shell.
export {
  ACTION_RENAME_VIEW_TAB,
  RENAME_VIEW_TAB_WINDOW_NAME,
  injectRenameMenuItem,
  createRenameViewTabAction,
} from './internal/viewTabRename';

// ─── Workspace initialization ────────────────────────────────────────
export { initWorkspace } from './workspace';
export { launchApp, launchRegisteredComponent } from './launch';
export type { LaunchRegisteredComponentOptions } from './launch';
export { resolveHostUrl } from './hostUrl';
export { buildPlatformChildUrl } from './buildPlatformChildUrl.js';
export {
  openChildToolWindow,
  openDataProvidersToolWindow,
} from './openChildToolWindow.js';

// ─── Dock management ─────────────────────────────────────────────────
export {
  updateDockButtons,
  getDefaultEditorConfig,
  recolorDockIcons,
  shutdownDock,
  // Hide built-in Tools-menu items by action ID. Normally driven via
  // `initWorkspace({ dock: { excludeTools } })`; exported for advanced use.
  setExcludedDockTools,
  // IAB topic names — exported so packages that publish/subscribe
  // to these topics use the same string constant, not separate literals.
  IAB_DOCK_CONFIG_UPDATE,
  IAB_RELOAD_AFTER_IMPORT,
  IAB_THEME_CHANGED,
  IAB_REGISTRY_CONFIG_UPDATE,
  ACTION_OPEN_REGISTRY_EDITOR,
  ACTION_OPEN_CONFIG_BROWSER,
  ACTION_LAUNCH_COMPONENT,
  // Built-in Tools-menu action IDs — pass to `dock.excludeTools` to hide
  // the matching entries.
  ACTION_EXPORT_CONFIG,
  ACTION_IMPORT_CONFIG,
} from './dock';

// ─── Persistence (config service) ────────────────────────────────────
export { saveDockConfig, loadDockConfig, clearDockConfig } from './db';
export { saveRegistryConfig, loadRegistryConfig, clearRegistryConfig } from './db';
export {
  getConfigManager,
  setConfigManager,
  setPlatformDefaultScope,
  migrateLegacyPlatformScope,
  realignAllConfigsToPlatformScope,
} from './db';
export type { ConfigScope } from './db';
export {
  importConfigBundle,
  type ImportBundle,
  type ImportConfigBundleOptions,
  type ImportConfigBundleResult,
  type ImportTableResult,
  type ImportMode,
} from './configImport';

// ─── Registry config types ──────────────────────────────────────────
export {
  deriveTemplateConfigId,
  generateTemplateConfigId,    // deprecated alias of deriveTemplateConfigId
  deriveSingletonConfigId,     // deprecated alias of deriveTemplateConfigId
  mintRegisteredInstanceId,
  REGISTRY_CONFIG_VERSION,
  type RegistryEditorConfig,
  type RegistryEntry,
} from './registryConfigTypes';
export {
  cloneRegistryTemplateConfig,
  type CloneRegistryTemplateConfigOptions,
} from './registryClone';

// ─── Registry v2 validators, migrator, host env reader ──────────────
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

export {
  readHostEnv,
  isHostEnvMissing,
  DEFAULT_USER_ID,
} from './registryHostEnv';

// Re-export config service types for convenience
export { createConfigManager, type ConfigManager } from "@wellsfargo-starui/core/host/config";
export type {
  AppConfigRow,
  AppRegistryRow,
  UserProfileRow,
  RoleRow,
} from "@wellsfargo-starui/core/host/config";

// ─── Dock config types + converter ───────────────────────────────────
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

// ─── Icon library ────────────────────────────────────────────────────
export {
  MARKET_ICON_SVGS,
  svgToDataUrl,
  marketIconToDataUrl,
} from './icons/index';

export {
  ICON_META,
  ICON_NAMES,
  ICON_CATEGORIES,
  ICON_CATEGORY_NAMES,
  getIconsByCategory,
  type MarketIconName,
  type IconCategory,
  type IconMeta,
} from './icons/index';

// ─── Types ───────────────────────────────────────────────────────────
export type {
  WorkspaceConfig,
  PlatformSettings,
  CustomSettings,
  UserRole,
} from './types';
