/**
 * Toolbar Visibility — tracks which optional toolbars (Filters, Style, etc.)
 * the user has shown in the host app.
 *
 * Hidden module — no SettingsPanel, never appears in the settings nav.
 * Lives in the per-profile snapshot so toolbar layout round-trips cleanly
 * across profile load / save.
 *
 * Missing keys in `visible` mean "use the host's default" — we deliberately
 * do NOT seed `false` for unknown toolbars so a host that adds a new
 * toolbar id later doesn't have to migrate every old profile.
 */
import type { Module } from '@wellsfargo-starui/core';

export const TOOLBAR_VISIBILITY_MODULE_ID = 'toolbar-visibility';

export interface ToolbarVisibilityState {
  /** Toolbar id → visible. Missing key = host default. */
  visible: Record<string, boolean>;
}

export const INITIAL_TOOLBAR_VISIBILITY: ToolbarVisibilityState = { visible: {} };

export const toolbarVisibilityModule: Module<ToolbarVisibilityState> = {
  id: TOOLBAR_VISIBILITY_MODULE_ID,
  name: 'Toolbar Visibility',
  category: 'options',
  schemaVersion: 1,
  priority: 1000,

  getInitialState: () => ({ visible: {} }),

  serialize: (state) => state,

  deserialize: (raw) => {
    if (!raw || typeof raw !== 'object') return { visible: {} };
    const d = raw as Partial<ToolbarVisibilityState>;
    if (!d.visible || typeof d.visible !== 'object' || Array.isArray(d.visible)) {
      return { visible: {} };
    }
    // Drop non-boolean values so a stray `null` / string can't poison render.
    const visible: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(d.visible)) {
      if (typeof v === 'boolean') visible[k] = v;
    }
    return { visible };
  },
};
