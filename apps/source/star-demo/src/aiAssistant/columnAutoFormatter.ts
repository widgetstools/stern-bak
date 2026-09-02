/**
 * Automatically formats columns based on field names and data types.
 *
 * Applies intelligent formatting for:
 * - Numeric columns: right-aligned with appropriate decimal places
 * - Fixed income fields: DV01, YTM, spread, etc. per trading conventions
 * - Signed values: P&L, changes, with red/green coloring
 * - Trend indicators: arrows for changes, yields, etc.
 */

import type { ColumnDefinition } from '@wellsfargo-starui/types';

/** Patterns for columns that should have trend arrows (up/down). */
const TREND_PATTERNS = [
  /^(change|delta|move|shift)/i,
  /yield.*change/i,
  /spread.*change/i,
  /pnl$/i,
  /pl$/i,
  /profit/i,
  /loss/i,
];

/** Patterns for P&L and signed value columns. */
const SIGNED_VALUE_PATTERNS = [/^(pnl|pl|p&l|profit|loss|p_l)/i, /realized|unrealized/i];

/** Fixed income trading field conventions. */
const FIXED_INCOME_FIELDS: Record<string, { decimals?: number; renderer?: string; signed?: boolean }> = {
  // Rates and yields
  yield: { decimals: 4 },
  ytm: { decimals: 4 },
  ytw: { decimals: 4 },
  coupon: { decimals: 4 },
  rate: { decimals: 4 },
  'accrued-yield': { decimals: 4 },

  // Pricing
  price: { decimals: 4 },
  cleanprice: { decimals: 4 },
  dirtyprice: { decimals: 4 },
  bid: { decimals: 4 },
  ask: { decimals: 4 },
  mid: { decimals: 4 },

  // Risk metrics
  dv01: { decimals: 2 },
  duration: { decimals: 4 },
  convexity: { decimals: 4 },
  key_rate_duration: { decimals: 4 },
  krd: { decimals: 4 },
  pv01: { decimals: 2 },
  effective_duration: { decimals: 4 },

  // Spreads
  spread: { decimals: 2 },
  oas: { decimals: 2 },
  'option-adjusted-spread': { decimals: 2 },
  i_spread: { decimals: 2 },
  'interpolated-spread': { decimals: 2 },
  z_spread: { decimals: 2 },
  'zero-volatility-spread': { decimals: 2 },
  g_spread: { decimals: 2 },
  'government-spread': { decimals: 2 },

  // Quantities
  notional: { decimals: 0 },
  principal: { decimals: 0 },
  par: { decimals: 0 },
  accrued: { decimals: 2 },
  quantity: { decimals: 0 },
  qty: { decimals: 0 },

  // P&L and changes
  pnl: { decimals: 2, renderer: 'pnl-value', signed: true },
  'market-value': { decimals: 2 },
  'book-value': { decimals: 2 },
  'fair-value': { decimals: 2 },

  // Changes and moves
  'yield-change': { decimals: 4, renderer: 'trend-arrow', signed: true },
  'price-change': { decimals: 4, renderer: 'trend-arrow', signed: true },
  'spread-change': { decimals: 2, renderer: 'trend-arrow', signed: true },
};

/**
 * Detects if a field name matches fixed income conventions.
 * Returns formatting config if matched, undefined otherwise.
 */
function detectFixedIncomeField(fieldName: string): (typeof FIXED_INCOME_FIELDS)[string] | undefined {
  const lower = fieldName.toLowerCase().replace(/[\s_-]/g, '');

  // Exact match
  for (const [key, config] of Object.entries(FIXED_INCOME_FIELDS)) {
    if (lower === key.replace(/[\s_-]/g, '')) {
      return config;
    }
  }

  // Substring match for compound names (e.g., "bondYield" -> "yield")
  for (const [key, config] of Object.entries(FIXED_INCOME_FIELDS)) {
    const keyNorm = key.replace(/[\s_-]/g, '');
    if (lower.includes(keyNorm)) {
      return config;
    }
  }

  return undefined;
}

/**
 * Detects if a field should have trend arrows.
 */
function shouldHaveTrendArrow(fieldName: string): boolean {
  return TREND_PATTERNS.some((pattern) => pattern.test(fieldName));
}

/**
 * Detects if a field is a signed value (P&L, change, etc.).
 */
function isSignedValue(fieldName: string): boolean {
  return SIGNED_VALUE_PATTERNS.some((pattern) => pattern.test(fieldName));
}

/**
 * Apply intelligent formatting to a column based on its field name and data type.
 */
export function applyAutoFormatting(column: ColumnDefinition): ColumnDefinition {
  const { field, cellDataType } = column;

  // Skip if already has explicit formatting
  if (column.cellRenderer || column.valueFormatter) {
    return column;
  }

  const formatted = { ...column };

  // Try to detect fixed income field first
  const fiConfig = detectFixedIncomeField(field);
  if (fiConfig) {
    // Set cell data type to number for right-alignment + numeric rendering
    if (!formatted.cellDataType) {
      formatted.cellDataType = 'number';
    }

    // Apply decimal places via valueFormatter if specified
    if (fiConfig.decimals !== undefined) {
      formatted.valueFormatter = `.${fiConfig.decimals}`;
    }

    // Apply cell renderer (e.g., pnl-value, trend-arrow)
    if (fiConfig.renderer) {
      formatted.cellRenderer = fiConfig.renderer;
    }

    // Mark as signed for sign-based coloring
    if (fiConfig.signed && !formatted.cellRenderer) {
      formatted.cellRenderer = 'colored-value';
    }

    return formatted;
  }

  // Detect numeric columns by type
  if (cellDataType === 'number') {
    // Ensure cellDataType is set for right-alignment (AG-Grid aligns numbers right by default)
    if (!formatted.cellDataType) {
      formatted.cellDataType = 'number';
    }

    // Default: 2 decimal places for currency, 0 for counts
    if (!formatted.valueFormatter) {
      formatted.valueFormatter = /qty|count|quantity|position|balance/i.test(field) ? '.0' : '.2';
    }

    // Check if it's a signed value (P&L, change)
    if (isSignedValue(field)) {
      if (!formatted.cellRenderer) {
        formatted.cellRenderer = 'colored-value';
      }
    }
    // Check if it should have trend arrows
    else if (shouldHaveTrendArrow(field)) {
      formatted.cellRenderer = 'trend-arrow';
    }
  }

  // Apply right-align type for any numeric column detected by naming
  if (!formatted.cellDataType || formatted.cellDataType === 'number') {
    // Check if field name suggests numeric data even if cellDataType isn't set
    const isNumericByName =
      /value|price|yield|rate|amount|qty|count|notional|principal|par|accrued|dv01|pv01|duration|spread|oas|pnl|profit|loss|total|sum|avg|average/i.test(
        field,
      );

    if (isNumericByName && !formatted.cellDataType) {
      formatted.cellDataType = 'number';
      if (!formatted.valueFormatter) {
        formatted.valueFormatter = /qty|count|quantity|position|balance|notional|principal|par/i.test(field) ? '.0' : '.2';
      }
    }
  }

  return formatted;
}

/**
 * Apply auto-formatting to a list of columns.
 */
export function applyAutoFormattingToColumns(columns: ColumnDefinition[]): ColumnDefinition[] {
  return columns.map(applyAutoFormatting);
}
