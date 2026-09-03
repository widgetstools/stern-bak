/**
 * Template-based responses. No LLM writes prose here: every sentence is a
 * fixed template filled from the tool result, so what the assistant says is
 * exactly what the tool did.
 */
import type { AssistantIntent } from './intentClassifier';
import type { ExtractedEntities } from './entityExtractor';

export interface ResponseContext {
  intent: AssistantIntent;
  entities: ExtractedEntities;
  gridName?: string;
  toolSummary?: string;
  ok: boolean;
  error?: string;
  confidence: number;
  source: 'local' | 'server';
}

function list(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function aggList(aggs: Record<string, string>): string {
  return list(Object.entries(aggs).map(([c, f]) => `${f}(${c})`));
}

export function generateResponse(ctx: ResponseContext): string {
  const grid = ctx.gridName ? `"${ctx.gridName}"` : 'the grid';

  if (!ctx.ok) {
    return `I couldn't do that${ctx.error ? `: ${ctx.error}` : '.'}`;
  }

  // Prefer the tool's own summary — it already reports side effects
  // (hidden columns, reloads) the template can't know about.
  if (ctx.toolSummary) return ctx.toolSummary;

  const e = ctx.entities;
  switch (ctx.intent) {
    case 'group_grid':
      return `Grouped ${grid} by ${list(e.columns)}${Object.keys(e.aggregations).length ? `, aggregating ${aggList(e.aggregations)}` : ''}.`;
    case 'pivot_grid':
      return `Pivoted ${grid} by ${list(e.columns)}.`;
    case 'sort_data':
      return `Sorted ${grid} by ${list(e.columns)} ${e.sortDirection ?? 'ascending'}.`;
    case 'filter_data':
      return `Filtered ${grid} on ${list(e.filters.map((f) => `${f.column} ${f.op} ${f.value}`))}.`;
    case 'hide_columns':
      return `Hid ${list(e.columns)} on ${grid}.`;
    case 'show_columns':
      return `Showing ${list(e.columns)} on ${grid}.`;
    case 'clear_grouping':
      return `Cleared grouping and pivot on ${grid}; hidden columns are back.`;
    case 'query_data':
    case 'aggregate_data':
      return `Ran the query on ${grid} — results are in the analysis panel.`;
    case 'create_chart':
      return `Drew a ${e.chartKind ?? 'chart'} of ${list(e.columns)} for ${grid}.`;
    case 'format_column':
      return `Formatted ${list(e.columns)} on ${grid}.`;
    default:
      return "I didn't understand that. Try: \"group by sector\", \"sort by notional desc\", \"hide cusip\", \"show me total notional by desk\".";
  }
}

/** What to say when nothing matched well enough to act on. */
export function clarificationFor(intent: AssistantIntent, entities: ExtractedEntities): string {
  if (entities.unresolved.length) {
    return `I couldn't find a column called ${list(entities.unresolved.map((u) => `"${u}"`))}. Which column did you mean?`;
  }
  switch (intent) {
    case 'group_grid':
    case 'pivot_grid':
      return 'Which column should I group by?';
    case 'sort_data':
      return 'Which column should I sort by?';
    case 'hide_columns':
    case 'show_columns':
      return 'Which columns?';
    case 'filter_data':
      return 'What condition should the filter use? e.g. "where sector is Financials".';
    default:
      return 'Could you rephrase that? I can group, pivot, sort, filter, hide/show columns, run queries and draw charts.';
  }
}
