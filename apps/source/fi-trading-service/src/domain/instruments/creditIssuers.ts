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
import { referenceIssuers } from './issuerReference.js';


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
  reference?: { lei: string; jurisdiction: string | null; country: string | null },
): Issuer {
  return {
    issuerId,
    name,
    ticker,
    sectorIndex,
    ratingIndex,
    // The issuer-to-prefix register is a licensed CUSIP product, so this stays
    // minted — deterministically, so an issuer keeps one prefix across builds.
    cusipPrefix: issuerPrefix(`${ticker}${parentIssuerId ?? ''}`, deriveSeed(seed, issuerId), used),
    // A financing subsidiary carries its PARENT's LEI here: it is a distinct
    // legal entity in reality, but GLEIF cannot tell us which subsidiaries a
    // given issuer has, and inventing an LEI is exactly what this replaced.
    lei: reference?.lei ?? '',
    country: reference?.country ?? 'US',
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

  // Real legal entities from the GLEIF register, split by the band they trade
  // in. Financing subsidiaries are still derived, because which ones exist is
  // not something the register answers usefully.
  const reference = referenceIssuers({ seed: options.seed });
  const igReal = reference.filter((entry) => !entry.record.hy);
  const hyReal = reference.filter((entry) => entry.record.hy);

  const emit = (entries: readonly (typeof reference)[number][], target: number): void => {
    const parents: Issuer[] = [];
    for (const entry of entries) {
      if (parents.length >= target) break;
      const issuer = makeIssuer(
        issuerId++, entry.record.legalName, entry.ticker, entry.sectorIndex,
        entry.ratingIndex, usedPrefixes, rng, null, options.seed, entry.record,
      );
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
      // Two invariants, and the second only started to bite once ratings came
      // from a real distribution with a D tail: a subsidiary must not cross
      // the investment-grade line (that would silently move it between the two
      // books), and it must never be rated ABOVE its own parent. Clamping high
      // yield at 6 did exactly that for a parent already at 7.
      const ratingIndex = parent.isHighYield
        ? Math.min(7, Math.max(parent.ratingIndex, notched))
        : Math.min(3, Math.max(parent.ratingIndex, notched));
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

  emit(igReal, igTarget);
  emit(hyReal, hyTarget);
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
