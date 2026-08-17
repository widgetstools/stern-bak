/**
 * Platform-level types. Everything a module or host consumer touches is
 * defined here — there are no framework imports anywhere in this file.
 */

import type {
  ColDef,
  ColGroupDef,
  GetRowIdFunc,
  GetRowIdParams,
  GridApi,
  GridOptions,
  IRowNode,
} from 'ag-grid-community';
/**
 * Framework-agnostic component slot. The `Module` interface accepts
 * React `ComponentType<X>` here because `@wellsfargo-starui/grid-react` plugs in
 * actual React components, but `@wellsfargo-starui/core` itself stays
 * vanilla-TypeScript: any `(props: P) => any` callable satisfies the
 * slot, including a `React.ComponentType<P>`. The `any` return is
 * deliberate so a host using `<module.SettingsPanel />` in JSX
 * type-checks regardless of what shape `core` was compiled against.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UIComponent<P> = (props: P) => any;

// ─── Column / grid aliases ──────────────────────────────────────────────────

export type AnyColDef = ColDef | ColGroupDef;

export type { GridApi, GridOptions, GetRowIdFunc, GetRowIdParams };

// ─── Persistence envelope ──────────────────────────────────────────────────

/**
 * Every persisted module state is wrapped in `{ v, data }`. `v` is the
 * module's `schemaVersion` at the time of serialisation; when the stored
 * value doesn't match the current module's schemaVersion, the platform
 * invokes `migrate` (or drops the state with a warning if no migration is
 * supplied).
 *
 * Canonical declaration lives in `@wellsfargo-starui/types` (so the
 * storage contract is shared across layers); re-exported here to keep
 * the engine import path stable.
 */
export type { SerializedState } from '@wellsfargo-starui/types';

// ─── Typed event bus ──────────────────────────────────────────────────────

export interface PlatformEventMap {
  'grid:ready': { gridId: string };
  'grid:destroyed': { gridId: string };
  'module:registered': { gridId: string; moduleId: string };
  'module:stateChanged': { gridId: string; moduleId: string };
  'profile:loaded': { gridId: string; profileId: string };
  'profile:saved': { gridId: string; profileId: string };
  'profile:deleted': { gridId: string; profileId: string };
  /**
   * A profile import (schemaVersion 2+) carried grid-level data and the
   * manager has just written it to the storage adapter. Grid-level
   * consumers (the v2 container's provider picker / caption) listen for
   * this to re-apply the restored selection live, without a remount.
   * `data` is the opaque blob as imported.
   */
  'gridLevelData:imported': { gridId: string; data: unknown };
  /**
   * A settings panel committed card edits into module state and wants the
   * active profile flushed to disk NOW (explicit-save-only model — module
   * state is otherwise only persisted by the grid's main Save). The host
   * controller listens and runs its canonical save (capture live grid
   * state → saveActiveProfile), so every customizer card persists on its
   * own Save without the user hunting for a second button.
   */
  'settings:save-requested': { gridId: string };
  /**
   * `platform.data.capabilities` now answers differently — a server-side
   * source bound, swapped or detached.
   *
   * `GridDataHub` exposes capabilities through a GETTER precisely so a
   * control disabled while a source is binding re-enables itself when the
   * answer changes. A getter alone cannot make that true in React: nothing
   * re-renders. This event is what closes that gap, and it is why the hub
   * takes the platform's event bus.
   */
  'data:capabilitiesChanged': { gridId: string };
}

export interface EventBus<M> {
  emit<K extends keyof M>(event: K, payload: M[K]): void;
  on<K extends keyof M>(event: K, handler: (payload: M[K]) => void): () => void;
}

// ─── Store ────────────────────────────────────────────────────────────────

export interface Store {
  readonly gridId: string;
  getModuleState<T>(moduleId: string): T;
  setModuleState<T>(moduleId: string, updater: (prev: T) => T): void;
  replaceModuleState<T>(moduleId: string, value: T): void;
  getAllModuleStates(): Record<string, unknown>;
  subscribe(listener: () => void): () => void;
  subscribeToModule<T>(moduleId: string, listener: (state: T, prev: T) => void): () => void;
}

// ─── Grid API hub ─────────────────────────────────────────────────────────

