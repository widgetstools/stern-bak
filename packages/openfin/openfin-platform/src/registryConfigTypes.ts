/**
 * Registry Editor configuration types (v2).
 *
 * The Registry Editor allows users to register reusable components
 * (React or Angular) and manage their template configurations.
 *
 * v2 additions (over v1):
 *   - `type`           — component hosting model ('internal' | 'external')
 *   - `usesHostConfig` — whether the component consumes the dock app's
 *                        ConfigService (true) or carries its own (false)
 *   - `appId`          — targets the dock app by default; editable when
 *                        usesHostConfig === false
 *   - `configServiceUrl` — same behavior as appId
 *   - `singleton`      — true = focus-existing on launch; false = spawn-new
 *
 * Persisted v1 data is upgraded by `migrateRegistryV1ToV2()` in
 * `./registryMigrate.ts` on read — no consumer sees a v1 entry.
 */

/** A single registered component entry. */
export interface RegistryEntry {
  // ── v1 fields (preserved, unchanged) ────────────────────────────
  /** Unique identifier (UUID). */
  id: string;
  /** Route or URL where the component is hosted. */
  hostUrl: string;
  /** Icon identifier (e.g., "mkt:bond", "lucide:home"). */
  iconId: string;
  /** Component classification (e.g., "GRID", "CHART", "HEATMAP"). */
  componentType: string;
  /** Component sub-classification (e.g., "CREDIT", "RATES", "MBS"). */
  componentSubType: string;
  /** Config ID for the persisted config row. For singletons this is
   *  derived from componentType + componentSubType via
   *  `deriveSingletonConfigId()`. For non-singletons it defaults to
   *  `generateTemplateConfigId()` output but the user can override. */
  configId: string;
  /** Human-readable display name. */
  displayName: string;
  /** ISO 8601 timestamp of when this entry was created. */
  createdAt: string;

  // ── v2 additions ────────────────────────────────────────────────
  /** Hosting model:
   *   'internal' — component route lives inside the host app
   *   'external' — component is served from a foreign URL
   *  Independent of `usesHostConfig` — the four combinations all exist. */
  type: 'internal' | 'external';

  /** Whether the component consumes the dock app's ConfigService.
   *   true  = host app injects appId + configServiceUrl at launch;
   *           editor locks these fields to the host values
   *   false = entry carries its own appId + configServiceUrl
   *           (may be foreign, or may be empty if component is
   *           fully self-contained with no config needs) */
  usesHostConfig: boolean;

  /** AppId this entry targets. Equals the host app's appId when
   *  usesHostConfig === true. Required non-empty when false. */
  appId: string;

  /** ConfigService URL. Equals the host app's URL when
   *  usesHostConfig === true. May be empty when false AND the
   *  external component is fully self-contained. */
  configServiceUrl: string;

  /** Instance lifecycle:
   *   true  = first click creates the window; subsequent clicks
   *           focus the existing instance (never more than one)
   *   false = every click spawns a new instance */
  singleton: boolean;
}

/** The full registry editor configuration, persisted as an APP_CONFIG row. */
export interface RegistryEditorConfig {
  /** Config format version. v2 is current; v1 is upgraded on read. */
  version: number;
  /** All registered component entries. */
  entries: RegistryEntry[];
}

/** Current schema version that `RegistryEditorConfig` is written at. */
export const REGISTRY_CONFIG_VERSION = 2;

/**
 * Canonical config-id derivation for the **template** (initial-
 * settings) config of a registered component. There is at most ONE
 * template per (componentType, componentSubType) pair, and this
 * function is the only valid way to compute its configId.
 *
 * Format: `<componenttype>-<componentsubtype>` (lowercase,
 * dash-separated). e.g. `grid-credit`, `blotter-markets`.
 *
 * The same string also serves as the `RegistryEntry.id` — registry
 * entries and their template config rows are keyed identically so
 * the join is trivial and admins can read the registry without a
 * lookup table.
 *
 * Per-instance rows spawned from the dock for non-singleton
 * components carry an **arbitrary UUID** as their `configId`
 * (different from this template id) but keep the same
 * `componentType` + `componentSubType`.
 *
 * Uniqueness within a given appId is enforced by
 * `validateSingletonUniqueness()` in `./registryValidate.ts` — and
 * because the template id IS the registry-entry id, that validator
 * doubles as a duplicate-entry check for the registry as a whole.
 */
export function deriveTemplateConfigId(componentType: string, componentSubType: string): string {
  return `${componentType}-${componentSubType}`.toLowerCase();
}

/**
 * @deprecated Use {@link deriveTemplateConfigId}. Kept as a
 * source-compatibility alias so existing imports keep working
 * during the rename. The output format is now identical to
 * `deriveTemplateConfigId` (lowercase `${type}-${subtype}`); the
 * old `templateComponent<Type><SubType>` format is gone.
 */
export function generateTemplateConfigId(componentType: string, componentSubType: string): string {
  return deriveTemplateConfigId(componentType, componentSubType);
}

/**
 * @deprecated Use {@link deriveTemplateConfigId}. The singleton-vs-
 * non-singleton distinction is no longer encoded in the configId —
 * BOTH cases use `${componentType}-${componentSubType}` lowercase
 * for the template row. The instance row for a non-singleton uses
 * an arbitrary UUID; the instance row for a singleton doesn't
 * exist (everyone shares the template).
 */
export function deriveSingletonConfigId(componentType: string, componentSubType: string): string {
  return deriveTemplateConfigId(componentType, componentSubType);
}

/**
 * Mint a fresh `instanceId` for a non-singleton registered-component
 * launch. Format:
 *
 *   `${userId}${componentType}-${componentSubType}-${Date.now()}`
 *
 * Example: `dev1blotter-markets-1714999999999`.
 *
 * Properties this gives us:
 *   • Per-user prefix — every row owned by a given user starts with
 *     their userId, so a Config Browser scan visually clusters them
 *     together and a `startsWith()` match finds all of one user's
 *     instances.
 *   • Type-scoped middle — `componentType-componentSubType` matches
 *     the same lower-cased shape used by `deriveTemplateConfigId`,
 *     so the template id is a strict prefix of every instance id
 *     spawned from it (after the userId portion).
 *   • Monotonically increasing suffix — `Date.now()` (long ms-since-
 *     epoch) makes the id sortable by creation time and gives enough
 *     uniqueness for human-paced launches. Two near-simultaneous
 *     launches in the same millisecond would collide; the launcher
 *     guards against that by rejecting duplicate configIds at save
 *     time, but real users don't double-click within 1 ms.
 *
 * Singleton launches DO NOT use this helper — singleton instanceId
 * equals its templateId so all callers share one stable row. Only the
 * non-singleton path mints fresh ids.
 */
export function mintRegisteredInstanceId(
  userId: string,
  componentType: string,
  componentSubType: string,
): string {
  return `${userId}${componentType}-${componentSubType}-${Date.now()}`;
}
