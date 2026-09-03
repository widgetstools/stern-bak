/**
 * Entity extraction: resolves the user's words to real column ids, aggregate
 * functions, sort directions, filter clauses and chart kinds — without an LLM.
 *
 * Column resolution reuses the same fuzzy matching the LLM tools already use
 * (`columnResolver.ts`), so "market value", "Market Value" and "marketValue"
 * all land on the one colId.
 */

export interface CatalogueColumn {
  colId: string;
  headerName: string;
  numeric: boolean;
}

export type AggFn = 'sum' | 'avg' | 'min' | 'max' | 'count' | 'first' | 'last';
export type SortDir = 'asc' | 'desc';
export type ChartKind = 'bar' | 'line' | 'pie' | 'scatter' | 'area' | 'auto';

export interface FilterClause {
  column: string;
  op: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'in';
  value: string | number | string[];
}

export interface ExtractedEntities {
  columns: string[];
  unresolved: string[];
  aggregations: Record<string, AggFn>;
  sortDirection?: SortDir;
  filters: FilterClause[];
  chartKind?: ChartKind;
  limit?: number;
}

const AGG_WORDS: Record<string, AggFn> = {
  sum: 'sum',
  total: 'sum',
  totals: 'sum',
  add: 'sum',
  average: 'avg',
  avg: 'avg',
  mean: 'avg',
  minimum: 'min',
  min: 'min',
  lowest: 'min',
  smallest: 'min',
  maximum: 'max',
  max: 'max',
  highest: 'max',
  largest: 'max',
  count: 'count',
  number: 'count',
  'how many': 'count',
};

const CHART_WORDS: Record<string, ChartKind> = {
  bar: 'bar',
  column: 'bar',
  line: 'line',
  trend: 'line',
  pie: 'pie',
  donut: 'pie',
  scatter: 'scatter',
  area: 'area',
};

