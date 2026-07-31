/**
 * Deployment identity resolved once at app bootstrap — before
 * `ensurePlatformReady` / `ensureDataServicesHub`.
 *
 * Source: OpenFin manifest `customSettings` or web `/app-config.json`.
 */
export interface PlatformBootstrapConfig {
  /** Drives SharedWorker name `mkt-data-services:${appId}` — fixed per deployment. */
  appId: string;
  /** Session user — AppData ownership, profile scope, private provider rows. */
  userId: string;
  /** REST mode gate. When true, `configServiceRestUrl` should be set. */
  useRest?: boolean;
  /** Remote config service base URL (REST mode). */
  configServiceRestUrl?: string;
  /** Optional seed JSON for empty Dexie (dev/demo). */
  seedConfigUrl?: string;
  /**
   * When to re-apply `seedConfigUrl`. Default `empty-only`. Dev demos use
   * `when-changed` so replacing `seed.json` after a rocket export re-seeds on reload.
   */
  seedConfigReload?: 'empty-only' | 'when-changed';
  /** AppData bootstrap hook ids + run policy (see `runAppDataBootstrap`). */
  appDataBootstrap?: AppDataBootstrapManifest;
}

/** Declarative AppData seeding — hook ids reference app TS registry entries. */
export interface AppDataBootstrapManifest {
  onHubReady?: string[];
  onUserChange?: string[];
  runPolicy?: 'if-missing' | 'always' | 'once-per-session';
  /** hookId → AppData provider names that must be absent before run (if-missing). */
  targets?: Record<string, string[]>;
}

export interface PlatformBootstrapValidationResult {
  valid: boolean;
  errors: readonly string[];
  warnings: readonly string[];
}

/** Shared dev/test bootstrap — replaces scattered `TestApp` / `dev1` literals. */
export const DEV_PLATFORM_BOOTSTRAP: PlatformBootstrapConfig = {
  appId: 'TestApp',
  userId: 'dev1',
  useRest: false,
};

function isNonEmpty(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Validate bootstrap config before hub / ConfigManager init.
 * Does not mutate the input.
 */
export function validatePlatformBootstrapConfig(
  config: PlatformBootstrapConfig,
): PlatformBootstrapValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isNonEmpty(config.appId)) {
    errors.push('appId is required and must be non-empty');
  }

  if (!isNonEmpty(config.userId)) {
    errors.push('userId is required and must be non-empty');
  }

  if (config.useRest === true && !isNonEmpty(config.configServiceRestUrl)) {
    warnings.push('useRest is true but configServiceRestUrl is missing');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/** REST URL forwarded to worker when `useRest` is enabled. */
export function resolveConfigServiceRestUrl(
  config: PlatformBootstrapConfig,
): string | undefined {
  return config.useRest ? config.configServiceRestUrl : undefined;
}
