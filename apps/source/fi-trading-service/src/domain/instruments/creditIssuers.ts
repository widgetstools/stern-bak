/**
 * The corporate issuer universe.
 *
 * Issuers come FIRST, and bonds hang off them. That ordering is what produces
 * the structure a credit desk works in: every bond of one issuer shares a
 * six-character CUSIP prefix, one credit curve and one idiosyncratic factor,
 * so they co-move, and a name that gaps on news gaps across its whole curve.
 * Generating bonds independently and stamping issuer names on afterwards
 * gives none of that.
 *
 * Names are real, well-known public issuers, as they are in the generator this
 * replaces. The SECURITIES are entirely synthetic — the CUSIPs are fabricated
 * (with correct check digits) and correspond to nothing issued.
 *
 * The universe is scaled out with financing entities rather than invented
 * companies, because that is how issuer families actually work: an operating
 * company, a finance subsidiary, and often an international funding vehicle,
 * each issuing under its own prefix and typically notched down from the
 * parent.
 */

import { completeCusip } from '../core/identifiers.js';
import { createRng, deriveSeed, uniformInt, type Rng } from '../core/rng.js';

/** name, ticker, sector index, rating index. */
type Archetype = readonly [string, string, number, number];

/** Sector indices match CREDIT_SECTORS in curves/creditFactors.ts. */
const BANKING = 0;
const BASIC = 1;
const CAPGOODS = 2;
const COMMS = 3;
const CONS_CYC = 4;
const CONS_NON = 5;
const ELECTRIC = 6;
const ENERGY = 7;
const INSURANCE = 8;
const NATGAS = 9;
const REITS = 10;
const TECH = 11;
const TRANSPORT = 12;

