import type { ColDef, ValueFormatterParams } from 'ag-grid-community';

const num2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num4 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const intl = new Intl.NumberFormat('en-US');

const fmtPx = (p: ValueFormatterParams) =>
  p.value == null ? '' : num4.format(p.value as number);
const fmtMoney = (p: ValueFormatterParams) =>
  p.value == null ? '' : intl.format(Math.round(p.value as number));
const fmtNum2 = (p: ValueFormatterParams) =>
  p.value == null ? '' : num2.format(p.value as number);
const fmtTime = (p: ValueFormatterParams) => {
  const v = p.value as string | number | null | undefined;
  if (v == null) return '';
  return new Date(v).toLocaleTimeString('en-GB', { hour12: false });
};

export const tradeColumnDefs: ColDef[] = [
  { field: 'tradeId',     headerName: 'Trade ID',  width: 130, pinned: 'left', filter: 'agTextColumnFilter' },
  { field: 'cusip',       headerName: 'CUSIP',     width: 110, pinned: 'left', filter: 'agTextColumnFilter' },
  { field: 'ticker',      headerName: 'Tkr',       width: 80,  filter: 'agSetColumnFilter' },
  { field: 'side',        headerName: 'Side',      width: 80,  filter: 'agSetColumnFilter' },
  { field: 'tradeStatus', headerName: 'Status',    width: 120, filter: 'agSetColumnFilter' },
  { field: 'tradeQty',    headerName: 'Qty',       width: 130, type: 'numericColumn', valueFormatter: fmtMoney, filter: 'agNumberColumnFilter' },
  { field: 'avgPrice',    headerName: 'Avg Price', width: 110, type: 'numericColumn', valueFormatter: fmtPx, filter: 'agNumberColumnFilter' },
  { field: 'cleanPrice',  headerName: 'Clean',     width: 100, type: 'numericColumn', valueFormatter: fmtPx, filter: 'agNumberColumnFilter' },
  { field: 'dirtyPrice',  headerName: 'Dirty',     width: 100, type: 'numericColumn', valueFormatter: fmtPx, filter: 'agNumberColumnFilter' },
  { field: 'yield',       headerName: 'Yield',     width: 90,  type: 'numericColumn', valueFormatter: fmtNum2, filter: 'agNumberColumnFilter' },
  { field: 'spreadBps',   headerName: 'Spread',    width: 90,  type: 'numericColumn', valueFormatter: fmtNum2, filter: 'agNumberColumnFilter' },
  { field: 'principal',   headerName: 'Principal', width: 140, type: 'numericColumn', valueFormatter: fmtMoney, filter: 'agNumberColumnFilter' },
  { field: 'accruedInterest', headerName: 'Accrued', width: 110, type: 'numericColumn', valueFormatter: fmtMoney, filter: 'agNumberColumnFilter' },
  { field: 'proceeds',    headerName: 'Proceeds',  width: 140, type: 'numericColumn', valueFormatter: fmtMoney, filter: 'agNumberColumnFilter' },
  { field: 'trader',      headerName: 'Trader',    width: 120, filter: 'agSetColumnFilter' },
  { field: 'counterparty', headerName: 'Cpty',     width: 130, filter: 'agSetColumnFilter' },
  { field: 'venue',       headerName: 'Venue',     width: 110, filter: 'agSetColumnFilter' },
  { field: 'tradeDate',   headerName: 'Trade Dt',  width: 110, filter: 'agTextColumnFilter' },
  { field: 'settlementDate', headerName: 'Settle Dt', width: 110, filter: 'agTextColumnFilter' },
  { field: 'tradeTime',   headerName: 'Time',      width: 100, valueFormatter: fmtTime, filter: 'agTextColumnFilter' },
  { field: 'currency',    headerName: 'Ccy',       width: 70,  filter: 'agSetColumnFilter' },
  { field: 'settleType',  headerName: 'Sett',      width: 80,  filter: 'agSetColumnFilter' },
];
