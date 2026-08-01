import type { ColDef, GridApi, SideBarDef, StatusPanelDef, Theme } from 'ag-grid-community';
import type { AnyModule, AppDataLookup, GridPlatform, MarketsGridLocalStorageConfig, StorageAdapter, StorageAdapterFactory, StorageAdapterFactoryOpts } from '@wellsfargo-starui/engine';
import type { GridHostContext } from '@wellsfargo-starui/host';
import type { UseProfileManagerResult, VisualExcelExportOptions, ProviderGridHostApi, GridEventBindingsHostApi } from '../customizer/index.js'; // relative on purpose (self-reference breaks the dist build + risks barrel cycles)

export type { ProviderGridHostApi, ProviderGridHostMode, GridEventBindingsHostApi } from '../customizer/index.js'; // relative on purpose (self-reference breaks the dist build + risks barrel cycles)
export type { MarketsGridLocalStorageConfig, StorageAdapterFactory, StorageAdapterFactoryOpts } from '@wellsfargo-starui/engine';

/**
 * One saved filter pinned to the toolbar. Shape is stable across
 * schema versions so on-disk profile snapshots load cleanly.
 */
export interface SavedFilter {
  id: string;
  label: string;
  filterModel: Record<string, unknown>;
  active: boolean;
}

/**
 * Public host-component props. Narrow contract — the ONE place a consumer
 * app configures the grid.
 */
export interface MarketsGridProps<TData = unknown> {
  /**
   * Optional host context — runtime, storage, data, and config ports.
   * When provided, identity defaults and storage/appData fall back to
   * the host unless explicit props override them.
   */
  host?: GridHostContext;

  /** Unique id per grid instance. Profile snapshots key off this. */
  gridId: string;
  /** Row data. Kept reactive — swapping triggers the usual AG-Grid diff.
   *  For live streaming, prefer keeping this prop referentially stable
   *  (e.g. pass a module-scoped `EMPTY` array) and push deltas via
   *  `gridApi.applyTransactionAsync` — see `applyProviderToGrid` in
   *  `@wellsfargo-starui/grid/widgets` MarketsGridContainer for the reference pattern. */
  rowData: TData[];
  /** Base column definitions — modules can transform them. */
  columnDefs: ColDef<TData>[];
  /** Module list. Default passes {@link DEFAULT_MODULES}; use exported
   *  {@link MINIMAL_MODULES} for a lightweight embed preset. */
  modules?: AnyModule[];
  /** AG-Grid theme object. */
  theme?: Theme;
  /**
   * AG Grid modules to register. Defaults to full {@link AllEnterpriseModule}.
   * Omit for backward-compatible enterprise registration.
   */
  agGridModules?: readonly import('ag-grid-community').Module[];
  /**
   * Call `api.sizeColumnsToFit()` on grid ready when columns allow it.
   * Defaults to `false` so profile-persisted column widths win on load.
   * Set `true` for hosts that want columns stretched to the viewport on first ready.
   */
  sizeColumnsToFitOnReady?: boolean;
  /**
   * When `false`, omit the date stream-safe floating filter from the
   * components map unless column defs reference date filters. Default `true`.
   */
  includeAllStreamSafeFilters?: boolean;
  /**
   * Field(s) on each row that uniquely identify it. Defaults to `'id'`.
   * A single column name keys rows by that field; an array of column
   * names produces a composite key (joined with `-`). Used by the
   * platform's `getRowId` and must match the worker-side cache key
   * produced by the data-services SharedWorkerDataServicesHub.
   */
  rowIdField?: string | readonly string[];
  /**
   * Optional adapter over the host application's named-data registry
   * (e.g. data-services' AppDataStore). When supplied, column-customization's
   * cell-editor `valuesSource` bindings (`{{providerName.key}}`) resolve
   * at edit time. The grid container typically constructs this from
   * `useAppDataStore()` and forwards it through.
   */
  appData?: AppDataLookup;
  /** Shown above the grid. Defaults to `true`. */
  showToolbar?: boolean;
  /** Filter pill toolbar. Defaults to `false`. */
  showFiltersToolbar?: boolean;
  /** Floating formatter toolbar (pill toggle on the filter bar). */
  showFormattingToolbar?: boolean;
  /** Enables the editing toolbar toggle on the primary row (toolbar starts hidden). */
  showEditingToolbar?: boolean;
  /** @deprecated Use `showEditingToolbar` or pass as segment allow-list with other editing props. */
  showSmartEditToolbar?: boolean;
  /** @deprecated Use `showEditingToolbar` or pass as segment allow-list with other editing props. */
  showBulkUpdateToolbar?: boolean;
  /** @deprecated Use `showEditingToolbar` or pass as segment allow-list with other editing props. */
  showEditHistoryToolbar?: boolean;
  /** Save button on the toolbar. Defaults to `true`. */
  showSaveButton?: boolean;
  /** Settings button on the toolbar. Defaults to `true`. */
  showSettingsButton?: boolean;
  /**
   * Column-selector button on the toolbar — opens a dialog to choose which
   * columns are shown vs hidden and reorder the visible ones by drag. Applying
   * reorders the live grid (`[...visible, ...available]`, available hidden);
   * persistence flows through the normal Save. Defaults to `true`.
   */
  showColumnSelector?: boolean;
  /** Visual Excel export button on the toolbar. Defaults to `true`. */
  showVisualExcelExport?: boolean;
  /** Profile selector pill. Defaults to `true`. */
  showProfileSelector?: boolean;
  /** AG-Grid sidebar config. */
  sideBar?: SideBarDef | boolean;
  /** AG-Grid status bar config. */
  statusBar?: { statusPanels: StatusPanelDef[] };
  /** AG-Grid default column def — merged with module-produced defaults. */
  defaultColDef?: ColDef<TData>;
  /** Row height in px. Defaults to `36`. */
  rowHeight?: number;
  /** Header height in px. Defaults to `32`. */
  headerHeight?: number;
  /** Enable row animations. Defaults to `true`. */
  animateRows?: boolean;
  /** Host can provide its own storage adapter (MemoryAdapter,
   *  LocalStorageBundleAdapter, …). For ConfigService-backed
   *  persistence prefer the `storage` factory prop below.
   *  When omitted, MarketsGrid uses an in-memory adapter scoped to the current session. */
  storageAdapter?: unknown;
  /** Auto-save debounce in ms. Defaults to 300. */
  autoSaveDebounceMs?: number;
  /** Additional className on the root. */
  className?: string;
  /** Additional inline style on the root. */
  style?: React.CSSProperties;
  /** Passed through to AG-Grid after our own onGridReady fires. */
  onGridReady?: (event: import('ag-grid-community').GridReadyEvent) => void;

