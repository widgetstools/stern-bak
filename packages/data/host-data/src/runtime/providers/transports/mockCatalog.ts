/**
 * What the mock provider offers, described rather than discovered.
 *
 * `probeMock` can already tell you a dataset's fields by generating rows and
 * inferring — but inference gives you all 256 position fields flat, with no
 * sense of which twelve a trader actually wants on screen. That is fine for a
 * schema dump and useless as a default blotter, and it gave callers no way to
 * offer "these are your options" without dumping the lot.
 *
 * So this adds the two things inference cannot supply:
 *
 *  - **Grouping and intent.** Every essential field is tagged with the group it
 *    belongs to and why it matters, so a picker can show "Pricing (7)" instead
 *    of an alphabetical wall.
 *  - **A curated default.** `curatedColumns(dataType)` is the set a blotter
 *    should open with — the columns a desk would actually put on screen.
 *
 * Field NAMES here are checked against the real generator by
 * `mockCatalog.test.ts`, so a rename in `mockPosition.ts` breaks the test
 * rather than silently dropping a column from every new blotter.
 */

import type { ColumnDefinition } from '@wellsfargo-starui/types';

export type MockDataType = 'positions' | 'trades' | 'orders' | 'custom';

export interface MockFieldSpec {
  field: string;
  headerName: string;
  cellDataType: NonNullable<ColumnDefinition['cellDataType']>;
  /** Section a picker should file this under. */
  group: string;
  /** In the default blotter layout. */
  curated?: boolean;
  width?: number;
}

export interface MockDatasetSpec {
  dataType: MockDataType;
  label: string;
  description: string;
  /** Row identity — the hub drops rows that don't resolve this. */
  keyColumn: string;
  /** Rows the generator produces by default. */
  defaultRowCount: number;
  fields: MockFieldSpec[];
}

const n = 'number' as const;
const t = 'text' as const;
const d = 'dateString' as const;
const b = 'boolean' as const;

/**
 * Positions — 48 curated columns across the groups a fixed-income desk reads:
 * identity, terms, live pricing, yields/spreads, risk, credit, position and
 * P&L, plus book-keeping.
 */
