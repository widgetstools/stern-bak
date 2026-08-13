/* eslint-disable @typescript-eslint/no-explicit-any */
declare const fin: any;
import {
  ColorSchemeOptionType,
  CustomActionCallerType,
  getCurrentSync,
  type CustomActionsMap,
} from '@openfin/workspace-platform';
import { type App } from '@openfin/workspace';
import type { ConfigManager } from '@wellsfargo-starui/core/host/config';
import {
  ACTION_EXPORT_CONFIG,
  ACTION_IMPORT_CONFIG,
  ACTION_LAUNCH_APP,
  ACTION_LAUNCH_COMPONENT,
  ACTION_OPEN_CONFIG_BROWSER,
  ACTION_OPEN_DATA_PROVIDERS,
  ACTION_OPEN_DOCK_EDITOR,
  ACTION_OPEN_REGISTRY_EDITOR,
  ACTION_OPEN_WORKSPACE_SETUP,
  ACTION_RELOAD_DOCK,
  ACTION_SHOW_DEVTOOLS,
  ACTION_INSPECT_SHARED_WORKER,
  ACTION_TOGGLE_PROVIDER,
  ACTION_TOGGLE_THEME,
  IAB_THEME_CHANGED,
  recolorDockIcons,
  reloadDockFromConfig,
} from '../dock';
import { launchApp, launchRegisteredComponent } from '../launch';
import { getPlatformDefaultScope } from '../db';
import { createRenameViewTabAction } from './viewTabRename';
import { openDataProvidersToolWindow } from '../openChildToolWindow.js';
import { buildPlatformChildUrl } from '../buildPlatformChildUrl.js';

export interface CustomActionDeps {
  /** Coalescing wrapper around the dark/light theme flip. */
  runThemeToggle: (continuation: (isDark: boolean) => Promise<void>) => Promise<void>;
  /** Open-or-foreground a child OpenFin window. */
  openChildWindow: (
    name: string,
    path: string,
    width: number,
    height: number,
    extraOptions?: Record<string, any>,
  ) => Promise<void>;
  /** Lazy lookup of the shared ConfigManager — module-level state in workspace.ts. */
  getConfigManager: () => ConfigManager | undefined;
  /** Gather all config rows and trigger a JSON download. */
  exportAllConfig: (cm: ConfigManager) => Promise<void>;
}

/**
 * Build the OpenFin platform's `customActions` map. Extracted verbatim from
 * `initializePlatform`'s inline literal so the platform initializer stays
 * focused on its `init({...})` orchestration.
 *
 * Each entry's `callerType` guard is preserved exactly — the actions only
 * run when invoked from a CustomButton or CustomDropdownItem (and certain
 * actions only one of those). The Dock3 `dockActionHandlers` map (still
 * in `workspace.ts`) mirrors most of these without the callerType guards.
 */