export const IG_ARCHETYPES: readonly Archetype[] = [
  ['JPMorgan Chase & Co', 'JPM', BANKING, 2], ['Bank of America Corp', 'BAC', BANKING, 2],
  ['Citigroup Inc', 'C', BANKING, 3], ['Wells Fargo & Co', 'WFC', BANKING, 2],
  ['Goldman Sachs Group Inc', 'GS', BANKING, 3], ['Morgan Stanley', 'MS', BANKING, 2],
  ['US Bancorp', 'USB', BANKING, 2], ['PNC Financial Services', 'PNC', BANKING, 2],
  ['Truist Financial Corp', 'TFC', BANKING, 2], ['Charles Schwab Corp', 'SCHW', BANKING, 2],
  ['Dow Inc', 'DOW', BASIC, 3], ['LyondellBasell Industries', 'LYB', BASIC, 3],
  ['Nucor Corp', 'NUE', BASIC, 2], ['Air Products & Chemicals', 'APD', BASIC, 2],
  ['Sherwin-Williams Co', 'SHW', BASIC, 3],
  ['Boeing Co', 'BA', CAPGOODS, 3], ['Caterpillar Inc', 'CAT', CAPGOODS, 2],
  ['Honeywell International', 'HON', CAPGOODS, 2], ['Deere & Co', 'DE', CAPGOODS, 2],
  ['Lockheed Martin Corp', 'LMT', CAPGOODS, 2], ['3M Co', 'MMM', CAPGOODS, 2],
  ['AT&T Inc', 'T', COMMS, 3], ['Verizon Communications', 'VZ', COMMS, 2],
  ['Comcast Corp', 'CMCSA', COMMS, 2], ['Charter Communications', 'CHTR', COMMS, 3],
  ['T-Mobile US Inc', 'TMUS', COMMS, 3], ['Walt Disney Co', 'DIS', COMMS, 2],
  ['Amazon.com Inc', 'AMZN', CONS_CYC, 2], ['Home Depot Inc', 'HD', CONS_CYC, 2],
  ["McDonald's Corp", 'MCD', CONS_CYC, 3], ["Lowe's Companies", 'LOW', CONS_CYC, 3],
  ['Starbucks Corp', 'SBUX', CONS_CYC, 3], ['NIKE Inc', 'NKE', CONS_CYC, 2],
  ['Johnson & Johnson', 'JNJ', CONS_NON, 0], ['Procter & Gamble Co', 'PG', CONS_NON, 1],
  ['Coca-Cola Co', 'KO', CONS_NON, 2], ['PepsiCo Inc', 'PEP', CONS_NON, 2],
  ['Pfizer Inc', 'PFE', CONS_NON, 2], ['Merck & Co Inc', 'MRK', CONS_NON, 2],
  ['AbbVie Inc', 'ABBV', CONS_NON, 3], ['Amgen Inc', 'AMGN', CONS_NON, 3],
  ['CVS Health Corp', 'CVS', CONS_NON, 3], ['Unilever PLC', 'UL', CONS_NON, 2],
  ['NextEra Energy Inc', 'NEE', ELECTRIC, 3], ['Duke Energy Corp', 'DUK', ELECTRIC, 3],
  ['Southern Co', 'SO', ELECTRIC, 3], ['Dominion Energy Inc', 'D', ELECTRIC, 3],
  ['American Electric Power', 'AEP', ELECTRIC, 3],
  ['Exxon Mobil Corp', 'XOM', ENERGY, 1], ['Chevron Corp', 'CVX', ENERGY, 1],
  ['ConocoPhillips', 'COP', ENERGY, 2], ['Shell PLC', 'SHEL', ENERGY, 2],
  ['TotalEnergies SE', 'TTE', ENERGY, 2],
  ['Berkshire Hathaway Inc', 'BRK', INSURANCE, 1], ['Chubb Ltd', 'CB', INSURANCE, 2],
  ['MetLife Inc', 'MET', INSURANCE, 2], ['Prudential Financial', 'PRU', INSURANCE, 2],
  ['American International Group', 'AIG', INSURANCE, 3],
  ['Williams Companies Inc', 'WMB', NATGAS, 3], ['Kinder Morgan Inc', 'KMI', NATGAS, 3],
  ['Enterprise Products Partners', 'EPD', NATGAS, 2], ['Energy Transfer LP', 'ET', NATGAS, 3],
  ['Prologis Inc', 'PLD', REITS, 2], ['Simon Property Group', 'SPG', REITS, 2],
  ['American Tower Corp', 'AMT', REITS, 3], ['Equinix Inc', 'EQIX', REITS, 3],
  ['Realty Income Corp', 'O', REITS, 2],
  ['Apple Inc', 'AAPL', TECH, 1], ['Microsoft Corp', 'MSFT', TECH, 0],
  ['Alphabet Inc', 'GOOGL', TECH, 1], ['Oracle Corp', 'ORCL', TECH, 3],
  ['Intel Corp', 'INTC', TECH, 2], ['International Business Machines', 'IBM', TECH, 2],
  ['Cisco Systems Inc', 'CSCO', TECH, 2], ['Broadcom Inc', 'AVGO', TECH, 3],
  ['Salesforce Inc', 'CRM', TECH, 2], ['Texas Instruments Inc', 'TXN', TECH, 2],
  ['Union Pacific Corp', 'UNP', TRANSPORT, 2], ['United Parcel Service', 'UPS', TRANSPORT, 2],
  ['FedEx Corp', 'FDX', TRANSPORT, 3], ['Norfolk Southern Corp', 'NSC', TRANSPORT, 3],
  ['CSX Corp', 'CSX', TRANSPORT, 3], ['Delta Air Lines Inc', 'DAL', TRANSPORT, 3],
];

