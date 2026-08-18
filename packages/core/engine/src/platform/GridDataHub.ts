/**
 * The stable {@link GridDataPort} handed to every module, delegating to
 * whichever adapter matches the row model this grid is running right now.
 *
 * WHY A FACADE — modules capture `platform.data` once, in `activate()`, and
 * hold it for the life of the grid. The row model underneath does not have
 * that lifetime: the platform is constructed before AG-Grid mounts, an SSRM
 * grid's provider can be re-bound without the platform being torn down, and
 * a provider that fails to create must still leave the customizer reachable
 * (roadmap Phase 8). A constructor-time choice of adapter would be wrong in
 * every one of those windows.
 *
 * This is the same shape {@link ApiHub} already uses for the GridApi: one
 * stable object, `attach`/`detach` underneath. `capabilities` is read through
 * a getter for exactly that reason — it is what this grid can do RIGHT NOW,
 * so a control disabled while the server-side source is binding re-enables
 * itself when the answer changes.
 *
 * The hub is NOT a third implementation: it forwards, and holds no row logic.
 */
import { CsrmDataAdapter } from './CsrmDataAdapter';
import { SsrmDataAdapter } from './SsrmDataAdapter';
import type {
  AggregateResult,
  ApiHub,
  CountResult,
  DataAggFunc,
  DataCapabilities,
  DataQuery,
  DataRow,
  DistinctOptions,
  DistinctResult,
  GridDataPort,
  MutationResult,
  RowChangeSink,
  RowPatch,
  RowsByIdResult,
  RowsInRangeResult,
  ScanResult,
  SsrmDataBinding,
} from './types';

export class GridDataHub implements GridDataPort {
  private readonly csrm: CsrmDataAdapter;
  private ssrm: SsrmDataAdapter | null = null;

  /**
   * `rows` is where the server-side adapter reports what its writes changed.
   * The client-side adapter takes no sink: `applyTransactionAsync` fires
   * `asyncTransactionsFlushed` and the bus hears that itself.
   *
   * `events` is how a capability CHANGE reaches the UI. Reading through a
   * getter is what makes the answer current; announcing the change is what
   * makes a rendered control notice.
   */
  constructor(
    private readonly hub: ApiHub,
    private readonly rows: RowChangeSink,
    private readonly events: CapabilityChangeSink,
  ) {
    this.csrm = new CsrmDataAdapter(hub);
  }

  /** Route reads and writes at the server-side plane. Idempotent per
   *  binding; pass a new binding when the provider is replaced. */
  bindSsrm(binding: SsrmDataBinding): void {
    this.ssrm = new SsrmDataAdapter(this.hub, binding, this.rows);
    this.announce();
  }

  /** Fall back to the client-side row model. */
  unbindSsrm(): void {
    if (this.ssrm === null) return;
    this.ssrm = null;
    this.announce();
  }

  /** The live adapter. Not exposed on {@link GridDataPort} — a module that
   *  could reach the concrete adapter could branch on the row model. */
  private get active(): GridDataPort {
    return this.ssrm ?? this.csrm;
  }

  get capabilities(): DataCapabilities {
    return this.active.capabilities;
  }

  scan(visit: (row: DataRow) => boolean | void, query?: DataQuery): Promise<ScanResult> {
    return this.active.scan(visit, query);
  }

  distinct(colId: string, options?: DistinctOptions): Promise<DistinctResult> {
    return this.active.distinct(colId, options);
  }

  aggregate(colId: string, fn: DataAggFunc, query?: DataQuery): Promise<AggregateResult> {
    return this.active.aggregate(colId, fn, query);
  }

  count(query?: DataQuery): Promise<CountResult> {
    return this.active.count(query);
  }

  getRowsById(ids: readonly string[]): Promise<RowsByIdResult> {
    return this.active.getRowsById(ids);
  }

  getRowsInRange(startIndex: number, endIndex: number): Promise<RowsInRangeResult> {
    return this.active.getRowsInRange(startIndex, endIndex);
  }

  mutate(patches: readonly RowPatch[]): Promise<MutationResult> {
    return this.active.mutate(patches);
  }

  setRowExclusion(expression: string | null): Promise<void> {
    return this.active.setRowExclusion(expression);
  }

  private announce(): void {
    this.events.emit('data:capabilitiesChanged', { gridId: this.events.gridId });
  }
}

/**
 * The slice of the platform the hub needs to announce a capability change.
 *
 * Narrowed on purpose: the hub takes the ability to say one thing, not the
 * whole event bus. A hub that could emit `profile:loaded` would be a hub that
 * could be mistaken for a place profile logic belongs.
 */
export interface CapabilityChangeSink {
  readonly gridId: string;
  emit(event: 'data:capabilitiesChanged', payload: { gridId: string }): void;
}
