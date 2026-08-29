import type { VirtualColumnDef } from '@wellsfargo-starui/grid/customizer';

// Calculated columns authored against the module's expression DSL.
// Field references use `[columnId]` syntax. Operators + IF/SUM/LOG/ABS
// are built-in. The engine re-evaluates each cell whenever a dependency
// field changes — so flashes ride through to derived columns too.

export const OVERVIEW_CALC_COLUMNS: VirtualColumnDef[] = [
  {
    colId: 'calc_pnlTotal',
    headerName: 'P&L Total',
    expression: '[dailyPnL] + [mtdPnL] + [ytdPnL]',
    cellDataType: 'currency',
    valueFormatterTemplate: { kind: 'preset', preset: 'currency', options: { signed: true } },
    position: 100,
    initialWidth: 130,
  },
  {
    colId: 'calc_carryRisk',
    headerName: 'Carry/Risk',
    expression: 'IF([modifiedDuration] > 0, [yieldToMaturity] / [modifiedDuration], null)',
    cellDataType: 'number',
    valueFormatterTemplate: { kind: 'preset', preset: 'number', options: { minimumFractionDigits: 2, maximumFractionDigits: 2 } },
    position: 101,
    initialWidth: 110,
  },
  {
    colId: 'calc_dollarDur',
    headerName: 'Dollar Dur',
    expression: '[marketValue] * [modifiedDuration] / 100',
    cellDataType: 'currency',
    valueFormatterTemplate: { kind: 'preset', preset: 'currency', options: { maximumFractionDigits: 0 } },
    position: 102,
    initialWidth: 130,
  },
  {
    colId: 'calc_bidAskBps',
    headerName: 'B/A bps (calc)',
    expression: '([askPrice] - [bidPrice]) * 100',
    cellDataType: 'number',
    valueFormatterTemplate: { kind: 'preset', preset: 'number', options: { minimumFractionDigits: 2, maximumFractionDigits: 2 } },
    position: 103,
    initialWidth: 120,
  },
];

export const CALCULATED_TAB_VIRTUAL: VirtualColumnDef[] = [
  ...OVERVIEW_CALC_COLUMNS,
  {
    colId: 'calc_riskBucket',
    headerName: 'Risk Bucket',
    expression: 'IF([modifiedDuration] < 3, "Short", IF([modifiedDuration] < 7, "Mid", IF([modifiedDuration] < 12, "Long", "Ultra")))',
    cellDataType: 'string',
    position: 104,
    initialWidth: 110,
  },
  {
    colId: 'calc_spreadToBench',
    headerName: 'Sprd→Bench (bps)',
    expression: '([yieldToMaturity] - [benchmarkYield]) * 100',
    cellDataType: 'number',
    valueFormatterTemplate: { kind: 'preset', preset: 'number', options: { minimumFractionDigits: 2, maximumFractionDigits: 2 } },
    position: 105,
    initialWidth: 140,
  },
  {
    colId: 'calc_liquidityScore',
    headerName: 'Liquidity (log)',
    // LOG10 isn't a registered function — LOG is natural log, so base-10 is
    // the change-of-base identity: log10(x) = ln(x) / ln(10).
    expression: 'LOG([avgDailyVolume30d]) / LOG(10)',
    cellDataType: 'number',
    valueFormatterTemplate: { kind: 'preset', preset: 'number', options: { minimumFractionDigits: 2, maximumFractionDigits: 2 } },
    position: 106,
    initialWidth: 120,
  },
  {
    colId: 'calc_pnlPctMkt',
    headerName: 'P&L % of Mkt',
    expression: 'IF([marketValue] > 0, ([dailyPnL] / [marketValue]) * 100, null)',
    cellDataType: 'number',
    valueFormatterTemplate: { kind: 'preset', preset: 'number', options: { minimumFractionDigits: 2, maximumFractionDigits: 3 } },
    position: 107,
    initialWidth: 120,
  },
  {
    colId: 'calc_cs01Notional',
    headerName: 'CS01 × Qty',
    expression: '[cs01] * [quantityFace] / 1000000',
    cellDataType: 'currency',
    valueFormatterTemplate: { kind: 'preset', preset: 'currency', options: { maximumFractionDigits: 0 } },
    position: 108,
    initialWidth: 130,
  },
  {
    colId: 'calc_yieldSpread',
    headerName: 'YTW − YTM',
    expression: '[yieldToWorst] - [yieldToMaturity]',
    cellDataType: 'number',
    valueFormatterTemplate: { kind: 'preset', preset: 'number', options: { minimumFractionDigits: 3, maximumFractionDigits: 3 } },
    position: 109,
    initialWidth: 110,
  },
];
