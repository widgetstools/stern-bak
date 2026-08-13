// Core AppConfigRow schema for the MarketsUI Configuration Service.
//
// This is the contract shared between `@wellsfargo-starui/config-service`
// (Dexie / IndexedDB client) and every consumer that reads or writes
// component configurations.

// ============================================================================
// AppConfigRow
// ============================================================================

/**
 * The single source of truth for a component configuration row.
 *
 * `payload` holds the component-specific config blob — its shape is
 * determined by `componentType` + `componentSubType` and is opaque to
 * the config service itself. Versioning, tagging, and similar features
 * are the responsibility of the consumer and live inside `payload`.
 *
 * ## Owner vs audit field roles (Decision 7 in the redesign)
 *
 *   - `userId` — the **owner** of the row. Drives visibility (see
 *     `isPublic` below). Under impersonation this is the impersonated
 *     user, not the real signed-in user.
 *   - `createdBy` / `updatedBy` — **audit** fields. Always reflect the
 *     real logged-in user, never the impersonated user.
 */
export interface AppConfigRow {
  /** Primary key — unique id for this row. */
  configId: string;

  /** Foreign key → application (platform uuid). */
  appId: string;

  /**
   * Owner of this config row. System-level rows (e.g. seeded templates)
   * typically use a reserved user id such as `"system"`.
   */
  userId: string;

  /**
   * Visibility flag (Decision 6 in the redesign).
   *
   *   - `true` (default) — **public**: visible to every user of this
   *     app. Templates and shared configs are public.
   *   - `false` — **private**: visible only to the row's `userId`
   *     (owner) within the row's `appId`.
   *
   * Optional for back-compat — rows written before this field existed
   * are normalized to `true` by storage migrations so existing data
   * keeps reading. New writes always populate the field explicitly.
   */
  isPublic?: boolean;

  /** Component type: "GRID", "CHART", "HEATMAP", "ORDERTICKET", "DOCK", etc. */
  componentType: string;

  /** Sub-category within the component type (e.g. "CREDIT", "RATES"). */
  componentSubType: string;

  /** True = shareable template. False = a user-specific instance. */
  isTemplate: boolean;

  /** Human-readable label shown in toolbars, menus, and lookups. */
  displayText: string;

  /** Opaque, component-defined configuration payload. */
  payload: Record<string, unknown> | unknown;

  /** User id of the creator. */
  createdBy: string;

  /** User id of the last editor. */
  updatedBy: string;

  /** ISO-8601 timestamp of creation. */
  creationTime: string;

  /** ISO-8601 timestamp of the last modification. */
  updatedTime: string;
}

/**
 * @deprecated Use `AppConfigRow` instead. Retained as an alias for
 * one release while consumers migrate. See Decision 13 in
 * `docs/plans/plan-2026-05-07/config-manager-redesign.md`.
 */
export type UnifiedConfig = AppConfigRow;

// ============================================================================
// Query / filtering
// ============================================================================

export interface ConfigurationFilter {
  configIds?: string[];
  appIds?: string[];
  userIds?: string[];
  componentTypes?: string[];
  componentSubTypes?: string[];
  displayTextContains?: string;
  isTemplate?: boolean;
  /** Reserved for future soft-delete support. Ignored when unsupported. */
  includeDeleted?: boolean;
  createdAfter?: string;
  createdBefore?: string;
  updatedAfter?: string;
  updatedBefore?: string;

  /**
   * The caller's effective user id. When set, storage layers must apply
   * the visibility filter `(isPublic = 1 OR userId = ?)` so private rows
   * owned by other users are excluded. When unset, no visibility filter
   * applies — admin / unfiltered paths only.
   */
  effectiveUserId?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface StorageHealthStatus {
  isHealthy: boolean;
  connectionStatus: 'connected' | 'disconnected' | 'error';
  lastChecked: string;
  responseTime: number;
  errorMessage?: string;
  storageType: 'sqlite' | 'dexie' | 'mock';
}

export interface BulkUpdateRequest {
  configId: string;
  updates: Partial<AppConfigRow>;
}

export interface BulkUpdateResult {
  configId: string;
  success: boolean;
  error?: string;
}

export interface CleanupResult {
  removedCount: number;
  configs?: AppConfigRow[] | undefined;
  dryRun?: boolean;
}

// ============================================================================
// Component type constants
// ============================================================================

export const COMPONENT_TYPES = {
  DATASOURCE: 'datasource',
  DATA_PROVIDER: 'data-provider',
  GRID: 'grid',
  DATA_GRID: 'data-grid',
  PROFILE: 'profile',
  WORKSPACE: 'workspace',
  PAGE: 'page',
  THEME: 'theme',
  LAYOUT: 'layout',
  DOCK: 'dock',
  /** Persisted OpenFin dock-editor configuration (buttons + dropdowns). */
  DOCK_CONFIG: 'dock-config',
  /** Persisted component-registry editor configuration (registry entries). */
  COMPONENT_REGISTRY: 'component-registry',
  /** MarketsGrid profile-set bundle — one row per (appId, userId, instanceId). */
  MARKETS_GRID_PROFILE_SET: 'markets-grid-profile-set',
  SIMPLE_BLOTTER: 'simple-blotter',
  SIMPLE_BLOTTER_LAYOUT: 'simple-blotter-layout',
  CUSTOM: 'custom',
} as const;

export const COMPONENT_SUBTYPES = {
  STOMP: 'stomp',
  REST: 'rest',
  MOCK: 'mock',
  DOCK_APPLICATIONS_MENU_ITEMS: 'dock-applications-menu-items',
  DEFAULT: 'default',
  CUSTOM: 'custom',
  SHARED: 'shared',
  DIRECT: 'direct',
} as const;

export type ComponentType = typeof COMPONENT_TYPES[keyof typeof COMPONENT_TYPES];
export type ComponentSubType = typeof COMPONENT_SUBTYPES[keyof typeof COMPONENT_SUBTYPES];
