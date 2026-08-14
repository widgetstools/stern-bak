// @wellsfargo-starui/openfin — public surface.
//
// Curated: only symbols with real external consumers live here.
// Internal machinery (dock plumbing, custom actions, child-window
// openers, registry validators) stays in its modules — reachable by
// this package's own code, not part of the public API.

// ─── Workspace initialization ────────────────────────────────────────
export {
  initWorkspace,
  ensureConfigService,
  runPlatformScopeMigrations,
  type EnsureConfigServiceOptions,
} from './workspace';
export { resolveHostUrl } from './hostUrl';

// ─── Built-in Tools-menu action IDs ─────────────────────────────────
// Pass to `initWorkspace({ dock: { excludeTools } })` to hide the
// matching entries.
export {
  ACTION_EXPORT_CONFIG,
  IAB_REGISTRY_CONFIG_UPDATE,
} from './dock';

// ─── Registry config (consumed by the Workspace Setup editor) ───────
export {
  saveRegistryConfig,
  loadRegistryConfig,
  clearRegistryConfig,
} from './db';
export type { ConfigScope } from './db';
export {
  deriveTemplateConfigId,
  REGISTRY_CONFIG_VERSION,
  type RegistryEditorConfig,
  type RegistryEntry,
} from './registryConfigTypes';
export { migrateRegistryToV2, type HostEnv } from './registryMigrate';
export { readHostEnv } from './registryHostEnv';

// ─── Manifest / bootstrap types ─────────────────────────────────────
export type {
  WorkspaceConfig,
  PlatformSettings,
  CustomSettings,
} from './types';