  // ── v2 additions (all optional, additive) ────────────────────────────

  /**
   * Stable identity for this instance when running inside a framework
   * that supplies one (OpenFin customData, app router, etc.). When
   * omitted, falls back to `gridId`.
   *
   * Used as the scope key for storage adapters — especially
   * `createConfigServiceStorage()` which keys UnifiedConfig rows by
   * `(appId, userId, instanceId)`.
   */
  instanceId?: string;

  /**
   * App identity — required when `storage` is a ConfigService-backed
   * factory. Scopes all profile writes so they land on the right app's
   * rows and never leak across apps sharing the same ConfigService.
   *
   * Typed as optional because pure-local-storage consumers don't need
   * it, but a runtime assertion inside `<MarketsGrid>` throws loudly
   * when `storage` is supplied without `appId`.
   */
  appId?: string;

  /**
   * User identity — required when `storage` is a ConfigService-backed
   * factory. Scopes profile writes to the signed-in user so different
   * users on the same machine see independent profile sets.
   *
   * Typed as optional because pure-local-storage consumers don't need
   * it, but a runtime assertion inside `<MarketsGrid>` throws loudly
   * when `storage` is supplied without `userId`.
   */
  userId?: string;

  /**
   * Storage adapter factory. When provided, takes precedence over
   * `storageAdapter`. Called internally with
   * `{ instanceId, appId, userId, gridId }` — consumers using
   * `createConfigServiceStorage()` get scoped writes without having
   * to re-close the factory on every userId change.
   *
   * Required companion props when this is set (unless the factory is
   * `createMarketsGridLocalStorageStorage()`, which keys only by grid):
   *   - `appId`   — non-empty string
   *   - `userId`  — non-empty string
   * MarketsGrid throws at mount time if either is missing for other factories.
   *
   * Typical construction at app bootstrap:
   *   const storage = createConfigServiceStorage({ configManager });
   *   <MarketsGrid ... storage={storage} appId={...} userId={userId} />
   *
   * Local-only persistence (no ConfigService):
   *   <MarketsGrid storage={createMarketsGridLocalStorageStorage()} ... />
   *
   * Same factory can be reused across many grids; each receives its
   * own `StorageAdapter` closed over the resolved opts.
   */
  storage?: StorageAdapterFactory;

