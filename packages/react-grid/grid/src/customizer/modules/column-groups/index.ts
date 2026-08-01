/**
 * Column Groups — user-authored nestable column groups rendered via
 * AG-Grid's `ColGroupDef`.
 *
 * Priority 18 — runs AFTER column-customization (10) + calculated-columns
 * (15) so groups see finalized per-col renames AND include virtual columns
 * in their children. Runs BEFORE conditional-styling (20) so rules can
 * target grouped columns.
 *
 * Runtime expand/collapse state is captured via AG-Grid's
 * `columnGroupOpened` event and persisted into `openGroupIds`; the next
 * render applies it as `ColGroupDef.openByDefault`, so reloading the app
 * restores the exact layout the user left.
 */
import type { Module, PlatformHandle } from '@wellsfargo-starui/core';
import {
  isColumnGroupsState,
  type ColumnGroupNode,
  type ColumnGroupsState,
} from './state';
import {
  collectGroupIds,
  composeGroups,
  groupHeaderBorderOverlayCSS,
  groupHeaderStyleToCSS,
  hasHeaderBorders,
  hasHeaderStyle,
} from './composeGroups';
import type { CssHandle } from '@wellsfargo-starui/core';
import { cssEscapeColId } from '../column-customization/transforms';
import {
  ColumnGroupsEditor,
  ColumnGroupsList,
  ColumnGroupsPanel,
} from './ColumnGroupsPanel';

export const COLUMN_GROUPS_MODULE_ID = 'column-groups';

/**
 * Walk the authored tree and inject a rule per styled group header. Unstyled
 * groups skip CSS emission entirely so they render at theme default.
 */
function reinjectHeaderCSS(css: CssHandle, groups: ColumnGroupNode[]): void {
  css.clear();
  const visit = (node: ColumnGroupNode) => {
    if (hasHeaderStyle(node.headerStyle)) {
      const body = groupHeaderStyleToCSS(node.headerStyle);
      // Selector and the headerClass on the DOM (set in composeGroups)
      // both go through cssEscapeColId — they always match regardless
      // of the groupId's shape.
      const safeId = cssEscapeColId(node.groupId);
      const cls = `ds-hdr-grp-${safeId}`;
      if (body) {
        // Target both the header cell AND the inner label container so
        // background + color reach the right element (AG-Grid renders the
        // label inside an inner span; `color` applies there).
        const rule = `.${cls}, .${cls} .ag-header-group-cell-label { ${body} }`;
        css.addRule(`grp-${node.groupId}`, rule);
      }
      // Border overlay as its own rule so the pseudo-element's
      // `position: absolute` doesn't fight the body declarations.
      if (hasHeaderBorders(node.headerStyle)) {
        const border = groupHeaderBorderOverlayCSS(`.${cls}`, node.headerStyle);
        if (border) css.addRule(`grp-border-${node.groupId}`, border);
      }
    }
    for (const c of node.children) {
      if (c.kind === 'group') visit(c.group);
    }
  };
  for (const g of groups) visit(g);
}

export const columnGroupsModule: Module<ColumnGroupsState> = {
  id: COLUMN_GROUPS_MODULE_ID,
  name: 'Column Groups',
  code: '02',
  schemaVersion: 1,
  priority: 18,

  getInitialState: () => ({ groups: [], openGroupIds: {} }),

  /**
   * Wires the `columnGroupOpened` → store write. v2 split this across
   * onRegister (stash setModuleState) + onGridReady (attach listener) +
   * onGridDestroy (detach). The v3 `activate(platform)` single-shot lets
   * us close over `platform.setState` directly.
   */
  activate(platform: PlatformHandle<ColumnGroupsState>): () => void {
    // AG-Grid's `columnGroupOpened` event payload shape — defensive types.
    interface GroupOpenedEvent {
      columnGroup?: {
        getGroupId?: () => string | undefined;
        isExpanded?: () => boolean;
        getProvidedColumnGroup?: () => { isExpanded?: () => boolean } | null;
      };
    }

    // ApiHub.on currently dispatches with no payload — we need to read the
    // event via the raw api. Subscribe directly via the typed GridApi.
    let detach: (() => void) | null = null;
    type LiveApi = NonNullable<typeof platform.api.api>;
    const attach = (api: LiveApi) => {
      const handler = (e: unknown) => {
        const evt = e as GroupOpenedEvent | null;
        const cg = evt?.columnGroup;
        if (!cg) return;
        const id = cg.getGroupId?.();
        const isOpen = cg.isExpanded?.() ?? cg.getProvidedColumnGroup?.()?.isExpanded?.();
        if (!id || typeof isOpen !== 'boolean') return;

        platform.setState((prev) => {
          if (prev.openGroupIds[id] === isOpen) return prev;
          return { ...prev, openGroupIds: { ...prev.openGroupIds, [id]: isOpen } };
        });
      };
      api.addEventListener('columnGroupOpened', handler);
      detach = () => {
        try {
          api.removeEventListener('columnGroupOpened', handler);
        } catch { /* api teardown race */ }
      };
    };

    const readyDisposer = platform.api.onReady((api) => {
      attach(api as LiveApi);
    });

    return () => {
      readyDisposer();
      detach?.();
    };
  },

  transformColumnDefs(defs, state, ctx) {
    // Keep the <style> tag in lockstep with the tree on every transform pass.
    const css = ctx.resources.css(COLUMN_GROUPS_MODULE_ID);
    reinjectHeaderCSS(css, state.groups);
    if (state.groups.length === 0) return defs;
    return composeGroups(defs, state.groups, state.openGroupIds);
  },

  serialize: (state) => state,

  deserialize: (raw) => {
    if (!isColumnGroupsState(raw)) return { groups: [], openGroupIds: {} };
    // Prune stale `openGroupIds` entries whose groupId no longer exists —
    // stops IndexedDB from accumulating orphaned entries across rename /
    // delete cycles.
    const valid = collectGroupIds(raw.groups);
    const openGroupIds: Record<string, boolean> = {};
    for (const [id, open] of Object.entries(raw.openGroupIds)) {
      if (valid.has(id) && typeof open === 'boolean') openGroupIds[id] = open;
    }
    return { groups: raw.groups, openGroupIds };
  },

  // v4: native master-detail slots — the settings sheet renders these
  // directly instead of falling back to the flat `SettingsPanel` wrapper.
  ListPane: ColumnGroupsList,
  EditorPane: ColumnGroupsEditor,
  SettingsPanel: ColumnGroupsPanel,
};

export { INITIAL_COLUMN_GROUPS } from './state';
export type {
  ColumnGroupsState,
  ColumnGroupNode,
  ColumnGroupChild,
  GroupChildShow,
  GroupHeaderStyle,
  GroupHeaderBorderSpec,
} from './state';
export { composeGroups, collectGroupIds, collectAssignedColIds } from './composeGroups';
