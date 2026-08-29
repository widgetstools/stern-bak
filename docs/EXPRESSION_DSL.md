# Expression DSL — Engine Reference & JavaScript → DSL Conversion Guide

> **Audience:** an AI agent (or developer) that must translate a JavaScript
> expression/function into the StarUI expression DSL **correctly**.
>
> **Source of truth:** the CSP‑safe engine in
> [`packages/core/engine/src/expression/`](../packages/core/engine/src/expression/)
> (`tokenizer.ts`, `parser.ts`, `evaluator.ts`, `functions.ts`). This document
> is derived directly from that code. When in doubt, the code wins — but this
> guide is kept in lockstep.
>
> ⚠️ The in‑app help panel's "Expression Syntax" tab lists a few functions that
> **do not exist** in the engine (e.g. `LEFT`, `RIGHT`, `MID`, `COALESCE`,
> `AND()`/`OR()` as functions, `SIGN`, `PI`, `HOUR`). **Use the function table in
> §7 of this document, not that tab.**

---

## 0. Conversion contract (read this first)

The DSL is a **single‑expression, side‑effect‑free language**. Every construct
returns a value; there are no statements, variables, assignments, loops, or
user functions. You are converting one JS expression into one DSL expression
that yields the same value per row.

**The 9‑step conversion algorithm:**

1. **Row field access** → bracket column refs. `params.data?.foo`, `data.foo`,
   `row.foo`, `params.data.foo` all become **`[foo]`**.
2. **Optional chaining / nested access** → a single dotted bracket path.
   `data?.a?.b?.c` → **`[a.b.c]`**. (Bracket paths are inherently null‑safe — a
   missing segment yields `null` and never throws. This *is* optional chaining.)
3. **Operators**: `===`/`==` → `==`; `!==`/`!=` → `!=`; `&&` → `AND`;
   `||` → `OR`; `!x` → `NOT x`. (`&&`, `||`, `!` are also accepted as‑is.)
4. **Method/Math/Date calls** → built‑in functions (§7, §10 mapping table).
5. **Control flow**: `cond ? a : b` stays a ternary; `if/else` statements →
   either a ternary, a `CASE WHEN … END`, an `IF(…)`/`IFS(…)` call, or the
   block form `if (cond) { return a } else { return b }` (§6).
6. **Nullish coalescing** `x ?? y` → `ISNULL(x, y)`; chains → nest `ISNULL`.
7. **Keywords**: ensure `AND OR NOT IN BETWEEN` are **UPPERCASE** (case‑sensitive).
   `CASE/WHEN/THEN/ELSE/END` and `if/else/return` are case‑insensitive. Function
   names are case‑insensitive.
8. **Reject unsupported JS** (§12) and rewrite: e.g. `LEFT(s,n)` →
   `SUBSTRING(s,0,n)`; `COALESCE(a,b,c)` → `ISNULL(a, ISNULL(b, c))`;
   `Math.sign(x)` → a ternary.
9. **Validate**: only registered function names (§7) with correct arity; strict
   `==`; no scientific notation; no statements other than `if`/`CASE` blocks.

**Cheat sheet:**

| JavaScript | DSL |
|---|---|
| `params.data?.cusip` / `data.cusip` | `[cusip]` |
| `data?.a?.b?.c` | `[a.b.c]` |
| `x === y` / `x == y` | `x == y` *(strict)* |
| `x !== y` / `x != y` | `x != y` |
| `a && b` / `a \|\| b` / `!a` | `a AND b` / `a OR b` / `NOT a` |
| `a ? b : c` | `a ? b : c` |
| `x ?? y` | `ISNULL(x, y)` |
| `` `${a}-${b}` `` | `CONCAT([a], "-", [b])` |
| `s.startsWith("X")` | `STARTS_WITH([s], "X")` |
| `Math.round(x)` | `ROUND([x])` |
| `arr.includes(x)` *(literal set)* | `x IN ["a","b"]` |

---

## 1. What it is, where it runs, safety

- **CSP‑safe.** No `eval`, no `new Function`. Pipeline:
  `tokenize → Pratt parse → AST → tree‑walking evaluate`.
