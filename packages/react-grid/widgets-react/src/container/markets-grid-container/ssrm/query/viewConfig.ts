import type { IServerSideGetRowsRequest } from 'ag-grid-community';
import type { ViewConfigUpdate } from '@perspective-dev/client';
import type { Aggregate, Sort } from '../types.js';
import type { PerspectiveSchema } from '../schema.js';
import { CHILD_COUNT_FIELD } from '../rows.js';
import { createFilterBuilder } from './filters.js';
import { chooseAggregate, maxAliasFor, maxExpressionFor } from './aggregates.js';

/**
 * What a request is asking Perspective for.
 *
 * - `group`  one level of the group tree: the children of `groupKeys`, keyed by
 *            `groupColumn` and carrying the aggregates of everything beneath.
 * - `leaf`   the rows themselves, once the request has descended past the last
 *            row-group column (or when nothing is grouped at all).
 * - `total`  a single aggregate row, which is what pivot mode shows when no
 *            row-group columns are active.
 */
export type QueryShape =
  | { kind: 'group'; groupColumn: string }
  | { kind: 'leaf' }
  | { kind: 'total' };

export type PerspectiveQuery = {
  config: ViewConfigUpdate;
  shape: QueryShape;
  /** Value columns carried on group rows, in request order. */
  valueColumns: string[];
  /** True when the filter cannot match anything, so the query can be skipped. */
  matchNothing: boolean;
  /** Conditions that could not be translated exactly. */
  unsupported: string[];
  /**
   * Derived columns holding a null-free maximum, mapped back to the column they
   * stand for so the row mappers can undo the substitution.
   */
  maxAliases?: Record<string, string>;
};

export type BuildQueryOptions = {
  request: IServerSideGetRowsRequest;
  schema: PerspectiveSchema;
  /** Every column the grid may render for a leaf row. */
  leafColumns: string[];
  /**
   * `request.groupKeys` with each key restored to its original type, when the
   * datasource still has it. Only used for filtering; the level still comes
   * from the length of `request.groupKeys`.
   */
  typedGroupKeys?: readonly unknown[];
};

