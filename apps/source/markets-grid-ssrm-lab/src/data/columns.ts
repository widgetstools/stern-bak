import type { ColDef, ValueFormatterParams, ValueGetterParams } from 'ag-grid-community';
import type { LabRow } from './types';

// ─── Intl formatters (singletons) ────────────────────────────────────

const num0 = new Intl.NumberFormat('en-US');
const num2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num3 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const num4 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });

export const fmt = {
  price: (p: ValueFormatterParams) =>
    p.value == null ? '' : num3.format(Number(p.value)),
  pct: (p: ValueFormatterParams) =>
    p.value == null ? '' : `${num3.format(Number(p.value))}%`,
  num2: (p: ValueFormatterParams) =>
    p.value == null ? '' : num2.format(Number(p.value)),
  num4: (p: ValueFormatterParams) =>
    p.value == null ? '' : num4.format(Number(p.value)),
  money: (p: ValueFormatterParams) =>
    p.value == null ? '' : num0.format(Math.round(Number(p.value))),
  signedMoney: (p: ValueFormatterParams) => {
    const v = p.value as number | null;
    if (v == null || v === 0) return '0';
    const sign = v > 0 ? '+' : '−';
    return `${sign}${num0.format(Math.round(Math.abs(v)))}`;
  },
  bps: (p: ValueFormatterParams) =>
    p.value == null ? '' : `${num2.format(Number(p.value))} bps`,
  date: (p: ValueFormatterParams) => {
    if (p.value == null) return '';
    const v = p.value;
    if (typeof v === 'number') return new Date(v).toISOString().slice(0, 10);
    return String(v).slice(0, 10);
  },
  time: (p: ValueFormatterParams) => {
    if (p.value == null) return '';
    const v = typeof p.value === 'number' ? p.value : Date.parse(String(p.value));
    if (Number.isNaN(v)) return '';
    return new Date(v).toLocaleTimeString();
  },
};

// ─── Synthetic value-getters ─────────────────────────────────────────

const krdSparkline = (p: ValueGetterParams<LabRow>): number[] | undefined => {
  const row = p.data;
  if (!row) return undefined;
  const series = [
    Number(row.krd1Y ?? 0),
    Number(row.krd2Y ?? 0),
    Number(row.krd5Y ?? 0),
    Number(row.krd10Y ?? 0),
    Number(row.krd30Y ?? 0),
  ];
  return series.some((n) => Number.isFinite(n)) ? series : undefined;
};

const bidAskWidthBps = (p: ValueGetterParams<LabRow>): number | undefined => {
  const bid = Number(p.data?.bidPrice);
  const ask = Number(p.data?.askPrice);
  if (!Number.isFinite(bid) || !Number.isFinite(ask)) return undefined;
  return (ask - bid) * 100;
};

// ─── Column groups (semantic — used when grouping enabled) ───────────

export const COL_GROUP = {
  identifier:  'Identifier',
  reference:   'Reference',
  pricing:     'Pricing',
  yields:      'Yields & Spreads',
  risk:        'Risk',
  quantities:  'Quantities & Cost',
  pnl:         'P&L',
  status:      'Status & Book',
} as const;

// ─── Base column defs ────────────────────────────────────────────────