export type ApiEventName =
  | 'cellFocused'
  | 'cellClicked'
  | 'cellSelectionChanged'
  | 'cellValueChanged'
  | 'columnEverythingChanged'
  | 'columnGroupOpened'
  | 'columnPinned'
  | 'columnResized'
  | 'columnVisible'
  | 'displayedColumnsChanged'
  | 'filterChanged'
  | 'firstDataRendered'
  | 'modelUpdated'
  | 'rowDataUpdated'
  | 'sortChanged'
  | 'asyncTransactionsFlushed'
  | 'rowValueChanged';

export interface ApiHub {
  /** The live GridApi, or null if the grid hasn't mounted yet. */
  readonly api: GridApi | null;
  /** Resolves when the grid fires `onGridReady`. Safe to await from anywhere. */
  whenReady(): Promise<GridApi>;
  /** Fire `fn` every time a grid mounts (or immediately if already ready).
   *  Returns a disposer. */
  onReady(fn: (api: GridApi) => void): () => void;
  /** Subscribe to an AG-Grid event. Returns a disposer. The handler receives
   *  the raw AG-Grid event object; most callers ignore it (a `() => void`
   *  handler is assignable here), but delta-carrying events like
   *  `asyncTransactionsFlushed` expose their payload through it. */
  on(evt: ApiEventName, fn: (event?: unknown) => void): () => void;
  /** Run `fn` with the live api (null-safe). Returns `fallback` when api
   *  hasn't mounted. Pure — never subscribes. */
  use<T>(fn: (api: GridApi) => T, fallback: T): T;
}

// ─── Shared row-change signal ──────────────────────────────────────────────

/**
 * The per-frame, rAF-coalesced summary of what changed in the grid's row
 * model, emitted by the platform's shared `RowChangeBus`. It exists so that
 * data-reactive modules (alerts, conditional-styling, filter counts) DON'T
 * each wire their own `modelUpdated` listener and walk every row on every
 * streaming tick — instead they subscribe once and act on the delta.
 *
 * Two shapes:
 *   - **delta** (`full === false`): `added` / `updated` / `removed` carry the
 *     exact row nodes from the streaming `applyTransactionAsync` flush. This
 *     is the hot path — subscribers evaluate ONLY these nodes.
 *   - **full** (`full === true`): a structural change (sort / filter /
 *     `setRowData`) where the per-row delta is unknown. Rare, user-driven.
 *     Subscribers that need correctness fall back to a whole-grid pass.
 */
export interface RowChange {
  readonly added: ReadonlyArray<IRowNode>;
  readonly updated: ReadonlyArray<IRowNode>;
  readonly removed: ReadonlyArray<IRowNode>;
  readonly full: boolean;
}

export interface RowChangeSignal {
  /** Subscribe to the coalesced per-frame row-change summary. Returns a
   *  disposer. Fires at most once per animation frame. */
  subscribe(fn: (change: RowChange) => void): () => void;
}

/**
 * The rows one transaction changed, in AG-Grid's own shape.
 *
 * Structurally what `applyServerSideTransaction` returns and what a
 * `RowNodeTransaction` carries, so a caller hands its result straight over
 * rather than repackaging it into a third shape.
 */
export interface RowNodeDelta {
  readonly add?: ReadonlyArray<IRowNode> | null;
  readonly update?: ReadonlyArray<IRowNode> | null;
  readonly remove?: ReadonlyArray<IRowNode> | null;
}

/**
 * The WRITE half of the row-change signal — how a delta AG-Grid does not
 * announce reaches {@link RowChangeSignal}'s subscribers.
 *
 * WHY IT EXISTS — the bus reads its deltas from `asyncTransactionsFlushed`,
 * which only `applyTransactionAsync` (client-side row model) fires.
 * `applyServerSideTransaction` fires nothing of the kind: it changes rows and
 * leaves `modelUpdated` as the only trace, which is indistinguishable from a
 * block refetch. So every server-side tick used to classify as a `full`
 * structural change carrying three empty arrays — subscribers paid the
 * whole-grid pass AND learned nothing about what moved.
 *
 * Deliberately NOT on {@link RowChangeSignal}: modules receive the signal and
 * must only ever read it. This is the same containment `GridDataHub.bindSsrm`
 * uses — the binding surface is on the concrete class the platform owns, not
 * on the interface it hands to modules.
 */
