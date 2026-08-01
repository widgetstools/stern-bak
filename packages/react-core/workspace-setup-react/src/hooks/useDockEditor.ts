/* eslint-disable @typescript-eslint/no-explicit-any */
declare const fin: any; // OpenFin global — available at runtime in OpenFin windows

import { useReducer, useEffect, useCallback, useRef, useState } from "react";
// /config subpath — avoids pulling @openfin/workspace-platform at
// module-eval time. The dock-editor renders in a browser window (not
// always inside OpenFin) so the main barrel's side effects break here.
import {
  loadDockConfig,
  saveDockConfig,
  clearDockConfig,
  loadRegistryConfig,
  IAB_DOCK_CONFIG_UPDATE,
  IAB_REGISTRY_CONFIG_UPDATE,
  type ConfigScope,
  type DockEditorConfig,
  type DockButtonConfig,
  type DockDropdownButtonConfig,
  type DockMenuItemConfig,
  type RegistryEditorConfig,
  type RegistryEntry,
} from "@wellsfargo-starui/openfin/config";

/**
 * Options for `useDockEditor()`.
 *
 * `scope` — optional (appId, userId) pair that gets threaded through
 * to `saveDockConfig` / `loadDockConfig` / `clearDockConfig`. When
 * omitted the config persists as the historical global singleton
 * (appId='system', userId='system') — matching pre-refactor
 * behaviour so existing call-sites keep working.
 *
 * Host apps that want per-user or per-app dock layouts pass real
 * identifiers; the underlying ConfigService uses them to compose a
 * scoped `configId`, making the row appear in the Config Browser
 * alongside MarketsGrid profile-set rows owned by the same user.
 */
export interface UseDockEditorOptions {
  scope?: ConfigScope;
}

// ─── Action Types ────────────────────────────────────────────────────

type EditorAction =
  | { type: "SET_BUTTONS"; buttons: DockButtonConfig[] }
  | { type: "ADD_BUTTON"; button: DockButtonConfig }
  | { type: "UPDATE_BUTTON"; id: string; button: DockButtonConfig }
  | { type: "REMOVE_BUTTON"; id: string }
  | { type: "REORDER_BUTTONS"; fromIndex: number; toIndex: number }
  | { type: "ADD_MENU_ITEM"; buttonId: string; item: DockMenuItemConfig; parentItemId?: string }
  | { type: "UPDATE_MENU_ITEM"; buttonId: string; itemId: string; item: DockMenuItemConfig; parentItemId?: string }
  | { type: "REMOVE_MENU_ITEM"; buttonId: string; itemId: string; parentItemId?: string }
  | { type: "REORDER_MENU_ITEMS"; buttonId: string; fromIndex: number; toIndex: number; parentItemId?: string }
  | { type: "SET_DIRTY"; dirty: boolean }
  | { type: "SET_LOADING"; loading: boolean };

// ─── State ───────────────────────────────────────────────────────────

interface EditorState {
  buttons: DockButtonConfig[];
  isDirty: boolean;
  isLoading: boolean;
}

const initialState: EditorState = {
  buttons: [],
  isDirty: false,
  isLoading: true,
};

// ─── Helpers ─────────────────────────────────────────────────────────

function reorder<T>(list: T[], fromIndex: number, toIndex: number): T[] {
  const result = [...list];
  const [removed] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, removed);
  return result;
}

function updateMenuItemsRecursive(
  items: DockMenuItemConfig[],
  targetId: string,
  updater: (items: DockMenuItemConfig[]) => DockMenuItemConfig[],
  parentItemId?: string,
): DockMenuItemConfig[] {
  if (!parentItemId) {
    return updater(items);
  }
  return items.map((item) => {
    if (item.id === parentItemId) {
      return { ...item, options: updater(item.options ?? []) };
    }
    if (item.options?.length) {
      return {
        ...item,
        options: updateMenuItemsRecursive(item.options, targetId, updater, parentItemId),
      };
    }
    return item;
  });
}

