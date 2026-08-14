import type { App } from "@openfin/workspace";

export interface CustomSettings {
  apps?: App[];

  /**
   * Which dock implementation to use.
   *
   * - `"dock2"` (default) — the classic `Dock.register` API. Top-level
   *   DropdownButtons render directly on the dock bar as icon dropdowns
   *   whose options carry their own icons, with a normal flyout (no
   *   two-column content-menu panel).
   * - `"dock3"` — the newer `Dock.init` content-menu API. Top-level
   *   groups surface their icon via dock-bar favorites folders linked by
   *   id to a two-column content menu.
   *
   * Both paths read the same dock config from ConfigService; only the
   * OpenFin registration + rendering differ.
   */
  dockVersion?: "dock2" | "dock3";

  /**
   * Platform deployment id — drives SharedWorker name
   * `mkt-data-services:${appId}`. Must be stable across every view.
   * Dev/demo: set in manifest `customSettings`. Production: one value
   * per deployed platform manifest.
   */
  appId?: string;

  /**
   * Signed-in session user for AppData, profiles, and private provider
   * rows. Dev/demo: pin in manifest (e.g. `dev1`). Production: prefer
   * SSO at platform start, then forward via `customData` on child spawns.
   */
  userId?: string;

  /**
   * URL to a JSON file containing seed data for first-run initialization.
   * When the config service database is empty, this file is fetched and
   * its contents are used to populate APP_REGISTRY, USER_PROFILE, and ROLES.
   *
   * Example: "http://localhost:5174/seed-config.json"
   */
  seedConfigUrl?: string;

  /**
   * When to re-apply `seedConfigUrl` on platform boot. Default `empty-only`.
   * Dev: `when-changed` re-seeds after a Config Browser rocket export is
   * copied to `seed.json` and the page reloads.
   */
  seedConfigReload?: 'empty-only' | 'when-changed';

  /**
   * Base URL of the remote config service REST API.
   * Only honoured when `useRest === true` — see `useRest` for the
   * intended on/off switch. Keeping the URL configured (but disabled)
   * lets a single manifest flip between local and REST mode by toggling
   * one boolean instead of editing two fields.
   *
   * Example: "https://config-api.example.com/api/v1"
   */
  configServiceRestUrl?: string;

  /**
   * Master switch for REST mode. When `true` AND
   * `configServiceRestUrl` is non-empty, every ConfigManager in this
   * platform (Provider window + view-route ConfigServiceProviders +
   * any future child window that reads the manifest) runs in REST
   * mode: writes go to the server first, mirror to Dexie, queue
   * `pendingSync` on transient failures.
   *
   * When `false` or unset, everything stays local — Dexie only — even
   * if `configServiceRestUrl` is configured. Default is `false` so an
   * accidentally-shipped URL doesn't silently start hitting a server.
   */
  useRest?: boolean;
}

export interface PlatformSettings {
  id: string;
  title: string;
  icon: string;
}

export interface WorkspaceConfig {
  /** Theme palette override */
  theme?: {
    brandPrimary?: string;
    brandSecondary?: string;
    backgroundPrimary?: string;
  };
  /** Which components to enable. Dock + notifications default on; Home + Store default OFF (opt-in). */
  components?: {
    home?: boolean;
    store?: boolean;
    dock?: boolean;
    notifications?: boolean;
  };
  /** Override the dock provider icon (must be raster: PNG/ICO) */
  dockIcon?: string;
  /**
   * Dock customization.
   */
  dock?: {
    /**
     * Action IDs of built-in Tools-menu items to hide from the dock.
     * Defaults to none — every built-in tool is shown (devtools entries
     * additionally gate on {@link WorkspaceConfig.devTools}). The IDs
     * match the `ACTION_*` constants exported by this package, e.g.
     * `ACTION_EXPORT_CONFIG === "export-config"`. Applies to both the
     * classic (dock2) Tools dropdown and the dock3 content menu.
     *
     * @example
     * ```typescript
     * initWorkspace({ dock: { excludeTools: ["export-config"] } });
     * ```
     */
    excludeTools?: string[];
  };
  /**
   * Icon shown on the theme toggle dock button when the app is in dark mode
   * (clicking it will switch to light). Typically a sun icon.
   * If set, adds a toggle button to the dock.
   */
  themeToggleDarkIcon?: string;

  /**
   * Icon shown on the theme toggle dock button when the app is in light mode
   * (clicking it will switch to dark). Typically a moon icon.
   * If set alongside themeToggleDarkIcon, the dock swaps icons on theme change.
   */
  themeToggleLightIcon?: string;
  /** Progress callback for UI status updates */
  onProgress?: (message: string) => void;
  /**
   * How the shared ConfigManager is resolved (see `ensureConfigService`):
   * `'auto'` (default) adopts a prewired manager or constructs + seeds one
   * from manifest customSettings; `'require-prewired'` throws loudly when
   * the host app didn't install one first — for apps that own their
   * bootstrap and want silent construction to be impossible.
   */
  configService?: 'auto' | 'require-prewired';
  /**
   * Run the idempotent persisted-state scope migrations at init
   * (see `runPlatformScopeMigrations`). Default `true` — existing
   * installs depend on them to keep pre-platform rows reachable. Set
   * `false` only for a brand-new deployment with nothing to heal.
   */
  migrations?: boolean;
  /**
   * Show the devtools Tools-menu entries (Developer Tools, Inspect
   * Shared Worker, Show/Hide Provider) on the dock. Default: shown in a
   * dev bundle (`import.meta.env.DEV`), hidden otherwise. The action
   * handlers stay registered either way — this only gates the menus.
   */
  devTools?: boolean;

  /**
   * App-level custom action handlers for dock buttons.
   *
   * The key is the action ID string you assign to a dock button or menu item
   * in the dock editor (the "Action ID" field). When a user clicks that button,
   * OpenFin calls the matching handler.
   *
   * Built-in action IDs (launch-app, toggle-theme, launch-component, etc.) are
   * always registered automatically — you do not need to re-register them here.
   * Any IDs provided here are merged alongside the built-in ones; on an id
   * collision the app-supplied handler wins.
   *
   * @example
   * ```typescript
   * initWorkspace({
   *   customActions: {
   *     "open-blotter": async (e) => {
   *       // e.callerType is "CustomButton" or "CustomDropdownItem"
   *       // e.customData contains any data you stored on the button
   *       await fin.Application.startFromManifest("http://localhost:5174/blotter.fin.json");
   *     },
   *   },
   * });
   * ```
   */
  customActions?: Record<string, (e: { callerType: string; customData?: unknown }) => Promise<void>>;
}