export interface RowChangeSink {
  /**
   * Report the rows a transaction just changed. The caller has already
   * applied it; this only tells the bus what moved.
   */
  transactionApplied(delta: RowNodeDelta): void;
}

// ─── Grid data port ───────────────────────────────────────────────────────

/**
 * One row as the data port hands it out.
 *
 * `data` is the live row object — AG-Grid's `node.data` under the client-side
 * row model, the worker's block row under the server-side one. Treat it as
 * read-only and write through {@link GridDataPort.mutate}.
 */
export interface DataRow {
  readonly id: string;
  readonly data: Record<string, unknown>;
}

/**
 * Which rows an operation addresses.
 *
 *  - `'all'` — every row in the dataset. The grid's applied filter model and
 *    quick-filter text are ignored. Under the server-side row model this is
 *    the whole worker row store, NOT the ~2,000-row block cache.
 *  - `'filtered'` — only rows passing the filter model and quick-filter text
 *    the grid has applied right now.
 */
export type DataScope = 'all' | 'filtered';

/**
 * What an operation runs over: a scope, plus an optional extra filter model
 * ANDed on top of it.
 *
 * The shape is whatever a CLIENT-SIDE grid can express, because that is the
 * reference behaviour — the server-side adapter rises to meet it, never the
 * other way round. `{ scope: 'filtered', filterModel }` therefore means what
 * it reads as: rows the user is looking at that ALSO match `filterModel`.
 * Where the worker's RPCs cannot carry that (a filter model naming a column
 * the grid is already filtering on cannot be merged — merging replaces the
 * applied entry rather than intersecting it), the server-side adapter pages
 * the rows and applies the remainder itself. Correct first, cheap second.
 *
 * Consumers in the parity roadmap: pill counts filter the whole dataset by a
 * hypothetical model (`{ filterModel }`), distinct-value dropdowns and header
 * indicators read what the user is looking at (`{ scope: 'filtered' }`).
 */
export interface DataQuery {
  /** Defaults to `'all'`. */
  readonly scope?: DataScope;
  /** An AG-Grid filter model every row must additionally match. */
  readonly filterModel?: Record<string, unknown> | null;
}

/** The aggregations both adapters implement. Deliberately the same five the
 *  worker's `AggFunc` union carries — a sixth here would be a function one
 *  side cannot compute. */
export type DataAggFunc = 'sum' | 'min' | 'max' | 'avg' | 'count';

/**
 * Every read result carries `complete`. It answers "did this cover the scope
 * it was asked for", which is NOT the same question as "how many rows came
 * back" — an empty-but-complete answer means the dataset really is empty,
 * while an empty-and-incomplete one means the port could not look (grid
 * unmounted, source detached, limit hit). Silently conflating the two is the
 * class of defect this port exists to remove.
 */
export interface DataResult {
  readonly complete: boolean;
}

export interface ScanResult extends DataResult {
  /** How many rows the visitor saw. */
  readonly scanned: number;
  /** The visitor returned `false` and the scan ended early, by request. */
  readonly stopped: boolean;
}

export interface DistinctResult extends DataResult {
  /**
   * Distinct values in SOURCE ORDER — the port takes no view on ordering, so
   * sort at the call site when order matters. (The two sources sort
   * differently: AG-Grid yields row order, the worker yields
   * `localeCompare`d strings. Normalising here would mean a comparator that
   * duplicates the one `resolveColumnDistinctValues` already owns.)
   */
  readonly values: readonly unknown[];
  /**
   * The source could only supply STRING projections of the column's values.
   * True for the server-side adapter: its `getSetFilterValues` RPC returns
   * `string[]` and collapses null/undefined to `''`. Consumers that write a
   * chosen value back into a typed field must coerce.
   */
  readonly stringProjected: boolean;
}

export interface AggregateResult extends DataResult {
  /** `null` when no row contributed a numeric value — a blank, not a zero.
   *  `count` legitimately reaches 0 and `sum` keeps its additive identity. */
  readonly value: number | null;
}

export interface CountResult extends DataResult {
  readonly count: number;
}

export interface RowsByIdResult {
  readonly rows: readonly DataRow[];
  /** Ids the port could not resolve. Under the server-side row model these
   *  are rows outside the loaded block window — see
   *  {@link DataCapabilities.canAddressUnloadedRows}. */
  readonly missing: readonly string[];
}

