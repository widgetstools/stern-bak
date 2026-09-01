import type { GridApi, GridOptions, GetRowIdParams } from 'ag-grid-community';
import { composeRowId } from '@wellsfargo-starui/types';
import { createGridStore } from '../store/createGridStore';
import { ApiHub } from './ApiHub';
import { EventBus } from './EventBus';
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

  /** Restore state for every module that's represented in `snapshot`. */
  deserializeAll(snapshot: Record<string, unknown> | null | undefined): void {
    if (!snapshot || typeof snapshot !== 'object') return;
    for (const m of this.modules) {
      const raw = (snapshot as Record<string, unknown>)[m.id];
      if (raw === undefined) continue;
      const state = this.loadOne(m, raw);
      this.store.replaceModuleState(m.id, state);
      this.events.emit('module:stateChanged', { gridId: this.gridId, moduleId: m.id });
    }
  }

  resetAll(): void {
    for (const m of this.modules) {
      this.store.replaceModuleState(m.id, m.getInitialState());
    }
  }

  /** Restore ONE module's state from its persisted snapshot value, leaving
   *  every other module's state reference — and therefore the pipeline's
   *  memoized transform output for those modules — untouched. Companion to
   *  `deserializeAll` for a caller that knows precisely which module changed
   *  (see `ProfileManager.syncModules`). No-op if `moduleId` isn't registered. */
  deserializeOne(moduleId: string, raw: unknown): void {
    const m = this.modules.find((mod) => mod.id === moduleId);
    if (!m) return;
    const state = this.loadOne(m, raw);
    this.store.replaceModuleState(m.id, state);
    this.events.emit('module:stateChanged', { gridId: this.gridId, moduleId: m.id });
  }

  /** Reset ONE module to its initial state, leaving every other module's
   *  state reference untouched. Companion to `resetAll` — see `deserializeOne`.
   *  No-op if `moduleId` isn't registered. */
  resetOne(moduleId: string): void {
    const m = this.modules.find((mod) => mod.id === moduleId);
    if (!m) return;
    this.store.replaceModuleState(m.id, m.getInitialState());
    this.events.emit('module:stateChanged', { gridId: this.gridId, moduleId: m.id });
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

function isEnvelope(value: unknown): value is SerializedState {
  return (
    typeof value === 'object' &&
    value !== null &&
    'v' in value &&
    'data' in value &&
    typeof (value as { v: unknown }).v === 'number'
  );
}
