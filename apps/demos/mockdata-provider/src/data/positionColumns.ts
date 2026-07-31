import type { ColDef, ValueFormatterParams } from 'ag-grid-community';

const num2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num3 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const num4 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const intl = new Intl.NumberFormat('en-US');

const fmtPx = (p: ValueFormatterParams) =>
  p.value == null ? '' : num3.format(p.value as number);
const fmtYield = (p: ValueFormatterParams) =>
  p.value == null ? '' : `${num3.format(p.value as number)}%`;
const fmtMoney = (p: ValueFormatterParams) =>
  p.value == null ? '' : intl.format(Math.round(p.value as number));
const fmtNum2 = (p: ValueFormatterParams) =>
  p.value == null ? '' : num2.format(p.value as number);
const fmtNum4 = (p: ValueFormatterParams) =>
  p.value == null ? '' : num4.format(p.value as number);
const fmtPnl = (p: ValueFormatterParams) => {
  const v = p.value as number | null;
  if (v == null || v === 0) return '0';
  const sign = v > 0 ? '+' : '−';
  return `${sign}${intl.format(Math.round(Math.abs(v)))}`;
};

export const positionColumnDefs: ColDef[] = [
  { field: 'cusip',              headerName: 'CUSIP',     width: 110, pinned: 'left', filter: 'agTextColumnFilter' },
  { field: 'ticker',             headerName: 'Tkr',       width: 80,  pinned: 'left', filter: 'agSetColumnFilter' },
  { field: 'instrumentDescription', headerName: 'Description', width: 260, filter: 'agTextColumnFilter' },
  { field: 'assetClass',         headerName: 'Class',     width: 110, filter: 'agSetColumnFilter' },
  { field: 'issuerSector',       headerName: 'Sector',    width: 130, filter: 'agSetColumnFilter' },
  { field: 'currency',           headerName: 'Ccy',       width: 70,  filter: 'agSetColumnFilter' },
  { field: 'couponRate',         headerName: 'Cpn %',     width: 90,  type: 'numericColumn', valueFormatter: fmtNum2, filter: 'agNumberColumnFilter' },
  { field: 'maturityDate',       headerName: 'Maturity',  width: 110, filter: 'agTextColumnFilter' },
  { field: 'bidPrice',           headerName: 'Bid',       width: 90,  type: 'numericColumn', valueFormatter: fmtPx, filter: 'agNumberColumnFilter' },
  { field: 'midPrice',           headerName: 'Mid',       width: 90,  type: 'numericColumn', valueFormatter: fmtPx, filter: 'agNumberColumnFilter' },
  { field: 'askPrice',           headerName: 'Ask',       width: 90,  type: 'numericColumn', valueFormatter: fmtPx, filter: 'agNumberColumnFilter' },
  { field: 'yieldToMaturity',    headerName: 'YTM',       width: 100, type: 'numericColumn', valueFormatter: fmtYield, filter: 'agNumberColumnFilter' },
  { field: 'oas',                headerName: 'OAS',       width: 90,  type: 'numericColumn', valueFormatter: fmtNum2, filter: 'agNumberColumnFilter' },
  { field: 'modifiedDuration',   headerName: 'Dur',       width: 80,  type: 'numericColumn', valueFormatter: fmtNum2, filter: 'agNumberColumnFilter' },
  { field: 'dv01',               headerName: 'DV01',      width: 90,  type: 'numericColumn', valueFormatter: fmtNum4, filter: 'agNumberColumnFilter' },
  { field: 'quantityFace',       headerName: 'Qty (face)', width: 130, type: 'numericColumn', valueFormatter: fmtMoney, filter: 'agNumberColumnFilter' },
  { field: 'marketValue',        headerName: 'Mkt Value', width: 140, type: 'numericColumn', valueFormatter: fmtMoney, filter: 'agNumberColumnFilter' },
  { field: 'unrealizedPnL',      headerName: 'Unreal P&L', width: 130, type: 'numericColumn', valueFormatter: fmtPnl, filter: 'agNumberColumnFilter' },
  { field: 'dailyPnL',           headerName: 'P&L (D)',   width: 110, type: 'numericColumn', valueFormatter: fmtPnl, filter: 'agNumberColumnFilter' },
  { field: 'mtdPnL',             headerName: 'P&L (MTD)', width: 130, type: 'numericColumn', valueFormatter: fmtPnl, filter: 'agNumberColumnFilter' },
  { field: 'ytdPnL',             headerName: 'P&L (YTD)', width: 140, type: 'numericColumn', valueFormatter: fmtPnl, filter: 'agNumberColumnFilter' },
  { field: 'book',               headerName: 'Book',      width: 120, filter: 'agSetColumnFilter' },
  { field: 'trader',             headerName: 'Trader',    width: 120, filter: 'agSetColumnFilter' },
  { field: 'accountName',        headerName: 'Account',   width: 120, filter: 'agSetColumnFilter' },
  { field: 'issuerName',         headerName: 'Issuer',    width: 200, filter: 'agSetColumnFilter' },
];