export interface RowsInRangeResult {
  readonly rows: readonly DataRow[];
  /** Displayed indices that resolved to a loading stub or to nothing. */
  readonly missingIndices: readonly number[];
}

/** One row's worth of intent. The adapter — not the caller — decides how to
 *  turn it into a transaction, because that is the row-model-specific part. */
export interface RowPatch {
  readonly rowId: string;
  /** Field name → new value. Fields absent here keep their current value. */
  readonly fields: Readonly<Record<string, unknown>>;
}

export interface MutationRejection {
  readonly rowId: string;
  /** User-facing copy naming why the row did not change. */
  readonly reason: string;
}

export interface MutationResult {
  /** Row ids the grid confirmed. An edit journal may record ONLY these. */
  readonly applied: readonly string[];
  readonly rejected: readonly MutationRejection[];
  /** `rejected.length === 0`. */
  readonly ok: boolean;
}

/**
 * One capability answer. Carries its own user-facing reason so a disabled
 * control and its tooltip come from the same place — a `false` with no
 * explanation is the silent no-op this roadmap exists to remove.
 */
export interface CapabilityVerdict {
  readonly supported: boolean;
  /** Empty when `supported`. Otherwise names the limit AND what the user can
   *  do instead — it is rendered verbatim. */
  readonly reason: string;
}

/**
 * What this grid can do RIGHT NOW. A value, not a method: modules read it
 * during render to decide whether a control is usable, and never branch on
 * which row model produced it.
 *
 * Each key is here because a phase of the parity roadmap needs it. Nothing
 * is added speculatively — a capability that is always `true` on both
 * adapters is dead weight, and a per-call `complete` flag beats a static one.
 */
export interface DataCapabilities {
  /** Reads addressed by row id or by displayed index resolve for ANY row in
   *  the dataset, not only the ones currently materialised. */
  readonly canAddressUnloadedRows: CapabilityVerdict;
  /** AG-Grid's own Excel/CSV export covers the full dataset. It does not go
   *  through this port — the verdict exists so the control can warn. */
  readonly exportCoversFullDataset: CapabilityVerdict;
  /** A JavaScript closure — a custom `comparator`, a compiled `aggFunc` —
   *  reaches the code that orders or aggregates rows. False when that code
   *  lives on the far side of `postMessage`. */
  readonly supportsCustomComparator: CapabilityVerdict;
  /**
   * `scan` / `count` honour an AG-Grid `AdvancedFilterModel`.
   *
   * NOT a verdict on the feature itself. The server-side query plane has
   * evaluated Advanced Filter trees since Phase 1 of the parity roadmap, so
   * the GRID's rows are filtered correctly under either row model — what this
   * reports is whether a figure computed THROUGH THIS PORT is scoped by it,
   * which the server-side adapter cannot do while `getFilterModel()` returns
   * only the column filters. A control that merely turns Advanced Filter on
   * must not be disabled from this.
   */
  readonly supportsAdvancedFilter: CapabilityVerdict;
  /**
   * A confirmed `mutate` reaches the system of record, not just this grid's
   * view of it.
   *
   * Scoped to the PORT. `false` does not mean edits cannot be persisted — it
   * means the adapter alone cannot persist them, which under the server-side
   * row model is by design: the write goes out through the app's own service
   * and comes back on the feed. See `MarketsGridProps.editWriteBack`.
   */
  readonly mutationsReachSource: CapabilityVerdict;
}

export interface DistinctOptions {
  readonly query?: DataQuery;
  /** Stop after this many distinct values. `complete: false` reports the
   *  truncation; WHICH values survive is source-dependent. */
  readonly limit?: number;
}

/**
 * The one way a module reads or writes rows.
 *
 * Modules stop calling `forEachNode` / `getDisplayedRowAtIndex` /
 * `applyTransactionAsync` — those are ClientSideRowModel APIs that degrade to
 * a block-cache window (or to nothing) under the server-side row model, which
 * is how a customizer ends up confidently reporting a wrong total or
 * accepting an edit that never lands. Two adapters implement this port, one
 * per row model, and they are held to one shared contract suite
 * (`portContract.test.ts`) so they cannot drift apart the way the three
 * hand-written filter predicates in this repo did.
 *
 * This is the same move `rows: RowChangeSignal` already made for change
 * notification, extended to read and write. **No module may branch on the row
 * model** — where a capability genuinely cannot exist, {@link capabilities}
 * says so with a reason the UI renders, never a silent no-op.
 *
 * Every method is async: the server-side adapter crosses a worker boundary
 * and the signature must not pretend otherwise.
 *
 * COST — `scan` walks the scope. Under the server-side row model that pages
 * the whole dataset across `postMessage`. Prefer `aggregate`, `count` and
 * `distinct`, which the worker answers in ONE round trip.
 */