export function buildCustomActions(deps: CustomActionDeps): CustomActionsMap {
  const { runThemeToggle, openChildWindow, getConfigManager, exportAllConfig } = deps;

  return {
    // ── Rename the active view tab ("Save Tab As…") ──
    // Wired into the view-tab right-click menu via the platform override's
    // `openViewTabContextMenu`. Defined first so the spread below preserves
    // its key alongside every other action.
    ...createRenameViewTabAction(openChildWindow),

    // ── Launch an app from a dock button or dropdown menu item ──
    // Note: computed property syntax [CONSTANT] is used throughout so
    // the action IDs are defined once in dock.ts and shared here.
    [ACTION_LAUNCH_APP]: async (e): Promise<void> => {
      if (
        e.callerType === CustomActionCallerType.CustomButton ||
        e.callerType === CustomActionCallerType.CustomDropdownItem
      ) {
        await launchApp(e.customData as App);
      }
    },

    // ── Launch a registered component from a dock button / menu item ──
    // customData shape: { registryEntryId: string, asWindow?: boolean }
    // Resolves the id against the live registry on every click so
    // edits to the registry propagate immediately.
    [ACTION_LAUNCH_COMPONENT]: async (e): Promise<void> => {
      if (
        e.callerType !== CustomActionCallerType.CustomButton &&
        e.callerType !== CustomActionCallerType.CustomDropdownItem
      ) {
        return;
      }
      const cd = (e.customData ?? {}) as { registryEntryId?: string; asWindow?: boolean };
      if (!cd.registryEntryId) {
        console.warn(`[${ACTION_LAUNCH_COMPONENT}] missing registryEntryId in customData`);
        return;
      }
      await launchRegisteredComponent(cd.registryEntryId, { asWindow: cd.asWindow });
    },

    // ── Toggle between dark and light theme ──
    // This is the ACTIVE toggle path for the classic dock (dock2), whose
    // theme-toggle button dispatches here as a CustomButton. (The dock3
    // path handles the toggle INLINE in the Dock3Provider override's
    // `launchEntry()` and does NOT reach this handler.)
    //
    // `runThemeToggle` flips `[data-theme]` synchronously (so the provider
    // window's CSS updates immediately) and coalesces rapid re-entry.
    //
    // CRITICAL: fire `setSelectedScheme` WITHOUT awaiting. It dispatches over
    // the `__of_workspace_protocol__` channel which hangs in this setup —
    // awaiting it blocks the dock icon recolor and the IAB publish that our
    // content windows need to flip their theme (the exact failure that made
    // the classic toggle "not work like dock3"). The SDK still flips the dock
    // + chrome from the synchronous part of the dispatch. Mirrors the dock3
    // inline handler.
    [ACTION_TOGGLE_THEME]: async (e): Promise<void> => {
      if (e.callerType !== CustomActionCallerType.CustomButton) return;
      await runThemeToggle(async (isDark) => {
        const platform = getCurrentSync();
        const next = isDark ? ColorSchemeOptionType.Dark : ColorSchemeOptionType.Light;
        try {
          // Fire-and-forget — do NOT await (see note above).
          void platform.Theme.setSelectedScheme(next);
        } catch (schemeErr) {
          console.warn('setSelectedScheme failed:', schemeErr);
        }
        await recolorDockIcons(isDark);
        const themeStr = isDark ? 'dark' : 'light';
        try {
          // Publish both `theme` (current schema) and `isDark` (legacy) so
          // content windows on either reducer stay in sync — matches dock3.
          await fin.InterApplicationBus.publish(IAB_THEME_CHANGED, { theme: themeStr, isDark });
        } catch (iabErr) {
          console.warn('IAB publish failed:', iabErr);
        }
      });
    },

    // ── Open the dock editor window ──
    [ACTION_OPEN_DOCK_EDITOR]: async (e): Promise<void> => {
      if (
        e.callerType !== CustomActionCallerType.CustomButton &&
        e.callerType !== CustomActionCallerType.CustomDropdownItem
      ) {
        return;
      }

      // Forward the platform scope so the child window's db.ts default
      // matches the provider's — see Config Browser launcher below.
      // Without this, the child saves to (system, system) while the
      // provider's boot-time migrations relocate rows under the real
      // (appId, userId), and the next reload finds nothing.
      const scope = getPlatformDefaultScope();

      // Try to bring an existing editor window to the front
      try {
        const existingWindow = fin.Window.wrapSync({
          uuid: fin.me.identity.uuid,
          name: 'dock-editor',
        });
        await existingWindow.setAsForeground();
      } catch {
        // Window doesn't exist yet — create a new one
        const app = await fin.Application.getCurrent();
        const manifest: Record<string, unknown> = await app.getManifest();
        const platformConfig = manifest['platform'] as Record<string, string> | undefined;
        const providerUrl = platformConfig?.['providerUrl'] ?? '';

        // Build against the manifest providerUrl so path- and hash-routed
        // apps both resolve correctly (see buildPlatformChildUrl).
        const url = buildPlatformChildUrl(providerUrl, '/dock-editor');
        if (!url) {
          console.error('Could not determine app origin from providerUrl:', providerUrl);
          return;
        }

        const platform = getCurrentSync();
        await platform.createWindow({
          name: 'dock-editor',
          url,
          defaultWidth: 720,
          defaultHeight: 800,
          autoShow: true,
          frame: true,
          resizable: true,
          saveWindowState: true,
          contextMenu: true,
          customData: { appId: scope.appId, userId: scope.userId },
        });
      }
    },

    // ── Open the registry editor window ──
    [ACTION_OPEN_REGISTRY_EDITOR]: async (e): Promise<void> => {
      if (
        e.callerType !== CustomActionCallerType.CustomButton &&
        e.callerType !== CustomActionCallerType.CustomDropdownItem
      ) {
        return;
      }

      const scope = getPlatformDefaultScope();

      try {
        const existingWindow = fin.Window.wrapSync({
          uuid: fin.me.identity.uuid,
          name: 'registry-editor',
        });
        await existingWindow.setAsForeground();
      } catch {
        const app = await fin.Application.getCurrent();
        const manifest: Record<string, unknown> = await app.getManifest();
        const platformConfig = manifest['platform'] as Record<string, string> | undefined;
        const providerUrl = platformConfig?.['providerUrl'] ?? '';

        const url = buildPlatformChildUrl(providerUrl, '/registry-editor');
        if (!url) {
          console.error('Could not determine app origin from providerUrl:', providerUrl);
          return;
        }

        const platform = getCurrentSync();
        await platform.createWindow({
          name: 'registry-editor',
          url,
          defaultWidth: 800,
          defaultHeight: 700,
          autoShow: true,
          frame: true,
          resizable: true,
          saveWindowState: true,
          contextMenu: true,
          customData: { appId: scope.appId, userId: scope.userId },
        });
      }
    },

    // ── Open the unified Workspace Setup editor (Phase 6) ──
    // Wider than the standalone editors because it hosts 3 panes
    // side-by-side: Components (320) + Dock (~600) + Inspector (360).
    [ACTION_OPEN_WORKSPACE_SETUP]: async (e): Promise<void> => {
      if (
        e.callerType !== CustomActionCallerType.CustomButton &&
        e.callerType !== CustomActionCallerType.CustomDropdownItem
      ) {
        return;
      }
      const scope = getPlatformDefaultScope();
      await openChildWindow('workspace-setup', '/workspace-setup', 1280, 760, {
        customData: { appId: scope.appId, userId: scope.userId },
      });
    },

    // ── Open the DataProvider editor ──
    // Sized to comfortably fit the 4-tab provider configurator
    // (Connection / Fields / Columns / Behaviour). Forwards the
    // platform default scope as customData so the editor's
    // matching every other admin tool.
    [ACTION_OPEN_DATA_PROVIDERS]: async (e): Promise<void> => {
      if (
        e.callerType !== CustomActionCallerType.CustomButton &&
        e.callerType !== CustomActionCallerType.CustomDropdownItem
      ) {
        return;
      }
      await openDataProvidersToolWindow();
    },

    // ── Open the config browser window ──
    [ACTION_OPEN_CONFIG_BROWSER]: async (e): Promise<void> => {
      if (
        e.callerType !== CustomActionCallerType.CustomButton &&
        e.callerType !== CustomActionCallerType.CustomDropdownItem
      ) {
        return;
      }

      // Use the platform default scope (set during initWorkspace) so the
      // browser's appId chip matches the appId every other piece of the
      // platform writes under. Falls back to the OpenFin uuid if the
      // platform scope wasn't initialised — shouldn't happen in normal
      // boots but keeps the launcher robust.
      const scope = getPlatformDefaultScope();
      const appId = scope.appId || (() => {
        try { return fin.me.identity.uuid; } catch { return ''; }
      })();
      const userId = scope.userId;

      try {
        const existingWindow = fin.Window.wrapSync({
          uuid: fin.me.identity.uuid,
          name: 'config-browser',
        });
        await existingWindow.setAsForeground();
      } catch {
        const app = await fin.Application.getCurrent();
        const manifest: Record<string, unknown> = await app.getManifest();
        const platformConfig = manifest['platform'] as Record<string, string> | undefined;
        const providerUrl = platformConfig?.['providerUrl'] ?? '';

        const url = buildPlatformChildUrl(providerUrl, '/config-browser');
        if (!url) {
          console.error('Could not determine app origin from providerUrl:', providerUrl);
          return;
        }

        const platform = getCurrentSync();
        await platform.createWindow({
          name: 'config-browser',
          url,
          defaultWidth: 1100,
          defaultHeight: 720,
          autoShow: true,
          frame: true,
          resizable: true,
          saveWindowState: true,
          contextMenu: true,
          customData: { appId, userId },
        });
      }
    },

    // ── Reload the dock buttons from the saved config ──
    [ACTION_RELOAD_DOCK]: async (e): Promise<void> => {
      if (e.callerType !== CustomActionCallerType.CustomDropdownItem) {
        return;
      }
      console.log('Reloading dock...');
      try {
        await reloadDockFromConfig();
        console.log('Dock reloaded.');
      } catch (error) {
        console.error('Failed to reload dock.', error);
      }
    },

    // ── Open DevTools for the provider window ──
    [ACTION_SHOW_DEVTOOLS]: async (e): Promise<void> => {
      if (e.callerType !== CustomActionCallerType.CustomDropdownItem) {
        return;
      }
      try {
        const providerWindow = fin.Window.getCurrentSync();
        await providerWindow.showDeveloperTools();
      } catch (error) {
        console.error('Failed to open developer tools.', error);
      }
    },

    // ── Open Chromium DevTools scoped to the data-services SharedWorker ──
    //
    // OpenFin's `View.inspectSharedWorker()` is the only reliable way
    // to inspect a SharedWorker in the embedded runtime — chrome://
    // inspect's "Other → inspect" flow tries to fetch a DevTools
    // front-end revision from Google's CDN that often isn't cached
    // for OpenFin's Chromium builds (404). This action enumerates
    // every running view, tries each one until one of them has a
    // worker connected (the call throws otherwise), and pops the
    // bundled DevTools window. See docs/DEBUGGING_SHARED_WORKER.md.
    [ACTION_INSPECT_SHARED_WORKER]: async (e): Promise<void> => {
      if (e.callerType !== CustomActionCallerType.CustomDropdownItem) {
        return;
      }
      try {
        // Walk every view in the current app. `Application.getViews()`
        // is stable across the OpenFin versions we support (43+);
        // `fin.System.getAllViews()` only landed in newer runtimes.
        const app = fin.Application.getCurrentSync();
        const views: any[] = await app.getViews();
        if (!views.length) {
          console.warn(
            '[inspect-shared-worker] No views are open — open a window that uses ' +
            'the data plane (e.g. a MarketsGrid blotter) and try again.',
          );
          return;
        }
        let lastErr: unknown = null;
        for (const view of views) {
          try {
            await view.inspectSharedWorker();
            return; // first success wins
          } catch (err) {
            lastErr = err;
          }
        }
        console.error(
          '[inspect-shared-worker] No view has a SharedWorker connected. ' +
          'Open a blotter or another data-services consumer first.',
          lastErr,
        );
      } catch (error) {
        console.error('Failed to inspect shared worker.', error);
      }
    },

    // ── Export all config from IndexedDB as a JSON download ──
    [ACTION_EXPORT_CONFIG]: async (e): Promise<void> => {
      if (e.callerType !== CustomActionCallerType.CustomDropdownItem) {
        return;
      }
      try {
        const cm = getConfigManager();
        if (!cm) {
          console.error('ConfigManager not initialized.');
          return;
        }
        await exportAllConfig(cm);
      } catch (error) {
        console.error('Failed to export config.', error);
      }
    },

    // ── Open the import config window ──
    [ACTION_IMPORT_CONFIG]: async (e): Promise<void> => {
      if (e.callerType !== CustomActionCallerType.CustomDropdownItem) {
        return;
      }

      // Open a dedicated React window for the file picker — same pattern
      // as the dock editor. A hidden provider window cannot show a native
      // file picker dialog, so we host the UI in its own OpenFin window.
      try {
        const existingWindow = fin.Window.wrapSync({
          uuid: fin.me.identity.uuid,
          name: 'import-config',
        });
        await existingWindow.setAsForeground();
      } catch {
        // Window doesn't exist yet — create it
        const app = await fin.Application.getCurrent();
        const manifest: Record<string, unknown> = await app.getManifest();
        const platformConfig = manifest['platform'] as Record<string, string> | undefined;
        const providerUrl = platformConfig?.['providerUrl'] ?? '';

        const url = buildPlatformChildUrl(providerUrl, '/import-config');
        if (!url) {
          console.error('Could not determine app origin from providerUrl:', providerUrl);
          return;
        }

        const platform = getCurrentSync();
        await platform.createWindow({
          name: 'import-config',
          url,
          defaultWidth: 400,
          defaultHeight: 320,
          autoShow: true,
          frame: true,
          resizable: false,
          saveWindowState: false,
          contextMenu: false,
        });
      }
    },

    // ── Toggle the provider window visibility ──
    [ACTION_TOGGLE_PROVIDER]: async (e): Promise<void> => {
      if (e.callerType !== CustomActionCallerType.CustomDropdownItem) {
        return;
      }
      try {
        const providerWindow = fin.Window.getCurrentSync();
        const isVisible = await providerWindow.isShowing();

        if (isVisible) {
          await providerWindow.hide();
          console.log('Provider window hidden.');
        } else {
          await providerWindow.show();
          console.log('Provider window shown.');
        }
      } catch (error) {
        console.error('Failed to toggle provider window.', error);
      }
    },
  };
}