// ─── Reducer ─────────────────────────────────────────────────────────

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "SET_BUTTONS":
      return { ...state, buttons: action.buttons, isDirty: false, isLoading: false };

    case "ADD_BUTTON":
      return { ...state, buttons: [...state.buttons, action.button], isDirty: true };

    case "UPDATE_BUTTON":
      return {
        ...state,
        buttons: state.buttons.map((b) => (b.id === action.id ? action.button : b)),
        isDirty: true,
      };

    case "REMOVE_BUTTON":
      return {
        ...state,
        buttons: state.buttons.filter((b) => b.id !== action.id),
        isDirty: true,
      };

    case "REORDER_BUTTONS":
      return {
        ...state,
        buttons: reorder(state.buttons, action.fromIndex, action.toIndex),
        isDirty: true,
      };

    case "ADD_MENU_ITEM": {
      return {
        ...state,
        buttons: state.buttons.map((b) => {
          if (b.id !== action.buttonId || b.type !== "DropdownButton") return b;
          const dropdown = b as DockDropdownButtonConfig;
          const newOptions = action.parentItemId
            ? updateMenuItemsRecursive(
                dropdown.options,
                action.item.id,
                (items) => [...items, action.item],
                action.parentItemId,
              )
            : [...dropdown.options, action.item];
          return { ...dropdown, options: newOptions };
        }),
        isDirty: true,
      };
    }

    case "UPDATE_MENU_ITEM": {
      return {
        ...state,
        buttons: state.buttons.map((b) => {
          if (b.id !== action.buttonId || b.type !== "DropdownButton") return b;
          const dropdown = b as DockDropdownButtonConfig;
          const updater = (items: DockMenuItemConfig[]) =>
            items.map((i) => (i.id === action.itemId ? action.item : i));
          const newOptions = action.parentItemId
            ? updateMenuItemsRecursive(dropdown.options, action.itemId, updater, action.parentItemId)
            : updater(dropdown.options);
          return { ...dropdown, options: newOptions };
        }),
        isDirty: true,
      };
    }

    case "REMOVE_MENU_ITEM": {
      return {
        ...state,
        buttons: state.buttons.map((b) => {
          if (b.id !== action.buttonId || b.type !== "DropdownButton") return b;
          const dropdown = b as DockDropdownButtonConfig;
          const updater = (items: DockMenuItemConfig[]) =>
            items.filter((i) => i.id !== action.itemId);
          const newOptions = action.parentItemId
            ? updateMenuItemsRecursive(dropdown.options, action.itemId, updater, action.parentItemId)
            : updater(dropdown.options);
          return { ...dropdown, options: newOptions };
        }),
        isDirty: true,
      };
    }

    case "REORDER_MENU_ITEMS": {
      return {
        ...state,
        buttons: state.buttons.map((b) => {
          if (b.id !== action.buttonId || b.type !== "DropdownButton") return b;
          const dropdown = b as DockDropdownButtonConfig;
          const updater = (items: DockMenuItemConfig[]) =>
            reorder(items, action.fromIndex, action.toIndex);
          const newOptions = action.parentItemId
            ? updateMenuItemsRecursive(dropdown.options, "", updater, action.parentItemId)
            : updater(dropdown.options);
          return { ...dropdown, options: newOptions };
        }),
        isDirty: true,
      };
    }

    case "SET_DIRTY":
      return { ...state, isDirty: action.dirty };

    case "SET_LOADING":
      return { ...state, isLoading: action.loading };

    default:
      return state;
  }
}

// ─── Hook ────────────────────────────────────────────────────────────

export interface UseDockEditorReturn {
  /** Current button definitions */
  buttons: DockButtonConfig[];
  /** Whether there are unsaved changes */
  isDirty: boolean;
  /** Whether initial load is in progress */
  isLoading: boolean;
  /** Dispatch raw actions */
  dispatch: React.Dispatch<EditorAction>;
  /** Save current config to IndexedDB and notify the dock */
  save: () => Promise<void>;
  /**
   * Re-load buttons from storage and clear the dirty flag. The "Discard
   * unsaved changes" path — does NOT touch IndexedDB.
   */
  reload: () => Promise<void>;
  /**
   * DESTRUCTIVE: clear the persisted dock config entirely and notify the
   * live dock to revert to defaults. Intended for admin flows; do not
   * wire to a Discard button. See `reload()`.
   */
  reset: () => Promise<void>;
  /** Publish current config to dock for live preview without saving */
  preview: () => Promise<void>;
  /**
   * Live list of Component-Registry entries. Populated on mount from
   * `loadRegistryConfig()` and refreshed whenever the registry-editor
   * publishes `IAB_REGISTRY_CONFIG_UPDATE`. Consumed by the menu-item
   * form to render the "Launch registered component" dropdown.
   */
  registryEntries: RegistryEntry[];
}

// Version number embedded in every saved config.
// If the config format ever changes in a breaking way, bump this number
// so old configs can be migrated or ignored.
const CONFIG_VERSION = 1;