export function buildQuery({
  request,
  schema,
  leafColumns,
  typedGroupKeys,
}: BuildQueryOptions): PerspectiveQuery {
  const known = (colId: string) => Boolean(schema[colId]);
  /*
   * A group column the table does not have would otherwise be dropped from the
   * column list while its key stayed in `groupKeys`, shifting every key one
   * position along and filtering each level by the wrong column's value. The
   * keys are dropped in step instead.
   */
  const allGroupColumns = request.rowGroupCols.map((col) => col.id);
  const rowGroupColumns = allGroupColumns.filter(known);
  const keptGroupKey = allGroupColumns.map(known);
  const pivotColumns = request.pivotMode ? request.pivotCols.map((col) => col.id).filter(known) : [];
  const requestKeys = typedGroupKeys ?? request.groupKeys ?? [];
  const groupKeys = requestKeys.filter((_, i) => keptGroupKey[i] ?? true);
  const level = groupKeys.length;

  /*
   * Value columns are resolved before anything else is built, because an
   * aggregate the engine will not accept has to be dropped here rather than
   * aborting the view read later.
   */
  const aggregates: Record<string, Aggregate> = {};
  const valueColumns: string[] = [];
  const maxAliases: Record<string, string> = {};
  const maxExpressions: Record<string, string> = {};
  const unsupportedAggregates: string[] = [];
  for (const col of request.valueCols) {
    if (!known(col.id)) continue;
    const choice = chooseAggregate(col.aggFunc, schema[col.id], col.id);
    if (choice.kind === 'unsupported') {
      unsupportedAggregates.push(choice.reason);
      continue;
    }
    if (choice.kind === 'max') {
      const alias = maxAliasFor(col.id);
      maxAliases[alias] = col.id;
      maxExpressions[alias] = maxExpressionFor(col.id);
      valueColumns.push(alias);
      aggregates[alias] = 'max';
      continue;
    }
    valueColumns.push(col.id);
    aggregates[col.id] = choice.aggregate;
  }

  const filters = createFilterBuilder(schema);
  filters.addModel(request.filterModel);
  filters.addGroupPath(rowGroupColumns, groupKeys);
  const plan = filters.plan();
  const base: ViewConfigUpdate = {
    filter: plan.filter,
    expressions: { ...plan.expressions, ...maxExpressions },
  };
  const common = {
    valueColumns,
    matchNothing: plan.matchNothing,
    unsupported: [...plan.unsupported, ...unsupportedAggregates],
    maxAliases,
  };

  // Pivot mode with no row grouping shows one aggregate row for the whole set.
  if (request.pivotMode && rowGroupColumns.length === 0) {
    return {
      ...common,
      shape: { kind: 'total' },
      config: {
        ...base,
        columns: valueColumns,
        aggregates,
        split_by: pivotColumns,
        group_rollup_mode: 'total',
      },
    };
  }

  if (level < rowGroupColumns.length) {
    const groupColumn = rowGroupColumns[level];
    /*
     * A group row holds its key and its aggregates, so a sort on anything else
     * has nothing to sort by. Rather than drop it — which looks to the user
     * like the sort did nothing — the column is aggregated with `any`, giving
     * each group a representative value to order by. It is a representative
     * value, not a total: sorting groups by a column that was never aggregated
     * is only ever approximate, and this makes it deterministic rather than
     * silently ignored.
     */
    const sortable = new Set([groupColumn, ...valueColumns]);
    const representative: string[] = [];
    for (const item of request.sortModel) {
      if (sortable.has(item.colId) || !known(item.colId)) continue;
      if (request.pivotMode) continue;
      sortable.add(item.colId);
      representative.push(item.colId);
    }
    const sort = toSort(request, sortable);
    /*
     * A constant column summed per group is the group's leaf count, which is
     * what `getChildCount` reports.
     *
     * Neither the child counter nor a representative sort column may be added
     * while pivoting. Under a `split_by` the engine fans every extra column out
     * per pivot key, and `column_paths()` — which becomes `pivotResultFields` —
     * then carries `X|__pspChildCount`, `Y|desk` and so on as if they were real
     * pivot columns. The test is `pivotMode`, not the number of pivot columns:
     * `column_paths()` is read whenever pivot mode is on, including before the
     * user has chosen a pivot column.
     */
    const extras = request.pivotMode ? [] : [CHILD_COUNT_FIELD, ...representative];
    const columns = [...valueColumns, ...extras];
    const expressions = request.pivotMode
      ? base.expressions
      : { ...base.expressions, [CHILD_COUNT_FIELD]: '1' };
    if (!request.pivotMode) {
      aggregates[CHILD_COUNT_FIELD] = 'sum';
      for (const colId of representative) aggregates[colId] = 'any';
    }
    return {
      ...common,
      shape: { kind: 'group', groupColumn },
      config: {
        ...base,
        expressions,
        group_by: [groupColumn],
        // "flat" drops the level's own total row, so the view holds exactly the
        // children AG Grid asked for: num_rows() is the child count and a row
        // window maps straight onto a block, with no off-by-one for the total.
        group_rollup_mode: 'flat',
        columns,
        aggregates,
        split_by: pivotColumns,
        sort,
      },
    };
  }

  return {
    ...common,
    shape: { kind: 'leaf' },
    config: {
      ...base,
      columns: leafColumns,
      sort: toSort(request, new Set(leafColumns)),
    },
  };
}

function toSort(request: IServerSideGetRowsRequest, sortable: Set<string>): Sort[] {
  const sort: Sort[] = [];
  for (const item of request.sortModel) {
    if (!sortable.has(item.colId)) continue;
    sort.push([item.colId, item.sort === 'desc' ? 'desc' : 'asc']);
  }
  return sort;
}

/**
 * A stable identity for a view config, so two requests that differ only in
 * which rows they want share one Perspective view rather than building the
 * aggregate tree again.
 */
export function viewCacheKey(config: ViewConfigUpdate): string {
  return JSON.stringify(config);
}