  /**
   * Fires once per mount after: (1) AG-Grid is ready, (2) GridPlatform is
   * mounted, (3) the active profile has been applied. Receives a single
   * `MarketsGridHandle` aggregating AG-Grid's `GridApi`, our `GridPlatform`,
   * and the active `ProfileManager`.
   *
   * Equivalent to reading `ref.current` — same handle instance.
   */
  onReady?: (handle: MarketsGridHandle) => void;

  /**
   * Admin-tool entries exposed through the settings sheet's Tools menu.
   * When omitted or empty (or every entry has `visible: false`), the
   * Tools button is not rendered — end-user grids pay zero chrome cost.
   *
   * Consumer controls role gating per-entry via `visible`. MarketsGrid
   * knows nothing about roles or permissions.
   */
  adminActions?: AdminAction[];

  /**
   * Opaque, top-level data persisted alongside the grid's profile-set
   * in the same backing storage row — but at the grid level, NOT
   * inside any particular profile. Used for state that must survive
   * profile switches (e.g. v2's data-provider selection:
   * `{ liveProviderId, historicalProviderId, mode }`).
   *
   * Treat this as a controlled prop: pass the current value in via
   * `gridLevelData`, receive the persisted value once via
   * `onGridLevelDataLoad`. MarketsGrid persists every subsequent
   * change to the prop via the configured storage adapter.
   *
   * Shape is opaque to MarketsGrid — consumers own the type. Set to
   * `null`/`undefined` to express "no value persisted yet".
   */
  gridLevelData?: unknown;

  /**
   * Fires once on mount after the storage adapter has resolved the
   * persisted grid-level-data value. Receives `null` when no value
   * has been written yet (or when the adapter doesn't implement
   * `loadGridLevelData`).
   *
   * Consumers typically `setState(loaded)` here to reconcile the
   * controlled `gridLevelData` prop with what's on disk.
   */
  onGridLevelDataLoad?: (data: unknown) => void;

  /**
   * Logical component name shown in the toolbar's grid-info popover
   * (the small ⓘ button next to the admin actions). Optional — when
   * omitted the popover still renders identity (path, instanceId,
   * appId, userId, gridId) without a heading. Set by hosting shells
   * that already know the route's display name (e.g. "MarketsGrid",
   * "FX Blotter").
   */
  componentName?: string;

  /**
   * Optional slot rendered above the primary toolbar row. Prefer
   * {@link providerGridHost} + Custom Settings in the grid customizer for
   * data-provider controls; `headerExtras` remains for ad-hoc host chrome.
   */
  headerExtras?: import('react').ReactNode;

  /**
   * Data-provider runtime API for MarketsGridContainer. Wired into the grid
   * customizer → Custom Settings panel (live/historical pickers, refresh,
   * reload, edit). Grid-level selection persists via `gridLevelData`.
   */
  providerGridHost?: ProviderGridHostApi | null;

  /**
   * Grid-level event→handler bindings UI (Custom Settings). Wired by
   * {@link MarketsGridContainer} when the app supplies `gridEventHandlers`.
   */
  gridEventBindingsHost?: GridEventBindingsHostApi | null;

  /**
   * Optional caption rendered top-left, ABOVE the primary toolbar row,
   * but only when `tabsHidden` is also true. The intent: in the OpenFin
   * shell, when the user hides the view-tab strip the view loses its
   * built-in title affordance, so the host (`<HostedMarketsGrid>`)
   * passes its `componentName` (or an explicit `caption` override) down
   * here so the grid can re-surface the label inline.
   *
   * No new design-system primitive — rendered as a single styled span
   * using the existing token palette. When either prop is missing /
   * false, nothing renders and layout is byte-identical to today.
   */
  caption?: string;

  /**
   * Companion to `caption`. When true, the caption is rendered;
   * otherwise it is suppressed even if `caption` is set. Sourced from
   * `useTabsHidden()` upstream. Defaults to `false`.
   */
  tabsHidden?: boolean;

  /**
   * Fired when the user commits an in-place edit of the caption (Enter
   * blur, or focus loss with non-empty content). The grid maintains
   * the editable value as local state seeded from the `caption` prop;
   * supplying this callback lets the host persist the override (e.g.
   * via `gridLevelData` or a profile field). When omitted, edits are
   * still applied locally but won't survive a remount.
   */
  onCaptionChange?: (next: string) => void;

  /**
   * Fires `true` when the grid begins persisting the active profile
   * (Save button click or save-on-switch flow) and `false` once the
   * write resolves or rejects. Container shells use this to overlay a
   * busy indicator that mirrors the snapshot-loading overlay.
   */
  onSavingChange?: (saving: boolean) => void;

