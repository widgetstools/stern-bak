import type { ColDef, ValueFormatterParams } from 'ag-grid-community';
import type { Bond } from './mockBonds';

const intl = new Intl.NumberFormat('en-US');
const px2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const px3 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const px4 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });

const fmtPx = (p: ValueFormatterParams<Bond>) =>
  p.value == null ? '' : px3.format(p.value as number);
const fmtYield = (p: ValueFormatterParams<Bond>) =>
  p.value == null ? '' : `${px3.format(p.value as number)}%`;
const fmtBps = (p: ValueFormatterParams<Bond>) =>
  p.value == null ? '' : `${px2.format(p.value as number)}`;
const fmtDuration = (p: ValueFormatterParams<Bond>) =>
  p.value == null ? '' : px2.format(p.value as number);
const fmtDv01 = (p: ValueFormatterParams<Bond>) =>
  p.value == null ? '' : px4.format(p.value as number);
const fmtMoney = (p: ValueFormatterParams<Bond>) =>
  p.value == null ? '' : intl.format(Math.round(p.value as number));
const fmtSize = (p: ValueFormatterParams<Bond>) => {
  const v = p.value as number | null;
  if (v == null) return '';
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}MM`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return String(v);
};
const fmtPnl = (p: ValueFormatterParams<Bond>) => {
  const v = p.value as number | null;
  if (v == null || v === 0) return '0';
  const sign = v > 0 ? '+' : '−';
  return `${sign}${intl.format(Math.round(Math.abs(v)))}`;
};
const fmtDate = (p: ValueFormatterParams<Bond>) =>
  p.value == null ? '' : (p.value as string).slice(0, 10);
const fmtTime = (p: ValueFormatterParams<Bond>) => {
  const v = p.value as string | null;
  if (!v) return '';
  return new Date(v).toLocaleTimeString('en-GB', { hour12: false });
};

export const bondColumnDefs: ColDef<Bond>[] = [
  { field: 'ticker', headerName: 'Tkr', width: 80, pinned: 'left', filter: 'agSetColumnFilter' },
  { field: 'description', headerName: 'Description', width: 220, pinned: 'left', filter: 'agTextColumnFilter' },
  { field: 'cusip', headerName: 'CUSIP', width: 110, filter: 'agTextColumnFilter' },
  { field: 'isin', headerName: 'ISIN', width: 130, filter: 'agTextColumnFilter' },
  { field: 'issuer', headerName: 'Issuer', width: 200, filter: 'agSetColumnFilter' },
  { field: 'sector', headerName: 'Sector', width: 120, filter: 'agSetColumnFilter' },
  { field: 'rating', headerName: 'Rtg', width: 80, filter: 'agSetColumnFilter' },
  { field: 'currency', headerName: 'Ccy', width: 70, filter: 'agSetColumnFilter' },
  { field: 'coupon', headerName: 'Cpn %', width: 90, type: 'numericColumn',
    valueFormatter: (p) => p.value == null ? '' : px3.format(p.value as number),
    filter: 'agNumberColumnFilter' },
  { field: 'maturity', headerName: 'Maturity', width: 110, valueFormatter: fmtDate,
    filter: 'agTextColumnFilter' },
  { field: 'side', headerName: 'Side', width: 90, filter: 'agSetColumnFilter' },
  { field: 'bidPrice', headerName: 'Bid', width: 90, type: 'numericColumn',
    valueFormatter: fmtPx, filter: 'agNumberColumnFilter' },
  { field: 'midPrice', headerName: 'Mid', width: 90, type: 'numericColumn',
    valueFormatter: fmtPx, filter: 'agNumberColumnFilter' },
  { field: 'offerPrice', headerName: 'Offer', width: 90, type: 'numericColumn',
    valueFormatter: fmtPx, filter: 'agNumberColumnFilter' },
  { field: 'bidYield', headerName: 'Bid Yld', width: 100, type: 'numericColumn',
    valueFormatter: fmtYield, filter: 'agNumberColumnFilter' },
  { field: 'ytm', headerName: 'YTM', width: 100, type: 'numericColumn',
    valueFormatter: fmtYield, filter: 'agNumberColumnFilter' },
  { field: 'offerYield', headerName: 'Off Yld', width: 100, type: 'numericColumn',
    valueFormatter: fmtYield, filter: 'agNumberColumnFilter' },
  { field: 'oas', headerName: 'OAS', width: 90, type: 'numericColumn',
    valueFormatter: fmtBps, filter: 'agNumberColumnFilter' },
  { field: 'zSpread', headerName: 'Z-Spr', width: 90, type: 'numericColumn',
    valueFormatter: fmtBps, filter: 'agNumberColumnFilter' },
  { field: 'duration', headerName: 'Dur', width: 80, type: 'numericColumn',
    valueFormatter: fmtDuration, filter: 'agNumberColumnFilter' },
  { field: 'convexity', headerName: 'Cnvx', width: 80, type: 'numericColumn',
    valueFormatter: fmtDuration, filter: 'agNumberColumnFilter' },
  { field: 'dv01', headerName: 'DV01', width: 90, type: 'numericColumn',
    valueFormatter: fmtDv01, filter: 'agNumberColumnFilter' },
  { field: 'size', headerName: 'Size', width: 90, type: 'numericColumn',
    valueFormatter: fmtSize, filter: 'agNumberColumnFilter' },
  { field: 'notional', headerName: 'Notional', width: 130, type: 'numericColumn',
    valueFormatter: fmtMoney, filter: 'agNumberColumnFilter' },
  { field: 'pnlDay', headerName: 'P&L (D)', width: 110, type: 'numericColumn',
    valueFormatter: fmtPnl, filter: 'agNumberColumnFilter' },
  { field: 'pnlMtd', headerName: 'P&L (MTD)', width: 130, type: 'numericColumn',
    valueFormatter: fmtPnl, filter: 'agNumberColumnFilter' },
  { field: 'pnlYtd', headerName: 'P&L (YTD)', width: 140, type: 'numericColumn',
    valueFormatter: fmtPnl, filter: 'agNumberColumnFilter' },
  { field: 'liquidity', headerName: 'Liq', width: 70, filter: 'agSetColumnFilter' },
  { field: 'desk', headerName: 'Desk', width: 100, filter: 'agSetColumnFilter' },
  { field: 'book', headerName: 'Book', width: 120, filter: 'agSetColumnFilter' },
  { field: 'trader', headerName: 'Trader', width: 120, filter: 'agSetColumnFilter' },
  { field: 'changeBps', headerName: 'Δ bps', width: 90, type: 'numericColumn',
    valueFormatter: fmtBps, filter: 'agNumberColumnFilter' },
  { field: 'lastTradedAt', headerName: 'Last', width: 100, valueFormatter: fmtTime,
    filter: 'agTextColumnFilter' },
];

export const bondDefaultColDef: ColDef<Bond> = {
  floatingFilter: true,
  filter: true,
  sortable: true,
  resizable: true,
};
