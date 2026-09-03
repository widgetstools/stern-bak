/**
 * Turns (intent, entities) into ONE call on the existing tool layer.
 *
 * The NLP assistant owns no grid logic of its own: every action goes through
 * the same `dispatchTool` the LLM assistant uses, with the same argument
 * shapes (`columnToolSchemas.ts`, `toolSchemas.ts`). That is what keeps the
 * two assistants feature-equivalent — a tool fixed for one is fixed for both.
 */
import type { ToolName } from '../aiAssistant/tools';
import type { AssistantIntent } from './intentClassifier';
import type { ExtractedEntities, FilterClause } from './entityExtractor';

export interface RoutedCall {
  tool: ToolName;
  args: Record<string, unknown>;
  /** Why this tool — shown in the transcript's debug line. */
  reason: string;
}

export type RouteOutcome =
  | { ok: true; call: RoutedCall }
  | { ok: false; needs: 'columns' | 'filter' | 'intent'; message: string };

/** AG-Grid filter model for one clause — the shape `set_filter_model` takes. */
function agFilterFor(clause: FilterClause, numeric: boolean): Record<string, unknown> {
  const v = clause.value;
  if (clause.op === 'in' && Array.isArray(v)) return { filterType: 'set', values: v };
  if (numeric || typeof v === 'number') {
    const type =
      clause.op === 'gt' ? 'greaterThan'
      : clause.op === 'gte' ? 'greaterThanOrEqual'
      : clause.op === 'lt' ? 'lessThan'
      : clause.op === 'lte' ? 'lessThanOrEqual'
      : clause.op === 'ne' ? 'notEqual'
      : 'equals';
    return { filterType: 'number', type, filter: typeof v === 'number' ? v : Number(v) };
  }
  if (clause.op === 'contains') return { filterType: 'text', type: 'contains', filter: String(v) };
  if (clause.op === 'ne') return { filterType: 'text', type: 'notEqual', filter: String(v) };
  return { filterType: 'set', values: [String(v)] };
}

export function routeToTool(
  intent: AssistantIntent,
  e: ExtractedEntities,
  ctx: { targetGridId: string; numericCols: Set<string> },
): RouteOutcome {
  const base = { targetGridId: ctx.targetGridId };
  const aggList = Object.entries(e.aggregations).map(([column, fn]) => ({ column, fn }));

  switch (intent) {
    case 'clear_grouping':
      return { ok: true, call: { tool: 'set_row_grouping', args: { ...base, groupBy: [] }, reason: 'clear grouping/pivot' } };

    case 'group_grid': {
      const groupBy = e.columns.filter((c) => !(c in e.aggregations));
      if (!groupBy.length) return { ok: false, needs: 'columns', message: 'no group-by column' };
      return {
        ok: true,
        call: {
          tool: 'set_row_grouping',
          args: { ...base, groupBy, ...(aggList.length ? { aggregations: e.aggregations } : null) },
          reason: `group rows by ${groupBy.join(' > ')}`,
        },
      };
    }

    case 'pivot_grid': {
      // "pivot by currency" alone: rows = first dimension, columns = the rest;
      // with one column named, rows by it and pivot by it is meaningless, so
      // ask. With two, first is rows, second is columns.
      const dims = e.columns.filter((c) => !(c in e.aggregations));
      if (dims.length < 2) return { ok: false, needs: 'columns', message: 'a pivot needs a row column and a column column' };
      return {
        ok: true,
        call: {
          tool: 'set_row_grouping',
          args: { ...base, groupBy: [dims[0]], pivotBy: dims.slice(1), pivotMode: true, ...(aggList.length ? { aggregations: e.aggregations } : null) },
          reason: `pivot rows by ${dims[0]}, columns by ${dims.slice(1).join(', ')}`,
        },
      };
    }

    case 'sort_data': {
      if (!e.columns.length) return { ok: false, needs: 'columns', message: 'no sort column' };
      return {
        ok: true,
        call: {
          tool: 'set_sort',
          args: { ...base, sortBy: e.columns.map((column) => ({ column, direction: e.sortDirection ?? 'asc' })) },
          reason: `sort by ${e.columns.join(', then ')}`,
        },
      };
    }

    case 'filter_data': {
      if (!e.filters.length) return { ok: false, needs: 'filter', message: 'no filter condition' };
      const filterModel: Record<string, unknown> = {};
      for (const f of e.filters) filterModel[f.column] = agFilterFor(f, ctx.numericCols.has(f.column));
      return { ok: true, call: { tool: 'set_filter_model', args: { ...base, filterModel }, reason: `filter on ${Object.keys(filterModel).join(', ')}` } };
    }

    case 'hide_columns':
      if (!e.columns.length) return { ok: false, needs: 'columns', message: 'no columns to hide' };
      return { ok: true, call: { tool: 'set_column_visibility', args: { ...base, hide: e.columns }, reason: `hide ${e.columns.join(', ')}` } };

    case 'show_columns':
      if (!e.columns.length) return { ok: false, needs: 'columns', message: 'no columns to show' };
      return { ok: true, call: { tool: 'set_column_visibility', args: { ...base, show: e.columns }, reason: `show ${e.columns.join(', ')}` } };

    case 'query_data':
    case 'aggregate_data':
    case 'create_chart': {
      // A question over the rows. Group-by dims are the named columns that
      // aren't being aggregated; with aggregates but no dims, aggregate the
      // whole grid via a single-group trick is not supported, so the query
      // engine returns raw rows and the analysis panel summarises.
      const dims = e.columns.filter((c) => !(c in e.aggregations));
      const args: Record<string, unknown> = { ...base };
      if (dims.length && aggList.length) {
        args.groupBy = dims;
        args.aggregate = aggList;
      } else if (dims.length) {
        args.columns = dims;
      } else if (aggList.length) {
        // Aggregate with nothing to group by: fall back to grid-wide summary.
        return { ok: true, call: { tool: 'summarize_grid_data', args: { ...base, columns: Object.keys(e.aggregations) }, reason: 'grid-wide totals' } };
      }
      if (e.filters.length) args.filter = e.filters;
      if (e.limit) args.limit = e.limit;
      if (e.sortDirection || e.limit) {
        const sortCol = aggList[0] ? `${aggList[0].fn}_${aggList[0].column}` : dims[0];
        if (sortCol) args.sortBy = { column: aggList[0] ? aggList[0].column : sortCol, direction: e.sortDirection ?? 'desc' };
      }
      if (intent === 'create_chart' || e.chartKind) args.chart = e.chartKind ?? 'auto';
      if (!args.groupBy && !args.columns && !args.filter) return { ok: false, needs: 'columns', message: 'nothing to query' };
      return { ok: true, call: { tool: 'query_grid_data', args, reason: intent === 'create_chart' ? 'chart the result' : 'run a query' } };
    }

    case 'format_column':
      if (!e.columns.length) return { ok: false, needs: 'columns', message: 'no column to format' };
      return {
        ok: true,
        call: { tool: 'set_column_style', args: { ...base, colId: e.columns[0], align: 'right' }, reason: `format ${e.columns[0]}` },
      };

    default:
      return { ok: false, needs: 'intent', message: 'unrecognised request' };
  }
}