export interface GridDataPort {
  readonly capabilities: DataCapabilities;

  /** Visit every row in `query`. Return `false` from `visit` to stop early —
   *  an early stop is a success (`stopped: true`), not an incomplete scan. */
  scan(visit: (row: DataRow) => boolean | void, query?: DataQuery): Promise<ScanResult>;

  /** Distinct values held in one column. */
  distinct(colId: string, options?: DistinctOptions): Promise<DistinctResult>;

  /** Fold one column to a single number. */
  aggregate(colId: string, fn: DataAggFunc, query?: DataQuery): Promise<AggregateResult>;

  /** How many rows `query` matches. */
  count(query?: DataQuery): Promise<CountResult>;

  /** Rows by id. Batched — one round trip, however many ids. */
  getRowsById(ids: readonly string[]): Promise<RowsByIdResult>;

  /** Rows by displayed index, both bounds inclusive. */
  getRowsInRange(startIndex: number, endIndex: number): Promise<RowsInRangeResult>;

  /** Apply row patches. The result names exactly what landed and what did
   *  not — callers record or roll back from it, never from the call itself
   *  having returned. */
  mutate(patches: readonly RowPatch[]): Promise<MutationResult>;
}

// ─── Server-side data source (structural) ─────────────────────────────────

/**
 * The worker RPCs {@link GridDataPort}'s server-side adapter calls.
 *
 * Declared structurally HERE, in core, for the same reason
 * {@link AppDataLookup} is: `@wellsfargo-starui/data` depends on
 * `@wellsfargo-starui/core`, so core cannot import it back. The real
 * `ISsrmDataProvider` satisfies this shape; the grid layer passes one in.
 *
 * It lists only what the adapter uses today. Adding an RPC is later-phase
 * work — where the port has no RPC to stand on, the adapter reports the gap
 * through `capabilities` instead of faking an answer.
 */
export interface SsrmDataSource {
  getRows(req: {
    startRow?: number;
    endRow?: number;
    filterModel?: Record<string, unknown> | null;
    quickFilterText?: string | null;
    /** Fields the quick filter searches — the grid's own columns. Omitted
     *  means every field, which is what the worker matched before the scope
     *  existed. See `quickFilterColumnsOf`. */
    quickFilterColumns?: string[] | null;
    sortModel?: Array<{ colId: string; sort: 'asc' | 'desc' }>;
  }): Promise<{ rowData: Record<string, unknown>[]; rowCount: number }>;

  getSetFilterValues(req: {
    column: string;
    filterModel?: Record<string, unknown> | null;
    quickFilterText?: string | null;
    quickFilterColumns?: string[] | null;
  }): Promise<string[]>;

  getStatusBar(req?: {
    filterModel?: Record<string, unknown> | null;
    quickFilterText?: string | null;
    quickFilterColumns?: string[] | null;
    valueCols?: Array<{ field: string; aggFunc?: string | null }>;
  }): Promise<{
    totalRows: number;
    filteredRows: number;
    /** `value` is `null` when no row contributed one — a blank, not a zero.
     *  The worker's fold is deliberate about that distinction (a 0 price
     *  reads as data), and this port carries it through rather than
     *  flattening it back to 0. */
    aggregations: Array<{ field: string; value: number | null }>;
  }>;
}

/** How a grid tells the platform it is running server-side. */
export interface SsrmDataBinding {
  readonly source: SsrmDataSource;
  /** Field carrying each row's key. Defaults to `'id'` — the same default
   *  every other keyColumn in this repo takes. */
  readonly keyColumn?: string;
  /** Live quick-filter text. AG-Grid does not send `quickFilterText` for the
   *  server-side row model, so the surface supplies it. Falls back to the
   *  grid option when omitted. */
  readonly getQuickFilterText?: () => string;
}

// ─── Resource scope ───────────────────────────────────────────────────────

