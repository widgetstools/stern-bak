/**
 * Grid column definitions — the trader-facing view over the provider's
 * engine schema. Price columns carry the write-lifecycle `cellClassRules`
 * (amber staged / yellow pending / red failed, painted from the
 * `CellStateStore`) and everything numeric formats to desk conventions:
 * marks in 3dp points, faces and MV in thousands, PnL signed and colored.
 */
import type { CellClassParams, ColDef } from 'ag-grid-community';
import type { CellStateStore } from '../trading/cellStates';

const fmtPx = (v: unknown) => (typeof v === 'number' ? v.toFixed(3) : '');
const fmtNum = (dp: number) => (v: unknown) => (typeof v === 'number' ? v.toFixed(dp) : '');
const fmtMoney = (v: unknown) =>
  typeof v === 'number' ? Math.round(v).toLocaleString('en-US') : '';
const fmtSignedMoney = (v: unknown) =>
  typeof v === 'number' ? `${v > 0 ? '+' : ''}${Math.round(v).toLocaleString('en-US')}` : '';

export function buildSpgColumnDefs(store: CellStateStore): ColDef[] {
  const writeStates = (colId: string): NonNullable<ColDef['cellClassRules']> => ({
    'spg-cell-staged': (p: CellClassParams) =>
      store.stateOf(String(p.data?.cusip ?? ''), colId) === 'staged',
    'spg-cell-pending': (p: CellClassParams) =>
      store.stateOf(String(p.data?.cusip ?? ''), colId) === 'pending',
    'spg-cell-failed': (p: CellClassParams) =>
      store.stateOf(String(p.data?.cusip ?? ''), colId) === 'failed',
  });

  const num = (extra: Partial<ColDef> = {}): Partial<ColDef> => ({
    type: 'numericColumn',
    filter: 'agNumberColumnFilter',
    ...extra,
  });

  return [
    {
      field: 'cusip', headerName: 'CUSIP', pinned: 'left', width: 118, lockPinned: true,
      cellClass: 'font-mono', cellClassRules: writeStates('cusip'),
    },
    { field: 'dealName', headerName: 'Deal', width: 140 },
    { field: 'assetClass', headerName: 'Class', width: 90, enableRowGroup: true },
    { field: 'tranche', headerName: 'Tranche', width: 92, enableRowGroup: true },
    { field: 'rating', headerName: 'Rtg', width: 84, enableRowGroup: true },
    {
      field: 'price', headerName: 'Price', width: 104, editable: true, enableValue: true,
      ...num({ valueFormatter: (p) => fmtPx(p.value) }),
      cellClassRules: writeStates('price'),
      headerTooltip: 'Trader mark (points). Edit, paste a column of marks, or CSV-import — yellow border until the server commits.',
    },
    {
      field: 'priorPrice', headerName: 'Prior Px', width: 104, editable: true,
      ...num({ valueFormatter: (p) => fmtPx(p.value) }),
      cellClassRules: writeStates('priorPrice'),
    },
    {
      field: 'priceChangePct', headerName: 'Px Chg %', width: 100,
      ...num({ valueFormatter: (p) => (typeof p.value === 'number' ? `${p.value.toFixed(2)}%` : '') }),
      cellClassRules: {
        'spg-num-up': (p: CellClassParams) => typeof p.value === 'number' && p.value > 0,
        'spg-num-down': (p: CellClassParams) => typeof p.value === 'number' && p.value < 0,
      },
      headerTooltip: 'Server-derived from price vs prior — updates on the commit echo, not on keystrokes.',
    },
    {
      field: 'spreadDm', headerName: 'Sprd/DM', width: 96, editable: true, enableValue: true,
      ...num({ valueFormatter: (p) => fmtNum(0)(p.value) }),
      cellClassRules: writeStates('spreadDm'),
    },
    {
      field: 'yieldToMaturity', headerName: 'YTM', width: 92, editable: true, enableValue: true,
      ...num({ valueFormatter: (p) => fmtNum(3)(p.value) }),
      cellClassRules: writeStates('yieldToMaturity'),
    },
    {
      field: 'coupon', headerName: 'Cpn', width: 88, editable: true,
      ...num({ valueFormatter: (p) => fmtNum(3)(p.value) }),
      cellClassRules: writeStates('coupon'),
    },
    { field: 'walYears', headerName: 'WAL', width: 80, ...num({ valueFormatter: (p) => fmtNum(2)(p.value) }) },
    { field: 'factor', headerName: 'Factor', width: 92, ...num({ valueFormatter: (p) => fmtNum(6)(p.value) }) },
    { field: 'currentFace', headerName: 'Curr Face', width: 122, enableValue: true, ...num({ valueFormatter: (p) => fmtMoney(p.value) }) },
    {
      field: 'marketValue', headerName: 'Mkt Value', width: 128, enableValue: true,
      ...num({ valueFormatter: (p) => fmtMoney(p.value) }),
      headerTooltip: 'Server-derived: currentFace × price / 100. Watch it move when a price commit echoes back.',
    },
    {
      field: 'pnl', headerName: 'PnL', width: 118, enableValue: true,
      ...num({ valueFormatter: (p) => fmtSignedMoney(p.value) }),
      cellClassRules: {
        'spg-num-up': (p: CellClassParams) => typeof p.value === 'number' && p.value > 0,
        'spg-num-down': (p: CellClassParams) => typeof p.value === 'number' && p.value < 0,
      },
    },
    { field: 'maturityDate', headerName: 'Maturity', width: 112, filter: 'agDateColumnFilter' },
    {
      field: 'trader', headerName: 'Trader', width: 116, editable: true, enableRowGroup: true,
      cellClassRules: writeStates('trader'),
    },
    { field: 'desk', headerName: 'Desk', width: 100, enableRowGroup: true },
    { field: 'originalFace', headerName: 'Orig Face', width: 122, hide: true, ...num({ valueFormatter: (p) => fmtMoney(p.value) }) },
    {
      field: 'lastUpdate', headerName: 'Updated', width: 100, sortable: true, filter: false,
      valueFormatter: (p) => (typeof p.value === 'string' ? p.value.slice(11, 19) : ''),
    },
  ];
}

export const SPG_DEFAULT_COL_DEF: ColDef = {
  sortable: true,
  resizable: true,
  filter: true,
  floatingFilter: false,
  enableCellChangeFlash: true,
};
