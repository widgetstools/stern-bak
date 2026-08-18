/**
 * {@link GridDataPort} over the SharedWorker query plane.
 *
 * The worker already holds the WHOLE dataset and already filters, counts and
 * aggregates it correctly — that work was built and then never connected at
 * the module layer, which is why a customizer can render a `SUM([price])`
 * that revises itself as the user scrolls. This adapter is the connection.
 *
 * It is built strictly on the RPCs that exist today:
 *
 *   `getRows`             → `scan`, `count` (a zero-row block returns
 *                            `rowCount` without materialising anything —
 *                            the mechanism the filter pills already use)
 *   `getSetFilterValues`  → `distinct`
 *   `getStatusBar`        → `aggregate` (the only RPC that folds a column)
 *
 * Where no RPC exists the gap is REPORTED through `capabilities`, never
 * faked. Addressed reads and writes fall back to the grid api, which under
 * this row model reaches the loaded block window only — so
 * `canAddressUnloadedRows` and `mutationsReachSource` both say no, with copy
 * the UI renders verbatim.
 */
import { getValueByPath } from '@wellsfargo-starui/types';
import {
  assertFilterModelSupported,
  doesRowMatchFilterModel,
} from '../filters/filterPredicate';
import { UnsupportedQueryError } from '../filters/UnsupportedQueryError';
import { beginFold, finishFold, foldValue } from './foldColumn';
import { quickFilterColumnsOf } from './quickFilterColumns';
import {
  assemblePatchRows,
  indicesBetween,
  readRowsById,
  readRowsInRange,
  rejectAllPatches,
} from './gridApiRows';
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
  MutationRejection,
  MutationResult,
  RowChangeSink,
  RowPatch,
  RowsByIdResult,
  RowsInRangeResult,
  ScanResult,
  SsrmDataBinding,
  SsrmDataSource,
} from './types';

/**
 * Rows per `getRows` round trip while scanning. Large enough that a scan of a
 * normal blotter is a couple of messages, small enough that one message never
 * serialises a 100,000-row dataset in a single structured clone.
 */
const SCAN_PAGE_ROWS = 2_000;

const SUPPORTED = { supported: true, reason: '' } as const;

/**
 * Reason strings are user-facing copy. Each one names the limit AND what the
 * user can do instead — Phase 6 renders them in tooltips beside a disabled
 * control, so "not supported" on its own would just be a politer silent
 * no-op.
 */
const SSRM_CAPABILITIES: DataCapabilities = {
  canAddressUnloadedRows: {
    supported: false,
    reason:
      'This grid loads rows from the server as you scroll, so rows outside the ' +
      'loaded range can’t be reached. Filter the view down to the rows you need, ' +
      'or scroll them into view first.',
  },
  exportCoversFullDataset: {
    supported: false,
    reason:
      'Export writes the rows this grid has loaded, not the full server-side ' +
      'dataset. Filter the view to the rows you need before exporting.',
  },
  supportsCustomComparator: {
    supported: false,
    reason:
      'Sorting and aggregation run on the server for this grid, so a custom ' +
      'function written here can’t be applied. Use one of the built-in ' +
      'aggregations instead.',
  },
  supportsAdvancedFilter: {
    supported: false,
    reason:
      'Counts and totals here are calculated from the column filters. The ' +
      'Advanced Filter narrows the rows this grid shows, but is not applied to ' +
      'these figures — use the column filters if the two need to agree.',
  },
  // Says what the ADAPTER can do. Since the session layer landed that is more
  // than it was — the edit is recorded with the query plane, so it survives a
  // block refetch and this window keeps seeing it — but it is still not a
  // write to the SOURCE: the plane holds it per session, no other window sees
  // it, and nothing has persisted. It is not a verdict on whether editing
  // works either: an app that wires `editWriteBack` persists through its own
  // write service and the value returns on the feed, which is the architecture
  // this row model is built for. Without one, the sentence below is the whole
  // truth.
  mutationsReachSource: {
    supported: false,
    reason:
      'Edits stay in this window — the shared data service keeps its own copy, ' +
      'and nobody else sees them. Persisting them needs the ' +
      "grid's `editWriteBack` wired to a write service.",
  },
};

const NOT_MOUNTED = 'The grid is not ready yet.';

export class SsrmDataAdapter implements GridDataPort {
  private readonly source: SsrmDataSource;
  private readonly keyColumn: string;
  private readonly getQuickFilterText?: () => string;

