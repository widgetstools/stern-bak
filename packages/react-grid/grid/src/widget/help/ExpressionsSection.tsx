/**
 * 3. Expression Syntax — column refs, literals, operators, built-in
 * function inventory, and trading examples for conditional styling,
 * calculated columns, and custom aggregations.
 */

import { Code, H1, H2, H3, P, Pre, Table } from './primitives';

export function ExpressionsSection() {
  return (
    <>
      <H1>3. Expression Syntax</H1>
      <P>
        Used by Conditional Styling (rule predicates), Calculated Columns
        (virtual column valueGetter), and Column Settings → Row Grouping →
        custom aggregation. All three share one engine — CSP-safe, tree-walking.
      </P>

      <H2>Column references</H2>
      <Table
        cols={['Syntax', 'Meaning']}
        rows={[
          [<Code>[price]</Code>, "Current row's price value"],
          [<Code>{'{price}'}</Code>, 'Alias — same as [price]'],
          [<Code>[value]</Code>, 'In custom agg: the array of child values AG-Grid feeds'],
        ]}
      />
      <P>
        Names with spaces or hyphens must use brackets: <Code>[order id]</Code>.
      </P>

      <H2>Literals &amp; operators</H2>
      <Table
        cols={['Category', 'Examples']}
        rows={[
          ['Number', <Code>42 3.14 -100 1e6</Code>],
          ['String', <Code>"BUY" 'SELL'</Code>],
          ['Boolean', <Code>true false</Code>],
          ['Null', <Code>null</Code>],
          ['Arithmetic', <Code>+ - * / %</Code>],
          ['Comparison', <Code>{'= == != > < >= <='}</Code>],
          ['Logical', <Code>AND && OR || NOT !</Code>],
          ['Membership', <Code>{'IN [a, b, c]  BETWEEN a AND b'}</Code>],
          ['Ternary', <Code>cond ? then : else</Code>],
        ]}
      />
      <P>
        The boolean operators <Code>AND</Code>, <Code>OR</Code>, <Code>NOT</Code>,{' '}
        <Code>IN</Code>, <Code>BETWEEN</Code> are <strong>case-sensitive</strong> —
        they must be UPPER, otherwise they read as column references. (The
        conditional keywords below are case-insensitive.)
      </P>

      <H2>Conditional logic</H2>
      <P>
        Beyond the <Code>cond ? then : else</Code> ternary, two readable
        multi-branch forms are built in. Both short-circuit (only the chosen
        branch is evaluated) and compose anywhere a value is expected.
      </P>

      <H3>CASE — SQL-style multi-branch</H3>
      <Pre>{`CASE
  WHEN [rating] == "AAA" THEN 1
  WHEN [rating] == "AA"  THEN 2
  ELSE 99
END`}</Pre>

      <H3>if / else — block form</H3>
      <Pre>{`if ([region] == "APAC") {
  return [country]
} else if ([region] == "EMEA") {
  return [city]
} else {
  return "—"
}`}</Pre>
      <P>
        <Code>CASE</Code> / <Code>WHEN</Code> / <Code>THEN</Code> / <Code>ELSE</Code> /{' '}
        <Code>END</Code> and <Code>if</Code> / <Code>else</Code> / <Code>return</Code> are{' '}
        <strong>case-insensitive</strong>; the <Code>return</Code> keyword and a
        trailing <Code>;</Code> are optional. Both fold into the same
        short-circuiting engine as the ternary and the{' '}
        <Code>IF</Code> / <Code>IFS</Code> functions below — pick whichever reads
        clearest.
      </P>

      <H2>Built-in functions</H2>
      <P>
        Function names are <strong>case-insensitive</strong> (<Code>abs</Code> ={' '}
        <Code>ABS</Code>); argument counts are enforced. Full signatures,
        coercion, and JavaScript → DSL conversion rules live in{' '}
        <Code>docs/EXPRESSION_DSL.md</Code>.
      </P>

      <H3>Math</H3>
      <P>
        <Code>ABS</Code> <Code>ROUND</Code> <Code>FLOOR</Code> <Code>CEIL</Code>{' '}
        <Code>SQRT</Code> <Code>POW</Code> <Code>MOD</Code> <Code>LOG</Code>{' '}
        <Code>EXP</Code> <Code>MIN</Code> <Code>MAX</Code>
      </P>
      <P>
        <Code>LOG</Code> is the <strong>natural</strong> log; <Code>POW(b, e)</Code>{' '}
        replaces <Code>**</Code>. There is no <Code>SIGN</Code>, <Code>TRUNC</Code>,{' '}
        <Code>PI</Code>, or <Code>LN</Code>.
      </P>

      <H3>Aggregation &amp; stats (column-aware)</H3>
      <P>
        Given a direct <Code>[col]</Code> reference, these reduce the whole column
        (every loaded row, via <Code>ctx.allRows</Code>). Given scalar arguments,
        they reduce the argument list instead.
      </P>
      <P>
        <Code>SUM</Code> <Code>COUNT</Code> <Code>DISTINCT_COUNT</Code> <Code>AVG</Code>{' '}
        <Code>MEDIAN</Code> <Code>STDEV</Code> <Code>VARIANCE</Code> <Code>MIN</Code>{' '}
        <Code>MAX</Code>
      </P>

      <H3>String</H3>
      <P>
        <Code>CONCAT</Code> <Code>UPPER</Code> <Code>LOWER</Code> <Code>TRIM</Code>{' '}
        <Code>LEN</Code> <Code>SUBSTRING</Code> <Code>REPLACE</Code>{' '}
        <Code>STARTS_WITH</Code> <Code>ENDS_WITH</Code> <Code>CONTAINS</Code>{' '}
        <Code>REGEX_MATCH</Code>
      </P>
      <P>
        Mind the underscores (<Code>STARTS_WITH</Code>, not{' '}
        <Code>STARTSWITH</Code>). No <Code>LEFT</Code>/<Code>RIGHT</Code>/<Code>MID</Code>{' '}
        — use <Code>{'SUBSTRING(s, start, len?)'}</Code>. <Code>REPLACE</Code>{' '}
        swaps <strong>all</strong> literal occurrences; regex is test-only via{' '}
        <Code>REGEX_MATCH</Code>.
      </P>

      <H3>Date</H3>
      <P>
        <Code>NOW</Code> <Code>TODAY</Code> <Code>YEAR</Code> <Code>MONTH</Code>{' '}
        <Code>DAY</Code> <Code>IS_WEEKDAY</Code> <Code>DATE_DIFF</Code> <Code>DATE_ADD</Code>
      </P>
      <P>
        <Code>{'DATE_DIFF(d1, d2, "days"|"hours"|"minutes"|"seconds")'}</Code>;{' '}
        <Code>{'DATE_ADD(d, n, "days"|"months"|"years"|"hours")'}</Code>. No{' '}
        <Code>HOUR</Code>/<Code>MINUTE</Code>/<Code>WEEKDAY</Code>/<Code>EOMONTH</Code>.
      </P>

      <H3>Logical &amp; null</H3>
      <Table
        cols={['Function', 'Purpose']}
        rows={[
          [<Code>{'IF(cond, then, else)'}</Code>, 'Single branch — all 3 args required (eager)'],
          [<Code>{'IFS(c1, v1, …, default?)'}</Code>, 'Multi-branch — first truthy wins'],
          [<Code>{'SWITCH(expr, case1, val1, …, default?)'}</Code>, 'Value-equality multi-branch'],
          [<Code>{'CASE(expr, case1, val1, …, default?)'}</Code>, 'Alias of SWITCH (the function form)'],
          [<Code>{'ISNULL(v, default)'}</Code>, "The DSL's ?? — v when non-null, else default"],
          [<Code>ISNOTNULL(v)</Code>, 'true when v is not null'],
          [<Code>ISEMPTY(v)</Code>, 'true for null, "", or empty array'],
        ]}
      />
      <P>
        <Code>IFS</Code> with an <strong>odd</strong> arg count treats the last
        arg as the default; even count returns <Code>null</Code> on no match.{' '}
        <Code>AND</Code> / <Code>OR</Code> / <Code>NOT</Code> are{' '}
        <strong>operators</strong>, not functions. There is no <Code>COALESCE</Code>{' '}
        — nest <Code>{'ISNULL(a, ISNULL(b, c))'}</Code>.
      </P>

      <H2>Trading examples</H2>

      <H3>Conditional styling — highlight large filled buys</H3>
      <Pre>{'[side] == "BUY" AND [quantity] >= 10000 AND [status] == "FILLED"'}</Pre>

      <H3>Calculated column — notional</H3>
      <Pre>{'[quantity] * [price] / 100'}</Pre>

      <H3>Calculated column — high-yield classifier</H3>
      <Pre>{`IFS(
  [yield] >= 7, "JUNK",
  [yield] >= 5, "HIGH YIELD",
  [yield] >= 3, "INV GRADE",
  "LOW"
)`}</Pre>

      <H3>Calculated column — relative to cost basis</H3>
      <Pre>{'([price] - [costBasis]) / [costBasis] * 100'}</Pre>

      <H3>Calculated column — days to maturity</H3>
      <Pre>{'DATE_DIFF([maturityDate], TODAY(), "days")'}</Pre>

      <H3>Calculated column — classify vs dataset mean</H3>
      <Pre>{`IF([price] >= AVG([price]) * 1.05, 1,
   IF([price] >= AVG([price]) * 0.95, 2, 3))`}</Pre>

      <H3>Custom aggregation — weighted-average spread</H3>
      <Pre>{'SUM([value] * [quantity]) / SUM([quantity])'}</Pre>
    </>
  );
}