export const baseColumns: ColDef<LabRow>[] = [
  // Identifier
  { field: 'cusip',                 headerName: 'CUSIP',         width: 110, pinned: 'left', filter: 'agTextColumnFilter' },
  { field: 'ticker',                headerName: 'Tkr',           width: 80,  pinned: 'left', filter: 'agSetColumnFilter' },
  { field: 'isin',                  headerName: 'ISIN',          width: 130, hide: true, filter: 'agTextColumnFilter' },
  { field: 'instrumentDescription', headerName: 'Description',   width: 260, filter: 'agTextColumnFilter' },

  // Reference
  { field: 'assetClass',            headerName: 'Class',         width: 110, filter: 'agSetColumnFilter' },
  { field: 'issuerSector',          headerName: 'Sector',        width: 130, filter: 'agSetColumnFilter' },
  { field: 'issuerSubSector',       headerName: 'Sub-sector',    width: 150, hide: true, filter: 'agSetColumnFilter' },
  { field: 'issuerCountryCode',     headerName: 'Country',       width: 100, filter: 'agSetColumnFilter' },
  { field: 'currency',              headerName: 'Ccy',           width: 70,  filter: 'agSetColumnFilter' },
  { field: 'compositeRating',       headerName: 'Rating',        width: 90,  filter: 'agSetColumnFilter' },
  { field: 'seniority',             headerName: 'Seniority',     width: 130, hide: true, filter: 'agSetColumnFilter' },

  // Pricing
  { field: 'bidPrice',              headerName: 'Bid',           width: 90,  type: 'numericColumn', valueFormatter: fmt.price, filter: 'agNumberColumnFilter' },
  { field: 'midPrice',              headerName: 'Mid',           width: 90,  type: 'numericColumn', valueFormatter: fmt.price, filter: 'agNumberColumnFilter' },
  { field: 'askPrice',              headerName: 'Ask',           width: 90,  type: 'numericColumn', valueFormatter: fmt.price, filter: 'agNumberColumnFilter' },
  { field: 'lastPrice',             headerName: 'Last',          width: 90,  type: 'numericColumn', valueFormatter: fmt.price, filter: 'agNumberColumnFilter' },
  { field: 'priceChange',           headerName: 'Δ Px',          width: 90,  type: 'numericColumn', valueFormatter: fmt.num4, filter: 'agNumberColumnFilter' },
  { field: 'priceChangePct',        headerName: 'Δ %',           width: 80,  type: 'numericColumn', valueFormatter: fmt.pct,  filter: 'agNumberColumnFilter' },
  { colId: 'bidAskWidthBps',        headerName: 'B/A (bps)',     width: 100, type: 'numericColumn', valueGetter: bidAskWidthBps, valueFormatter: fmt.num2, filter: 'agNumberColumnFilter' },
  { field: 'bidSize',               headerName: 'Bid Sz',        width: 110, hide: true, type: 'numericColumn', valueFormatter: fmt.money },
  { field: 'askSize',               headerName: 'Ask Sz',        width: 110, hide: true, type: 'numericColumn', valueFormatter: fmt.money },

  // Yields & Spreads
  { field: 'yieldToMaturity',       headerName: 'YTM',           width: 100, type: 'numericColumn', valueFormatter: fmt.pct, filter: 'agNumberColumnFilter' },
  { field: 'yieldToWorst',          headerName: 'YTW',           width: 100, type: 'numericColumn', valueFormatter: fmt.pct, filter: 'agNumberColumnFilter' },
  { field: 'currentYield',          headerName: 'Curr Yld',      width: 100, type: 'numericColumn', valueFormatter: fmt.pct, filter: 'agNumberColumnFilter' },
  { field: 'oas',                   headerName: 'OAS',           width: 90,  type: 'numericColumn', valueFormatter: fmt.num2, filter: 'agNumberColumnFilter' },
  { field: 'zSpread',               headerName: 'Z-spr',         width: 90,  type: 'numericColumn', valueFormatter: fmt.num2, filter: 'agNumberColumnFilter' },
  { field: 'iSpread',               headerName: 'I-spr',         width: 90,  type: 'numericColumn', valueFormatter: fmt.num2, filter: 'agNumberColumnFilter' },

  // Risk
  { field: 'modifiedDuration',      headerName: 'Dur',           width: 80,  type: 'numericColumn', valueFormatter: fmt.num2, filter: 'agNumberColumnFilter' },
  { field: 'dv01',                  headerName: 'DV01',          width: 90,  type: 'numericColumn', valueFormatter: fmt.num4, filter: 'agNumberColumnFilter' },
  { field: 'convexity',             headerName: 'Convex',        width: 95,  type: 'numericColumn', valueFormatter: fmt.num2, filter: 'agNumberColumnFilter' },
  { field: 'cs01',                  headerName: 'CS01',          width: 90,  hide: true, type: 'numericColumn', valueFormatter: fmt.num4 },
  { colId: 'krdSparkline',          headerName: 'KRD curve',     width: 120, valueGetter: krdSparkline, sortable: false, filter: false },

  // Quantities & Cost
  { field: 'quantityFace',          headerName: 'Qty (face)',    width: 130, type: 'numericColumn', valueFormatter: fmt.money, filter: 'agNumberColumnFilter' },
  { field: 'marketValue',           headerName: 'Mkt Value',     width: 140, type: 'numericColumn', valueFormatter: fmt.money, filter: 'agNumberColumnFilter' },
  { field: 'avgCost',               headerName: 'Avg Cost',      width: 110, type: 'numericColumn', valueFormatter: fmt.price, filter: 'agNumberColumnFilter' },
  { field: 'accruedInterest',       headerName: 'Accrued',       width: 110, hide: true, type: 'numericColumn', valueFormatter: fmt.num4 },

  // P&L
  { field: 'unrealizedPnL',         headerName: 'Unreal P&L',    width: 130, type: 'numericColumn', valueFormatter: fmt.signedMoney, filter: 'agNumberColumnFilter' },
  { field: 'dailyPnL',              headerName: 'P&L (D)',       width: 110, type: 'numericColumn', valueFormatter: fmt.signedMoney, filter: 'agNumberColumnFilter' },
  { field: 'mtdPnL',                headerName: 'P&L (MTD)',     width: 130, type: 'numericColumn', valueFormatter: fmt.signedMoney, filter: 'agNumberColumnFilter' },
  { field: 'ytdPnL',                headerName: 'P&L (YTD)',     width: 140, type: 'numericColumn', valueFormatter: fmt.signedMoney, filter: 'agNumberColumnFilter' },

  // Status & Book
  { field: 'book',                  headerName: 'Book',          width: 120, filter: 'agSetColumnFilter' },
  { field: 'trader',                headerName: 'Trader',        width: 120, filter: 'agSetColumnFilter' },
  { field: 'accountName',           headerName: 'Account',       width: 140, filter: 'agSetColumnFilter' },
  { field: 'analyst',               headerName: 'Analyst',       width: 120, hide: true, filter: 'agSetColumnFilter' },
  { field: 'maturityDate',          headerName: 'Maturity',      width: 110, filter: 'agTextColumnFilter' },
  { field: 'lastUpdate',            headerName: 'Updated',       width: 110, type: 'numericColumn', valueFormatter: fmt.time, filter: false, sortable: true },
];

// Note: NO `enableCellChangeFlash` here. The conditional-styling module
// runs its own CSS-keyframe flashes via seeded rules (`flash: { … }`),
// and those compose cleanly with `activeDurationMs` windows. Turning AG
// Grid's native cell flash on at the same time double-paints every tick
// AND — worse — when a column recomputes faster than the flash+fade
// timeout (e.g. calculated columns whose inputs tick every 500 ms), the
// cell never leaves the flashed state and its background appears
// permanently green/teal. Leave it off; the conditional rules handle
// flashing where it's actually meaningful.
export const defaultColDef: ColDef = {
  resizable: true,
  sortable: true,
  filter: true,
  floatingFilter: false,
};

/** Find a column by `field` or `colId`. Returned ref is shared — clone before mutating. */
export function findCol(field: string): ColDef<LabRow> | undefined {
  return baseColumns.find((c) => c.field === field || c.colId === field);
}

/** Build a column list by picking fields in order. */
export function pickColumns(fields: string[]): ColDef<LabRow>[] {
  return fields
    .map((f) => baseColumns.find((c) => c.field === f || c.colId === f))
    .filter((c): c is ColDef<LabRow> => c !== undefined)
    .map((c) => ({ ...c, hide: false }));
}
