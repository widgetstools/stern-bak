 
import { useReducer, useEffect, useCallback, useRef, useState } from "react";
// /host subpath — the fin-global seam; every helper noops outside OpenFin.
import {
  isOpenFin,
  publishIabTopic,
  createPlatformView,
} from "@wellsfargo-starui/openfin/host";
import {
  loadRegistryConfig,
  saveRegistryConfig,
  clearRegistryConfig,
  IAB_REGISTRY_CONFIG_UPDATE,
  deriveTemplateConfigId,
  migrateRegistryToV2,
  readHostEnv,
  resolveHostUrl,
  REGISTRY_CONFIG_VERSION,
  type ConfigScope,
  type RegistryEditorConfig,
  type RegistryEntry,
  type HostEnv,
} from "@wellsfargo-starui/openfin";

/**
 * Options for `useRegistryEditor()`. `scope` is an optional
 * `(appId, userId)` pair threaded through to
 * `saveRegistryConfig` / `loadRegistryConfig`. When omitted the
 * registry saves as the historical global singleton
 * (`appId: 'system'`, `userId: 'system'`) so existing callers keep
 * working unchanged.
 */
export interface UseRegistryEditorOptions {
  scope?: ConfigScope;
}

// ─── Action Types ────────────────────────────────────────────────────

type RegistryAction =
  | { type: "SET_ENTRIES"; entries: RegistryEntry[] }
  | { type: "ADD_ENTRY"; entry: RegistryEntry }
  | { type: "UPDATE_ENTRY"; id: string; entry: RegistryEntry }
  | { type: "REMOVE_ENTRY"; id: string }
  | { type: "SET_DIRTY"; dirty: boolean }
  | { type: "SET_LOADING"; loading: boolean };

interface RegistryState {
  entries: RegistryEntry[];
  isDirty: boolean;
  isLoading: boolean;
}

const initialState: RegistryState = {
  entries: [],
  isDirty: false,
  isLoading: true,
};

function registryReducer(state: RegistryState, action: RegistryAction): RegistryState {
  switch (action.type) {
    case "SET_ENTRIES":
      return { ...state, entries: action.entries, isDirty: false, isLoading: false };
    case "ADD_ENTRY":
      return { ...state, entries: [...state.entries, action.entry], isDirty: true };
    case "UPDATE_ENTRY":
      return {
        ...state,
        entries: state.entries.map((e) => (e.id === action.id ? action.entry : e)),
        isDirty: true,
      };
    case "REMOVE_ENTRY":
      return {
        ...state,
        entries: state.entries.filter((e) => e.id !== action.id),
        isDirty: true,
      };
    case "SET_DIRTY":
      return { ...state, isDirty: action.dirty };
    case "SET_LOADING":
      return { ...state, isLoading: action.loading };
    default:
      return state;
  }
}

// ─── Hook ────────────────────────────────────────────────────────────

export interface UseRegistryEditorReturn {
  entries: RegistryEntry[];
  isDirty: boolean;
  isLoading: boolean;
  hostEnv: HostEnv;
  dispatch: React.Dispatch<RegistryAction>;
  save: () => Promise<void>;
  /**
   * Re-load entries from storage and clear the dirty flag. This is the
   * "Discard unsaved changes" path — it does NOT touch IndexedDB. Safe
   * to call from a Discard button without risk of data loss.
   */
  reload: () => Promise<void>;
  /**
   * DESTRUCTIVE: clear the persisted registry entirely and reset state
   * to empty. Intended for admin/troubleshooting flows ("Clear all
   * components"). Never wire this to a button labelled Discard — the
   * behaviour does not match user expectation. See `reload()`.
   */
  reset: () => Promise<void>;
  testComponent: (entry: RegistryEntry) => Promise<void>;
}