const POSITION_FIELDS: MockFieldSpec[] = [
  // Row identity. `cusip` is unique too — the universe grows a distinct
  // security per row up to MAX_UNIVERSE_SIZE (20 000) — but `positionKey`
  // (`${cusip}-${accountIdx}`) stays unique even past that ceiling, where the
  // generator cycles securities across accounts, and it is what existing
  // configs key on. The hub keys its cache by keyColumn, so a key that
  // repeats silently collapses the feed.
  { field: 'positionKey', headerName: 'Position Key', cellDataType: t, group: 'Identity' },
  { field: 'cusip', headerName: 'CUSIP', cellDataType: t, group: 'Identity', curated: true, width: 110 },
  { field: 'isin', headerName: 'ISIN', cellDataType: t, group: 'Identity', curated: true, width: 130 },
  { field: 'ticker', headerName: 'Ticker', cellDataType: t, group: 'Identity', curated: true, width: 90 },
  { field: 'sedol', headerName: 'SEDOL', cellDataType: t, group: 'Identity' },
  { field: 'figi', headerName: 'FIGI', cellDataType: t, group: 'Identity' },

  { field: 'issuerName', headerName: 'Issuer', cellDataType: t, group: 'Issuer', curated: true, width: 180 },
  { field: 'issuerSector', headerName: 'Sector', cellDataType: t, group: 'Issuer', curated: true, width: 130 },
  { field: 'issuerCountry', headerName: 'Country', cellDataType: t, group: 'Issuer', curated: true, width: 90 },
  { field: 'issuerIndustryGroup', headerName: 'Industry', cellDataType: t, group: 'Issuer' },
  { field: 'issuerType', headerName: 'Issuer Type', cellDataType: t, group: 'Issuer' },

  { field: 'assetClass', headerName: 'Asset Class', cellDataType: t, group: 'Instrument', curated: true, width: 120 },
  { field: 'securityType', headerName: 'Security Type', cellDataType: t, group: 'Instrument', curated: true, width: 130 },
  { field: 'currency', headerName: 'Ccy', cellDataType: t, group: 'Instrument', curated: true, width: 70 },
  { field: 'maturityDate', headerName: 'Maturity', cellDataType: d, group: 'Instrument', curated: true, width: 110 },
  { field: 'couponRate', headerName: 'Coupon', cellDataType: n, group: 'Instrument', curated: true, width: 90 },
  { field: 'couponType', headerName: 'Coupon Type', cellDataType: t, group: 'Instrument', curated: true, width: 110 },
  { field: 'couponFrequency', headerName: 'Freq', cellDataType: n, group: 'Instrument' },
  { field: 'dayCount', headerName: 'Day Count', cellDataType: t, group: 'Instrument' },
  { field: 'issueDate', headerName: 'Issue Date', cellDataType: d, group: 'Instrument' },

  { field: 'bidPrice', headerName: 'Bid', cellDataType: n, group: 'Pricing', curated: true, width: 100 },
  { field: 'askPrice', headerName: 'Ask', cellDataType: n, group: 'Pricing', curated: true, width: 100 },
  { field: 'midPrice', headerName: 'Mid', cellDataType: n, group: 'Pricing', curated: true, width: 100 },
  { field: 'lastPrice', headerName: 'Last', cellDataType: n, group: 'Pricing', curated: true, width: 100 },
  { field: 'priceChange', headerName: 'Chg', cellDataType: n, group: 'Pricing', curated: true, width: 90 },
  { field: 'priceChangePct', headerName: 'Chg %', cellDataType: n, group: 'Pricing', curated: true, width: 90 },
  { field: 'evalPrice', headerName: 'Eval', cellDataType: n, group: 'Pricing' },

  { field: 'yieldToMaturity', headerName: 'YTM', cellDataType: n, group: 'Yield & Spread', curated: true, width: 90 },
  { field: 'yieldToWorst', headerName: 'YTW', cellDataType: n, group: 'Yield & Spread', curated: true, width: 90 },
  { field: 'oas', headerName: 'OAS', cellDataType: n, group: 'Yield & Spread', curated: true, width: 80 },
  { field: 'zSpread', headerName: 'Z-Spread', cellDataType: n, group: 'Yield & Spread', curated: true, width: 100 },
  { field: 'gSpread', headerName: 'G-Spread', cellDataType: n, group: 'Yield & Spread' },
  { field: 'assetSwapSpread', headerName: 'ASW', cellDataType: n, group: 'Yield & Spread' },

  { field: 'effectiveDuration', headerName: 'Eff Dur', cellDataType: n, group: 'Risk', curated: true, width: 100 },
  { field: 'modifiedDuration', headerName: 'Mod Dur', cellDataType: n, group: 'Risk', curated: true, width: 100 },
  { field: 'convexity', headerName: 'Convexity', cellDataType: n, group: 'Risk', curated: true, width: 100 },
  { field: 'dv01', headerName: 'DV01', cellDataType: n, group: 'Risk', curated: true, width: 100 },
  { field: 'spreadDuration', headerName: 'Spread Dur', cellDataType: n, group: 'Risk' },

  { field: 'compositeRating', headerName: 'Rating', cellDataType: t, group: 'Credit', curated: true, width: 90 },
  { field: 'moodysRating', headerName: "Moody's", cellDataType: t, group: 'Credit', curated: true, width: 90 },
  { field: 'spRating', headerName: 'S&P', cellDataType: t, group: 'Credit', curated: true, width: 90 },
  { field: 'fitchRating', headerName: 'Fitch', cellDataType: t, group: 'Credit' },
  { field: 'ratingsBucket', headerName: 'Rating Bucket', cellDataType: t, group: 'Credit', curated: true, width: 120 },
  { field: 'ratingOutlook', headerName: 'Outlook', cellDataType: t, group: 'Credit' },

  { field: 'quantityFace', headerName: 'Face', cellDataType: n, group: 'Position', curated: true, width: 130 },
  { field: 'marketValue', headerName: 'Market Value', cellDataType: n, group: 'Position', curated: true, width: 140 },
  { field: 'avgCost', headerName: 'Avg Cost', cellDataType: n, group: 'Position', curated: true, width: 110 },
  { field: 'accruedInterest', headerName: 'Accrued', cellDataType: n, group: 'Position', curated: true, width: 110 },
  { field: 'factor', headerName: 'Factor', cellDataType: n, group: 'Position' },

  { field: 'dailyPnL', headerName: 'Daily P&L', cellDataType: n, group: 'P&L', curated: true, width: 120 },
  { field: 'unrealizedPnL', headerName: 'Unrealized P&L', cellDataType: n, group: 'P&L', curated: true, width: 140 },
  { field: 'realizedPnL', headerName: 'Realized P&L', cellDataType: n, group: 'P&L' },

  { field: 'portfolio', headerName: 'Portfolio', cellDataType: t, group: 'Book', curated: true, width: 130 },
  { field: 'desk', headerName: 'Desk', cellDataType: t, group: 'Book', curated: true, width: 110 },
  { field: 'trader', headerName: 'Trader', cellDataType: t, group: 'Book', curated: true, width: 120 },
  { field: 'strategy', headerName: 'Strategy', cellDataType: t, group: 'Book' },
  { field: 'accountName', headerName: 'Account', cellDataType: t, group: 'Book', curated: true, width: 140 },
  { field: 'accountId', headerName: 'Account ID', cellDataType: t, group: 'Book' },

  { field: 'lastUpdate', headerName: 'Updated', cellDataType: n, group: 'Meta', curated: true, width: 110 },
];

