/**
 * Editor-agnostic completion data for the ExpressionEngine DSL.
 *
 * Extracted verbatim from the former Monaco `completions.ts` so the operator
 * catalogue, bracket scanner and default function provider are shared by any
 * editor implementation. Only the thin provider-registration wrapper was
 * Monaco-specific; everything here is plain data + pure functions.
 */
import { ExpressionEngine } from '@wellsfargo-starui/engine';

export type ColumnsFn = () => Array<{ colId: string; headerName: string; dataType?: string }>;
export type FunctionsFn = () => Array<{ name: string; category: string; signature: string; description: string }>;

/**
 * Operator / keyword catalogue surfaced in the completion widget.
 *
 * Covers every structural piece of the DSL beyond columns and functions:
 *   - Logical keywords: AND, OR, NOT
 *   - Set membership: IN, BETWEEN
 *   - Comparisons: ==, !=, <>, <, >, <=, >=
 *   - Arithmetic: +, -, *, /, %
 *   - Literals: true, false, null
 *
 * Each entry carries a short `detail` line for the suggest widget's right
 * column and a `docs` block for hover preview — traders authoring predicates
 * see usage inline without opening the help palette. `snippet: true` entries
 * drop the user straight into a placeholder so `IN ` expands to `IN [$0]`
 * with the caret inside the array.
 */
export interface OpSpec {
  label: string;
  detail: string;
  kind: 'keyword' | 'operator' | 'control';
  /** Text inserted into the editor. Defaults to `label` when omitted. */
  insertText?: string;
  /** If true, `insertText` is a snippet template (see toCodeMirrorSnippet). */
  snippet?: boolean;
  docs?: string;
}

export const OPERATORS_AND_KEYWORDS: ReadonlyArray<OpSpec> = [
  // ── Logical joiners ──────────────────────────────────────────────────
  { label: 'AND', detail: 'Logical AND', kind: 'keyword', docs: '`a AND b` — true when both operands are true. Left-to-right short-circuit.' },
  { label: 'OR',  detail: 'Logical OR',  kind: 'keyword', docs: '`a OR b` — true when either operand is true. Left-to-right short-circuit.' },
  { label: 'NOT', detail: 'Logical NOT', kind: 'keyword', docs: '`NOT expr` — negates a boolean value.' },

  // ── Set / range membership ──────────────────────────────────────────
  { label: 'IN', detail: 'Set membership', kind: 'keyword', insertText: 'IN [$0]', snippet: true, docs: '`x IN [a, b, c]` — true when x equals any element of the array.' },
  { label: 'BETWEEN', detail: 'Range check', kind: 'keyword', insertText: 'BETWEEN $1 AND $0', snippet: true, docs: '`x BETWEEN low AND high` — true when `low <= x <= high` (inclusive).' },

  // ── Literals ────────────────────────────────────────────────────────
  { label: 'true', detail: 'Boolean true', kind: 'keyword' },
  { label: 'false', detail: 'Boolean false', kind: 'keyword' },
  { label: 'null', detail: 'Null literal', kind: 'keyword' },

  // ── Control flow (sugar — both fold into short-circuiting ternaries) ──
  { label: 'CASE', detail: 'Multi-branch (SQL-style)', kind: 'control', insertText: 'CASE WHEN ${1:cond} THEN ${2:result} ELSE ${0:fallback} END', snippet: true, docs: '`CASE WHEN c1 THEN r1 [WHEN …] [ELSE e] END` — first matching branch wins; short-circuits.' },
  { label: 'WHEN', detail: 'CASE branch', kind: 'control', insertText: 'WHEN ${1:cond} THEN ${0:result}', snippet: true, docs: 'A `WHEN cond THEN result` branch inside a CASE.' },
  { label: 'THEN', detail: 'CASE result', kind: 'keyword' },
  { label: 'END', detail: 'CASE terminator', kind: 'keyword' },
  { label: 'if … else', detail: 'Conditional block', kind: 'control', insertText: 'if (${1:cond}) {\n  return ${2:a}\n} else {\n  return ${0:b}\n}', snippet: true, docs: '`if (cond) { return a } else { return b }` — JS-style conditional; supports `else if`; short-circuits.' },
  { label: 'else', detail: 'if / CASE branch', kind: 'keyword' },

  // ── Comparison operators ────────────────────────────────────────────
  { label: '==', detail: 'Equal to', kind: 'operator', docs: '`a == b` — true when operands compare equal.' },
  { label: '!=', detail: 'Not equal to', kind: 'operator', docs: '`a != b` — true when operands differ. Synonym: `<>`.' },
  { label: '<>', detail: 'Not equal to (SQL-style)', kind: 'operator' },
  { label: '<',  detail: 'Less than', kind: 'operator' },
  { label: '>',  detail: 'Greater than', kind: 'operator' },
  { label: '<=', detail: 'Less than or equal', kind: 'operator' },
  { label: '>=', detail: 'Greater than or equal', kind: 'operator' },

  // ── Arithmetic ──────────────────────────────────────────────────────
  { label: '+', detail: 'Addition / concatenation', kind: 'operator', docs: 'Numeric addition. For strings, prefer `CONCAT(a, b)`.' },
  { label: '-', detail: 'Subtraction', kind: 'operator' },
  { label: '*', detail: 'Multiplication', kind: 'operator' },
  { label: '/', detail: 'Division', kind: 'operator' },
  { label: '%', detail: 'Modulus', kind: 'operator' },
];

/** Returns the character of the last unclosed bracket in the text (or null).
 *  Respects string literals so `"text with ["` doesn't count. Cheap left-to-right
 *  scan — fine for single-line expressions. */
export function findUnclosedBracket(text: string): '[' | '{' | null {
  const stack: Array<'[' | '{'> = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"' || ch === "'") {
      const quote = ch;
      i++;
      while (i < text.length && text[i] !== quote) {
        if (text[i] === '\\') i++;
        i++;
      }
      i++;
      continue;
    }
    if (ch === '[' || ch === '{') stack.push(ch);
    else if (ch === ']') { if (stack[stack.length - 1] === '[') stack.pop(); }
    else if (ch === '}') { if (stack[stack.length - 1] === '{') stack.pop(); }
    i++;
  }
  return stack[stack.length - 1] ?? null;
}

/** Default function provider — pulls from the ExpressionEngine singleton.
 *  Callers can override via the `functionsProvider` prop but 99% won't. */
let _defaultEngine: ExpressionEngine | null = null;
export function defaultFunctionsProvider() {
  _defaultEngine ??= new ExpressionEngine();
  return _defaultEngine.getFunctions().map((f) => ({
    name: f.name,
    category: f.category,
    signature: f.signature,
    description: f.description,
  }));
}