export interface CssHandle {
  addRule(ruleId: string, cssText: string): void;
  removeRule(ruleId: string): void;
  clear(): void;
}

export interface ExpressionEngineLike {
  parse(source: string): unknown;
  evaluate(node: unknown, ctx: unknown): unknown;
  parseAndEvaluate(source: string, ctx: unknown): unknown;
  /** Compile once to a reusable `(ctx) => value` closure — prefer on hot paths.
   *  `ctx` is `any` (not `unknown`) so the concrete engine's
   *  `(ctx: EvaluationContext) => unknown` stays assignable to this narrow,
   *  expression-type-free interface. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  compile(source: string): (ctx: any) => unknown;
  validate(source: string): { valid: boolean; errors: Array<{ message: string; position: number; length: number }> };
}

/**
 * Read-only adapter over the host application's named-data registry.
 * Mirrors the shape data-services' `AppDataStore` exposes, but typed in
 * core so the column-customization transform / cell-editor wiring
 * doesn't need a hard dep on data-services. Concrete implementations live
 * upstream (typically `widgets-react`'s grid container plumbs an
 * AppDataStore into the platform constructor as this interface).
 *
 * Used by:
 *   - `cellEditorParams.values` for select-style cell editors with a
 *     `valuesSource: '{{providerName.key}}'` binding — the transform
 *     plants a function getter that calls `get(name, key)` at edit time.
 *   - the column-settings cell-editor panel's structured picker —
 *     `listProviders()` + `keysOf(name)` populate the dropdowns so the
 *     user can compose a binding without hand-typing the syntax.
 *   - `subscribe(fn)` for hot-reload UX: when an AppData provider's
 *     values change, callers can refresh whatever computed state
 *     depends on the lookup (e.g. dropdown previews in the editor UI).
 */
export interface AppDataLookup {
  /** Synchronous lookup of a single value. Returns undefined when
   *  the provider name or key isn't known. */
  get(name: string, key: string): unknown;
  /** Snapshot of provider names. Optional — picker UI degrades to a
   *  free-text input if absent. */
  listProviders?(): string[];
  /** Snapshot of available keys on a named provider. Optional. */
  keysOf?(name: string): string[];
  /** Notify on provider/value changes. Returns a disposer. Optional. */
  subscribe?(fn: () => void): () => void;
  /** Optional write path when the host allows grid-driven AppData mutation. */
  set?(name: string, key: string, value: unknown): void | Promise<void>;
}

export interface ResourceScope {
  /** Get (or create) a scoped CssInjector for a module. Idempotent per module id. */
  css(moduleId: string): CssHandle;
  /** The shared ExpressionEngine. Singleton per platform instance. */
  expression(): ExpressionEngineLike;
  /** A typed per-key WeakMap cache. Useful for api-keyed row snapshots etc. */
  cache<K extends object, V>(name: string): WeakMap<K, V>;
  /** Per-platform dirty registry. Panels mark items as dirty/clean via the
   *  `set` method; the `subscribe` method is consumed by `useDirty` / the
   *  `useSyncExternalStore` binding in React. Scoped by arbitrary string key
   *  (typically the item id or `${moduleId}:${itemId}`). Replaces v2's
   *  file-level `dirtyRegistry = new Set()` + `window.dispatchEvent` pattern
   *  so dirty state NEVER bleeds between grids on the same page. */
  dirty(): DirtyBus;
  /** Optional AppData lookup. Returns undefined when the platform was
   *  constructed without an `appData` option (e.g. unit tests, demos
   *  that don't run the full data-services runtime). Consumers MUST handle the
   *  undefined case — typically by falling back to a static value list
   *  or skipping the dynamic features entirely. */
  appData?(): AppDataLookup | undefined;
}

/**
 * A minimal event-notifier for dirty state. Intentionally not typed on the
 * key so callers can pick their own scoping (module id, item id, composite).
 */
export interface DirtyBus {
  /** Mark a key dirty or clean. Coalesces — setting the same state twice
   *  is a no-op and does NOT notify subscribers. */
  set(key: string, dirty: boolean): void;
  /** Is the key currently dirty? */
  isDirty(key: string): boolean;
  /** How many keys are currently dirty. Cheap — maintained incrementally. */
  count(): number;
  /** Every key currently dirty. Snapshot; safe to iterate. */
  keys(): string[];
  /** Subscribe to any change. `fn()` is invoked on every set that actually
   *  flips a key's dirty state. Returns a disposer. */
  subscribe(fn: () => void): () => void;
  /** Clear every key + notify once. Called on platform teardown. */
  reset(): void;
}

// ─── Platform handle passed to modules ────────────────────────────────────

export interface PlatformHandle<S> {
  readonly gridId: string;
  readonly api: ApiHub;
  readonly resources: ResourceScope;
  readonly events: EventBus<PlatformEventMap>;
  /** Shared, rAF-coalesced row-change signal. Subscribe here instead of
   *  wiring a private `modelUpdated` listener that walks every row per tick. */
  readonly rows: RowChangeSignal;
  /** Read + write rows. Call this instead of reaching for `forEachNode` /
   *  `applyTransactionAsync` — those answer for the client-side row model
   *  only, and a module must never branch on which one is running. */
  readonly data: GridDataPort;
  /** Read + write THIS module's state. */
  getState(): S;
  setState(updater: (prev: S) => S): void;
  /** Read another module's state (TYPED at the call site). */
  getModuleState<T>(moduleId: string): T;
  /** Subscribe to THIS module's state changes. */
  subscribe(fn: (state: S, prev: S) => void): () => void;
}

// ─── Module contract ──────────────────────────────────────────────────────

export interface Module<S = unknown> {
  readonly id: string;
  readonly name: string;
  /**
   * Settings-navigation category. Known ids (`options`, `columns`,
   * `styling`, `editing`, `data`) bucket the module into that group of the
   * customizer nav; anything else (or omitting it) lands the module in the
   * trailing "More" group. Purely presentational — never persisted.
   */
  readonly category?: string;
  readonly schemaVersion: number;
  readonly dependencies?: readonly string[];
  readonly priority: number;