/** Trades — 42 curated columns following a trade from execution to settlement. */
const TRADE_FIELDS: MockFieldSpec[] = [
  { field: 'tradeId', headerName: 'Trade ID', cellDataType: t, group: 'Identity', curated: true, width: 140 },
  { field: 'parentOrderId', headerName: 'Order ID', cellDataType: t, group: 'Identity', curated: true, width: 140 },
  { field: 'blockId', headerName: 'Block ID', cellDataType: t, group: 'Identity' },
  { field: 'externalId', headerName: 'External ID', cellDataType: t, group: 'Identity' },

  { field: 'cusip', headerName: 'CUSIP', cellDataType: t, group: 'Security', curated: true, width: 110 },
  { field: 'isin', headerName: 'ISIN', cellDataType: t, group: 'Security', curated: true, width: 130 },
  { field: 'ticker', headerName: 'Ticker', cellDataType: t, group: 'Security', curated: true, width: 90 },
  { field: 'issuerName', headerName: 'Issuer', cellDataType: t, group: 'Security', curated: true, width: 180 },
  { field: 'assetClass', headerName: 'Asset Class', cellDataType: t, group: 'Security', curated: true, width: 120 },
  { field: 'maturityDate', headerName: 'Maturity', cellDataType: d, group: 'Security', curated: true, width: 110 },

  { field: 'side', headerName: 'Side', cellDataType: t, group: 'Economics', curated: true, width: 80 },
  { field: 'tradeQty', headerName: 'Quantity', cellDataType: n, group: 'Economics', curated: true, width: 130 },
  { field: 'executedQty', headerName: 'Executed', cellDataType: n, group: 'Economics', curated: true, width: 120 },
  { field: 'remainingQty', headerName: 'Remaining', cellDataType: n, group: 'Economics' },
  { field: 'avgPrice', headerName: 'Avg Price', cellDataType: n, group: 'Economics', curated: true, width: 100 },
  { field: 'cleanPrice', headerName: 'Clean Px', cellDataType: n, group: 'Economics', curated: true, width: 100 },
  { field: 'dirtyPrice', headerName: 'Dirty Px', cellDataType: n, group: 'Economics' },
  { field: 'principal', headerName: 'Principal', cellDataType: n, group: 'Economics', curated: true, width: 140 },
  { field: 'accruedInterest', headerName: 'Accrued', cellDataType: n, group: 'Economics', curated: true, width: 110 },
  { field: 'proceeds', headerName: 'Proceeds', cellDataType: n, group: 'Economics', curated: true, width: 140 },
  { field: 'yield', headerName: 'Yield', cellDataType: n, group: 'Economics', curated: true, width: 90 },
  { field: 'spreadBps', headerName: 'Spread (bps)', cellDataType: n, group: 'Economics', curated: true, width: 90 },

  { field: 'tradeStatus', headerName: 'Status', cellDataType: t, group: 'Lifecycle', curated: true, width: 110 },
  { field: 'tradeDate', headerName: 'Trade Date', cellDataType: d, group: 'Lifecycle', curated: true, width: 110 },
  { field: 'settlementDate', headerName: 'Settle Date', cellDataType: d, group: 'Lifecycle', curated: true, width: 110 },
  { field: 'executedTime', headerName: 'Exec Time', cellDataType: t, group: 'Lifecycle', curated: true, width: 130 },
  { field: 'settleStatus', headerName: 'Settlement', cellDataType: t, group: 'Lifecycle', curated: true, width: 120 },
  { field: 'amendStatus', headerName: 'Amend Status', cellDataType: b, group: 'Lifecycle' },
  { field: 'cancelStatus', headerName: 'Cancel Status', cellDataType: b, group: 'Lifecycle' },

  { field: 'trader', headerName: 'Trader', cellDataType: t, group: 'Parties', curated: true, width: 120 },
  { field: 'desk', headerName: 'Desk', cellDataType: t, group: 'Parties', curated: true, width: 110 },
  { field: 'counterparty', headerName: 'Counterparty', cellDataType: t, group: 'Parties', curated: true, width: 160 },
  { field: 'salesPerson', headerName: 'Salesperson', cellDataType: t, group: 'Parties', curated: true, width: 130 },
  { field: 'accountName', headerName: 'Account', cellDataType: t, group: 'Parties', curated: true, width: 130 },
  { field: 'portfolio', headerName: 'Portfolio', cellDataType: t, group: 'Parties' },

  { field: 'venue', headerName: 'Venue', cellDataType: t, group: 'Execution', curated: true, width: 110 },
  { field: 'tradeCapacity', headerName: 'Capacity', cellDataType: t, group: 'Execution', curated: true, width: 120 },
  { field: 'protocol', headerName: 'Protocol', cellDataType: t, group: 'Execution', curated: true, width: 110 },
  { field: 'currency', headerName: 'Ccy', cellDataType: t, group: 'Execution', curated: true, width: 70 },

  { field: 'commissionAmount', headerName: 'Commission', cellDataType: n, group: 'Fees', curated: true, width: 120 },
  { field: 'fees', headerName: 'Fees', cellDataType: n, group: 'Fees', curated: true, width: 100 },
  { field: 'salesCredit', headerName: 'Sales Credit', cellDataType: n, group: 'Fees', curated: true, width: 120 },

  { field: 'tradeDv01', headerName: 'Trade DV01', cellDataType: n, group: 'TCA', curated: true, width: 110 },
  { field: 'slippage_bps', headerName: 'Slippage (bps)', cellDataType: n, group: 'TCA', curated: true, width: 130 },
  { field: 'arrivalPrice', headerName: 'Arrival Px', cellDataType: n, group: 'TCA', curated: true, width: 110 },
  { field: 'benchmarkPrice', headerName: 'Benchmark Px', cellDataType: n, group: 'TCA' },

  { field: 'complianceStatus', headerName: 'Compliance', cellDataType: t, group: 'Compliance', curated: true, width: 120 },
  { field: 'traceEligible', headerName: 'TRACE Eligible', cellDataType: b, group: 'Compliance' },

  { field: 'lastUpdate', headerName: 'Updated', cellDataType: n, group: 'Meta', curated: true, width: 110 },
];

