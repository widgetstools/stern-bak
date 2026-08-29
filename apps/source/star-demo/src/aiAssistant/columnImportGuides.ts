/**
 * Two feature guides split out of `featureGuides.ts` to stay under its
 * 800-line ceiling (see CLAUDE.md): the expression DSL's full grammar and
 * function catalog, and the workflow for importing an AG-Grid `ColDef[]`
 * (pasted or attached as .js/.ts source) into this platform's own
 * `ColumnDefinition` JSON.
 *
 * SOURCE OF TRUTH for the expression DSL: `docs/EXPRESSION_DSL.md` at the
 * repo root — a complete, code-derived JS→DSL conversion reference. This
 * guide is a condensed port of it for a chat tool result (the full doc is
 * ~580 lines; nothing here should contradict it — when the two disagree,
 * `docs/EXPRESSION_DSL.md` wins, and this file should be re-checked against
 * it). Not reachable from the assistant directly: it runs in a browser
 * window with no filesystem access, so it can only see this guide's content
 * via `get_feature_guide`, never the doc file itself.
 */
import type { FeatureGuide } from './featureGuides';

const EXPRESSION_DSL_GUIDE = `## expression-dsl

The engine behind \`valueGetter\` (on a provider's \`columnDefinitions\`),
\`add_calculated_column\`'s \`expression\`, and conditional-styling rule
predicates. **Single-expression, side-effect-free**: every construct returns
a value: no statements, variables, assignments, loops, or user-defined
functions. Converting a JS expression means finding the ONE DSL expression
that yields the same value per row — not transliterating JS syntax.

### Converting JS → DSL, in order

1. **Row field access → bracket refs.** \`params.data?.foo\`, \`data.foo\`,
   \`row.foo\` all become \`[foo]\`.
2. **Optional chaining → one dotted path.** \`data?.a?.b?.c\` → \`[a.b.c]\`.
   Bracket paths are inherently null-safe — a missing segment yields \`null\`,
   never throws. This IS the DSL's optional chaining; there is no \`?.\` token.
3. **Operators**: \`===\`/\`==\` → \`==\`; \`!==\`/\`!=\` → \`!=\`; \`&&\` → \`AND\`;
   \`||\` → \`OR\`; \`!x\` → \`NOT x\` (\`&&\` \`||\` \`!\` are also accepted as-is).
4. **Method/Math/Date calls → built-in functions** (table below).
5. **Control flow**: \`cond ? a : b\` stays a ternary. \`if/else\` → a ternary,
   \`CASE WHEN...END\`, \`IF\`/\`IFS\`, or the block form
   \`if (cond) { return a } else { return b }\`.
6. **Nullish coalescing** \`x ?? y\` → \`ISNULL(x, y)\`; chains nest: \`a ?? b ?? c\`
   → \`ISNULL(a, ISNULL(b, c))\`.
7. **Keywords**: \`AND OR NOT IN BETWEEN\` must be UPPERCASE (case-sensitive).
   \`CASE/WHEN/THEN/ELSE/END\`, \`if/else/return\` and function names are
   case-insensitive.
8. **Reject or rewrite unsupported JS** (see "What it cannot do" below) —
   say so explicitly rather than emitting something that looks plausible and
   silently does the wrong thing.

Cheat sheet:

| JavaScript | DSL |
|---|---|
| \`params.data?.cusip\` / \`data.cusip\` | \`[cusip]\` |
| \`data?.a?.b?.c\` | \`[a.b.c]\` |
| \`x === y\` | \`x == y\` *(strict — no coercion)* |
| \`a && b\` / \`a \\|\\| b\` / \`!a\` | \`a AND b\` / \`a OR b\` / \`NOT a\` |
| \`x ?? y\` | \`ISNULL(x, y)\` |
| \`s.startsWith("X")\` | \`STARTS_WITH([s], "X")\` |
| \`Math.round(x)\` | \`ROUND([x])\` |
| \`arr.includes(x)\` *(literal set)* | \`x IN ["a","b"]\` |
| a JS template string joining fields | \`CONCAT([a], "-", [b])\` |

### Reading row data (evaluation context)

| Reference | Resolves to |
|---|---|
| \`[colId]\`, \`[a.b.c]\` | A field on the current row — null-safe, nested. **Preferred**, always. |
| \`data\`, \`row\`, \`columns\` | The whole current-row object (\`data.foo\` works but prefer \`[foo]\`). |
| \`value\`, \`x\` | The current cell's own value (\`valueGetter\`'s column; the edited value in alerts). |
| \`oldValue\`, \`newValue\` | Previous/next value — edit and alert contexts only. |
| \`[colId.old]\` / \`[colId.new]\` | Previous/current value for a tick/diff rule — **conditional-styling only**, not available in a provider \`valueGetter\` or a calculated column. |

A bare identifier with no brackets (\`price\`) only resolves if that EXACT
top-level key exists on the row, and does not dot-walk — always prefer
\`[price]\`.

### Operators — exact runtime semantics

Precedence, low to high: ternary → \`OR\` → \`AND\` → \`== != > < >= <= IN
BETWEEN\` → \`+ -\` → \`* / %\` → member access (\`.\`) → unary \`NOT\`/\`-\`.

- \`==\`/\`!=\` are **strict** (like \`===\`/\`!==\`) — no type coercion.
  \`[count] == "5"\` is false when count is the number 5.
- \`+\`: string-concatenates if EITHER operand is a string, else numeric add.
- \`-\` \`*\` \`/\` \`%\`: JS arithmetic; **\`/ 0\` returns \`null\`**, never
  \`Infinity\`/\`NaN\`.
- \`>\` \`<\` \`>=\` \`<=\`: numbers compare numerically, strings compare
  lexicographically — make sure both sides are actually numeric when you
  mean a numeric comparison.
- \`AND\`/\`OR\` short-circuit and return the operand VALUE, like JS \`&&\`/\`||\`
  — not a forced boolean.
- \`x IN [a, b, c]\` — membership in a literal array (brackets required, no
  dynamic arrays). \`x BETWEEN lo AND hi\` — inclusive, \`lo <= x <= hi\`.
- Truthiness: falsy = \`null undefined false 0 ""\`. Everything else,
  including \`NaN\` and \`"0"\`, is truthy.

### Conditionals — four equivalent forms, all short-circuiting

- Ternary: \`[side] == "BUY" ? 1 : -1\`
- \`CASE WHEN [rating] == "AAA" THEN 1 WHEN [rating] == "AA" THEN 2 ELSE 99 END\`
  — first match wins, \`null\` if none match and there's no ELSE.
- Block: \`if ([region] == "APAC") { return [country] } else if (...) { ... } else { return "-" }\`
  — one value per branch, \`return\`/trailing \`;\` optional, supports \`else if\`.
  The most literal target for a JS \`if/return/else\`.
- \`IF(cond, then, else)\` (eager, both branches evaluated), \`IFS(c1, v1, c2,
  v2, ..., default?)\` (first truthy wins — the natural target for an
  \`if/else-if/else\` chain), \`SWITCH(expr, case1, val1, ..., default?)\` /
  \`CASE(expr, ...)\` (value-equality, the function form — disambiguated from
  \`CASE WHEN\` by the \`(\` that follows it).

### Function catalog — all 44, this table is authoritative

Names are case-insensitive; wrong arg count THROWS at eval time — check
arity. Numeric args coerce via \`Number()\` (non-numeric → 0); string args
coerce \`null\`/\`undefined\` → \`""\`.

Functions marked **agg** operate on the WHOLE column (every loaded row) when
given a direct \`[col]\` argument; with scalar args they just reduce the
varargs.

| Category | Functions |
|---|---|
| Math | \`ABS(n)\`, \`ROUND(n, decimals?)\`, \`FLOOR(n)\`, \`CEIL(n)\`, \`SQRT(n)\`, \`POW(base, exp)\`, \`MOD(a, b)\`, \`LOG(n)\` (**natural log** — there is no LN, and no LOG10: log10(x) = LOG(x) / LOG(10)), \`EXP(n)\`, \`MIN(...)\` **agg**, \`MAX(...)\` **agg** |
| Stats **agg** | \`AVG\`, \`MEDIAN\`, \`STDEV\` (sample, n-1), \`VARIANCE\` (sample, n-1) |
| Aggregation **agg** | \`SUM\`, \`COUNT\` (counts non-null), \`DISTINCT_COUNT\` |
| String | \`CONCAT(a, b, ...)\`, \`UPPER(s)\`, \`LOWER(s)\`, \`TRIM(s)\`, \`LEN(s)\`, \`SUBSTRING(s, start, len?)\` (0-based; **no LEFT/RIGHT/MID**), \`REPLACE(s, from, to)\` (all occurrences, \`from\` literal not regex), \`STARTS_WITH(s, prefix)\`, \`ENDS_WITH(s, suffix)\`, \`CONTAINS(s, substr)\`, \`REGEX_MATCH(s, pattern)\` (test only, boolean; \`pattern\` is a string) |
| Date | \`NOW()\`, \`TODAY()\`, \`YEAR(d)\`, \`MONTH(d)\` (1-12), \`DAY(d)\`, \`IS_WEEKDAY(d)\`, \`DATE_DIFF(d1, d2, unit)\` (unit: days/hours/minutes/seconds or d/h/m/s), \`DATE_ADD(d, n, unit)\` (unit: days/months/years/hours) |
| Logical/null | \`IF(cond, then, else)\`, \`IFS(c1, v1, ..., default?)\`, \`SWITCH(expr, ...)\`, \`CASE(expr, ...)\` (alias of SWITCH), \`ISNULL(v, default)\` (the DSL's \`??\`), \`ISNOTNULL(v)\`, \`ISEMPTY(v)\` (null/""/empty array) |

**Do not invent a function name.** There is no \`AND()\`/\`OR()\`/\`NOT()\` (those
are operators), no \`COALESCE\` (nest \`ISNULL\`), no \`SIGN\`/\`TRUNC\`/\`PI\`/\`LN\`/
\`LEFT\`/\`RIGHT\`/\`MID\`/\`SUBSTITUTE\`/\`SEARCH\`/\`ISNUMBER\`/\`ISTEXT\`/\`LOOKUP\`/
\`VLOOKUP\`/\`LOG10\`. If the source JS needs one of these, rewrite it (e.g.
\`Math.sign(x)\` → \`x > 0 ? 1 : (x < 0 ? -1 : 0)\`) or say plainly that it
doesn't map.

### What it cannot do — reject or rewrite, never guess

No \`let\`/\`const\`/assignment, no loops (\`for\`/\`while\`/\`.map\`/\`.reduce\`/
\`.forEach\`), no arrow functions or closures, no computed/dynamic keys
(\`obj[expr]\`), no spread/destructuring, no object or array literals (except
the \`IN [...]\` set and \`BETWEEN\`), no bitwise operators, no \`typeof\`/
\`instanceof\`, no scientific notation, no regex REPLACE (only \`REGEX_MATCH\`
tests), no multi-statement branch bodies (an \`if{}\`/\`CASE\` block holds
exactly one value expression, never a sequence).

If a JS expression genuinely needs one of these, it cannot be represented —
say so explicitly rather than emitting a DSL string that parses cleanly but
computes something different.

### Worked examples

Optional-chaining fallback, JS:
\`\`\`js
if (data?.cusip?.startsWith('SPCL') && data?.inventoryName === null) {
  return data?.pnlDetailsFinal?.pnlWrapper?.rdiInventoryName;
} else {
  return data?.inventoryName;
}
\`\`\`
DSL (ternary):
\`\`\`text
STARTS_WITH([cusip], "SPCL") AND [inventoryName] == null
  ? [pnlDetailsFinal.pnlWrapper.rdiInventoryName]
  : [inventoryName]
\`\`\`
Or the block form (most literal, same result):
\`\`\`text
if (STARTS_WITH([cusip], "SPCL") AND [inventoryName] == null) {
  return [pnlDetailsFinal.pnlWrapper.rdiInventoryName]
} else {
  return [inventoryName]
}
\`\`\`

Classifier chain against a column-wide aggregate, JS:
\`price >= avg*1.05 ? "HIGH" : price >= avg*0.95 ? "MID" : "LOW"\`
DSL (\`AVG([price])\` reads the WHOLE column via the agg behavior):
\`\`\`text
IFS([price] >= AVG([price]) * 1.05, "HIGH",
    [price] >= AVG([price]) * 0.95, "MID",
    "LOW")
\`\`\`

Full grammar, precedence edge cases, and the complete JS→DSL mapping table:
\`docs/EXPRESSION_DSL.md\` at the repo root — this guide is a condensed port
of it.`;

