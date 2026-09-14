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
 *   - `asWindow`       — default host surface: standalone OpenFin platform
 *                        window (true) vs. a view docked into the
 *                        Workspace browser window (false)
 *
 * Persisted v1 data is upgraded by `migrateRegistryV1ToV2()` in
 * `./registryMigrate.ts` on read — no consumer sees a v1 entry.
 * `asWindow` was added after v2 was cut; `fillMissingV2Fields()` in the
 * same module defaults it to `false` for any pre-existing v2 record
 * that predates the field, so no version bump was needed.
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

  /** Default host surface:
   *   true  = opens as its own standalone OpenFin platform window
   *   false = opens as a view docked into the OpenFin Workspace
   *           browser window (default)
   *  Seeds the `asWindow` customData when the component is added to
   *  the dock (a one-time snapshot, same as iconId/tooltip) — each
   *  dock placement can still be overridden independently afterward. */
  asWindow: boolean;
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
 * Every launch of the component — a dock button, a menu item, the
 * registry editor's test launch — runs on this row: the view's
 * `instanceId` IS the template id, so all instances share the
 * template's profiles and provider selection and no per-instance rows
 * exist. Per-view state (the active profile, the tab title) rides on
 * the view's `customData`, which workspace snapshots round-trip.
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
 * non-singleton distinction is not encoded in the configId — BOTH
 * cases use `${componentType}-${componentSubType}` lowercase, and
 * every instance runs on that one row; singleton only changes whether
 * a second launch focuses the existing instance or opens another.
 */
export function deriveSingletonConfigId(componentType: string, componentSubType: string): string {
  return deriveTemplateConfigId(componentType, componentSubType);
}