const ORDER_FIELDS: MockFieldSpec[] = [
  { field: 'id', headerName: 'ID', cellDataType: t, group: 'Identity', curated: true, width: 110 },
  { field: 'instrument', headerName: 'Instrument', cellDataType: t, group: 'Identity', curated: true, width: 130 },
  { field: 'side', headerName: 'Side', cellDataType: t, group: 'Economics', curated: true, width: 80 },
  { field: 'status', headerName: 'Status', cellDataType: t, group: 'Lifecycle', curated: true, width: 110 },
  { field: 'quantity', headerName: 'Quantity', cellDataType: n, group: 'Economics', curated: true, width: 120 },
  { field: 'price', headerName: 'Price', cellDataType: n, group: 'Economics', curated: true, width: 110 },
  { field: 'timestamp', headerName: 'Timestamp', cellDataType: n, group: 'Meta', curated: true, width: 130 },
];

export const MOCK_DATASETS: readonly MockDatasetSpec[] = [
  {
    dataType: 'positions',
    label: 'Fixed-income positions',
    description:
      'A fixed-income portfolio across Rates, Agency, MBS, CMBS, RMBS, corporate IG and HY, munis and convertibles: ' +
      '50 archetype securities by default, grown to `rowCount` distinct securities (unique CUSIPs) on demand — ' +
      '2 000 rows is 2 000 bonds, up to 20 000. Rich rows (256 fields) with nested ratings, key-rate durations and ' +
      'exposure breakdowns. Prices, yields, spreads, accrual and P&L tick on a random 1–4% of the book each interval.',
    keyColumn: 'positionKey',
    defaultRowCount: 50,
    fields: POSITION_FIELDS,
  },
  {
    dataType: 'trades',
    label: 'Trade blotter',
    description:
      'A growing trade book (207 fields) that walks a lifecycle: New → Pending → Executed → Allocated → Confirmed ' +
      '→ Settled, with amendments and fails. Seeds `rowCount` unique trades (default 200; 5 000 supported), spread ' +
      'over roughly one security per four trades — securities repeat, as a real blotter does — and joins to ' +
      'positions on `cusip`. Each tick either mints a trade or advances one.',
    keyColumn: 'tradeId',
    defaultRowCount: 200,
    fields: TRADE_FIELDS,
  },
  {
    dataType: 'orders',
    label: 'Simple orders (legacy)',
    description:
      'A sparse 7-field shape kept for back-compat with older configs. Prefer `trades` for anything new.',
    keyColumn: 'id',
    defaultRowCount: 50,
    fields: ORDER_FIELDS,
  },
  {
    dataType: 'custom',
    label: 'Custom rows (legacy)',
    description: 'Same sparse shape as `orders`, or your own rows via `customData`.',
    keyColumn: 'id',
    defaultRowCount: 50,
    fields: ORDER_FIELDS,
  },
];