- **Used in:** column `valueGetter` expressions (DataProvider editor → Columns
  tab), Calculated Columns, Conditional Styling rule predicates, row‑exclusion
  filters (grid customizer → Custom Settings → Row Filter; EXCLUDE‑when‑true,
  wired to AG Grid's external filter), custom Row‑Group aggregations, alerts.
- **Per‑row.** The expression is parsed once and evaluated against each row's
  data. Keep it pure and cheap.

---

## 2. Evaluation model & context

The evaluator runs the AST against an `EvaluationContext`. The identifiers you
can reference:

| Reference | Resolves to |
|---|---|
| `[colId]`, `[a.b.c]` | A field on the current row (null‑safe, nested). **Preferred.** |
| `{colId}` | **Deprecated** alias of `[colId]` (legacy; avoid in new expressions). |
| `data`, `row` | The whole current‑row object. `data.foo` member access works but prefer `[foo]`. |
| `columns` | Alias of `data` (same object). |
| `value`, `x` | The current cell's value (the column's own value in a `valueGetter`; the edited value in alerts). |
| `oldValue`, `newValue` | Previous/next cell value (edit & alert contexts only). |
| *(aggregation)* | When a column‑aware function (e.g. `SUM`) is given a direct `[col]` arg, it reads the **whole column** across all loaded rows. See §7. |

A **bare identifier** (e.g. `price` without brackets) resolves to `data.price`
**only if that exact top‑level key exists**; otherwise it is `undefined` (not
`null`) and it does **not** dot‑walk. **Always prefer `[price]`** — it dot‑walks
and normalizes missing → `null`.

---

## 3. Lexical grammar

### Literals

| Kind | Examples | Notes |
|---|---|---|
| Number | `42`, `3.14`, `.5`, `-100` | Decimal only. **No scientific notation** — `1e6` is invalid; write `1000000`. Negatives are unary minus + number. |
| String | `"BUY"`, `'SELL'` | Single or double quotes. **Escapes are literal:** `\` + char → that char, so `\"`→`"`, `\\`→`\`, but `\n`→`"n"` (NOT a newline). To embed a quote, use the other quote style. |
| Boolean | `true`, `false` | Lowercase only. |
| Null | `null` | Lowercase only. |

### Identifiers, column refs, members

- Bracket column ref: `[identifier(.segment)*]` — e.g. `[price]`, `[ratings.sp]`,
  `[analytics.keyRateDuration.3Y]` (numeric‑leading segments like `3Y` are
  supported). **This is the canonical way to read row data.**
- Legacy `{identifier}` column ref — still parsed when the content is a plain
  column id, but deprecated.
- Member access: `obj.prop` (e.g. `data.foo.bar`). Each step is null‑safe.

### Whitespace & terminators

- Whitespace is insignificant. `;` is treated as an **optional statement
  terminator** (only meaningful inside `if` block bodies; harmless elsewhere).
- `{ … }` braces delimit `if`/`else` block bodies (§6).

---

## 4. Operators & precedence

From lowest to highest binding:

| Prec | Operators | Associativity / form |
|---|---|---|
| 1 | `? :` (ternary) | right |
| 2 | `OR` / `\|\|` | left, short‑circuit |
| 4 | `AND` / `&&` | left, short‑circuit |
| 6 | `==` `!=` `>` `<` `>=` `<=` `IN` `BETWEEN` | left |
| 8 | `+` `-` | left |
| 10 | `*` `/` `%` | left |
| 14 | `.` (member access) | left |
| — | unary `NOT`/`!`, unary `-` | prefix |

**Exact runtime semantics** (this matters for correctness):

- **`==` / `!=` are STRICT** (`===` / `!==`). **No type coercion.**
  `[count] == "5"` is `false` when `count` is the number `5`. Use `[count] == 5`.
- **`+`**: if **either** operand is a string → **string concatenation**;
  otherwise JS numeric addition. So `[name] + "!"` concatenates; `[a] + [b]` adds
  only when both are non‑strings.
- **`-` `*` `/` `%`**: JS arithmetic on the runtime values (strings are coerced
  to numbers by JS: `"5" * 1 → 5`). **`/ 0` returns `null`** (not `Infinity`/`NaN`).
- **`>` `<` `>=` `<=`**: JS comparison on the **actual** values — numbers compare
  numerically, **strings compare lexicographically** (`"10" > "9"` is `false`).
  Ensure operands are numeric when you mean numeric comparison.
- **`AND` / `OR`**: short‑circuit and return the **operand value** (like JS
  `&&`/`||`), not a forced boolean. `[a] AND [b]` returns `[a]` when `[a]` is
  falsy, else `[b]`.
- **`NOT` / `!`**: returns a real boolean (`!isTruthy(x)`).
- **`x IN [a, b, c]`**: membership in a **literal array** (brackets required).
  `[side] IN ["BUY", "SELL"]`. (No dynamic arrays.)
- **`x BETWEEN lo AND hi`**: inclusive numeric range, `lo <= x <= hi`.

**Truthiness** (`isTruthy`): falsy = `null`, `undefined`, `false`, `0`, `""`.
Everything else is truthy — including `NaN`, the string `"0"`, and `[]`.

---

## 5. Column references & optional chaining (the key mapping)

A bracket column ref resolves by **path walk with null‑safety**:

1. Try the value as a **flat literal key** first (so feeds that legitimately
   encode dots in a key still work).
2. Otherwise **dot‑walk** the nested object, bailing to `null` the moment any
   segment is missing/non‑object.

Therefore:

```text
[pnlDetailsFinal.pnlWrapper.PnlCalcInputInOutput.rdiInventoryName]
≡  params.data?.pnlDetailsFinal?.pnlWrapper?.PnlCalcInputInOutput?.rdiInventoryName
```

- Missing field, or any missing intermediate → **`null`** (never throws).
- This is why you convert JS optional chains (`?.`) into a single bracket path —
  the null‑safety is built in.
- `[x] == null` is **true** for both an explicit `null` and a missing field
  (the engine coalesces `undefined → null` for column refs). If you must
  distinguish "absent" from "explicit null", the DSL cannot — flag it.

---

## 6. Conditionals

The DSL offers four equivalent ways to branch. **All short‑circuit** (only the
chosen branch is evaluated). `CASE`/`if` are parse‑time sugar that fold into the
ternary, so they nest and compose anywhere a value is expected.

### Ternary

```text
[side] == "BUY" ? 1 : -1
```

### `CASE WHEN … THEN … [ELSE …] END` (SQL‑style, searched)

```text
CASE
  WHEN [rating] == "AAA" THEN 1
  WHEN [rating] == "AA"  THEN 2
  ELSE 99