const OP_WORDS: Array<[RegExp, FilterClause['op']]> = [
  [/(?:greater than|more than|above|over|>)/i, 'gt'],
  [/(?:at least|>=|no less than)/i, 'gte'],
  [/(?:less than|below|under|<)/i, 'lt'],
  [/(?:at most|<=|no more than)/i, 'lte'],
  [/(?:not equal|isn't|is not|!=|<>)/i, 'ne'],
  [/(?:contains|containing|like|includes)/i, 'contains'],
  [/(?:equals?|is|=|==)/i, 'eq'],
];

/** Stop words that are never column names. */
const STOP = new Set([
  'the', 'a', 'an', 'by', 'on', 'of', 'and', 'or', 'to', 'in', 'for', 'with', 'then', 'me', 'my',
  'show', 'group', 'pivot', 'sort', 'filter', 'hide', 'display', 'chart', 'graph', 'plot',
  'grid', 'blotter', 'table', 'rows', 'row', 'columns', 'column', 'data', 'value', 'values',
  'asc', 'ascending', 'desc', 'descending', 'where', 'only', 'all', 'please', 'can', 'you',
  'sum', 'total', 'average', 'avg', 'count', 'min', 'max', 'mean', 'top', 'bottom',
]);

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Score how well a phrase matches a catalogue column. 1 = exact, 0 = none. */
function matchScore(phrase: string, col: CatalogueColumn): number {
  const p = norm(phrase);
  if (!p) return 0;
  const id = norm(col.colId);
  const header = norm(col.headerName);
  if (p === id || p === header) return 1;
  if (id.startsWith(p) || header.startsWith(p)) return 0.85;
  if (id.includes(p) || header.includes(p)) return 0.7;
  // Token overlap for multi-word headers ("Market Value" vs "value")
  const words = col.headerName.toLowerCase().split(/\s+/).map(norm);
  const hit = words.filter((w) => w && (w === p || p.includes(w) || w.includes(p))).length;
  return hit ? Math.min(0.6, 0.3 * hit) : 0;
}

/** Resolve one phrase to the best-matching colId, if any is good enough. */
export function resolveColumn(phrase: string, catalogue: CatalogueColumn[]): string | undefined {
  let best: { colId: string; score: number } | undefined;
  for (const col of catalogue) {
    const score = matchScore(phrase, col);
    if (score > (best?.score ?? 0)) best = { colId: col.colId, score };
  }
  return best && best.score >= 0.6 ? best.colId : undefined;
}

/**
 * Pull candidate column phrases out of free text: quoted strings, camelCase
 * tokens, and 1–3 word runs that aren't stop words. Each is tried against the
 * catalogue; the longest matching run wins so "market value" beats "value".
 */
function candidatePhrases(input: string): string[] {
  const out: string[] = [];
  for (const m of input.matchAll(/["'“”‘’]([^"'“”‘’]+)["'“”‘’]/g)) out.push(m[1]);
  const words = input
    .replace(/["'“”‘’,;:()]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  for (let i = 0; i < words.length; i++) {
    for (let len = 3; len >= 1; len--) {
      const run = words.slice(i, i + len);
      if (run.length < len) continue;
      if (run.some((w) => STOP.has(w.toLowerCase()))) continue;
      out.push(run.join(' '));
    }
  }
  return out;
}

export function extractEntities(input: string, catalogue: CatalogueColumn[]): ExtractedEntities {
  const lower = input.toLowerCase();
  const found: Array<{ colId: string; at: number }> = [];
  const unresolved: string[] = [];
  const seen = new Set<string>();

  // Longest phrases first so a multi-word header claims its words before the
  // single-word fallbacks do.
  const phrases = candidatePhrases(input).sort((a, b) => b.length - a.length);
  const claimed = new Set<string>();
  for (const phrase of phrases) {
    const key = phrase.toLowerCase();
    if ([...claimed].some((c) => c.includes(key))) continue;
    const colId = resolveColumn(phrase, catalogue);
    if (colId) {
      if (!seen.has(colId)) {
        found.push({ colId, at: lower.indexOf(key) });
        seen.add(colId);
      }
      claimed.add(key);
    }
  }
  const columns = found.sort((a, b) => a.at - b.at).map((f) => f.colId);

  // Aggregations: "sum of notional", "average yield", "total market value"
  const aggregations: Record<string, AggFn> = {};
  for (const [word, fn] of Object.entries(AGG_WORDS)) {
    const re = new RegExp(`\\b${word}\\b(?:\\s+(?:of|the))?\\s+([a-zA-Z][a-zA-Z0-9 ]{0,40}?)(?=\\s*[,;]|\\s+(?:by|and|then|where|for)\\b|$)`, 'i');
    const m = input.match(re);
    if (m) {
      const colId = resolveColumn(m[1].trim(), catalogue);
      if (colId) aggregations[colId] = fn;
    }
  }

  // Sort direction
  let sortDirection: SortDir | undefined;
  if (/\b(desc|descending|highest first|largest first|top)\b/i.test(lower)) sortDirection = 'desc';
  else if (/\b(asc|ascending|lowest first|smallest first|bottom)\b/i.test(lower)) sortDirection = 'asc';

  // Filters: "where sector is Financials", "with notional over 1m"
  const filters: FilterClause[] = [];
  const filterRe = /\b(?:where|with|for|having|only|and|or)\s+([a-zA-Z][a-zA-Z0-9 ]{0,40}?)\s+(is not|isn't|is|equals?|=|==|!=|<>|contains?|containing|like|includes?|greater than|more than|above|over|at least|less than|below|under|at most|>=|<=|>|<)\s+([^,;]+?)(?=\s+(?:and|or|then|sorted|sort|group|order)\b|$)/gi;
  for (const m of input.matchAll(filterRe)) {
    const colId = resolveColumn(m[1].trim(), catalogue);
    if (!colId) {
      unresolved.push(m[1].trim());
      continue;
    }
    const opWord = m[2];
    const op = OP_WORDS.find(([re]) => re.test(opWord))?.[1] ?? 'eq';
    const rawVal = m[3].trim().replace(/^["'“”‘’]|["'“”‘’]$/g, '');
    filters.push({ column: colId, op, value: parseValue(rawVal) });
  }

  // Chart kind
  let chartKind: ChartKind | undefined;
  for (const [word, kind] of Object.entries(CHART_WORDS)) {
    if (new RegExp(`\\b${word}\\b`, 'i').test(lower)) {
      chartKind = kind;
      break;
    }
  }
  if (!chartKind && /\b(chart|graph|plot|visuali[sz]e)\b/i.test(lower)) chartKind = 'auto';

  // Limit: "top 10", "first 5"
  const limitMatch = lower.match(/\b(?:top|first|bottom|last)\s+(\d{1,4})\b/);
  const limit = limitMatch ? Number(limitMatch[1]) : undefined;

  return { columns, unresolved, aggregations, sortDirection, filters, chartKind, limit };
}

/** "1m" → 1_000_000, "250k" → 250_000, "1,234.5" → 1234.5, else the string. */
function parseValue(raw: string): string | number {
  const m = raw.replace(/,/g, '').match(/^(-?\d+(?:\.\d+)?)\s*([kmb]|mm|bn)?$/i);
  if (!m) return raw;
  const n = Number(m[1]);
  const suffix = (m[2] ?? '').toLowerCase();
  const mult = suffix === 'k' ? 1e3 : suffix === 'm' || suffix === 'mm' ? 1e6 : suffix === 'b' || suffix === 'bn' ? 1e9 : 1;
  return n * mult;
}