  /**
   * `rows` is how a write reaches the row-change subscribers. Under the
   * client-side row model an edit produces an `asyncTransactionsFlushed` the
   * bus hears by itself, so alerts, timed activations and the filter badges
   * all see it; `applyServerSideTransaction` fires nothing equivalent, and
   * without this report the same edit would be silent to every one of them.
   */
  constructor(
    private readonly hub: ApiHub,
    binding: SsrmDataBinding,
    private readonly rows: RowChangeSink,
  ) {
    this.source = binding.source;
    this.keyColumn = binding.keyColumn ?? 'id';
    this.getQuickFilterText = binding.getQuickFilterText;
  }

  get capabilities(): DataCapabilities {
    return SSRM_CAPABILITIES;
  }

  async scan(
    visit: (row: DataRow) => boolean | void,
    query: DataQuery = {},
  ): Promise<ScanResult> {
    const plan = this.planFor(query);
    // The residual is the half of the caller's model the RPC could not carry,
    // so this side has to evaluate it — and therefore this side has to be able
    // to refuse it. Raised once, before the first page: the verdict reads the
    // request, never the rows. The worker refuses its own half the same way,
    // and both arrive here as `complete: false` — the port's honest channel for
    // "could not look", which is not the same answer as "found nothing".
    if (plan.residual && !supported(plan.residual)) {
      return { scanned: 0, stopped: false, complete: false };
    }
    let scanned = 0;
    let fetched = 0;

    for (;;) {
      let page: { rowData: Record<string, unknown>[]; rowCount: number };
      try {
        page = await this.source.getRows({
          ...plan.request,
          startRow: fetched,
          endRow: fetched + SCAN_PAGE_ROWS,
        });
      } catch {
        return { scanned, stopped: false, complete: false };
      }
      for (const data of page.rowData) {
        // The residual predicate is the part of the caller's filter model the
        // RPC could not carry. Checking it here is what lets `scope:
        // 'filtered'` accept ANY extra model, matching the client-side grid.
        if (plan.residual && !doesRowMatchFilterModel(data, plan.residual)) continue;
        scanned += 1;
        if (visit({ id: this.idOf(data), data }) === false) {
          return { scanned, stopped: true, complete: true };
        }
      }
      // Paging tracks rows FETCHED, not rows visited — a residual predicate
      // must never shorten the walk.
      fetched += page.rowData.length;
      // A short page or a satisfied count ends it. The length guard is what
      // stops an empty page from looping forever.
      if (page.rowData.length === 0 || fetched >= page.rowCount) {
        return { scanned, stopped: false, complete: true };
      }
    }
  }

  /**
   * `getSetFilterValues` is the one-round-trip answer, but it DELETES the
   * requested column's own entry from the filter model — a set-filter panel
   * must show its column's whole domain, not the domain its own selection has
   * already narrowed. That makes it the wrong answer to "what values are in
   * the rows the user is looking at" whenever that column is filtered, so
   * those calls fall back to a scan, as does any query carrying a residual.
   */
  async distinct(colId: string, options: DistinctOptions = {}): Promise<DistinctResult> {
    const query = options.query ?? {};
    const plan = this.planFor(query);
    const columnIsFiltered = !!plan.request.filterModel && colId in plan.request.filterModel;
    return plan.residual || columnIsFiltered
      ? this.distinctByScan(colId, query, options.limit)
      : this.distinctByRpc(colId, plan.request, options.limit);
  }

  async aggregate(
    colId: string,
    fn: DataAggFunc,
    query: DataQuery = {},
  ): Promise<AggregateResult> {
    const plan = this.planFor(query);
    if (plan.residual) return this.aggregateByScan(colId, fn, query);
    if (!supported(plan.request.filterModel)) return { value: null, complete: false };
    try {
      const summary = await this.source.getStatusBar({
        ...plan.request,
        valueCols: [{ field: colId, aggFunc: fn }],
      });
      const entry = summary.aggregations.find((a) => a.field === colId);
      return { value: entry ? entry.value : null, complete: true };
    } catch {
      return { value: null, complete: false };
    }
  }

  async count(query: DataQuery = {}): Promise<CountResult> {
    const plan = this.planFor(query);
    if (plan.residual) {
      const scan = await this.scan(() => {}, query);
      return { count: scan.complete ? scan.scanned : 0, complete: scan.complete };
    }
    if (!supported(plan.request.filterModel)) return { count: 0, complete: false };
    try {
      // A zero-row block: the plane filters the whole row store and answers
      // with `rowCount` alone.
      const result = await this.source.getRows({ ...plan.request, startRow: 0, endRow: 0 });
      return { count: result.rowCount, complete: true };
    } catch {
      return { count: 0, complete: false };
    }
  }

  async getRowsById(ids: readonly string[]): Promise<RowsByIdResult> {
    const api = this.hub.api;
    if (!api) return { rows: [], missing: [...ids] };
    return readRowsById(api, ids);
  }

