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
import { doesRowMatchFilterModel } from '../filters/filtersToolbarLogic';
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
  mutationsReachSource: {
    supported: false,
    reason:
      'Edits change this grid only — the shared data service keeps its own copy ' +
      'and will replace them on the next refresh.',
  },
};

const NOT_MOUNTED = 'The grid is not ready yet.';

export class SsrmDataAdapter implements GridDataPort {
  private readonly source: SsrmDataSource;
  private readonly keyColumn: string;
  private readonly getQuickFilterText?: () => string;

  constructor(
    private readonly hub: ApiHub,
    binding: SsrmDataBinding,
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
      return { count: scan.scanned, complete: scan.complete };
    }
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
      status = api.applyServerSideTransaction({ update: assembled.map((a) => a.row) })?.status;
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

    return {
      applied: assembled.map((a) => a.rowId),
      rejected,
      ok: rejected.length === 0,
    };
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

/** The scope half of every RPC this adapter makes. */
interface SourceRequest {
  filterModel: Record<string, unknown> | null;
  quickFilterText: string | null;
  quickFilterColumns: string[] | null;
}

function nonEmpty(model: Record<string, unknown>): Record<string, unknown> | null {
  return Object.keys(model).length > 0 ? model : null;
}
