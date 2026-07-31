/**
 * IAB topic names + action ID constants used across the openfin-platform
 * + its consumers (dock-editor, registry-editor, config-browser).
 *
 * Lives in a standalone file (not dock.ts) because dock.ts imports
 * `@openfin/workspace-platform` at the module top level, which throws
 * at module-eval time in plain-browser contexts. Consumers that only
 * need the constant strings (dock-editor's ImportConfig panel, for
 * example) import from this file (directly or via the `/config`
 * subpath) to avoid pulling workspace-platform into their bundle.
 *
 * dock.ts re-exports these for back-compat with consumers that still
 * import via the main barrel.
 */

// ─── IAB topic names ────────────────────────────────────────────────
export const IAB_DOCK_CONFIG_UPDATE = "dock-config-update";
export const IAB_RELOAD_AFTER_IMPORT = "reload-dock-after-import";
export const IAB_THEME_CHANGED = "theme-changed";
export const IAB_REGISTRY_CONFIG_UPDATE = "registry-config-update";

// ─── Action ID constants ─────────────────────────────────────────────
export const ACTION_LAUNCH_APP           = "launch-app";
export const ACTION_TOGGLE_THEME         = "toggle-theme";
export const ACTION_OPEN_DOCK_EDITOR     = "open-dock-editor";
export const ACTION_RELOAD_DOCK          = "reload-dock";
export const ACTION_SHOW_DEVTOOLS        = "show-devtools";
/**
 * Dock action to open Chromium DevTools scoped to the data-services
 * SharedWorker. Iterates through Application.getViews() and calls
 * `view.inspectSharedWorker()` on the first one that has a worker
 * attached — useful because the standalone `chrome://inspect`
 * "Other → inspect" path 404s in OpenFin runtimes whose Chromium
 * revision isn't cached at chrome-devtools-frontend.appspot.com.
 */
export const ACTION_INSPECT_SHARED_WORKER = "inspect-shared-worker";
export const ACTION_EXPORT_CONFIG        = "export-config";
export const ACTION_IMPORT_CONFIG        = "import-config";
export const ACTION_TOGGLE_PROVIDER      = "toggle-provider-window";
export const ACTION_OPEN_REGISTRY_EDITOR = "open-registry-editor";
export const ACTION_OPEN_CONFIG_BROWSER  = "open-config-browser";
/**
 * Dock action to open the unified Workspace Setup editor — Phase 6
 * supersedes the standalone Dock Editor + Registry Editor with one
 * three-pane editor (Components / Dock / Inspector). The standalone
 * editors remain available for now; both surfaces edit the same
 * underlying ConfigService rows.
 */
export const ACTION_OPEN_WORKSPACE_SETUP = "open-workspace-setup";
/**
 * Dock action to open the DataProvider editor — the authoring surface
 * for STOMP / REST / Mock / AppData providers that any blotter in the
 * platform can later bind to via <DataProviderSelector>. Same scope
 * + customData plumbing as the other admin tools.
 */
export const ACTION_OPEN_DATA_PROVIDERS  = "open-data-providers";
/**
 * Dock button / menu item action: launch a component registered in
 * the Component Registry. `customData` shape:
 *   { registryEntryId: string, asWindow?: boolean }
 *
 * The handler (registered in workspace.ts) resolves the live registry
 * entry by id at click-time, so updates to the registry (hostUrl /
 * configId / appId / etc.) propagate immediately to every dock item
 * that references the id. Missing ids are handled gracefully — a
 * user-visible notification, no hard failure.
 */
export const ACTION_LAUNCH_COMPONENT     = "launch-component";
