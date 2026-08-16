/**
 * {@link GridDataPort} over AG-Grid's ClientSideRowModel.
 *
 * This adapter is the REFERENCE behaviour — a CSRM grid is what the
 * server-side one has to rise to, never the other way round. It is a thin
 * wrapper over the calls modules make today (`forEachNode`,
 * `forEachNodeAfterFilter`, `getCellValue`, `applyTransactionAsync`), so
 * routing a module through the port cannot change what that module does.
 *
 * Two deliberate departures, both invisible until a caller exists:
 *
 *  1. `mutate` settles on AG-Grid's async-transaction CALLBACK, not on the
 *     call returning. `applyTransactionAsync` returns `void`; the editing
 *     modules currently `await` that `undefined`, which resolves immediately
 *     and is why the edit journal can record an edit that never landed. The
 *     port's contract is that a confirmation means confirmed.
 *  2. A patch for a row the grid does not hold is REPORTED, where
 *     `buildRowUpdatesFromPatches` invents `{ id: rowId }` and lets AG-Grid
 *     drop it silently.
 */
import type { GridApi, IRowNode } from 'ag-grid-community';
import { getValueByPath } from '@wellsfargo-starui/types';
import {
  assertFilterModelSupported,
  doesRowMatchFilterModel,
} from '../filters/filterPredicate';
import { UnsupportedQueryError } from '../filters/UnsupportedQueryError';
import { beginFold, finishFold, foldValue } from './foldColumn';
import type { ApiHub } from './types';
import {
  assemblePatchRows,
  indicesBetween,
  readRowsById,
  readRowsInRange,
  rejectAllPatches,
} from './gridApiRows';
import type {
  AggregateResult,
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
} from './types';

const SUPPORTED = { supported: true, reason: '' } as const;

/** Everything the client-side row model holds, it holds in this window. */
const CSRM_CAPABILITIES: DataCapabilities = {
  canAddressUnloadedRows: SUPPORTED,
  exportCoversFullDataset: SUPPORTED,
  supportsCustomComparator: SUPPORTED,
  supportsAdvancedFilter: SUPPORTED,
  mutationsReachSource: SUPPORTED,
};

const NOT_MOUNTED = 'The grid is not ready yet.';

interface VisitedRow {
  node: IRowNode;
  row: DataRow;
}

export class CsrmDataAdapter implements GridDataPort {
  constructor(private readonly hub: ApiHub) {}

  get capabilities(): DataCapabilities {
    return CSRM_CAPABILITIES;
  }

  async scan(
    visit: (row: DataRow) => boolean | void,
    query: DataQuery = {},
  ): Promise<ScanResult> {
    const api = this.hub.api;
    if (!api) return { scanned: 0, stopped: false, complete: false };
    let scanned = 0;
    let stopped = false;
    const complete = forEachRow(api, query, ({ row }) => {
      scanned += 1;
      if (visit(row) === false) {
        stopped = true;
        return false;
      }
      return true;
    });
    return { scanned, stopped, complete };
  }

  async distinct(colId: string, options: DistinctOptions = {}): Promise<DistinctResult> {
    const api = this.hub.api;
    if (!api) {
      return { values: [], stringProjected: false, complete: false };
    }
    const limit = options.limit ?? Number.POSITIVE_INFINITY;
    const seen = new Set<string>();
    const values: unknown[] = [];
    let truncated = false;

    const complete = forEachRow(api, options.query ?? {}, ({ node }) => {
      // `getCellValue` — not the raw field — so a column backed by a
      // valueGetter (a calculated column) lists what the user sees. The
      // worker's `getSetFilterValues` answers from rows it has already
      // enriched with the same calculated fields, so the two agree.
      const value = api.getCellValue({ rowNode: node, colKey: colId });
      const key = safeKey(value);
      if (seen.has(key)) return true;
      seen.add(key);
      values.push(value);
      if (values.length >= limit) {
        truncated = true;
        return false;
      }
      return true;
    });

    return { values, stringProjected: false, complete: complete && !truncated };
  }