END
```
Returns the first matching branch; `null` if none match and there's no `ELSE`.
Keywords are case‑insensitive. **Distinct from the `CASE(expr, …)` *function*
(§7)**, which is disambiguated by the `(` that follows it.

### `if (…) { … } else { … }` (JS‑style block)

```text
if ([region] == "APAC") {
  return [country]
} else if ([region] == "EMEA") {
  return [city]
} else {
  return "—"
}
```
Each block holds **one** value expression; `return` and trailing `;` are
optional. Supports `else if`. This is the most direct target for a JS `if/else`
that has a single `return` per branch.

### Function forms

- `IF(cond, then, else)` — single branch. **Eager** (both branches evaluated).
- `IFS(c1, v1, c2, v2, …, default?)` — first truthy `cN` wins; optional trailing
  default. The natural target for a JS `if/else‑if/else` chain.
- `SWITCH(expr, case1, val1, …, default?)` / `CASE(expr, …)` — value‑equality
  multi‑branch (strict `===`).

> **Which to pick when converting?** A JS `if/return/else` with one return per
> branch → the `if { } else { }` block (most literal) or a ternary. A
> JS `switch`/value‑map → `SWITCH`/`CASE(expr,…)`. A chain of `else if` on
> different conditions → `IFS` or `CASE WHEN`.

---

## 7. Function catalog (authoritative — 44 functions)

Function names are **case‑insensitive** (`abs` == `ABS`). Argument counts are
enforced — wrong arity **throws**. Numeric args are coerced with `toNum`
(non‑numeric → `0`); string args with `toStr` (`null`/`undefined` → `""`).

> **`[col]`‑aware (aggregation) functions** are marked **agg**. When given a
> *direct* `[col]` argument, they operate on the **entire column** (all loaded
> rows). Given scalars, they reduce the args as a vararg list.

### Math

| Function | Signature | Notes |
|---|---|---|
| `ABS` | `ABS(n)` | |
| `ROUND` | `ROUND(n, decimals?)` | `decimals` default `0`. |
| `FLOOR` | `FLOOR(n)` | |
| `CEIL` | `CEIL(n)` | |
| `SQRT` | `SQRT(n)` | |
| `POW` | `POW(base, exp)` | `Math.pow`. |
| `MOD` | `MOD(a, b)` | `a % b`. |
| `LOG` | `LOG(n)` | **Natural** log (`Math.log`). There is no `LN`. |
| `EXP` | `EXP(n)` | `e^n`. |
| `MIN` **agg** | `MIN(a, b, …)` \| `MIN([col])` | |
| `MAX` **agg** | `MAX(a, b, …)` \| `MAX([col])` | |

### Statistics (agg)

| Function | Signature |
|---|---|
| `AVG` **agg** | `AVG(values… \| [col])` |
| `MEDIAN` **agg** | `MEDIAN(values… \| [col])` |
| `STDEV` **agg** | `STDEV(values… \| [col])` — sample stdev (n‑1). |
| `VARIANCE` **agg** | `VARIANCE(values… \| [col])` — sample variance (n‑1). |

### Aggregation (agg)

| Function | Signature | Notes |
|---|---|---|
| `SUM` **agg** | `SUM(values… \| [col])` | |
| `COUNT` **agg** | `COUNT(values… \| [col])` | Counts non‑null values. |
| `DISTINCT_COUNT` **agg** | `DISTINCT_COUNT(values… \| [col])` | Distinct non‑null values. |

### String

| Function | Signature | Notes |
|---|---|---|
| `CONCAT` | `CONCAT(a, b, …)` | Coerces each arg via `toStr`, joins with `""`. |
| `UPPER` | `UPPER(s)` | |
| `LOWER` | `LOWER(s)` | |
| `TRIM` | `TRIM(s)` | |
| `LEN` | `LEN(s)` | String length. |
| `SUBSTRING` | `SUBSTRING(s, start, len?)` | `start` is 0‑based; with `len` returns `s.substring(start, start+len)`; without `len`, to end. **There is no `LEFT`/`RIGHT`/`MID`.** |
| `REPLACE` | `REPLACE(s, from, to)` | Replaces **all** occurrences; `from` is treated **literally** (regex‑escaped). |
| `STARTS_WITH` | `STARTS_WITH(s, prefix)` | Note the **underscore**. Null‑safe (`null`→`""`). |
| `ENDS_WITH` | `ENDS_WITH(s, suffix)` | |
| `CONTAINS` | `CONTAINS(s, substr)` | Substring test. |
| `REGEX_MATCH` | `REGEX_MATCH(s, pattern)` | `new RegExp(pattern).test(s)`. `pattern` is a **string**, not a `/regex/` literal. |

### Date

Date inputs are ISO‑8601 strings or anything `new Date(String(v))` accepts.

| Function | Signature | Notes |
|---|---|---|
| `NOW` | `NOW()` | Current timestamp, ISO string. |
| `TODAY` | `TODAY()` | Current date `YYYY-MM-DD`. |
| `YEAR` | `YEAR(d)` | |
| `MONTH` | `MONTH(d)` | 1–12. |
| `DAY` | `DAY(d)` | Day of month. |
| `IS_WEEKDAY` | `IS_WEEKDAY(d)` | Mon–Fri → `true`. |
| `DATE_DIFF` | `DATE_DIFF(d1, d2, unit)` | `d1 - d2` in `unit` ∈ `days\|hours\|minutes\|seconds` (or `d\|h\|m\|s`); else milliseconds. **Name has an underscore** — there is no `DATEDIFF`. |
| `DATE_ADD` | `DATE_ADD(d, n, unit)` | Add `n` of `unit` ∈ `days\|months\|years\|hours` (`d\|mo\|y\|h`). Returns ISO string. **No `HOUR`/`MINUTE`/`SECOND`/`WEEKDAY`/`EOMONTH`.** |

### Logical / null

| Function | Signature | Notes |
|---|---|---|
| `IF` | `IF(cond, then, else)` | Eager; exactly 3 args. |
| `IFS` | `IFS(c1, v1, …, default?)` | First truthy wins; odd arg count → last is default; even → `null` on no match. |
| `SWITCH` | `SWITCH(expr, case1, val1, …, default?)` | Strict `===` value match. |
| `CASE` | `CASE(expr, case1, val1, …, default?)` | Alias of `SWITCH` (the *function*; not the `CASE WHEN` keyword). |
| `ISNULL` | `ISNULL(v, default)` | `v == null ? default : v` — covers `null` **and** `undefined`/missing. The DSL's `??`. |
| `ISNOTNULL` | `ISNOTNULL(v)` | `v != null`. |
| `ISEMPTY` | `ISEMPTY(v)` | `null`, `""`, or empty array → `true`. |

> **There is no `AND()`/`OR()`/`NOT()` function** — those are operators
> (`a AND b`). **There is no `COALESCE`** — nest `ISNULL`. **There is no
> `SIGN`/`TRUNC`/`PI`/`LN`/`LEFT`/`RIGHT`/`MID`/`SUBSTITUTE`/`SEARCH`/`PAD…`/
> `ISNUMBER`/`ISTEXT`/`TYPE`/`NUMBER`/`TEXT`/`BOOL`/`LOOKUP`/`VLOOKUP`.** Rewrite
> using what's above (see §10/§12).

---

## 8. Type‑coercion rules

| Helper | Rule | Examples |
|---|---|---|
| `toNum(v)` | `number`→itself; else `Number(v)`, `NaN→0`. | `toNum("3.5")→3.5`, `toNum("x")→0`, `toNum(null)→0` |
| `toStr(v)` | `null`/`undefined`→`""`; else `String(v)`. | `toStr(null)→""`, `toStr(5)→"5"` |
| `isTruthy(v)` | falsy: `null`,`undefined`,`false`,`0`,`""`. | `isTruthy(NaN)→true`, `isTruthy("0")→true` |

- **Operators** use JS semantics on raw values (see §4) — only `+` special‑cases
  strings, only `/0` special‑cases to `null`.
- **Functions** coerce per the table above (so `STARTS_WITH(null,"X")→false`,
  `ROUND("12.4")→12`).
- To force a string→number in an operator context, multiply by 1: `[x] * 1`.
- To force any value→string, use `CONCAT([x], "")` or put it in a `+` with a
  string.

---

## 9. Error & null behavior

- **Returns `null` (no throw):** missing column / nested path, member access on
  `null`, division by zero, comparisons/arithmetic on incompatible values
  (JS `NaN`/`false` results), no‑match `CASE`/`IFS`/`SWITCH` without a default.
- **Throws (parse time):** any syntax error (unbalanced brackets/quotes,
  unexpected token, unterminated `CASE`, `if` without braces). Use
  `engine.validate(expr)` to detect before running.
- **Throws (runtime):** **unknown function name**, and a function call with the
  **wrong number of arguments**. Hosts (e.g. the column `valueGetter`) wrap
  evaluation in `try/catch` and fall back to the raw field value, but you should
  still produce expressions that never throw: only use functions from §7 with
  correct arity.

**Implication for an agent:** prefer expressions that *gracefully* yield `null`
over ones that risk a throw. Validate function names and arities.

---

## 10. JavaScript → DSL mapping (comprehensive)

### Member / property access

| JavaScript | DSL |
|---|---|
| `params.data.foo`, `data.foo`, `row.foo` | `[foo]` |
| `params.data?.a?.b?.c` | `[a.b.c]` |
| `obj.deep.path` (where `obj` is the row) | `[deep.path]` |
| dynamic key `data[k]` | **unsupported** (keys must be literal) |

### Operators

| JavaScript | DSL |
|---|---|
| `===`, `==` | `==` (strict) |
| `!==`, `!=` | `!=` (strict) |
| `&&`, `\|\|`, `!` | `AND`, `OR`, `NOT` (or `&&`/`\|\|`/`!`) |
| `>`,`<`,`>=`,`<=` | same |
| `+`,`-`,`*`,`/`,`%` | same (mind `+` concat & `/0`→null) |
| `cond ? a : b` | `cond ? a : b` |
| `x ?? y` | `ISNULL(x, y)` |
| `a ?? b ?? c` | `ISNULL(a, ISNULL(b, c))` |
| `**` (exponent) | `POW(base, exp)` |
| bitwise `& \| ^ ~ << >>` | **unsupported** |

### Strings

| JavaScript | DSL |
|---|---|
| `` `${a}-${b}` `` | `CONCAT([a], "-", [b])` |
| `a + "x"` (string) | `CONCAT([a], "x")` or `[a] + "x"` |
| `s.toUpperCase()` / `.toLowerCase()` | `UPPER([s])` / `LOWER([s])` |
| `s.trim()` | `TRIM([s])` |
| `s.length` | `LEN([s])` |
| `s.startsWith(p)` / `.endsWith(p)` | `STARTS_WITH([s], p)` / `ENDS_WITH([s], p)` |
| `s.includes(sub)` | `CONTAINS([s], sub)` |
| `s.substring(a, b)` | `SUBSTRING([s], a, b - a)` *(DSL 3rd arg is length)* |
| `s.slice(a)` | `SUBSTRING([s], a)` |
| `s.substr(start, len)` | `SUBSTRING([s], start, len)` |
| `s.slice(0, n)` / "LEFT" | `SUBSTRING([s], 0, n)` |
| "RIGHT" `s.slice(-n)` | `SUBSTRING([s], LEN([s]) - n, n)` |
| `s.replaceAll(a, b)` (literal) | `REPLACE([s], a, b)` |
| `s.replace(a, b)` (first only) | `REPLACE` replaces **all** — not identical; flag if "first‑only" matters |
| `/re/.test(s)` | `REGEX_MATCH([s], "re")` |
| `s.replace(/re/, …)` | **unsupported** (no regex replace) |

### Math

| JavaScript | DSL |
|---|---|
| `Math.abs/round/floor/ceil/sqrt/exp(x)` | `ABS/ROUND/FLOOR/CEIL/SQRT/EXP([x])` |
| `Math.pow(a,b)` / `a ** b` | `POW(a, b)` |
| `Math.log(x)` | `LOG([x])` |
| `Math.min/max(a,b,…)` | `MIN/MAX(a, b, …)` |
| `x % y` | `x % y` or `MOD(x, y)` |
| `Math.sign(x)` | `x > 0 ? 1 : (x < 0 ? -1 : 0)` |
| `Math.trunc(x)` | `x >= 0 ? FLOOR([x]) : CEIL([x])` |
| `Math.PI` | `3.141592653589793` (literal) |

### Dates

| JavaScript | DSL |
|---|---|
| `new Date()` (ISO) | `NOW()` |
| today (`YYYY-MM-DD`) | `TODAY()` |
| `d.getFullYear()` | `YEAR([d])` |
| `d.getMonth()+1` | `MONTH([d])` |
| `d.getDate()` | `DAY([d])` |
| days between | `DATE_DIFF([d1], [d2], "days")` |
| add days/months/years | `DATE_ADD([d], n, "days"\|"months"\|"years")` |
| `getHours/Minutes/Seconds` | **unsupported** |

### Null / presence / branching

| JavaScript | DSL |
|---|---|
| `x == null` / `x === null` / `x === undefined` | `[x] == null` |
| `x != null` | `ISNOTNULL([x])` or `[x] != null` |
| `!x` (empty‑ish) | `ISEMPTY([x])` (null/""/[]) or `NOT [x]` |
| `arr.includes(x)` (literal set) | `x IN ["a","b","c"]` |
| `if/else (single return each)` | `if (cond) { return a } else { return b }` or ternary |
| `if/else‑if/else` chain | `IFS(c1, v1, c2, v2, …, default)` or `CASE WHEN … END` |
| `switch (x) { case … }` | `SWITCH([x], case1, val1, …, default)` |
| `COALESCE(a, b, c)` | `ISNULL(a, ISNULL(b, c))` |

---

## 11. Worked examples

### A. Optional‑chaining fallback (the canonical case)

**JavaScript:**
```js
valueGetter: (params) => {
  const cusip = params.data?.cusip;
  const inventoryName = params.data?.inventoryName;
  const pnlInventoryName =
    params.data?.pnlDetailsFinal?.pnlWrapper?.PnlCalcInputInOutput?.rdiInventoryName;
  if (cusip?.startsWith('SPCL') && inventoryName === null) {
    return pnlInventoryName;
  } else {
    return inventoryName;
  }
}
```

**DSL (ternary form):**
```text
STARTS_WITH([cusip], "SPCL") AND [inventoryName] == null
  ? [pnlDetailsFinal.pnlWrapper.PnlCalcInputInOutput.rdiInventoryName]
  : [inventoryName]
```

**DSL (block form — most literal):**
```text
if (STARTS_WITH([cusip], "SPCL") AND [inventoryName] == null) {
  return [pnlDetailsFinal.pnlWrapper.PnlCalcInputInOutput.rdiInventoryName]
} else {
  return [inventoryName]
}
```

> Note: `cusip?.startsWith('SPCL')` becomes `STARTS_WITH([cusip], "SPCL")` —
> null‑safe because `STARTS_WITH` coerces `null → ""`. And `[inventoryName] == null`
> is `true` for both explicit `null` and a missing field (acceptable when the
> field is always present but sometimes null).

### B. Classifier chain

**JS:** `price >= avg*1.05 ? "HIGH" : price >= avg*0.95 ? "MID" : "LOW"`
**DSL:**
```text
IFS([price] >= AVG([price]) * 1.05, "HIGH",
    [price] >= AVG([price]) * 0.95, "MID",
    "LOW")
```
(`AVG([price])` is column‑wide via the **agg** behavior.)

### C. Notional with null fallback

**JS:** `(data.qty ?? 0) * (data.price ?? 0)`
**DSL:** `ISNULL([qty], 0) * ISNULL([price], 0)`

### D. Label from a switch

**JS:** `switch(side){case "BUY":return 1;case "SELL":return -1;default:return 0;}`
**DSL:** `SWITCH([side], "BUY", 1, "SELL", -1, 0)`

### E. String building

**JS:** `` `${region}/${country}` ``
**DSL:** `CONCAT([region], "/", [country])`

---

## 12. Unsupported JS — reject or rewrite

The DSL is intentionally small. If the JS uses any of these, you must rewrite or
report that it cannot be expressed:

- **Statements & flow:** `let/const/var` bindings, assignment, `for`/`while`,
  `try/catch`, `throw`, multiple statements per branch. *(The only "blocks" are
  single‑value `if/else` bodies.)*
- **Functions/closures:** arrow functions, `function`, callbacks,
  `array.map/filter/reduce`, `.forEach`.
- **Dynamic access:** computed keys `obj[expr]`, spread `...`, destructuring.
- **Objects/arrays as values:** object literals; array literals **except** the
  `IN [ … ]` set and `BETWEEN`.
- **Operators:** bitwise (`& | ^ ~ << >>`), `typeof`, `instanceof`, `in`
  (JS `in`), increment/decrement, comma operator, exponent `**` (use `POW`).
- **Numbers:** scientific notation (`1e6`), hex/binary/octal, `BigInt`,
  `NaN`/`Infinity` literals.
- **Strings:** escape sequences that produce control chars (`\n`, `\t` become
  literal letters), regex **replace** (only `REGEX_MATCH` test exists), tagged
  templates.
- **Missing built‑ins:** `LEFT/RIGHT/MID/SUBSTITUTE/SEARCH/PAD*` → use
  `SUBSTRING`; `COALESCE` → nest `ISNULL`; `AND()/OR()/NOT()` → operators;
  `SIGN/TRUNC/PI/LN` → rewrite (see §10); `HOUR/MINUTE/SECOND/WEEKDAY/EOMONTH` →
  unsupported; `ISNUMBER/ISTEXT/TYPE/NUMBER/TEXT/BOOL/LOOKUP/VLOOKUP` → unsupported.

If a construct truly has no DSL equivalent, **say so explicitly** rather than
emitting an expression that silently does the wrong thing.

---

## 13. Final self‑check (run before emitting)

1. Every row‑field read is a `[bracket]` ref (nested → dotted path); no `?.`,
   no `params`/`data.`/`row.` left over.
2. Equality is `==`/`!=` (strict). No `===`/`!==` text remains. No accidental
   single `=` (it parses as `==`, but write `==`).
3. `AND OR NOT IN BETWEEN` are UPPERCASE. Function names spelled exactly as §7
   (e.g. `STARTS_WITH`, `DATE_DIFF`, `DISTINCT_COUNT`) — but case doesn't matter.
4. Every function exists in §7 and has a legal arg count.
5. No scientific notation, no bitwise/typeof/spread/lambdas/loops/assignments.
6. Branching uses ternary, `CASE WHEN … END`, `IF/IFS/SWITCH`, or an `if {} else {}`
   block — never multiple statements per branch.
7. Nullish → `ISNULL`; "first non‑null of N" → nested `ISNULL`.
8. Prefer forms that yield `null` over forms that could throw.
9. If you used `engine.validate`, it returned `{ valid: true }`.
```
