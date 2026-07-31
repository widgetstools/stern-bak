/**
 * Mock fixed-income bond inventory — realistic shape for a corporate-credit
 * trading blotter. Deterministic seed so reloads produce the same dataset
 * (profile snapshots key off row ids; we need stable ids across sessions).
 */

export type Side = 'BID' | 'OFFER' | 'TWO-WAY';
export type Sector =
  | 'Treasury'
  | 'Financials'
  | 'Industrials'
  | 'Energy'
  | 'Utilities'
  | 'Tech'
  | 'Healthcare'
  | 'Consumer'
  | 'Sovereign'
  | 'Munis';
export type Rating = 'AAA' | 'AA+' | 'AA' | 'AA-' | 'A+' | 'A' | 'A-' | 'BBB+' | 'BBB' | 'BBB-' | 'BB+' | 'BB' | 'B+' | 'B';
export type Currency = 'USD' | 'EUR' | 'GBP';
export type Liquidity = 'A1' | 'A2' | 'B1' | 'B2' | 'C';

export interface Bond {
  id: string;
  cusip: string;
  isin: string;
  ticker: string;
  description: string;
  issuer: string;
  sector: Sector;
  currency: Currency;
  coupon: number;
  maturity: string;
  rating: Rating;
  side: Side;
  bidPrice: number;
  offerPrice: number;
  midPrice: number;
  bidYield: number;
  offerYield: number;
  ytm: number;
  oas: number;
  zSpread: number;
  duration: number;
  convexity: number;
  dv01: number;
  size: number;
  notional: number;
  pnlDay: number;
  pnlMtd: number;
  pnlYtd: number;
  liquidity: Liquidity;
  trader: string;
  book: string;
  desk: string;
  lastTradedAt: string;
  changeBps: number;
}

const SECTORS: Sector[] = [
  'Treasury',
  'Financials',
  'Industrials',
  'Energy',
  'Utilities',
  'Tech',
  'Healthcare',
  'Consumer',
  'Sovereign',
  'Munis',
];

const RATINGS: Rating[] = ['AAA', 'AA+', 'AA', 'AA-', 'A+', 'A', 'A-', 'BBB+', 'BBB', 'BBB-', 'BB+', 'BB', 'B+', 'B'];

const ISSUERS: Array<[string, string, Sector]> = [
  ['UST', 'US Treasury', 'Treasury'],
  ['GILT', 'UK Gilt', 'Sovereign'],
  ['BUND', 'German Bund', 'Sovereign'],
  ['JPM', 'JPMorgan Chase & Co', 'Financials'],
  ['BAC', 'Bank of America Corp', 'Financials'],
  ['C', 'Citigroup Inc', 'Financials'],
  ['GS', 'Goldman Sachs Group', 'Financials'],
  ['MS', 'Morgan Stanley', 'Financials'],
  ['WFC', 'Wells Fargo & Co', 'Financials'],
  ['HSBC', 'HSBC Holdings plc', 'Financials'],
  ['BARC', 'Barclays plc', 'Financials'],
  ['UBS', 'UBS Group AG', 'Financials'],
  ['DB', 'Deutsche Bank AG', 'Financials'],
  ['BNP', 'BNP Paribas SA', 'Financials'],
  ['AAPL', 'Apple Inc', 'Tech'],
  ['MSFT', 'Microsoft Corp', 'Tech'],
  ['GOOG', 'Alphabet Inc', 'Tech'],
  ['ORCL', 'Oracle Corp', 'Tech'],
  ['IBM', 'International Business Machines', 'Tech'],
  ['CSCO', 'Cisco Systems Inc', 'Tech'],
  ['XOM', 'Exxon Mobil Corp', 'Energy'],
  ['CVX', 'Chevron Corp', 'Energy'],
  ['BP', 'BP plc', 'Energy'],
  ['SHEL', 'Shell plc', 'Energy'],
  ['TTE', 'TotalEnergies SE', 'Energy'],
  ['JNJ', 'Johnson & Johnson', 'Healthcare'],
  ['PFE', 'Pfizer Inc', 'Healthcare'],
  ['UNH', 'UnitedHealth Group', 'Healthcare'],
  ['MRK', 'Merck & Co Inc', 'Healthcare'],
  ['ABBV', 'AbbVie Inc', 'Healthcare'],
  ['KO', 'Coca-Cola Co', 'Consumer'],
  ['PEP', 'PepsiCo Inc', 'Consumer'],
  ['PG', 'Procter & Gamble', 'Consumer'],
  ['WMT', 'Walmart Inc', 'Consumer'],
  ['MCD', 'McDonald’s Corp', 'Consumer'],
  ['DIS', 'Walt Disney Co', 'Consumer'],
  ['GE', 'General Electric Co', 'Industrials'],
  ['BA', 'Boeing Co', 'Industrials'],
  ['CAT', 'Caterpillar Inc', 'Industrials'],
  ['LMT', 'Lockheed Martin', 'Industrials'],
  ['UNP', 'Union Pacific Corp', 'Industrials'],
  ['DUK', 'Duke Energy Corp', 'Utilities'],
  ['NEE', 'NextEra Energy Inc', 'Utilities'],
  ['SO', 'Southern Co', 'Utilities'],
  ['NYC', 'New York Municipal', 'Munis'],
  ['CALG', 'California GO', 'Munis'],
];

