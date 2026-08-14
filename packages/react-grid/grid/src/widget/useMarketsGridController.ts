/**
 * useMarketsGridController — owns all state, effects, and side-effect
 * callbacks for the MarketsGrid view component.
 *
 * The view (`Host` inside `MarketsGrid.tsx`) becomes JSX-only. Every
 * observable behaviour (console log strings, ProfileManager method
 * invocation order, storageAdapter call sites, onReady firing) must
 * match what `MarketsGrid.tsx` did before this extraction — see
 * `MarketsGrid.characterisation.test.tsx` for the complete contract.
 *
 * Internal-only: not exported from the package barrel. Future commits
 * may make it public if external consumers need a headless MarketsGrid;
 * for now we keep the surface tight.
 */

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Dispatch,
  type ForwardedRef,
  type RefObject,
  type SetStateAction,
} from 'react';
import type { GridApi } from 'ag-grid-community';
import {
  LocalStorageBundleAdapter,
  MemoryAdapter,
  type StorageAdapter,
} from '@wellsfargo-starui/core';
import {
  captureGridStateInto,
  COLUMN_CUSTOMIZATION_MODULE_ID,
  exportVisualExcel,
  useGridApi,
  useGridPlatform,
  useModuleState,
  useProfileManager,
  VISUAL_EXCEL_MODULE_ID,
  type VisualExcelExportOptions,
} from '../customizer/internal.js'; // relative on purpose (self-reference breaks the dist build + risks barrel cycles)
import { type VisualExcelState } from '@wellsfargo-starui/core';
import type { FormattingToolbarHandle } from './FormattingToolbar';
import type { SettingsSheetHandle } from './SettingsSheet';
import type { MarketsGridHandle, MarketsGridLocalStorageConfig } from './types';
import { createOpenFinViewProfileSource } from './openfinViewProfile';

export interface UseMarketsGridControllerOpts {
  readonly gridId: string;
  readonly storageAdapter: StorageAdapter | undefined;
  readonly autoSaveDebounceMs: number | undefined;
  readonly forwardedRef: ForwardedRef<MarketsGridHandle>;
  readonly onReady: ((handle: MarketsGridHandle) => void) | undefined;
  readonly gridLevelData: unknown;
  readonly onGridLevelDataLoad: ((data: unknown) => void) | undefined;
  readonly onSavingChange: ((saving: boolean) => void) | undefined;
  /** Derived from general-settings — supplied by host to avoid duplicate store subscription. */
  readonly headerCaseAttr?: 'upper' | undefined;
}

export interface MarketsGridControllerHandle {
  readonly profiles: ReturnType<typeof useProfileManager>;
  readonly api: GridApi | null;
  readonly platform: ReturnType<typeof useGridPlatform>;
  readonly headerCaseAttr: 'upper' | undefined;
  readonly sheetRef: RefObject<SettingsSheetHandle | null>;
  readonly toolbarRef: RefObject<FormattingToolbarHandle | null>;
  readonly isDirty: boolean;
  readonly saveFlash: boolean;
  readonly settingsOpen: boolean;
  readonly setSettingsOpen: Dispatch<SetStateAction<boolean>>;
  /** "Jump to module + select item" request for the settings sheet. Set by
   *  {@link MarketsGridControllerHandle.openColumnSettings}. */
  readonly settingsFocusRequest: { moduleId: string; itemId: string | null; nonce: number } | null;
  readonly styleToolbarOpen: boolean;
  readonly pendingSwitch: { id: string } | null;
  readonly setPendingSwitch: Dispatch<SetStateAction<{ id: string } | null>>;
  readonly handleOpenSettings: () => void;
  /** Open the customizer on Column Settings, pre-selecting `colId`. Wired to
   *  the grid cell context menu's "Settings" item. */
  readonly openColumnSettings: (colId: string) => void;
  /** Column-selector dialog open state + opener (toolbar "Columns" button). */
  readonly columnSelectorOpen: boolean;
  readonly setColumnSelectorOpen: Dispatch<SetStateAction<boolean>>;
  readonly handleOpenColumnSelector: () => void;
  readonly handleToggleStyleToolbar: () => void;
  readonly editingToolbarOpen: boolean;
  readonly handleToggleEditingToolbar: () => void;
  readonly handleSaveAll: () => Promise<void>;
  readonly handleExportVisualExcel: () => void;
  readonly visualExcelExportEnabled: boolean;
  readonly requestLoadProfile: (id: string) => void;
  readonly confirmSwitchSave: () => Promise<void>;
  readonly confirmSwitchDiscard: () => Promise<void>;
}