const COLUMN_DEF_IMPORT_GUIDE = `## column-def-import

Converting an AG-Grid \`ColDef[]\` a user pastes or attaches (.js/.ts source —
already supported as a chat attachment, no special handling needed to
receive it) into this platform's \`ColumnDefinition[]\` for
\`create_data_provider\` / \`update_data_provider\`'s \`config.columnDefinitions\`.
Read get_feature_guide("expression-dsl") too before converting any
\`valueGetter\` — it's the harder half of this.

### Field-by-field

- **Copy straight through, unchanged**: \`field\`, \`headerName\`, \`width\`,
  \`sortable\`, \`resizable\`, \`hide\`.
- **\`filter\`**: copy through EXACTLY as written. A string here is a literal
  AG-Grid filter component name with zero translation on this platform (e.g.
  \`filter: "agNumberColumnFilter"\` from the pasted ColDef works as-is) — do
  not rename or reinterpret it. Only decide something new when the source
  ColDef didn't set \`filter\` at all: omitting it lets the platform apply its
  own richer default (a combined text+set filter), which is usually the
  better choice for a fresh column than inventing one.
- **\`cellDataType\`**: if the source ColDef has an explicit \`type\` or
  \`cellDataType\`, use it directly — the enums match
  (text/number/boolean/date/dateString/object). If it doesn't, infer, in
  this order, and say what you inferred and why (never silently default):
  1. From \`filter\`: \`agNumberColumnFilter\` → \`number\`; \`agDateColumnFilter\`
     → \`date\` (or \`dateString\` if the field is an ISO date string, not a
     real Date) ; \`agTextColumnFilter\` → \`text\`. \`agSetColumnFilter\` doesn't
     imply a type on its own — look at a sample value, or ask.
  2. From \`valueFormatter\`/\`cellRenderer\` naming or logic: currency/percent/
     number formatting implies \`number\`; date formatting implies \`date\`/
     \`dateString\`.
  3. Still unclear — ask rather than guessing; an invented \`cellDataType\`
     changes sorting/filtering/alignment silently.
- **\`valueGetter\`**: transpile the JS function body into the platform's
  expression DSL — see get_feature_guide("expression-dsl") for the full
  algorithm and function catalog. If the JS does something the DSL cannot
  express (a loop, a call to an external/imported function, a closure
  variable, multi-step imperative logic), say so explicitly and either omit
  \`valueGetter\` (the column falls back to its plain \`field\` binding) or offer
  the closest safe approximation with the gap named. Never emit a DSL string
  that looks plausible but changes the row's actual value.
- **\`cellRenderer\`**: this platform's field is a REGISTRY ID (a string
  naming one of the built-in renderers), not a React component or component
  name the way an AG-Grid ColDef's \`cellRenderer\` usually is. Call
  \`list_cell_renderers\` and match the closest one by purpose (a pill/badge
  renderer, a heatmap, a sparkline, a bar) — never invent an id. If nothing
  matches, omit it and say so rather than guessing.
- **\`valueFormatter\`**: unlike \`valueGetter\`, this is NOT the expression DSL
  — treat it as a much riskier field to auto-convert. If the source's
  formatter logic isn't a simple, obviously-representable case, leave it
  unset and tell the user rather than guessing at a format string.

### Worked example

Pasted AG-Grid ColDef:
\`\`\`js
{
  field: 'notional',
  headerName: 'Notional',
  filter: 'agNumberColumnFilter',
  valueGetter: (params) => params.data.qty * params.data.price,
}
\`\`\`

No explicit \`cellDataType\`, so it's inferred from \`filter\`
(\`agNumberColumnFilter\` → \`number\`) and stated as such; \`valueGetter\`
transpiles directly (row-field access → bracket refs, arithmetic is
identical):

\`\`\`json
{
  "field": "notional",
  "headerName": "Notional",
  "filter": "agNumberColumnFilter",
  "cellDataType": "number",
  "valueGetter": "[qty] * [price]"
}
\`\`\`

Applied via \`update_data_provider({ providerId, config: { columnDefinitions:
[ ...existing, thisColumn ] } } })\` — updating \`config\` reloads every open
blotter already bound to the provider, so there's no separate step to make
it show.`;

export const COLUMN_IMPORT_GUIDES: readonly FeatureGuide[] = [
  {
    id: 'expression-dsl',
    title: 'Expression DSL — full grammar and the 44-function catalog',
    summary: 'The bracket-syntax expression language behind valueGetter, calculated columns and conditional styling, plus a JS-to-DSL conversion algorithm.',
    detail: EXPRESSION_DSL_GUIDE,
  },
  {
    id: 'column-def-import',
    title: 'Importing AG-Grid ColDefs into a data provider',
    summary: 'Converting a pasted or attached AG-Grid ColDef[] (field mapping, cellDataType inference, valueGetter transpilation) into this platform’s ColumnDefinition JSON.',
    detail: COLUMN_DEF_IMPORT_GUIDE,
  },
];