  async getRowsInRange(startIndex: number, endIndex: number): Promise<RowsInRangeResult> {
    const api = this.hub.api;
    if (!api) return { rows: [], missingIndices: indicesBetween(startIndex, endIndex) };
    return readRowsInRange(api, startIndex, endIndex);
  }

  async mutate(patches: readonly RowPatch[]): Promise<MutationResult> {
    if (patches.length === 0) return { applied: [], rejected: [], ok: true };
    const api = this.hub.api;
    if (!api) return rejectAllPatches(patches, NOT_MOUNTED);

    const { assembled, unresolved } = assemblePatchRows(api, patches);
    const rejected: MutationRejection[] = unresolved.map((rowId) => ({
      rowId,
      reason: SSRM_CAPABILITIES.canAddressUnloadedRows.reason,
    }));
    if (assembled.length === 0) {
      return { applied: [], rejected, ok: rejected.length === 0 };
    }

    // `applyServerSideTransaction` is synchronous and reports its own status;
    // there is no flush callback to wait on. Anything other than `Applied`
    // means the store refused the update — a route that does not exist, or a
    // block still loading.
    let status: string | undefined;
    try {
      const result = api.applyServerSideTransaction({ update: assembled.map((a) => a.row) });
      status = result?.status;
      // The nodes the store actually touched — the only description of this
      // write anything downstream will ever get.
      if (result) this.rows.transactionApplied(result);
    } catch {
      status = undefined;
    }
    if (status !== 'Applied') {
      return {
        applied: [],
        rejected: [
          ...rejected,
          ...assembled.map((a) => ({
            rowId: a.rowId,
            reason:
              'The grid is still loading those rows from the server. Try again in a moment.',
          })),
        ],
        ok: false,
      };
    }

    const applied = assembled.map((a) => a.rowId);

    // The transaction above wrote into AG Grid's BLOCK CACHE and nowhere else,
    // so the edit lived exactly as long as the block did: a purge-refresh —
    // which `bindSsrmTicks` schedules 50 ms after every tick under an active
    // sort — refetched the row from the plane and silently restored the old
    // value. Recording the patch with the plane is what makes the edit survive
    // that, and it stays private to this session: the row store is shared by
    // every window on the provider, so writing there would leak one window's
    // uncommitted edit into all of them.
    //
    // Fire-and-forget with the promise swallowed on purpose. The edit is
    // already on screen and already reported to `rows`; a failed round trip
    // means the value reverts on the next refetch, which is the behaviour that
    // existed before this call and not a reason to fail a write that landed.
    const session = sessionPatchesFrom(patches, applied);
    if (this.source.setSessionPatches && session.length > 0) {
      void this.source.setSessionPatches(session).catch(() => {});
    }

    return {
      applied,
      rejected,
      ok: rejected.length === 0,
    };
  }

  /**
   * Hand the exclusion rule to the plane, then make the grid ask again.
   *
   * A purge is required, not merely tidy: every loaded block was built by a
   * query that did not carry this rule, so without one the rows it excludes
   * stay on screen until something else happens to evict them.
   *
   * A source with no `setSessionExclude` degrades to the previous behaviour —
   * the rule is inert under this row model — rather than throwing at a
   * customizer panel that has no way to act on it.
   */
  async setRowExclusion(expression: string | null): Promise<void> {
    if (!this.source.setSessionExclude) return;
    try {
      await this.source.setSessionExclude(expression);
    } catch {
      return;
    }
    this.hub.use((api) => api.refreshServerSide({ purge: true }), undefined);
  }

  // ─── Internals ───────────────────────────────────────────────────────────

  private async distinctByRpc(
    colId: string,
    request: SourceRequest,
    limit: number | undefined,
  ): Promise<DistinctResult> {
    let values: string[];
    try {
      values = await this.source.getSetFilterValues({ column: colId, ...request });
    } catch {
      return { values: [], stringProjected: true, complete: false };
    }
    const truncated = typeof limit === 'number' && values.length > limit;
    return {
      values: truncated ? values.slice(0, limit) : values,
      // The RPC's return type is `string[]`; null and undefined arrive as ''.
      stringProjected: true,
      complete: !truncated,
    };
  }

  private async distinctByScan(
    colId: string,
    query: DataQuery,
    limit: number | undefined,
  ): Promise<DistinctResult> {
    const seen = new Set<string>();
    let truncated = false;
    const scan = await this.scan((row) => {
      const value = getValueByPath(row.data, colId);
      seen.add(value == null ? '' : String(value));
      if (typeof limit === 'number' && seen.size >= limit) {
        truncated = true;
        return false;
      }
      return true;
    }, query);
    return {
      // String-projected on purpose: the RPC path cannot do better, and one
      // method must not return two different value types.
      values: [...seen],
      stringProjected: true,
      complete: scan.complete && !truncated,
    };
  }