export const HY_ARCHETYPES: readonly Archetype[] = [
  ['DISH Network Corp', 'DISH', COMMS, 6], ['Lumen Technologies Inc', 'LUMN', COMMS, 6],
  ['Altice USA Inc', 'ATUS', COMMS, 5], ['Frontier Communications', 'FYBR', COMMS, 5],
  ['Carnival Corp', 'CCL', CONS_CYC, 5], ['Royal Caribbean Cruises', 'RCL', CONS_CYC, 4],
  ['Norwegian Cruise Line', 'NCLH', CONS_CYC, 5], ['Caesars Entertainment', 'CZR', CONS_CYC, 5],
  ['MGM Resorts International', 'MGM', CONS_CYC, 4], ['Wynn Resorts Ltd', 'WYNN', CONS_CYC, 5],
  ['Bath & Body Works Inc', 'BBWI', CONS_CYC, 4], ["Macy's Inc", 'M', CONS_CYC, 4],
  ['Nordstrom Inc', 'JWN', CONS_CYC, 4],
  ['Occidental Petroleum Corp', 'OXY', ENERGY, 4], ['Antero Resources Corp', 'AR', ENERGY, 4],
  ['Range Resources Corp', 'RRC', ENERGY, 4], ['Chesapeake Energy Corp', 'CHK', ENERGY, 4],
  ['Southwestern Energy Co', 'SWN', ENERGY, 4], ['EQT Corp', 'EQT', ENERGY, 4],
  ['United States Steel Corp', 'X', BASIC, 4], ['Cleveland-Cliffs Inc', 'CLF', BASIC, 4],
  ['Freeport-McMoRan Inc', 'FCX', BASIC, 4], ['Alcoa Corp', 'AA', BASIC, 4],
  ['Bombardier Inc', 'BBD', CAPGOODS, 5], ['TransDigm Group Inc', 'TDG', CAPGOODS, 5],
  ['Howmet Aerospace Inc', 'HWM', CAPGOODS, 4],
  ['Community Health Systems', 'CYH', CONS_NON, 6], ['Tenet Healthcare Corp', 'THC', CONS_NON, 4],
  ['HCA Healthcare Inc', 'HCA', CONS_NON, 4], ['Bausch Health Companies', 'BHC', CONS_NON, 6],
  ['Rite Aid Corp', 'RAD', CONS_NON, 6],
  ['American Airlines Group', 'AAL', TRANSPORT, 5], ['United Airlines Holdings', 'UAL', TRANSPORT, 4],
  ['Avis Budget Group Inc', 'CAR', TRANSPORT, 4], ['Hertz Global Holdings', 'HTZ', TRANSPORT, 5],
  ['Coinbase Global Inc', 'COIN', TECH, 4], ['Rackspace Technology', 'RXT', TECH, 6],
  ['Xerox Holdings Corp', 'XRX', TECH, 5],
  ['Vistra Corp', 'VST', ELECTRIC, 4], ['Calpine Corp', 'CPN', ELECTRIC, 5],
  ['Talen Energy Corp', 'TLN', ELECTRIC, 5],
];

/**
 * Financing entities. Real issuer families use these, and a finance subsidiary
 * is usually notched below the operating company because it is structurally
 * further from the assets.
 */
const FINANCE_SUFFIXES: readonly (readonly [string, number])[] = [
  ['Capital Corp', 0],
  ['Finance LLC', 0],
  ['Funding Inc', 1],
  ['International Finance BV', 1],
  ['Credit Corp', 0],
  ['Global Funding', 1],
];

export interface Issuer {
  issuerId: number;
  name: string;
  ticker: string;
  sectorIndex: number;
  ratingIndex: number;
  /** Six characters, unique. Every bond of this issuer shares it. */
  cusipPrefix: string;
  lei: string;
  country: string;
  isHighYield: boolean;
  /** Five-year senior unsecured spread at rest, in basis points. */
  baseSpread5yBp: number;
  /** The operating company, when this is a financing entity. */
  parentIssuerId: number | null;
}

/**
 * Five-year senior unsecured spread by rating, in basis points.
 *
 * These are the resting levels the factor model perturbs; the ratio between
 * adjacent buckets matters more than the absolute level, because it sets how
 * far a downgrade moves a name.
 */
export const BASE_SPREAD_BY_RATING: readonly number[] = [25, 42, 72, 125, 255, 430, 900, 2500];

/** Deterministic six-character CUSIP issuer prefix. */
export function issuerPrefix(ticker: string, salt: number, used: Set<string>): string {
  let hash = 2166136261 ^ salt;
  for (let i = 0; i < ticker.length; i++) {
    hash = Math.imul(hash ^ ticker.charCodeAt(i), 16777619) >>> 0;
  }
  const alphabet = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (let attempt = 0; attempt < 512; attempt++) {
    let value = (hash + attempt * 7919) >>> 0;
    // Real prefixes are mostly digits with an occasional letter in the last
    // position, so the shape here matches what a security master looks like.
    let prefix = '';
    for (let i = 0; i < 5; i++) {
      prefix += String(value % 10);
      value = Math.floor(value / 10);
    }
    prefix += alphabet[value % (attempt % 4 === 3 ? alphabet.length : 10)] as string;
    if (!used.has(prefix)) {
      used.add(prefix);
      return prefix;
    }
  }
  throw new Error(`Could not mint a unique CUSIP prefix for ${ticker}`);
}