export function mockDataset(dataType: MockDataType): MockDatasetSpec {
  return MOCK_DATASETS.find((d) => d.dataType === dataType) ?? MOCK_DATASETS[0];
}

/** Fields grouped in catalogue order — what a picker renders as sections. */
export function mockFieldGroups(dataType: MockDataType): Array<{ group: string; fields: MockFieldSpec[] }> {
  const out: Array<{ group: string; fields: MockFieldSpec[] }> = [];
  for (const field of mockDataset(dataType).fields) {
    const existing = out.find((g) => g.group === field.group);
    if (existing) existing.fields.push(field);
    else out.push({ group: field.group, fields: [field] });
  }
  return out;
}

function toColumn(spec: MockFieldSpec): ColumnDefinition {
  return {
    field: spec.field,
    headerName: spec.headerName,
    cellDataType: spec.cellDataType,
    ...(spec.width ? { width: spec.width } : null),
    sortable: true,
    resizable: true,
    filter: true,
  };
}

/**
 * The default blotter layout for a dataset.
 *
 * Inference over generated rows returns every field — 256 for positions — which
 * is a schema dump, not a blotter. This is the subset a desk would actually put
 * on screen, in reading order.
 */
export function curatedColumns(dataType: MockDataType): ColumnDefinition[] {
  return mockDataset(dataType).fields.filter((f) => f.curated).map(toColumn);
}

/** Every catalogued field as a column, for "show me everything". */
export function allCatalogColumns(dataType: MockDataType): ColumnDefinition[] {
  return mockDataset(dataType).fields.map(toColumn);
}

/** Columns for an explicit field list, in the order given. Unknown names are
 *  returned so the caller can report them rather than silently dropping. */
export function columnsForFields(
  dataType: MockDataType,
  fields: readonly string[],
): { columns: ColumnDefinition[]; unknown: string[] } {
  const byName = new Map(mockDataset(dataType).fields.map((f) => [f.field, f]));
  const columns: ColumnDefinition[] = [];
  const unknown: string[] = [];
  for (const name of fields) {
    const spec = byName.get(name);
    if (spec) columns.push(toColumn(spec));
    else unknown.push(name);
  }
  return { columns, unknown };
}