  private async aggregateByScan(
    colId: string,
    fn: DataAggFunc,
    query: DataQuery,
  ): Promise<AggregateResult> {
    const fold = beginFold();
    const scan = await this.scan((row) => {
      foldValue(fold, getValueByPath(row.data, colId));
    }, query);
    return { value: finishFold(fold, fn), complete: scan.complete };
  }

  /**
   * Split a {@link DataQuery} into the request the worker can honour and the
   * predicate this side has to apply itself.
   *
   * `scope: 'filtered'` reads the grid's live filter model plus the
   * quick-filter text (AG-Grid never sends the latter for this row model, so
   * the surface supplies it and the grid option is the fallback). `scope:
   * 'all'` sends only the caller's own model.
   *
   * The split exists because filter models MERGE by column id: an extra
   * entry for a column the grid is already filtering on would REPLACE the
   * applied one, where a client-side grid intersects them. Those overlapping
   * entries become the `residual`, checked per row against the same predicate
   * the client-side adapter uses — so the two give the same answer, and the
   * one-round-trip path still serves every query without an overlap.
   */
  private planFor(query: DataQuery): {
    request: SourceRequest;
    residual: Record<string, unknown> | null;
  } {
    const extra = query.filterModel ?? {};
    if (query.scope !== 'filtered') {
      return {
        request: {
          filterModel: nonEmpty(extra),
          quickFilterText: null,
          quickFilterColumns: null,
        },
        residual: null,
      };
    }

    const applied = this.hub.use((api) => api.getFilterModel(), null) ?? {};
    const merged: Record<string, unknown> = { ...applied };
    const residual: Record<string, unknown> = {};
    for (const [colId, model] of Object.entries(extra)) {
      if (colId in applied) residual[colId] = model;
      else merged[colId] = model;
    }
    const quickFilterText = this.quickFilterText();
    return {
      request: {
        filterModel: nonEmpty(merged),
        quickFilterText,
        // The grid's own column scope, so the port's idea of "the rows the
        // user is looking at" is the grid's — a quick filter that skips a
        // hidden column here has to skip it there too.
        quickFilterColumns: quickFilterText
          ? this.hub.use((api) => quickFilterColumnsOf(api) ?? null, null)
          : null,
      },
      residual: nonEmpty(residual),
    };
  }

  private quickFilterText(): string | null {
    const text =
      this.getQuickFilterText?.() ??
      this.hub.use((api) => String(api.getGridOption('quickFilterText') ?? ''), '');
    return text ? text : null;
  }

  private idOf(data: Record<string, unknown>): string {
    const key = getValueByPath(data, this.keyColumn) ?? data.__ssrmGroupKey;
    return key == null ? '' : String(key);
  }
}

/**
 * The FIELDS this session wrote, grouped by row — never the assembled row.
 *
 * `assemblePatchRows` produces whole rows because both AG Grid transaction
 * APIs take whole rows, but sending one as a session patch would shadow every
 * column at its value-as-of-the-edit and hold it there until the source
 * happened to tick that exact column. The caller's own `RowPatch.fields` is
 * the honest answer to "what did this session change", and it is what lets the
 * plane's source-wins rule work per field.
 *
 * Restricted to the rows that actually landed: a patch the transaction refused
 * must not survive in the plane as though it had been applied.
 */
function sessionPatchesFrom(
  patches: readonly RowPatch[],
  applied: readonly string[],
): Array<{ key: string; fields: Record<string, unknown> }> {
  const landed = new Set(applied);
  const byRow = new Map<string, Record<string, unknown>>();
  for (const patch of patches) {
    if (!landed.has(patch.rowId)) continue;
    const existing = byRow.get(patch.rowId);
    if (existing) Object.assign(existing, patch.fields);
    else byRow.set(patch.rowId, { ...patch.fields });
  }
  return [...byRow].map(([key, fields]) => ({ key, fields }));
}

/** The scope half of every RPC this adapter makes. */
interface SourceRequest {
  filterModel: Record<string, unknown> | null;
  quickFilterText: string | null;
  quickFilterColumns: string[] | null;
}

function nonEmpty(model: Record<string, unknown>): Record<string, unknown> | null {
  return Object.keys(model).length > 0 ? model : null;
}

/**
 * Whether the shared predicate can evaluate this model at all.
 *
 * Asking here as well as at the worker is not a second check of the same
 * thing: it saves a round trip whose only possible answer is the refusal this
 * side already knows, and it keeps the two halves of a split query — the
 * request and its residual — held to one standard.
 */
function supported(model: Record<string, unknown> | null): boolean {
  if (!model) return true;
  try {
    assertFilterModelSupported(model);
    return true;
  } catch (err) {
    if (err instanceof UnsupportedQueryError) return false;
    throw err;
  }
}