  getInitialState(): S;
  serialize(state: S): unknown;
  deserialize(raw: unknown): S;
  migrate?(raw: unknown, fromVersion: number): S;
  /**
   * Module ids this module absorbed. When a snapshot has no envelope under
   * `id` but has one under any of these, the platform hands ALL present
   * legacy envelopes (still `{v, data}`-wrapped) to `migrateLegacy` and
   * stores its result. Saved snapshots only ever write `id` — legacy keys
   * disappear on the next save.
   */
  readonly legacyIds?: readonly string[];
  migrateLegacy?(envelopes: Readonly<Record<string, unknown>>): S;

  /**
   * Single-shot lifecycle. Called after the grid is ready, with the
   * platform handle. Returns a disposer that is invoked on teardown.
   *
   * This replaces v2's split (`onRegister` + `onGridReady` + `onGridDestroy`)
   * with one function whose closure scope holds all the module's runtime
   * state. Means no file-level mutable maps, no race between first
   * `transformColumnDefs` and resource allocation, and one clear cleanup.
   */
  activate?(platform: PlatformHandle<S>): () => void;

  // Pure transforms — run synchronously inside the pipeline runner. Receive
  // current state; do NOT fetch it themselves.
  transformColumnDefs?(defs: AnyColDef[], state: S, ctx: TransformContext): AnyColDef[];
  transformGridOptions?(opts: Partial<GridOptions>, state: S, ctx: TransformContext): Partial<GridOptions>;

  // Optional UI surface — slots filled by React bindings that live next
  // to the module (in `@wellsfargo-starui/grid-react`). Vanilla consumers can
  // ignore. Typed structurally as `(props) => unknown` so this file has
  // no React peer-dep.
  SettingsPanel?: UIComponent<SettingsPanelProps>;
  ListPane?: UIComponent<ListPaneProps>;
  EditorPane?: UIComponent<EditorPaneProps>;
}

export type AnyModule = Module<any>;

/** Context available inside a `transformX` call. */
export interface TransformContext {
  readonly gridId: string;
  readonly getRowId: GetRowIdFunc;
  readonly getModuleState: <T>(moduleId: string) => T;
  readonly resources: ResourceScope;
  readonly api: GridApi | null;
}

// ─── UI slot props ─────────────────────────────────────────────────────────

export interface SettingsPanelProps { gridId: string }
export interface ListPaneProps {
  gridId: string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}
export interface EditorPaneProps {
  gridId: string;
  selectedId: string | null;
}
