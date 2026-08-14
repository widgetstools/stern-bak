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
