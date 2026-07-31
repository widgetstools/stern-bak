/**
 * 2. Trading-Specific Formats — basis points, bond tick prices,
 * prices/yields, order side & status, compact notional, P&L painting.
 */

import { Code, H1, H2, P, Table } from './primitives';

export function TradingSection() {
  return (
    <>
      <H1>2. Trading-Specific Formats</H1>

      <H2>Basis points</H2>
      <Table
        cols={['Format', 'Use case']}
        rows={[
          [<Code>{'0" bps"'}</Code>, '150 bps'],
          [<Code>{'+#,##0" bps";-#,##0" bps"'}</Code>, 'Signed bps change'],
          [<Code>{'0.0" bps"'}</Code>, 'Fractional bps'],
          [<Code>{'[Green]+0.0" bps";[Red]-0.0" bps"'}</Code>, 'Yield change colored'],
        ]}
      />

      <H2>Bond tick prices</H2>
      <P>
        Full Excel doesn't support tick prices (32nds, 64ths, etc). We ship a
        native <Code>kind: 'tick'</Code> formatter with five tokens — pick them
        from the Formatting Toolbar's tick menu.
      </P>
      <Table
        cols={['Token', 'Decimal', 'Rendered']}
        rows={[
          [<Code>TICK32</Code>, '101.5', '101-16 (16/32)'],
          [<Code>TICK32_PLUS</Code>, '101.515625', '101-16+ (sub-tick)'],
          [<Code>TICK64</Code>, '101.25', '101-16 (16/64)'],
          [<Code>TICK128</Code>, '101.125', '101-16 (16/128)'],
          [<Code>TICK256</Code>, '101.0625', '101-16 (16/256)'],
        ]}
      />

      <H2>Prices &amp; yields</H2>
      <Table
        cols={['Format', 'Use case']}
        rows={[
          [<Code>0.0000</Code>, 'FX major pairs, 4 decimals'],
          [<Code>0.00000</Code>, 'Precious metals, 5 decimals'],
          [<Code>{'0.00" pct"'}</Code>, 'Bond price as pct-of-par'],
          [<Code>{'0.000"%"'}</Code>, 'Yield'],
          [<Code>{'#,##0.00000000" BTC"'}</Code>, 'Crypto 8-decimal'],
        ]}
      />

      <H2>Order side &amp; status</H2>
      <Table
        cols={['Format', 'Use case']}
        rows={[
          [<Code>{'[="BUY"]"▲ BUY";[="SELL"]"▼ SELL";@'}</Code>, 'Side with arrows'],
          [<Code>{'[="BUY"][Green]@;[="SELL"][Red]@'}</Code>, 'Color-coded side'],
          [<Code>{'[>=100]"AT PAR";[<100]"DISCOUNT"'}</Code>, 'Price vs par'],
          [<Code>{'[=1]"PRICED";[=0]"PENDING"'}</Code>, 'Lifecycle boolean'],
          [<Code>{'[>0]"LONG " 0;[<0]"SHORT " 0'}</Code>, 'Position direction'],
        ]}
      />

      <H2>Compact notional</H2>
      <Table
        cols={['Format', '1,234,567,890 renders']}
        rows={[
          [<Code>#,##0,,</Code>, '1,235 (millions)'],
          [<Code>{'#,##0.00,,"M"'}</Code>, '1,234.57M'],
          [<Code>{'#,##0,,,'}</Code>, '1 (billions)'],
          [<Code>{'#,##0.00,,,"B"'}</Code>, '1.23B'],
        ]}
      />

      <H2>P&amp;L painting</H2>
      <Table
        cols={['Format', 'Behavior']}
        rows={[
          [<Code>{'[Green]+#,##0;[Red]-#,##0;0'}</Code>, 'Daily P&L with sign + color'],
          [
            <Code>{'[Green]+#,##0.00" USD";[Red]-#,##0.00" USD"'}</Code>,
            'Currency-tagged P&L',
          ],
        ]}
      />
    </>
  );
}
