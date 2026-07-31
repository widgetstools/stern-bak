/* eslint-disable @typescript-eslint/no-explicit-any */
declare const fin: any;

/**
 * Shared "Save Tab As…" wiring for the OpenFin view-tab context menu.
 *
 * Both the base platform (workspace.ts) and the Star shell (bootstrap.ts)
 * register their own WorkspacePlatformOverrideCallback. Both also register
 * their own customActions map. To avoid duplicating the rename plumbing in
 * two places, the menu-template injection helper and the action handler
 * factory live here, and each override callback / actions map imports them.
 */

import {
  CustomActionCallerType,
  ViewTabMenuOptionType,
  type CustomActionsMap,
  type OpenViewTabContextMenuPayload,
  type ViewTabCustomActionPayload,
} from '@openfin/workspace-platform';

/** Custom action id wired into the view-tab context menu's "Save Tab As…" entry. */
export const ACTION_RENAME_VIEW_TAB = 'rename-view-tab';

/** OpenFin window name used by the rename popout — kept in one place so the
 *  customAction handler and the React route both refer to the same identity. */
export const RENAME_VIEW_TAB_WINDOW_NAME = 'rename-view-tab';

/**
 * Insert a "Save Tab As…" entry at the top of the view-tab context menu
 * template. Only injected when exactly one view is selected — multi-select
 * rename has no clear semantics and OpenFin's own per-view actions follow
 * the same rule.
 */
export function injectRenameMenuItem(
  payload: OpenViewTabContextMenuPayload,
): OpenViewTabContextMenuPayload {
  if (payload.selectedViews.length !== 1) return payload;
  return {
    ...payload,
    template: [
      {
        label: 'Save Tab As…',
        data: {
          type: ViewTabMenuOptionType.Custom,
          action: { id: ACTION_RENAME_VIEW_TAB },
        },
      },
      ...payload.template,
    ],
  };
}

/**
 * Build a CustomActionsMap entry for `ACTION_RENAME_VIEW_TAB`.
 *
 * The handler reads the selected view's current title (so the prompt seeds
 * with what the user already sees on the tab), then opens the rename popout
 * window via the shared `openChildWindow` helper. The popout reads its
 * customData via `fin.me.getOptions()` and on confirm runs
 * `executeJavaScript('document.title = "...";')` against the target view.
 * Default `titlePriority` is `'document'`, so the workspace tabstrip mirrors
 * the new title via the platform's `view-page-title-updated` event.
 *
 * `View.updateOptions({ title })` is intentionally NOT used: `title` lives
 * on the create-time `ViewOptions` shape, not on `MutableViewOptions` /
 * `UpdatableViewOptions`, so the call is silently dropped at runtime.
 */
export function createRenameViewTabAction(
  openChildWindow: (
    name: string,
    path: string,
    width: number,
    height: number,
    extraOptions?: Record<string, any>,
  ) => Promise<void>,
): CustomActionsMap {
  return {
    [ACTION_RENAME_VIEW_TAB]: async (e): Promise<void> => {
      if (e.callerType !== CustomActionCallerType.ViewTabContextMenu) return;
      const payload = e as ViewTabCustomActionPayload;
      const target = payload.selectedViews?.[0];
      if (!target) return;

      const view = fin.View.wrapSync(target);

      // Seed the prompt with what the user actually sees on the tab.
      // The tabstrip resolves through `document.title` first (default
      // `titlePriority: 'document'`), so prefer that. Fall back to the
      // create-time options.title only when document.title is empty
      // (e.g. the page hasn't set one). The view name is intentionally
      // skipped — `internal-generated-view-…` is never a useful seed.
      let currentTitle = '';
      try {
        const docTitle = await view.executeJavaScript('document.title');
        if (typeof docTitle === 'string') currentTitle = docTitle;
      } catch { /* best-effort */ }
      if (!currentTitle) {
        try {
          const opts = await view.getOptions();
          const t = opts?.title as string | undefined;
          if (t && !t.startsWith('internal-generated-')) currentTitle = t;
        } catch { /* best-effort */ }
      }

      // Center the popout over the parent browser window so it appears
      // anchored to the tab the user just right-clicked, not stranded in
      // the middle of the screen.
      const popupW = 380;
      const popupH = 140;
      let position: { defaultLeft?: number; defaultTop?: number; defaultCentered?: boolean } = {
        defaultCentered: true,
      };
      try {
        const parent = fin.Window.wrapSync(payload.windowIdentity);
        const bounds = await parent.getBounds();
        position = {
          defaultCentered: false,
          defaultLeft: Math.round(bounds.left + (bounds.width - popupW) / 2),
          defaultTop: Math.round(bounds.top + (bounds.height - popupH) / 2),
        };
      } catch { /* fall back to screen-centered */ }

      await openChildWindow(
        RENAME_VIEW_TAB_WINDOW_NAME,
        '/rename-view-tab',
        popupW,
        popupH,
        {
          frame: false,
          resizable: false,
          maximizable: false,
          minimizable: false,
          alwaysOnTop: true,
          saveWindowState: false,
          contextMenu: false,
          ...position,
          customData: {
            view: { uuid: target.uuid, name: target.name },
            currentTitle,
          },
        },
      );
    },
  };
}
