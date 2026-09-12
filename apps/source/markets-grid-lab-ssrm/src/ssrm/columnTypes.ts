/**
 * Engine boot schema for the lab dataset.
 *
 * The SSRM engine types a column from `cellDataType` (`number` → f64,
 * `boolean` → bool, else string; `dateString` also gets a numeric epoch
 * shadow for range filters and sorts). The lab's ColDefs don't declare
 * cellDataType — CSRM never needed it — so the mapping lives here, one
 * entry per field the lab's columns (and their valueGetters) read. A field
 * missing from this list is not shipped in blocks, which surfaces as a
 * blank column — `columnTypes.test.ts` pins the list against the lab's
 * actual column defs so drift fails a test instead.
 */
import type { ColumnDefinition } from '@wellsfargo-starui/types';

export const LAB_NUMBER_FIELDS = [
  'bidPrice', 'midPrice', 'askPrice', 'lastPrice',
  'priceChange', 'priceChangePct', 'bidSize', 'askSize',
  'yieldToMaturity', 'yieldToWorst', 'currentYield',
  'oas', 'zSpread', 'iSpread',
  'modifiedDuration', 'dv01', 'convexity', 'cs01',
  'quantityFace', 'marketValue', 'avgCost', 'accruedInterest',
  'unrealizedPnL', 'dailyPnL', 'mtdPnL', 'ytdPnL',
  'lastUpdate',
  // Not columns themselves — the KRD sparkline valueGetter reads these off
  // block rows, so they must ride the engine schema.
  'krd1Y', 'krd2Y', 'krd5Y', 'krd10Y', 'krd30Y',
] as const;

export const LAB_TEXT_FIELDS = [
  'id', 'cusip', 'ticker', 'isin', 'instrumentDescription',
  'assetClass', 'issuerSector', 'issuerSubSector', 'issuerCountryCode',
  'currency', 'compositeRating', 'seniority',
  'book', 'trader', 'accountName', 'analyst',
] as const;

export const LAB_DATE_FIELDS = ['maturityDate'] as const;

/** The `columnDefinitions` handed to the mock-ssrm provider config. */
export function labSsrmColumnDefinitions(): ColumnDefinition[] {
  // headerName is required by ColumnDefinition but only the engine schema
  // reads these — display names come from the lab's own ColDefs.
  return [
    ...LAB_TEXT_FIELDS.map((field) => ({ field, headerName: field, cellDataType: 'text' as const })),
    ...LAB_NUMBER_FIELDS.map((field) => ({ field, headerName: field, cellDataType: 'number' as const })),
    ...LAB_DATE_FIELDS.map((field) => ({ field, headerName: field, cellDataType: 'dateString' as const })),
  ];
}