  /**
   * When true, the live data stream is disconnected and row values may
   * be stale. Shows a flashing banner in the grid header and disables
   * cell editing until cleared.
   */
  dataStale?: boolean;

  /** Message shown in the stale-data banner. A default is used when omitted. */
  dataStaleMessage?: string;

  /**
   * When true, the grid is showing a historical as-of snapshot (not live
   * data). Shows an informational banner and disables cell editing until
   * cleared. Independent of {@link dataStale} (disconnected provider).
   */
  historicalViewMode?: boolean;

  /** Message shown in the historical-view banner. A default is used when omitted. */
  historicalViewMessage?: string;

  /**
   * ISO `YYYY-MM-DD` for the primary-toolbar date picker (right edge).
   * When omitted, the grid initializes to today's date and manages
   * selection locally until `onToolbarDateChange` is supplied.
   */
  toolbarDate?: string;

  /** Fired when the user selects a new date in the toolbar date picker. */
  onToolbarDateChange?: (date: string) => void;

  /** Show the shadcn date picker on the primary toolbar. Defaults to `true`. */
  showToolbarDatePicker?: boolean;

  /**
   * When `false`, the toolbar date picker only allows selecting today
   * (no historical data provider). Omit or set `true` to allow any date.
   */
  toolbarDateHistoryEnabled?: boolean;

  /**
   * Secondary toolbar actions (export, settings, admin, grid info).
   * `overflow` (default) — single ⋯ menu; `inline` — one icon per action.
   */
  toolbarActionsLayout?: 'inline' | 'overflow';
}

/**
 * Imperative handle returned by `ref` / `onReady`. Bundles the three
 * things a consumer might reach for when interacting programmatically
 * with a MarketsGrid instance.
 */
export interface MarketsGridHandle {
  /** AG-Grid's GridApi — column manipulation, filters, sort, export, etc. */
  gridApi: GridApi;
  /** Our module-system handle — module state, transforms, expression engine. */
  platform: GridPlatform;
  /** The hook-shaped profile manager — `{ activeProfileId, profiles,
   *  isDirty, saveActiveProfile(), loadProfile(id), cloneProfile(…),
   *  deleteProfile(…), renameProfile(…), exportProfile(), importProfile(),
   *  … }`. This is `UseProfileManagerResult` (from @wellsfargo-starui/engine) rather
   *  than the raw ProfileManager class — matches how consumers already
   *  interact with profiles via the useProfileManager hook. */
  profiles: UseProfileManagerResult;
  /**
   * Same code path the toolbar Save button uses — captures native AG-Grid
   * state into the grid-state module slice, then flushes the active
   * profile via `profiles.saveActiveProfile()`, then plays the post-save
   * UI flash. Hosts (e.g. OpenFin "Save Workspace") should prefer this
   * over calling `profiles.saveActiveProfile()` directly so the busy
   * overlay and grid-state capture both run.
   */
  saveAll: () => Promise<void>;

  /** Export visible grid data to Excel with display formatters and style colours. */
  exportVisualExcel: (options?: VisualExcelExportOptions) => void;

  /**
   * When `storage={createMarketsGridLocalStorageStorage()}` — returns the
   * persisted bundle (all profiles, active profile id, grid-level data).
   */
  getConfig?: () => MarketsGridLocalStorageConfig;

  /**
   * When using `createMarketsGridLocalStorageStorage()` — replaces the
   * bundle in localStorage and reloads the active profile into the grid.
   */
  setConfig?: (config: MarketsGridLocalStorageConfig) => Promise<void>;
}

/**
 * An entry in the settings sheet's Tools menu. Used for admin-only
 * actions like "Open Config Browser", "Audit Log", "Perf Trace".
 *
 * MarketsGrid does not take a dep on any admin tool — consumers mount
 * those themselves and wire the launcher via `onClick`.
 */
export interface AdminAction {
  /** Stable id. Used for React keys + e2e testids (`admin-action-${id}`). */
  id: string;
  /** Human-readable label. */
  label: string;
  /** Icon ref (`mkt:*` or `lucide:*`). Default: `lucide:wrench`. */
  icon?: string;
  /** Muted subtitle below the label. Optional. */
  description?: string;
  /** Invoked when the user picks the action. Consumer decides what
   *  "launch" means — navigate, openfin window, modal, etc. */
  onClick: () => void | Promise<void>;
  /** When false, the entry is omitted from the dropdown. Default true. */
  visible?: boolean;
}