export interface IssuerUniverseOptions {
  seed: number;
  /** Investment-grade issuers to produce. */
  investmentGrade?: number;
  /** High-yield issuers to produce. */
  highYield?: number;
  startIssuerId?: number;
}

function spreadFor(ratingIndex: number, rng: Rng): number {
  const base = BASE_SPREAD_BY_RATING[ratingIndex] ?? 200;
  // Issuers within a bucket are not identical; percentile within the bucket
  // is preserved across migrations so a strong BBB stays a strong BB.
  return Math.round(base * (0.78 + (uniformInt(rng, 0, 1000) / 1000) * 0.5));
}

function makeIssuer(
  issuerId: number,
  name: string,
  ticker: string,
  sectorIndex: number,
  ratingIndex: number,
  used: Set<string>,
  rng: Rng,
  parentIssuerId: number | null,
  seed: number,
): Issuer {
  return {
    issuerId,
    name,
    ticker,
    sectorIndex,
    ratingIndex,
    cusipPrefix: issuerPrefix(`${ticker}${parentIssuerId ?? ''}`, deriveSeed(seed, issuerId), used),
    lei: `LEI${String(issuerId).padStart(6, '0')}${'0'.repeat(11)}`,
    country: 'US',
    isHighYield: ratingIndex > 3,
    baseSpread5yBp: spreadFor(ratingIndex, rng),
    parentIssuerId,
  };
}

/**
 * Build the issuer universe.
 *
 * Archetypes come first so the well-known names are always present at any
 * size, then financing entities fill out the requested count.
 */
export function buildIssuers(options: IssuerUniverseOptions): Issuer[] {
  const igTarget = options.investmentGrade ?? 400;
  const hyTarget = options.highYield ?? 250;
  const rng = createRng(deriveSeed(options.seed, 'issuers'));
  const usedPrefixes = new Set<string>();
  let issuerId = options.startIssuerId ?? 1;
  const out: Issuer[] = [];

  const emit = (archetypes: readonly Archetype[], target: number): void => {
    const parents: Issuer[] = [];
    for (const [name, ticker, sector, rating] of archetypes) {
      if (parents.length >= target) break;
      const issuer = makeIssuer(issuerId++, name, ticker, sector, rating, usedPrefixes, rng, null, options.seed);
      parents.push(issuer);
      out.push(issuer);
    }
    if (parents.length === 0) return;

    let produced = parents.length;
    let round = 0;
    while (produced < target) {
      const parent = parents[produced % parents.length] as Issuer;
      const [suffix, notch] = FINANCE_SUFFIXES[round % FINANCE_SUFFIXES.length] as readonly [string, number];
      // Notch the subsidiary down, but never across the investment-grade
      // line: a financing entity of a BBB parent is a weak BBB, not a BB.
      // Letting it cross would silently move issuers between the two books.
      const notched = parent.ratingIndex + notch;
      const ratingIndex = parent.isHighYield ? Math.min(6, Math.max(4, notched)) : Math.min(3, notched);
      const stem = parent.name.replace(/ (Inc|Corp|Co|PLC|Ltd|LP|SE|BV|LLC|& Co)$/u, '');
      out.push(
        makeIssuer(
          issuerId++,
          `${stem} ${suffix}`,
          parent.ticker,
          parent.sectorIndex,
          ratingIndex,
          usedPrefixes,
          rng,
          parent.issuerId,
          options.seed,
        ),
      );
      produced += 1;
      if (produced % parents.length === 0) round += 1;
    }
  };

  emit(IG_ARCHETYPES, igTarget);
  emit(HY_ARCHETYPES, hyTarget);
  return out;
}

/** Rating index per issuer, for the migration engine. */
export function ratingVector(issuers: readonly Issuer[]): Uint8Array {
  return Uint8Array.from(issuers.map((issuer) => issuer.ratingIndex));
}

/** Sector index per issuer, for the credit factor model. */
export function sectorVector(issuers: readonly Issuer[]): Uint8Array {
  return Uint8Array.from(issuers.map((issuer) => issuer.sectorIndex));
}

/** Validate that a prefix produces well-formed CUSIPs. */
export function prefixProducesValidCusips(prefix: string): boolean {
  return completeCusip(`${prefix}AA`) !== null;
}