export function useRegistryEditor(opts: UseRegistryEditorOptions = {}): UseRegistryEditorReturn {
  const scope = opts.scope;
  const [state, dispatch] = useReducer(registryReducer, initialState);
  const [hostEnv, setHostEnv] = useState<HostEnv>({ appId: '', configServiceUrl: '' });
  const stateRef = useRef(state);
  stateRef.current = state;

  // Load host env + initial config on mount. The v1→v2 migrator runs
  // here so no downstream code ever sees a v1-shaped entry.
  useEffect(() => {
    (async () => {
      try {
        const env = await readHostEnv();
        setHostEnv(env);

        const saved = await loadRegistryConfig(scope);
        const migrated = migrateRegistryToV2(saved as RegistryEditorConfig | null, env);
        dispatch({ type: "SET_ENTRIES", entries: migrated.entries });
      } catch (err) {
        console.error("Failed to load registry config:", err);
        dispatch({ type: "SET_ENTRIES", entries: [] });
      }
    })();
  }, [scope]);

  const buildConfig = useCallback((): RegistryEditorConfig => {
    return {
      version: REGISTRY_CONFIG_VERSION,
      // Normalise every entry so the persisted shape ALWAYS satisfies
      // the registry contract:
      //   id        === ${componentType}-${componentSubType} (lowercase)
      //   configId  === same as id
      // This catches:
      //   - draft entries created with a temp UUID id (Workspace
      //     Setup's `newDraftEntry`) — replaced with the canonical id.
      //   - legacy rows with stale UUID ids — auto-corrected on next save.
      //   - any future code path that forgets to derive the id —
      //     it can't slip a UUID through this filter.
      // Entries with empty type/subtype (genuinely incomplete drafts)
      // pass through unchanged; the editor's validation rejects those
      // before save in any case.
      entries: stateRef.current.entries.map((e) => {
        if (!e.componentType || !e.componentSubType) return e;
        const derived = deriveTemplateConfigId(e.componentType, e.componentSubType);
        return { ...e, id: derived, configId: derived };
      }),
    };
  }, []);

  const publishConfig = useCallback(async (config: RegistryEditorConfig) => {
    try {
      await publishIabTopic(IAB_REGISTRY_CONFIG_UPDATE, config);
    } catch (err) {
      console.warn("Failed to publish registry config update:", err);
    }
  }, []);

  const save = useCallback(async () => {
    const config = buildConfig();
    await saveRegistryConfig(config, scope);
    await publishConfig(config);
    // Sync state with what just hit disk. `buildConfig` may have
    // rewritten ids (draft UUIDs → canonical `${type}-${subtype}`),
    // and we want the UI to reflect that on the next render —
    // otherwise selection-by-id, dock-config references, and the
    // Components-pane row keys all stay pinned to the temp ids.
    dispatch({ type: "SET_ENTRIES", entries: config.entries });
    console.log("Registry config saved.");
  }, [buildConfig, publishConfig, scope]);

  const reload = useCallback(async () => {
    try {
      const env = await readHostEnv();
      const saved = await loadRegistryConfig(scope);
      const migrated = migrateRegistryToV2(saved as RegistryEditorConfig | null, env);
      dispatch({ type: "SET_ENTRIES", entries: migrated.entries });
    } catch (err) {
      console.error("Failed to reload registry config:", err);
      dispatch({ type: "SET_ENTRIES", entries: [] });
    }
  }, [scope]);

  const reset = useCallback(async () => {
    await clearRegistryConfig(scope);
    dispatch({ type: "SET_ENTRIES", entries: [] });
  }, [scope]);

  const testComponent = useCallback(async (entry: RegistryEntry) => {
    try {
      // Normalise host-relative paths (e.g. "/blotters/marketsgrid")
      // against the editor's own origin before launching. OpenFin needs
      // an absolute URL; `window.open` doesn't, but normalising in both
      // branches keeps user behaviour consistent across the two paths.
      const resolvedUrl = resolveHostUrl(entry.hostUrl);

      if (!isOpenFin()) {
        window.open(resolvedUrl, "_blank");
        return;
      }

      // Test launch policy: the spawned view operates DIRECTLY on the
      // template row. Pass the template configId AS the `instanceId`
      // so when the user saves, the write lands on
      // `${componentType}-${componentSubType}` (the canonical
      // template id) — overwriting initial settings rather than
      // creating a per-launch UUID-keyed clone.
      //
      // The `isTemplate: true` flag on customData tells the
      // component-host saver to mark the resulting AppConfigRow as
      // a template (and to set `singleton` from the entry).
      //
      // Non-test launches (dock menu) use a different flow — a fresh
      // UUID instanceId, then component-host clones the template
      // payload into that UUID-keyed row, with isTemplate=false.
      const templateId = entry.configId || deriveTemplateConfigId(
        entry.componentType,
        entry.componentSubType,
      );
      const instanceId = templateId;

      await createPlatformView({
        url: resolvedUrl,
        customData: {
          instanceId,
          templateId,
          componentType: entry.componentType,
          componentSubType: entry.componentSubType,
          // Test-launch marker: tells component-host that any save
          // from this view is the template/initial-settings save.
          isTemplate: true,
          singleton: entry.singleton,
          // v2: forward the appId + configServiceUrl the component will
          // target. For usesHostConfig === true this equals hostEnv; for
          // external entries it equals the entry's own values.
          appId: entry.appId,
          configServiceUrl: entry.configServiceUrl,
          // userId is taken from the editor's hostEnv (set by the
          // parent OpenFin provider via customData.userId on the
          // editor window). Component-host's saver needs it to
          // populate `userId` / `createdBy` / `updatedBy` on a
          // freshly-built AppConfigRow when no prior template exists.
          userId: hostEnv.userId,
        },
      });
    } catch (err) {
      console.warn("Failed to launch test component:", err);
    }
  }, []);

  return {
    entries: state.entries,
    isDirty: state.isDirty,
    isLoading: state.isLoading,
    hostEnv,
    dispatch,
    save,
    reload,
    reset,
    testComponent,
  };
}
