/**
 * 1. Excel Format Strings — SSF-backed format syntax, anatomy,
 * numeric/currency/negative/conditional/date/color recipes.
 */

import { Code, H1, H2, P, Pre, Table } from './primitives';

export function ExcelSection() {
  return (
    <>
      <H1>1. Excel Format Strings</H1>
      <P>
        Powered by SSF (SheetJS Format), which gives full Excel parity for numbers,
        currencies, percentages, dates, and conditional sections.
      </P>

      <H2>Anatomy</H2>
      <P>Up to four sections separated by <Code>;</Code>:</P>
      <Pre>positive ; negative ; zero ; text</Pre>
      <P>
        With <strong>conditional sections</strong>, swap the positive/negative/zero
        test for value-equality or range tests:
      </P>
      <Pre>[condition1]section1 ; [condition2]section2 ; default</Pre>
      <P>
        Supported conditions: <Code>[&gt;N]</Code> <Code>[&gt;=N]</Code>{' '}
        <Code>[&lt;N]</Code> <Code>[&lt;=N]</Code> <Code>[=N]</Code>{' '}
        <Code>[&lt;&gt;N]</Code> where <Code>N</Code> is a literal number.
      </P>

      <H2>Numbers</H2>
      <Table
        cols={['Format', 'Input', 'Rendered']}
        rows={[
          [<Code>0</Code>, '1234.5', '1235'],
          [<Code>0.00</Code>, '1234.5', '1234.50'],
          [<Code>#,##0</Code>, '1234567', '1,234,567'],
          [<Code>#,##0.00</Code>, '1234567.89', '1,234,567.89'],
          [<Code>0%</Code>, '0.125', '13%'],
          [<Code>0.00%</Code>, '0.12345', '12.35%'],
          [<Code>0.00E+00</Code>, '12345', '1.23E+04'],
          [<Code>#,##0,</Code>, '1234567', '1,235 (thousands)'],
          [<Code>#,##0,,</Code>, '1234567890', '1,235 (millions)'],
          [<Code>#,##0,,,</Code>, '1234567890123', '1,235 (billions)'],
        ]}
      />

      <H2>Currencies</H2>
      <P>
        <Code>$</Code> and <Code>€</Code> can be used raw. Other symbols{' '}
        (<Code>£ ¥ ₹ CHF</Code>) must be wrapped in quotes — SSF otherwise
        rejects them.
      </P>
      <Table
        cols={['Format', 'Rendered']}
        rows={[
          [<Code>{'$#,##0.00'}</Code>, '$1,234.50'],
          [<Code>{'€#,##0.00'}</Code>, '€1,234.50'],
          [<Code>{'"£"#,##0.00'}</Code>, '£1,234.50'],
          [<Code>{'"¥"#,##0'}</Code>, '¥1,235'],
          [<Code>{'"CHF "#,##0.00'}</Code>, 'CHF 1,234.50'],
        ]}
      />

      <H2>Negatives</H2>
      <Table
        cols={['Format', '-1234.56 renders as']}
        rows={[
          [<Code>{'#,##0.00;-#,##0.00'}</Code>, '-1,234.56'],
          [<Code>{'#,##0.00;(#,##0.00)'}</Code>, '(1,234.56)'],
          [<Code>{'[Red]#,##0.00;[Red](#,##0.00)'}</Code>, '(1,234.56) in red'],
          [<Code>{'[Green]+#,##0;[Red]-#,##0'}</Code>, '-1,235 in red with sign'],
        ]}
      />

      <H2>Conditional sections</H2>
      <Table
        cols={['Format', 'Behavior']}
        rows={[
          [<Code>{'[>100]0;0.00'}</Code>, 'Integer when ≥ 100, 2dp otherwise'],
          [<Code>{'[>=1000000]0.0,,"M";0'}</Code>, 'Compact "million" suffix over 1M'],
          [<Code>{'[=1]"Green";[=0]"Off"'}</Code>, 'Enum mapping for 0/1 switch'],
          [<Code>{'[>0]"▲" 0.00;[<0]"▼" 0.00;0'}</Code>, 'Up/down arrows with number'],
          [<Code>{'[=1]"🟢";[=2]"🟡";[=3]"🔴"'}</Code>, 'Traffic-light emoji map'],
        ]}
      />

      <H2>Dates</H2>
      <P>
        Date values must be <Code>Date</Code> objects or ISO-8601 strings
        (starting with <Code>yyyy-mm-dd</Code>).
      </P>
      <Table
        cols={['Format', 'Rendered (2026-04-18 14:30)']}
        rows={[
          [<Code>yyyy-mm-dd</Code>, '2026-04-18'],
          [<Code>dd/mm/yyyy</Code>, '18/04/2026'],
          [<Code>mm/dd/yyyy</Code>, '04/18/2026'],
          [<Code>dd-mmm-yyyy</Code>, '18-Apr-2026'],
          [<Code>{'yyyy-mm-dd hh:mm'}</Code>, '2026-04-18 14:30'],
          [<Code>{'hh:mm AM/PM'}</Code>, '02:30 PM'],
          [<Code>{'dddd, mmmm dd, yyyy'}</Code>, 'Saturday, April 18, 2026'],
        ]}
      />

      <H2>Colors</H2>
      <P>
        Supported tags: <Code>[Black]</Code> <Code>[Blue]</Code> <Code>[Cyan]</Code>{' '}
        <Code>[Green]</Code> <Code>[Magenta]</Code> <Code>[Red]</Code>{' '}
        <Code>[White]</Code> <Code>[Yellow]</Code>. Apply to a single section:
      </P>
      <Pre>[Green]#,##0.00;[Red](#,##0.00)</Pre>
    </>
  );
}