  async aggregate(
    colId: string,
    fn: DataAggFunc,
    query: DataQuery = {},
  ): Promise<AggregateResult> {
    const api = this.hub.api;
    if (!api) return { value: null, complete: false };
    const fold = beginFold();
    const complete = forEachRow(api, query, ({ row }) => {
      foldValue(fold, getValueByPath(row.data, colId));
      return true;
    });
    return { value: complete ? finishFold(fold, fn) : null, complete };
  }

  async count(query: DataQuery = {}): Promise<CountResult> {
    const api = this.hub.api;
    if (!api) return { count: 0, complete: false };
    let count = 0;
    const complete = forEachRow(api, query, () => {
      count += 1;
      return true;
    });
    return { count, complete };
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
      reason: 'That row is no longer in the grid.',
    }));
    if (assembled.length === 0) {
      return { applied: [], rejected, ok: rejected.length === 0 };
    }

    // Resolve on AG-Grid's flush callback: the transaction is asynchronous by
    // design (it batches with every other one in the frame), so "it returned"
    // and "it landed" are different moments.
    await new Promise<void>((resolve) => {
      api.applyTransactionAsync({ update: assembled.map((a) => a.row) }, () => resolve());
    });

    return {
      applied: assembled.map((a) => a.rowId),
      rejected,
      ok: rejected.length === 0,
    };
  }
}

// ─── Shared helpers ────────────────────────────────────────────────────────

/**
 * Walk the rows `query` addresses. `fn` returns `false` to stop. Returns
 * whether the walk covered the scope it was asked for — the `complete` every
 * read result carries.
 *
 * `scope: 'filtered'` is `forEachNodeAfterFilter` — AG-Grid's own answer,
 * quick-filter text included. `scope: 'all'` is `forEachNode`. An extra
 * `filterModel` is ANDed on top with `doesRowMatchFilterModel`, the ONE
 * predicate the query plane evaluates blocks with.
 *
 * This combination is the reference the server-side adapter has to match —
 * per-row AND, in both scopes, with no restriction on which columns the extra
 * model may name.
 *
 * A model the predicate cannot evaluate is REFUSED before the first row, not
 * per row: the verdict must read the request, so an empty grid rejects exactly
 * what a full one does. The refusal surfaces as `complete: false` rather than
 * as a throw, because that is the channel every port method already has and
 * every caller already reads — and because "the port could not look" is
 * precisely what it means.
 */
function forEachRow(
  api: GridApi,
  query: DataQuery,
  fn: (visited: VisitedRow) => boolean,
): boolean {
  const filterModel = query.filterModel;
  const hasExtraFilter = !!filterModel && Object.keys(filterModel).length > 0;
  if (hasExtraFilter) {
    try {
      assertFilterModelSupported(filterModel);
    } catch (err) {
      if (err instanceof UnsupportedQueryError) return false;
      throw err;
    }
  }
  let stop = false;

  const each = (node: IRowNode): void => {
    if (stop) return;
    const data = node.data as Record<string, unknown> | undefined;
    // Group / footer nodes carry no data. `getAllRowsSnapshot` skips them
    // today for the same reason: they are not rows of the dataset.
    if (!data || typeof data !== 'object') return;
    if (hasExtraFilter && !doesRowMatchFilterModel(data, filterModel)) return;
    const id = typeof node.id === 'string' ? node.id : '';
    if (!fn({ node, row: { id, data } })) stop = true;
  };

  try {
    if (query.scope === 'filtered') api.forEachNodeAfterFilter(each);
    else api.forEachNode(each);
  } catch {
    /* api mid-teardown — the caller's `complete` still reports what ran */
  }
  return true;
}

function safeKey(value: unknown): string {
  try {
    return JSON.stringify(value) ?? 'undefined';
  } catch {
    return String(value);
  }
}

