import type { GridApi, GridOptions, GetRowIdParams } from 'ag-grid-community';
import { composeRowId } from '@wellsfargo-starui/types';
import { createGridStore } from '../store/createGridStore';
import { ApiHub } from './ApiHub';
import { EventBus } from './EventBus';
import { GridDataHub } from './GridDataHub';
import { PipelineRunner } from './PipelineRunner';
import { ResourceScope } from './ResourceScope';
import { RowChangeBus } from './RowChangeBus';
import { topoSortModules } from './topoSort';
import type {
  AnyColDef,
  AnyModule,
  AppDataLookup,
  PlatformEventMap,
  PlatformHandle,
  SerializedState,
  SsrmDataBinding,
  Store,
  TransformContext,
} from './types';

export interface GridPlatformOptions {
  gridId: string;
  modules: readonly AnyModule[];
  /**
   * Field(s) on each row that uniquely identify it. Defaults to `'id'`.
   * Pass a single string for a one-column key, or an array of column
   * names for a composite key — the values are joined with `-` to form
   * the row id (matches the worker-side cache key produced by the
   * data-services SharedWorkerDataServicesHub).
   */
  rowIdField?: string | readonly string[];
  /**
   * Optional adapter over the host application's named-data registry
   * (e.g. data-services' AppDataStore). Plumbed through to `resources.appData()`
   * so cell-editor `valuesSource: '{{name.key}}'` bindings can resolve at
   * edit time. When omitted, dynamic value-source bindings degrade to
   * empty value lists — features tied to AppData simply don't render.
   */
  appData?: AppDataLookup;
  /**
   * Server-side data plane. When set, `platform.data` reads and writes
   * through the SharedWorker query plane instead of AG-Grid's client-side row
   * model. Omit for a client-side grid.
   *
   * Also bindable after construction — `platform.data.bindSsrm(...)` — because
   * the platform is built before the grid mounts and outlives a provider
   * swap.
   */
  ssrm?: SsrmDataBinding;
}

/**
 * The single per-grid runtime object. Holds:
 *   - `store`         — zustand-vanilla state container
 *   - `api`           — reactive GridApi hub (whenReady + typed events)
 *   - `resources`     — CssInjector + ExpressionEngine + WeakMap caches
 *   - `events`        — typed platform-level pub-sub
 *   - `pipeline`      — cached transformColumnDefs / transformGridOptions
 *   - `activeDisposers` — per-module teardown callbacks from `module.activate`
 *
 * `destroy()` is the ONE cleanup path. There are no file-level globals.
 */
export class GridPlatform {
  readonly gridId: string;
  readonly store: Store;
  readonly api: ApiHub;
  readonly resources: ResourceScope;
  readonly events: EventBus<PlatformEventMap>;
  readonly rows: RowChangeBus;
  readonly data: GridDataHub;

  private readonly pipeline: PipelineRunner;
  private readonly modules: AnyModule[];
  private readonly rowIdField: string | readonly string[];
  /** Stable `getRowId` + base object for the empty-input transform path. */
  private readonly getRowIdFn: (params: GetRowIdParams) => string;
  private readonly transformGridOptionsBase: Partial<GridOptions>;
  private readonly activeDisposers: Array<() => void> = [];
  private mountedGrid = false;
  private destroyed = false;

  constructor(opts: GridPlatformOptions) {
    this.gridId = opts.gridId;
    this.rowIdField = opts.rowIdField ?? 'id';
    this.getRowIdFn = (params: GetRowIdParams) =>
      composeRowId(params.data, this.rowIdField) ?? '';
    this.transformGridOptionsBase = { getRowId: this.getRowIdFn };
    this.modules = topoSortModules(opts.modules);
    this.store = createGridStore({ gridId: opts.gridId, modules: this.modules });
    this.events = new EventBus<PlatformEventMap>();
    this.api = new ApiHub();
    this.rows = new RowChangeBus(this.api);
    this.data = new GridDataHub(this.api);
    if (opts.ssrm) this.data.bindSsrm(opts.ssrm);
    this.resources = new ResourceScope(opts.gridId, { appData: opts.appData });
    this.pipeline = new PipelineRunner();

    for (const m of this.modules) {
      this.events.emit('module:registered', { gridId: this.gridId, moduleId: m.id });
    }
  }

  // ─── Grid lifecycle ──────────────────────────────────────────────────────

  /** Called by the host when AG-Grid fires `onGridReady`. Activates every
   *  module exactly once. */
  onGridReady(api: GridApi): void {
    if (this.destroyed) return;
    this.api.attach(api);
    // Start the shared row-change emitter before modules activate so any
    // module subscribing in `activate` is wired to a live bus. Idempotent.
    this.rows.start();
    if (!this.mountedGrid) {
      this.mountedGrid = true;
      for (const m of this.modules) {
        if (!m.activate) continue;
        const dispose = m.activate(this.platformHandleFor(m));
        if (typeof dispose === 'function') this.activeDisposers.push(dispose);
      }
    }
    this.events.emit('grid:ready', { gridId: this.gridId });
  }