export function useDockEditor(opts: UseDockEditorOptions = {}): UseDockEditorReturn {
  const scope = opts.scope;
  const [state, dispatch] = useReducer(editorReducer, initialState);
  const [registryEntries, setRegistryEntries] = useState<RegistryEntry[]>([]);

  // stateRef gives useCallback functions access to the latest state
  // without listing `state` as a dependency (which would recreate every
  // callback on every render). This is a standard React pattern for
  // "reading current state inside a stable callback".
  const stateRef = useRef(state);
  stateRef.current = state;

  // ── Component Registry ──
  // Load once on mount + subscribe to IAB updates so edits made in a
  // separate registry-editor window propagate to the dock editor's
  // "Launch registered component" dropdown without a reload.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const reg = await loadRegistryConfig(scope);
        if (!cancelled) setRegistryEntries(reg?.entries ?? []);
      } catch (err) {
        console.warn("useDockEditor: failed to load registry", err);
      }
    })();

    // Subscribe to registry-config-update IAB messages. Guarded for
    // non-OpenFin contexts (the editor window runs in a plain browser
    // at dev time).
    let unsubscribe: (() => void) | undefined;
    try {
      if (typeof fin !== "undefined" && fin?.InterApplicationBus?.subscribe) {
        const handler = (msg: RegistryEditorConfig) => {
          if (!cancelled) setRegistryEntries(msg?.entries ?? []);
        };
        fin.InterApplicationBus.subscribe(
          { uuid: "*" },
          IAB_REGISTRY_CONFIG_UPDATE,
          handler,
        );
        unsubscribe = () => {
          try {
            fin.InterApplicationBus.unsubscribe(
              { uuid: "*" },
              IAB_REGISTRY_CONFIG_UPDATE,
              handler,
            );
          } catch { /* best-effort */ }
        };
      }
    } catch (err) {
      console.warn("useDockEditor: registry IAB subscribe failed", err);
    }

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [scope]);

  // Load initial config from IndexedDB on first render.
  // The empty dependency array [] means this runs once, on mount.
  useEffect(() => {
    async function loadInitialConfig() {
      try {
        const saved = await loadDockConfig(scope);
        if (saved) {
          dispatch({ type: "SET_BUTTONS", buttons: saved.buttons });
        } else {
          // No saved config yet — start with an empty list
          dispatch({ type: "SET_BUTTONS", buttons: [] });
        }
      } catch (err) {
        console.error("Failed to load dock config:", err);
        dispatch({ type: "SET_BUTTONS", buttons: [] });
      }
    }
    loadInitialConfig();
  }, [scope]);

  // Build a saveable DockEditorConfig snapshot from the current state
  const buildConfig = useCallback((): DockEditorConfig => {
    return {
      version: CONFIG_VERSION,
      buttons: stateRef.current.buttons,
      updatedAt: new Date().toISOString(),
    };
  }, []);

  // Publish config via InterApplicationBus (for live updates)
  const publishConfig = useCallback(async (config: DockEditorConfig) => {
    try {
      if (typeof fin !== "undefined") {
        await fin.InterApplicationBus.publish(IAB_DOCK_CONFIG_UPDATE, config);
      }
    } catch (err) {
      console.warn("Failed to publish dock config update:", err);
    }
  }, []);

  const save = useCallback(async () => {
    const config = buildConfig();
    await saveDockConfig(config, scope);
    await publishConfig(config);
    dispatch({ type: "SET_DIRTY", dirty: false });
    console.log("Dock config saved.");
  }, [buildConfig, publishConfig, scope]);

  const reload = useCallback(async () => {
    try {
      const saved = await loadDockConfig(scope);
      dispatch({ type: "SET_BUTTONS", buttons: saved?.buttons ?? [] });
    } catch (err) {
      console.error("Failed to reload dock config:", err);
      dispatch({ type: "SET_BUTTONS", buttons: [] });
    }
  }, [scope]);

  const reset = useCallback(async () => {
    await clearDockConfig(scope);
    dispatch({ type: "SET_BUTTONS", buttons: [] });
    // Publish empty config so dock reverts to defaults
    try {
      if (typeof fin !== "undefined") {
        await fin.InterApplicationBus.publish("dock-config-reset", {});
      }
    } catch (err) {
      console.warn("Failed to publish dock config reset:", err);
    }
  }, [scope]);

  const preview = useCallback(async () => {
    const config = buildConfig();
    await publishConfig(config);
  }, [buildConfig, publishConfig]);

  return {
    buttons: state.buttons,
    isDirty: state.isDirty,
    isLoading: state.isLoading,
    dispatch,
    save,
    reload,
    reset,
    preview,
    registryEntries,
  };
}
