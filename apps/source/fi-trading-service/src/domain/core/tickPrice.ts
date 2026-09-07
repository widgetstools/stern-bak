/**
 * Price quotation, per market convention.
 *
 * A grid where every price is a decimal is one of the fastest ways to spot
 * synthetic fixed-income data. A trader reads Treasuries in 32nds, high yield
 * in eighths, investment grade in spread, munis in yield, and CDX.HY in price.
 * The number under the string is the same; the string is the tell.
 *
 * The 32nds grammar, for the record:
 *
 *   99-16    99 + 16/32              = 99.5
 *   99-16+   99 + 16.5/32            = 99.515625   ('+' means half a 32nd)
 *   99-162   99 + 16.25/32           = 99.5078125  (trailing digit is eighths
 *   99-166   99 + 16.75/32              of a 32nd, i.e. 256ths of a point)
 */

/** How an instrument's price is quoted. */
export type QuotationBasis =
  | 'Decimal'
  | 'Thirty2nds'
  | 'Eighths'
  | 'Yield'
  | 'Spread'
  | 'DiscountMargin'
  | 'PointsUpfront';

const TICK_32 = /^(-?\d+)-(\d{1,2})([+0-7])?$/;

/** Parse a 32nds string. Returns null rather than a wrong price. */
export function parseTreasuryTick(text: string): number | null {
  const match = TICK_32.exec(text.trim());
  if (match === null) return null;
  const whole = Number(match[1]);
  const thirty2nds = Number(match[2]);
  if (thirty2nds > 31) return null;
  const suffix = match[3];
  const eighths = suffix === undefined ? 0 : suffix === '+' ? 4 : Number(suffix);
  const fraction = (thirty2nds + eighths / 8) / 32;
  return whole < 0 || Object.is(whole, -0) ? whole - fraction : whole + fraction;
}

export type TickPrecision = '32' | '64' | '256';

/**
 * Format a price in 32nds.
 *
 * `'32'` rounds to a whole 32nd, `'64'` allows the `+` half, `'256'` allows
 * the full eighths digit. The default is 256ths, which is how the on-the-run
 * Treasury market actually quotes.
 */
export function formatTreasuryTick(price: number, precision: TickPrecision = '256'): string {
  const sign = price < 0 ? '-' : '';
  const abs = Math.abs(price);
  const steps = precision === '32' ? 32 : precision === '64' ? 64 : 256;
  const totalTicks = Math.round(abs * steps);
  const whole = Math.floor(totalTicks / steps);
  const remainder = totalTicks - whole * steps;
  const eighthsPerStep = 256 / steps;
  const total256 = remainder * eighthsPerStep;
  const thirty2nds = Math.floor(total256 / 8);
  const eighths = total256 - thirty2nds * 8;
  const suffix = eighths === 0 ? '' : eighths === 4 ? '+' : String(eighths);
  return `${sign}${whole}-${String(thirty2nds).padStart(2, '0')}${suffix}`;
}

const EIGHTHS = /^(-?\d+)(?:\s+(\d)\/(\d))?$/;

/** Parse a high-yield style `101 3/8` quote. */
export function parseEighths(text: string): number | null {
  const match = EIGHTHS.exec(text.trim());
  if (match === null) return null;
  const whole = Number(match[1]);
  if (match[2] === undefined || match[3] === undefined) return whole;
  const denominator = Number(match[3]);
  if (denominator === 0) return null;
  const fraction = Number(match[2]) / denominator;
  return whole < 0 ? whole - fraction : whole + fraction;
}

/** Format a price in eighths, the way high yield is quoted. */
export function formatEighths(price: number): string {
  const sign = price < 0 ? '-' : '';
  const abs = Math.abs(price);
  const total = Math.round(abs * 8);
  const whole = Math.floor(total / 8);
  const eighths = total - whole * 8;
  if (eighths === 0) return `${sign}${whole}`;
  // Reduce the fraction, so 4/8 prints as 1/2 the way a runs sheet would.
  let numerator = eighths;
  let denominator = 8;
  while (numerator % 2 === 0 && denominator % 2 === 0) {
    numerator /= 2;
    denominator /= 2;
  }
  return `${sign}${whole} ${numerator}/${denominator}`;
}

/** Snap a price onto a tick grid. Prices off-grid are an instant tell. */
export function roundToTick(price: number, tickSize: number): number {
  if (tickSize <= 0) return price;
  return Math.round(price / tickSize) * tickSize;
}

/** The tick grid each quotation basis trades on, in points. */
export const TICK_SIZE: Record<string, number> = {
  treasuryBenchmark: 1 / 256,
  treasuryOffTheRun: 1 / 128,
  tba: 1 / 32,
  agency: 1 / 64,
  corporate: 1 / 100,
  highYield: 1 / 8,
  municipal: 1 / 100,
  structured: 1 / 100,
};

/** Format a price the way its instrument family is quoted. */
export function formatPrice(price: number, basis: QuotationBasis): string {
  switch (basis) {
    case 'Thirty2nds':
      return formatTreasuryTick(price);
    case 'Eighths':
      return formatEighths(price);
    case 'PointsUpfront':
      return price.toFixed(3);
    case 'Yield':
    case 'Spread':
    case 'DiscountMargin':
    case 'Decimal':
      return price.toFixed(3);
  }
}