const TRADERS = ['M. Chen', 'A. Patel', 'S. Johnson', 'R. Garcia', 'J. Schmidt', 'N. Tanaka', 'L. Murphy', 'E. Okafor'];
const BOOKS = ['IG-CORE', 'IG-LIQ', 'HY-HI-BETA', 'TSY-OPS', 'EMG-MKTS', 'STRUCT-CR'];
const DESKS = ['Credit', 'Rates', 'Sovereign', 'Emerging'];

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(arr: readonly T[], r: () => number): T {
  return arr[Math.floor(r() * arr.length)];
}

function makeCusip(r: () => number): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
  let out = '';
  for (let i = 0; i < 9; i++) out += chars[Math.floor(r() * chars.length)];
  return out;
}

function makeIsin(country: string, cusip: string): string {
  return `${country}${cusip}`;
}

function maturityYears(r: () => number): number {
  // Weighted distribution skewed toward intermediate tenors.
  const buckets = [2, 3, 5, 7, 10, 10, 15, 20, 30, 30];
  return buckets[Math.floor(r() * buckets.length)];
}

function isoMaturity(years: number, r: () => number): string {
  const now = new Date('2030-06-15T00:00:00Z');
  const monthOffset = Math.floor(r() * 12);
  now.setUTCFullYear(now.getUTCFullYear() + years);
  now.setUTCMonth(monthOffset);
  return now.toISOString().slice(0, 10);
}

function priceFromYield(coupon: number, ytm: number, years: number): number {
  // Quick, plausible bond pricing (annual compounding, par 100). Not used
  // for analytics — only to make the table look internally consistent.
  const c = coupon;
  const n = years;
  const y = Math.max(ytm / 100, 0.0001);
  const pv = (1 - Math.pow(1 + y, -n)) / y;
  const price = c * pv + 100 / Math.pow(1 + y, n);
  return +price.toFixed(3);
}

export function buildBondInventory(count = 180, seed = 42): Bond[] {
  const r = mulberry32(seed);
  const now = Date.now();
  const rows: Bond[] = [];

  for (let i = 0; i < count; i++) {
    const [ticker, issuer, sector] = pick(ISSUERS, r);
    const currency: Currency = sector === 'Sovereign' && ticker !== 'UST'
      ? (ticker === 'GILT' ? 'GBP' : 'EUR')
      : 'USD';
    const cusip = makeCusip(r);
    const country = currency === 'USD' ? 'US' : currency === 'GBP' ? 'GB' : 'DE';
    const isin = makeIsin(country, cusip);
    const years = maturityYears(r);
    const maturity = isoMaturity(years, r);
    const coupon = +(2 + r() * 7).toFixed(3);
    const ytm = +(coupon * (0.85 + r() * 0.5)).toFixed(3);
    const mid = priceFromYield(coupon, ytm, years);
    const halfSpread = +(0.05 + r() * 0.35).toFixed(3);
    const bidPrice = +(mid - halfSpread).toFixed(3);
    const offerPrice = +(mid + halfSpread).toFixed(3);
    const bidYield = +(ytm + 0.05 + r() * 0.04).toFixed(3);
    const offerYield = +(ytm - (0.05 + r() * 0.04)).toFixed(3);
    const oas = +((sector === 'Treasury' ? 0 : 35) + r() * 220).toFixed(1);
    const zSpread = +(oas + 5 + r() * 30).toFixed(1);
    const duration = +(Math.min(years, 28) * (0.6 + r() * 0.45)).toFixed(2);
    const convexity = +(Math.pow(duration, 1.65) * 0.08).toFixed(2);
    const dv01 = +((duration * 100) / 10000).toFixed(4);
    const sizeBucket = Math.floor(r() * 4);
    const size = [1, 2, 5, 10][sizeBucket] * 1_000_000;
    const notional = size;
    const pnlDay = Math.round((r() - 0.45) * 85000);
    const pnlMtd = Math.round(pnlDay * (4 + r() * 18));
    const pnlYtd = Math.round(pnlMtd * (3 + r() * 7));
    const rating = sector === 'Treasury'
      ? 'AAA'
      : RATINGS[Math.min(RATINGS.length - 1, Math.floor(r() * 9 + (sector === 'Sovereign' ? 0 : 1)))];
    const side: Side = r() > 0.66 ? 'TWO-WAY' : r() > 0.5 ? 'BID' : 'OFFER';
    const liquidity: Liquidity = (['A1', 'A1', 'A2', 'A2', 'B1', 'B2', 'C'] as Liquidity[])[Math.floor(r() * 7)];
    const trader = pick(TRADERS, r);
    const book = pick(BOOKS, r);
    const desk = sector === 'Treasury' ? 'Rates' : sector === 'Sovereign' ? 'Sovereign' : pick(DESKS, r);
    const lastTradedAt = new Date(now - Math.floor(r() * 4 * 3600_000)).toISOString();
    const changeBps = +(((bidYield - ytm) * 100 - 0.5) * 10).toFixed(1);

    rows.push({
      id: `${ticker}-${cusip.slice(0, 6)}-${i}`,
      cusip,
      isin,
      ticker,
      description: `${ticker} ${coupon.toFixed(3)}% ${maturity.slice(0, 7)}`,
      issuer,
      sector: sector as Sector,
      currency,
      coupon,
      maturity,
      rating,
      side,
      bidPrice,
      offerPrice,
      midPrice: mid,
      bidYield,
      offerYield,
      ytm,
      oas,
      zSpread,
      duration,
      convexity,
      dv01,
      size,
      notional,
      pnlDay,
      pnlMtd,
      pnlYtd,
      liquidity,
      trader,
      book,
      desk,
      lastTradedAt,
      changeBps,
    });
  }

  rows.sort((a, b) => a.ticker.localeCompare(b.ticker) || a.maturity.localeCompare(b.maturity));
  return rows;
}
