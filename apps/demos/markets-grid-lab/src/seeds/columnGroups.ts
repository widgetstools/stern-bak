import type { ColumnGroupNode } from '@wellsfargo-starui/grid/customizer';

// Column groups with optional bold-headers and per-child columnGroupShow
// modes. `marryChildren: true` prevents drag-out. GroupHeaderStyle has
// NO theme-aware shape — `color` / `background` are single CSS strings,
// so we lean on light-mode-friendly hex values; the grid is readable in
// both themes because tokens dominate every neighbouring surface.

export const OVERVIEW_COLUMN_GROUPS: ColumnGroupNode[] = [
  {
    groupId: 'g_identifier',
    headerName: 'Identifier',
    marryChildren: true,
    openByDefault: false,
    headerStyle: { bold: true },
    children: [
      { kind: 'col', colId: 'cusip',                 show: 'always' },
      { kind: 'col', colId: 'ticker',                show: 'always' },
      { kind: 'col', colId: 'instrumentDescription', show: 'open' },
      { kind: 'col', colId: 'isin',                  show: 'open' },
    ],
  },
  {
    groupId: 'g_reference',
    headerName: 'Reference',
    openByDefault: false,
    headerStyle: { bold: true },
    children: [
      { kind: 'col', colId: 'assetClass',          show: 'always' },
      { kind: 'col', colId: 'issuerSector',        show: 'always' },
      { kind: 'col', colId: 'currency',            show: 'always' },
      { kind: 'col', colId: 'compositeRating',     show: 'always' },
      { kind: 'col', colId: 'issuerCountryCode',   show: 'open' },
      { kind: 'col', colId: 'seniority',           show: 'open' },
    ],
  },
  {
    groupId: 'g_pricing',
    headerName: 'Pricing',
    openByDefault: true,
    headerStyle: { bold: true },
    children: [
      { kind: 'col', colId: 'bidPrice',       show: 'always' },
      { kind: 'col', colId: 'midPrice',       show: 'always' },
      { kind: 'col', colId: 'askPrice',       show: 'always' },
      { kind: 'col', colId: 'lastPrice',      show: 'open' },
      { kind: 'col', colId: 'priceChange',    show: 'open' },
      { kind: 'col', colId: 'priceChangePct', show: 'always' },
      { kind: 'col', colId: 'bidAskWidthBps', show: 'open' },
    ],
  },
  {
    groupId: 'g_yields',
    headerName: 'Yields & Spreads',
    openByDefault: false,
    headerStyle: { bold: true },
    children: [
      { kind: 'col', colId: 'yieldToMaturity', show: 'always' },
      { kind: 'col', colId: 'yieldToWorst',    show: 'open' },
      { kind: 'col', colId: 'currentYield',    show: 'open' },
      { kind: 'col', colId: 'oas',             show: 'always' },
      { kind: 'col', colId: 'zSpread',         show: 'open' },
      { kind: 'col', colId: 'iSpread',         show: 'open' },
    ],
  },
  {
    groupId: 'g_risk',
    headerName: 'Risk',
    openByDefault: false,
    headerStyle: { bold: true },
    children: [
      { kind: 'col', colId: 'modifiedDuration', show: 'always' },
      { kind: 'col', colId: 'dv01',             show: 'always' },
      { kind: 'col', colId: 'convexity',        show: 'open' },
      { kind: 'col', colId: 'cs01',             show: 'open' },
      { kind: 'col', colId: 'krdSparkline',     show: 'open' },
    ],
  },
  {
    groupId: 'g_quantities',
    headerName: 'Quantities & Cost',
    openByDefault: false,
    headerStyle: { bold: true },
    children: [
      { kind: 'col', colId: 'quantityFace',     show: 'always' },
      { kind: 'col', colId: 'marketValue',      show: 'always' },
      { kind: 'col', colId: 'avgCost',          show: 'open' },
      { kind: 'col', colId: 'accruedInterest',  show: 'open' },
    ],
  },
  {
    groupId: 'g_pnl',
    headerName: 'P&L',
    openByDefault: true,
    headerStyle: { bold: true },
    children: [
      { kind: 'col', colId: 'unrealizedPnL', show: 'always' },
      { kind: 'col', colId: 'dailyPnL',      show: 'always' },
      { kind: 'col', colId: 'mtdPnL',        show: 'open' },
      { kind: 'col', colId: 'ytdPnL',        show: 'open' },
    ],
  },
  {
    groupId: 'g_status',
    headerName: 'Status & Book',
    openByDefault: false,
    headerStyle: { bold: true },
    children: [
      { kind: 'col', colId: 'book',         show: 'always' },
      { kind: 'col', colId: 'trader',       show: 'always' },
      { kind: 'col', colId: 'accountName',  show: 'open' },
      { kind: 'col', colId: 'analyst',      show: 'open' },
      { kind: 'col', colId: 'maturityDate', show: 'always' },
      { kind: 'col', colId: 'lastUpdate',   show: 'open' },
    ],
  },
];