export function useMarketsGridController(
  opts: UseMarketsGridControllerOpts,
): MarketsGridControllerHandle {
  const {
    gridId,
    storageAdapter,
    autoSaveDebounceMs,
    forwardedRef,
    onReady,
    gridLevelData,
    onGridLevelDataLoad,
    onSavingChange,
    headerCaseAttr: headerCaseAttrProp,
  } = opts;

  // Construct a fallback adapter ONCE when the host doesn't provide one.
  // MemoryAdapter means changes don't persist across reloads — fine for
  // demos, tests, and consumers that want ephemeral state. Production
  // apps should pass a `storage` factory built from
  // `createConfigServiceStorage({ configManager })`
  // (see apps/demos/demo-react and apps/demo-configservice-react).
  const adapterRef = useRef<StorageAdapter | null>(null);
  if (!adapterRef.current) adapterRef.current = storageAdapter ?? new MemoryAdapter();

  // ── Grid-level data persistence ───────────────────────────────────
  //
  // Read once on mount, hand the loaded value back to the consumer via
  // `onGridLevelDataLoad`, then watch the `gridLevelData` prop for
  // changes and write them through the adapter. Optional adapter
  // method (`loadGridLevelData?`) — when missing, we silently no-op
  // both reads and writes so older third-party adapters keep working.
  //
  // The `lastPersistedRef` comparison handles two edge cases:
  //   1. React StrictMode's double-effect fires the persist effect on
  //      the second setup with the just-loaded value still in the
  //      prop. Without the comparison we'd write that value back to
  //      disk on mount.
  //   2. Round-trips A → B → A still emit, because each transition
  //      differs from the previously-persisted snapshot.
  const onGridLevelDataLoadRef = useRef(onGridLevelDataLoad);
  useEffect(() => { onGridLevelDataLoadRef.current = onGridLevelDataLoad; }, [onGridLevelDataLoad]);
  const lastPersistedRef = useRef<unknown>(undefined);
  const initialLoadRef = useRef(false);
  useEffect(() => {
    if (initialLoadRef.current) return;
    initialLoadRef.current = true;
    const adapter = adapterRef.current;
    if (!adapter?.loadGridLevelData) {
      // eslint-disable-next-line no-console
      console.log(`[v2/markets-grid] gridLevelData: adapter has no loadGridLevelData method (using null)`);
      lastPersistedRef.current = null;
      onGridLevelDataLoadRef.current?.(null);
      return;
    }
    // eslint-disable-next-line no-console
    console.log(`[v2/markets-grid] gridLevelData: load → adapter.loadGridLevelData(%s)`, gridId);
    let cancelled = false;
    void adapter
      .loadGridLevelData(gridId)
      .then((loaded) => {
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.log(`[v2/markets-grid] gridLevelData: loaded`, loaded);
        lastPersistedRef.current = loaded;
        onGridLevelDataLoadRef.current?.(loaded);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.warn(`[v2/markets-grid] gridLevelData: load failed`, err);
        lastPersistedRef.current = null;
        onGridLevelDataLoadRef.current?.(null);
      });
    return () => { cancelled = true; };
    // Reason: gridId is stable per-mount; we deliberately don't depend
    // on the prop or the load-callback (both captured via refs). The
    // empty deps array makes this a one-shot mount-time load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Skip until the initial load has resolved — otherwise the first
    // render's `gridLevelData` prop (typically `null`/`undefined`)
    // would race the load and clobber persisted state.
    if (!initialLoadRef.current) return;
    // Uncontrolled: when the host omits `gridLevelData`, the load path
    // above hydrates via `onGridLevelDataLoad` but we must NOT treat
    // `undefined` as a value to persist — that would re-save on every
    // render (`undefined !== lastLoaded`) and ping `subscribeToChanges`
    // in a loop.
    if (gridLevelData === undefined) return;
    if (lastPersistedRef.current === gridLevelData) return;
    const adapter = adapterRef.current;
    if (!adapter?.saveGridLevelData) return;
    // eslint-disable-next-line no-console
    console.log(`[v2/markets-grid] gridLevelData: save`, gridLevelData);
    lastPersistedRef.current = gridLevelData;
    void adapter.saveGridLevelData(gridId, gridLevelData);
  }, [gridLevelData, gridId]);

  // Profiles are explicit-save-only. Auto-save used to debounce every
  // keystroke into the active profile; that was confusing in practice —
  // users lost the mental model of "my profile = my saved state". With
  // `disableAutoSave`, the ProfileManager instead tracks a dirty flag
  // the Save button consumes (and the profile-switch / beforeunload
  // guards below consult).
  // Per-view active-profile override for OpenFin. When the host runs
  // inside OpenFin (`fin.me` reachable), each view stores its own
  // `activeProfileId` on `customData` — duplicated views can show
  // different profiles of the same grid instance, and the workspace
  // snapshot round-trips the override automatically. Outside OpenFin
  // the factory returns `null` and the manager falls back to its
  // localStorage pointer as before.
  const openfinSourceRef = useRef(createOpenFinViewProfileSource());
  const profiles = useProfileManager({
    adapter: adapterRef.current,
    autoSaveDebounceMs,
    disableAutoSave: true,
    activeIdSource: openfinSourceRef.current ?? undefined,
  });

  const platform = useGridPlatform();
  const api = useGridApi();
  const [visualExcel] = useModuleState<VisualExcelState>(VISUAL_EXCEL_MODULE_ID);
  const headerCaseAttr = headerCaseAttrProp;

  // ── Imperative handle ─────────────────────────────────────────────
  // Populated once AG-Grid's onGridReady has fired (api becomes non-null)
  // which in turn has already let GridPlatform run the module pipeline,
  // including the active profile apply. Consumers reading `ref.current`
  // before this see `null` (React ref semantics); after this see the
  // stable handle. `onReady` fires exactly once per mount.
  const handleRef = useRef<MarketsGridHandle | null>(null);
  // Ref-bridge to handleSaveAll, defined further down. We expose
  // `saveAll` on the imperative handle so external save triggers
  // (OpenFin "Save Workspace") run the same path as the toolbar Save
  // button — including the busy-overlay flip via `onSavingChange`.
  const saveAllRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const exportVisualExcelRef = useRef<(options?: VisualExcelExportOptions) => void>(() => {});
  const saveAll = useCallback(() => saveAllRef.current(), []);
  const bundleAdapter =
    adapterRef.current instanceof LocalStorageBundleAdapter ? adapterRef.current : null;
  const bundleHandle = bundleAdapter
    ? {
        getConfig: () => bundleAdapter.readConfig(),
        setConfig: async (config: MarketsGridLocalStorageConfig) => {
          await bundleAdapter.applySerializedConfig(config);
          // applySerializedConfig writes profile rows straight to the
          // adapter, bypassing every ProfileManager method that keeps the
          // cached list in sync. loadProfile() below activates the right
          // profile's *content* but — by design — never refreshes the
          // list, so without this the picker would keep showing whatever
          // was cached at boot (typically just Default) until some other
          // list-mutating action (e.g. clone) incidentally refreshed it.
          await profiles.refreshProfiles();
          const nextActive = bundleAdapter.readConfig().activeProfileId;
          await profiles.loadProfile(nextActive);
        },
      }
    : {};
  handleRef.current = api
    ? {
        gridApi: api,
        platform,
        profiles,
        saveAll,
        exportVisualExcel: (options) => exportVisualExcelRef.current(options),
        ...bundleHandle,
      }
    : null;

  // Reason: deps narrowed to `[api]` — the only field whose identity
  // transition (null → live GridApi) needs to update the forwarded ref.
  // `platform` is captured at mount via platformRef so it's identity-stable
  // anyway. `profiles` is a new object reference on every ProfileManager
  // store mutation, so listing it would rebuild the imperative handle on
  // every save/profile-load. Consumers always consume via `onReady` (fires
  // once, guarded by readyFiredRef) — they capture the handle by value at
  // that moment. Profile actions on the captured handle still work because
  // they delegate to the singleton manager via stable callbacks; live state
  // should be read through useProfileManager (or its field selectors), not
  // off the frozen handle snapshot.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useImperativeHandle(forwardedRef, () => handleRef.current as MarketsGridHandle, [api]);

  const readyFiredRef = useRef(false);
  useEffect(() => {
    if (!readyFiredRef.current && handleRef.current) {
      readyFiredRef.current = true;
      // eslint-disable-next-line no-console
      console.log(`[v2/markets-grid] handle delivered to onReady (gridApi alive — consumer can now subscribe)`);
      onReady?.(handleRef.current);
    }
  }, [api, onReady]);

  const [saveFlash, setSaveFlash] = useState(false);
  const saveFlashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Clear the save-flash timer on unmount so we don't setState on a gone
  // component if the grid is torn down mid-flash (e.g. navigating away just
  // after clicking Save).
  useEffect(() => {
    return () => {
      if (saveFlashTimer.current) clearTimeout(saveFlashTimer.current);
    };
  }, []);

  // Settings sheet — the Cockpit popout drawer.
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Imperative handle into the SettingsSheet so the settings-icon
  // click handler can raise a buried popout window to front instead
  // of no-op-opening an already-open sheet. See handleOpenSettings
  // below for the full policy.
  const sheetRef = useRef<SettingsSheetHandle>(null);

  const handleOpenSettings = useCallback(() => {
    // If the sheet is already popped out into an OS window that's
    // alive, raise it to front (it may be buried behind other
    // windows) and bail. Otherwise fall through to the normal
    // "open inline" path.
    if (sheetRef.current?.focusIfPopped()) return;
    setSettingsOpen(true);
  }, []);

  // Cell context menu → "Settings": open the customizer on Column Settings
  // with the clicked column pre-selected. The monotonic nonce makes each
  // request distinct so the sheet re-navigates even when the same column is
  // targeted twice (e.g. the sheet was closed in between). Setting the
  // request BEFORE opening means the sheet's focus effect sees it on the
  // same commit that flips `open`. Works whether the sheet is closed,
  // already open inline, or popped into an OS window (handleOpenSettings
  // raises the popout; the request still drives navigation there).
  const [settingsFocusRequest, setSettingsFocusRequest] = useState<
    { moduleId: string; itemId: string | null; nonce: number } | null
  >(null);
  const focusNonceRef = useRef(0);
  const openColumnSettings = useCallback(
    (colId: string) => {
      focusNonceRef.current += 1;
      setSettingsFocusRequest({
        moduleId: COLUMN_CUSTOMIZATION_MODULE_ID,
        itemId: colId,
        nonce: focusNonceRef.current,
      });
      handleOpenSettings();
    },
    [handleOpenSettings],
  );

  // Column-selector dialog — opened from the primary toolbar's "Columns"
  // button. Self-contained: it reads the live grid columns on open and applies
  // order/visibility back via applyColumnState; persistence rides the normal Save.
  const [columnSelectorOpen, setColumnSelectorOpen] = useState(false);
  const handleOpenColumnSelector = useCallback(() => setColumnSelectorOpen(true), []);

  // Formatting toolbar — always starts hidden. The toolbar-control button on the
  // FiltersToolbar toggles it. The `showFormattingToolbar` prop only
  // controls whether the feature is available (i.e. whether the formatter
  // pill + floating panel exist); it doesn't pre-open the toolbar.
  const [styleToolbarOpen, setStyleToolbarOpen] = useState(false);
  // Imperative handle into the FormattingToolbar — same pattern as
  // sheetRef. The toolbar-control button uses `focusIfPopped()` to raise a
  // buried popout window before falling through to toggle.
  const toolbarRef = useRef<FormattingToolbarHandle>(null);

  const handleToggleStyleToolbar = useCallback(() => {
    // If the toolbar is popped into an OS window, a buried popout
    // should come to front on brush-click. Otherwise (or if focus
    // fails because the popout is gone), fall through to toggle.
    if (styleToolbarOpen && toolbarRef.current?.focusIfPopped()) return;
    setStyleToolbarOpen((p) => !p);
  }, [styleToolbarOpen]);

  // Editing toolbar — same open/closed model as the formatting toolbar.
  const [editingToolbarOpen, setEditingToolbarOpen] = useState(false);

  const handleToggleEditingToolbar = useCallback(() => {
    setEditingToolbarOpen((p) => !p);
  }, []);

  const handleExportVisualExcel = useCallback(() => {
    if (!api) return;
    const state = platform.store.getModuleState<VisualExcelState>(VISUAL_EXCEL_MODULE_ID);
    exportVisualExcel(api, state?.settings ?? { enabled: true, fileNamePrefix: 'markets-grid' });
  }, [api, platform]);

  exportVisualExcelRef.current = handleExportVisualExcel;

  const handleSaveAll = useCallback(async () => {
    // Capture native AG-Grid state (column order / widths / sort / filters /
    // pagination / selection / viewport) into the grid-state module slice
    // BEFORE persisting — the subsequent saveActiveProfile flush then picks
    // up this fresh capture alongside every other module's state. Auto-save
    // deliberately never runs this path; grid state is explicit-save-only.
    if (api) {
      try { captureGridStateInto(platform.store, api); }
      catch (err) { console.warn('[markets-grid] captureGridStateInto failed:', err); }
    }
    onSavingChange?.(true);
    try {
      await profiles.saveActiveProfile();
    } catch (err) {
      console.warn('[markets-grid] saveActiveProfile failed:', err);
      onSavingChange?.(false);
      return;
    }
    onSavingChange?.(false);
    setSaveFlash(true);
    if (saveFlashTimer.current) clearTimeout(saveFlashTimer.current);
    saveFlashTimer.current = setTimeout(() => setSaveFlash(false), 600);
  }, [profiles, api, platform, onSavingChange]);

  // Keep the handle's saveAll bridge pointed at the latest closure.
  saveAllRef.current = handleSaveAll;

  // Settings-panel Save → canonical profile persist. Module state is
  // explicit-save-only (auto-save disabled above), so a customizer card's
  // own "Save" commits to the store but does NOT reach disk until the
  // active profile is flushed. Panels emit `settings:save-requested` after
  // committing; we run the same path as the toolbar Save button so every
  // card persists on its own Save (capture live grid state + saveActiveProfile
  // + busy overlay). Routed through `saveAllRef` so this subscribes once and
  // always calls the latest closure.
  useEffect(() => {
    return platform.events.on('settings:save-requested', () => {
      void saveAllRef.current();
    });
  }, [platform]);

  // Active profile dirty state — wired to the Save button indicator,
  // the profile-switch AlertDialog, and the beforeunload warning.
  const isDirty = profiles.isDirty;

  // Warn the user if they try to close / reload the tab while their
  // active profile has unsaved edits. The `returnValue` string is
  // ignored by every modern browser (they show a generic message) but
  // it's required for the prompt to appear at all.
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // Profile-switch unsaved-changes prompt state. When the user picks a
  // different profile from the switcher AND there are unsaved edits,
  // we stash the target id here and open an AlertDialog offering
  // Save / Discard / Cancel. The Dialog's action handlers finalise the
  // switch; with no dirty edits the switch goes through directly.
  const [pendingSwitch, setPendingSwitch] = useState<null | { id: string }>(null);

  const requestLoadProfile = useCallback(
    (id: string) => {
      if (id === profiles.activeProfileId) return;
      if (profiles.isDirty) {
        setPendingSwitch({ id });
        return;
      }
      void profiles.loadProfile(id);
    },
    [profiles],
  );

  const confirmSwitchSave = useCallback(async () => {
    if (!pendingSwitch) return;
    const targetId = pendingSwitch.id;
    setPendingSwitch(null);
    try {
      // Route through the same Save-button path so AG-Grid native state
      // (column widths / sort / filters / pagination) is captured before
      // the snapshot lands — otherwise a Save-then-Switch would persist
      // stale grid-state.
      await handleSaveAll();
      await profiles.loadProfile(targetId);
    } catch (err) {
      console.warn('[markets-grid] save-and-switch failed:', err);
    }
  }, [pendingSwitch, handleSaveAll, profiles]);

  const confirmSwitchDiscard = useCallback(async () => {
    if (!pendingSwitch) return;
    const targetId = pendingSwitch.id;
    setPendingSwitch(null);
    try {
      // Discard in-memory edits (reverts to the last-saved snapshot of
      // the outgoing profile) BEFORE loading the new one. The discard
      // is technically optional since load() also replaces state, but
      // it keeps semantics clean: dirty=false is observable in between.
      await profiles.discardActiveProfile();
      await profiles.loadProfile(targetId);
    } catch (err) {
      console.warn('[markets-grid] discard-and-switch failed:', err);
    }
  }, [pendingSwitch, profiles]);

  return {
    profiles,
    api,
    platform,
    headerCaseAttr,
    sheetRef,
    toolbarRef,
    isDirty,
    saveFlash,
    settingsOpen,
    setSettingsOpen,
    settingsFocusRequest,
    styleToolbarOpen,
    pendingSwitch,
    setPendingSwitch,
    handleOpenSettings,
    openColumnSettings,
    columnSelectorOpen,
    setColumnSelectorOpen,
    handleOpenColumnSelector,
    handleToggleStyleToolbar,
    editingToolbarOpen,
    handleToggleEditingToolbar,
    handleExportVisualExcel,
    visualExcelExportEnabled: visualExcel?.settings?.enabled ?? true,
    handleSaveAll,
    requestLoadProfile,
    confirmSwitchSave,
    confirmSwitchDiscard,
  };
}