  /** Called by the host when AG-Grid fires `onGridPreDestroyed`. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const dispose of this.activeDisposers.splice(0)) {
      try { dispose(); } catch { /* swallow — teardown must complete */ }
    }
    this.rows.dispose();
    this.api.detach();
    this.pipeline.dispose();
    this.resources.dispose();
    this.events.emit('grid:destroyed', { gridId: this.gridId });
  }

  // ─── Transform pipeline ──────────────────────────────────────────────────

  transformColumnDefs(base: AnyColDef[]): AnyColDef[] {
    return this.pipeline.runColumnDefs(this.modules, base, this.transformContext());
  }

  transformGridOptions(base: Partial<GridOptions> = {}): Partial<GridOptions> {
    const input =
      base.getRowId !== undefined
        ? base
        : Object.keys(base).length === 0
          ? this.transformGridOptionsBase
          : { ...base, getRowId: this.getRowIdFn };
    return this.pipeline.runGridOptions(this.modules, input, this.transformContext());
  }

  // ─── Persistence contract ────────────────────────────────────────────────

  /** Snapshot every module's state as `{ v, data }` envelopes. */
  serializeAll(): Record<string, SerializedState> {
    const out: Record<string, SerializedState> = {};
    for (const m of this.modules) {
      const state = this.store.getModuleState(m.id);
      out[m.id] = { v: m.schemaVersion, data: m.serialize(state) };
    }
    return out;
  }

  /** Restore state for every module that's represented in `snapshot` —
   *  directly under its id, or (for merged modules) under its `legacyIds`. */
  deserializeAll(snapshot: Record<string, unknown> | null | undefined): void {
    if (!snapshot || typeof snapshot !== 'object') return;
    for (const m of this.modules) {
      const raw = (snapshot as Record<string, unknown>)[m.id];
      const state =
        raw !== undefined ? this.loadOne(m, raw) : this.loadFromLegacy(m, snapshot);
      if (state === SKIP) continue;
      this.store.replaceModuleState(m.id, state);
      this.events.emit('module:stateChanged', { gridId: this.gridId, moduleId: m.id });
    }
  }

  resetAll(): void {
    for (const m of this.modules) {
      this.store.replaceModuleState(m.id, m.getInitialState());
    }
  }

  // ─── Read-only accessors ─────────────────────────────────────────────────

  getModules(): readonly AnyModule[] {
    return this.modules;
  }

  // ─── Internals ───────────────────────────────────────────────────────────

  private platformHandleFor<S>(module: AnyModule): PlatformHandle<S> {
    return {
      gridId: this.gridId,
      api: this.api,
      resources: this.resources,
      events: this.events,
      rows: this.rows,
      data: this.data,
      getState: () => this.store.getModuleState<S>(module.id),
      setState: (updater) => this.store.setModuleState<S>(module.id, updater),
      getModuleState: <T,>(id: string) => this.store.getModuleState<T>(id),
      subscribe: (fn) => this.store.subscribeToModule<S>(module.id, fn),
    };
  }

  private transformContext(): TransformContext {
    const field = this.rowIdField;
    return {
      gridId: this.gridId,
      getRowId: (params: GetRowIdParams) =>
        composeRowId(params.data, field) ?? '',
      getModuleState: (id) => this.store.getModuleState(id),
      resources: this.resources,
      api: this.api.api,
    };
  }

  /** Assemble state from legacy envelopes for a module absorbed into `m`,
   *  or `SKIP` when the snapshot has nothing for it. */
  private loadFromLegacy<S>(
    m: AnyModule,
    snapshot: Record<string, unknown>,
  ): S | typeof SKIP {
    if (!m.legacyIds?.length || !m.migrateLegacy) return SKIP;
    const envelopes: Record<string, unknown> = {};
    let found = false;
    for (const id of m.legacyIds) {
      const raw = snapshot[id];
      if (raw === undefined) continue;
      envelopes[id] = raw;
      found = true;
    }
    if (!found) return SKIP;
    try {
      return m.migrateLegacy(envelopes) as S;
    } catch (err) {
      console.warn(`[platform] Module "${m.id}" migrateLegacy failed — falling back to initial:`, err);
      return m.getInitialState() as S;
    }
  }

  private loadOne<S>(m: AnyModule, raw: unknown): S {
    const envelope = isEnvelope(raw) ? raw : null;
    const data = envelope ? envelope.data : raw;
    const version = envelope ? envelope.v : m.schemaVersion; // no envelope → trust

    try {
      if (version === m.schemaVersion) return m.deserialize(data);
      if (m.migrate) return m.migrate(data, version);
      console.warn(
        `[platform] Module "${m.id}" stored v${version}, current v${m.schemaVersion}, no migrate — falling back to initial.`,
      );
      return m.getInitialState();
    } catch (err) {
      console.warn(`[platform] Module "${m.id}" deserialize failed — falling back to initial:`, err);
      return m.getInitialState();
    }
  }
}

/** Sentinel: `deserializeAll` leaves the module's current state untouched. */
const SKIP = Symbol('skip');

function isEnvelope(value: unknown): value is SerializedState {
  return (
    typeof value === 'object' &&
    value !== null &&
    'v' in value &&
    'data' in value &&
    typeof (value as { v: unknown }).v === 'number'
  );
}
