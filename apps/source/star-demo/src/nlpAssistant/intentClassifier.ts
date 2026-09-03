/**
 * Local, LLM-free intent classification.
 *
 * Ordered, word-bounded patterns rather than bag-of-keywords: "show me a
 * chart" is a chart request, not a column-visibility one, and "ipsum" must
 * not match "sum". Specific phrasings score higher than generic verbs so a
 * sentence that mentions several things lands on the one it is about.
 */

export type AssistantIntent =
  | 'group_grid'
  | 'pivot_grid'
  | 'filter_data'
  | 'sort_data'
  | 'hide_columns'
  | 'show_columns'
  | 'query_data'
  | 'create_chart'
  | 'format_column'
  | 'aggregate_data'
  | 'clear_grouping'
  | 'unknown';

export interface IntentResult {
  intent: AssistantIntent;
  /** 0–1. Below `MIN_CONFIDENCE` the intent is reported as `unknown`. */
  confidence: number;
  /** The patterns that fired, for the transcript's debug line. */
  keywords: string[];
  parameters: Record<string, string[]>;
}

export const MIN_CONFIDENCE = 0.3;

interface Rule {
  intent: AssistantIntent;
  pattern: RegExp;
  weight: number;
}

/**
 * Highest weight = most specific. Weights add per intent and are capped at 1,
 * so two weak generic hits can still lose to one strong specific one.
 */
const RULES: Rule[] = [
  // Clearing wins over everything: "clear the grouping" mentions grouping.
  { intent: 'clear_grouping', pattern: /\b(clear|reset|remove|drop)\s+(the\s+)?(grouping|groups?|pivot(ing)?)\b/i, weight: 1 },
  { intent: 'clear_grouping', pattern: /\b(flatten|ungroup|un-group|unpivot)\b/i, weight: 1 },

  { intent: 'create_chart', pattern: /\b(bar|line|pie|donut|scatter|area)\s+(chart|graph|plot)\b/i, weight: 1 },
  { intent: 'create_chart', pattern: /\b(chart|graph|plot|visuali[sz]e|draw)\b/i, weight: 0.9 },
  { intent: 'create_chart', pattern: /\bas\s+a\s+(chart|graph|pie|bar|line)\b/i, weight: 1 },

  { intent: 'pivot_grid', pattern: /\b(pivot|cross[- ]?tab|crosstab)\b/i, weight: 1 },

  { intent: 'group_grid', pattern: /\b(group|roll\s*up|bucket|aggregate|summari[sz]e)\s+(the\s+)?(rows?\s+|grid\s+|data\s+)?(by|on|per)\b/i, weight: 1 },
  { intent: 'group_grid', pattern: /\b(group|roll\s*up)\b/i, weight: 0.6 },

  { intent: 'sort_data', pattern: /\b(sort|order|arrange|rank)(ed)?\s+(the\s+)?(rows?\s+|grid\s+)?(by|on)\b/i, weight: 1 },
  { intent: 'sort_data', pattern: /\b(sort|order by|arrange)\b/i, weight: 0.6 },
  { intent: 'sort_data', pattern: /\b(asc|ascending|desc|descending)\b/i, weight: 0.3 },

  { intent: 'filter_data', pattern: /\b(filter|where|only\s+(the\s+)?(rows|ones)|show\s+only|keep\s+only|exclude|just\s+the)\b/i, weight: 1 },
  { intent: 'filter_data', pattern: /\bwith\s+\w[\w ]*\s+(over|under|above|below|greater|less|more|at least|at most|is|equals?|contains?)\b/i, weight: 0.8 },

  { intent: 'hide_columns', pattern: /\b(hide|remove|drop|delete|get\s+rid\s+of)\s+(the\s+)?(\w[\w ]*\s+)?(columns?)?\b/i, weight: 0.9 },
  { intent: 'hide_columns', pattern: /\bdon'?t\s+show\b/i, weight: 1 },

  // "show"/"display" is column visibility only when it is not "show me",
  // "show only", "show rows", or paired with a chart/query verb.
  { intent: 'show_columns', pattern: /\b(show|display|unhide|reveal|bring\s+back|add)\s+(the\s+)?(?!me\b|only\b|rows?\b|all\s+rows|a\s+|an\s+|top\b|what\b|how\b)\w/i, weight: 0.8 },
  { intent: 'show_columns', pattern: /\b(unhide|reveal|bring\s+back)\b/i, weight: 1 },

  { intent: 'query_data', pattern: /\b(what|which|how\s+many|how\s+much|list|show\s+me|give\s+me|tell\s+me|find)\b/i, weight: 0.9 },
  { intent: 'query_data', pattern: /\b(top|bottom|first|last)\s+\d+\b/i, weight: 0.8 },

  { intent: 'aggregate_data', pattern: /\b(total|sum|average|avg|mean|count|minimum|maximum|min|max)\s+(of\s+)?(the\s+)?\w/i, weight: 0.7 },

  { intent: 'format_column', pattern: /\b(format|align|decimal(s| places)?|right[- ]align|left[- ]align|colou?r|width|resize|rename)\b/i, weight: 1 },
];

/** Deterministic tie-break: the more specific intent wins. */
const PRIORITY: AssistantIntent[] = [
  'clear_grouping', 'create_chart', 'pivot_grid', 'format_column', 'filter_data', 'sort_data',
  'group_grid', 'hide_columns', 'query_data', 'aggregate_data', 'show_columns', 'unknown',
];

export function classifyIntent(input: string): IntentResult {
  const scores = new Map<AssistantIntent, number>();
  const fired: string[] = [];
  for (const rule of RULES) {
    const m = rule.pattern.exec(input);
    if (!m) continue;
    scores.set(rule.intent, Math.min(1, (scores.get(rule.intent) ?? 0) + rule.weight));
    fired.push(m[0].trim().toLowerCase());
  }

  // A grouping request that also names an aggregate is still a grouping
  // request — the aggregate is a parameter of it, not a competing intent.
  if (scores.has('group_grid') || scores.has('pivot_grid')) scores.delete('aggregate_data');
  // "show me the top 10" is a query even though "top 10" alone is weak.
  if (scores.has('query_data') && scores.has('show_columns')) scores.delete('show_columns');
  // A chart of an aggregate is a chart.
  if (scores.has('create_chart')) {
    scores.delete('aggregate_data');
    scores.delete('query_data');
    scores.delete('show_columns');
  }

  let best: AssistantIntent = 'unknown';
  let bestScore = 0;
  for (const intent of PRIORITY) {
    const s = scores.get(intent) ?? 0;
    if (s > bestScore) {
      best = intent;
      bestScore = s;
    }
  }

  const confidence = bestScore >= MIN_CONFIDENCE ? bestScore : 0;
  return {
    intent: confidence > 0 ? best : 'unknown',
    confidence,
    keywords: [...new Set(fired)],
    parameters: {},
  };
}

/**
 * Whether the server model should have a look. The local pipeline is precise
 * on the phrasings it knows and blind to everything else, so anything it is
 * not sure about is worth a round trip when a server is up.
 */
export function shouldUseServerNLP(result: IntentResult): boolean {
  return result.intent === 'unknown' || result.confidence < 0.6;
}
