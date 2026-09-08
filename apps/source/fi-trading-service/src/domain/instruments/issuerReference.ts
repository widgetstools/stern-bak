/**
 * Real corporate issuers, from the GLEIF register.
 *
 * The synthetic issuer universe produced plausible names and a fabricated LEI
 * of the form `LEI000123000...`, which looks fine until somebody tries to join
 * on it. These are real legal entities with the LEIs the register actually
 * holds — `JPMORGAN CHASE & CO.` is `8I5DZWZKVSZI1NUHU748`, and the
 * jurisdictions come out Delaware-heavy because that is where US corporates
 * incorporate.
 *
 * The names and sectors are curated in `scripts/fetchIssuers.mjs` rather than
 * crawled: GLEIF holds every registered entity, so an unfiltered pull returns
 * small LLCs and fund vehicles rather than bond issuers, and it publishes no
 * industry classification at all.
 *
 * What stays synthetic, and why:
 *
 *  - **CUSIP prefixes.** The issuer-to-prefix register is a licensed CUSIP
 *    Global Services product, not public. Minted deterministically here, so a
 *    given issuer keeps one prefix across builds and its bonds share it.
 *  - **Ratings and spreads.** Agency ratings are licensed too. Assigned from
 *    the investment-grade / high-yield split the catalog carries, which is the
 *    part that actually matters for how a bond trades.
 *  - **Financing subsidiaries.** A real capital structure has them; which ones
 *    exist is not something GLEIF answers usefully, so they are still derived
 *    from the parent.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRng, deriveSeed, uniformInt, type Rng } from '../core/rng.js';
import { CREDIT_SECTORS } from '../curves/creditFactors.js';

export interface IssuerRecord {
  lei: string;
  legalName: string;
  name: string;
  sector: string;
  hy: boolean;
  jurisdiction: string | null;
  country: string | null;
}

export interface IssuerReference {
  source: string;
  licence: string;
  fetchedAt: string;
  requested: number;
  issuers: IssuerRecord[];
}

let cached: IssuerReference | null = null;

export function issuerReference(): IssuerReference {
  if (cached === null) {
    const here = dirname(fileURLToPath(import.meta.url));
    const path = join(here, '..', '..', '..', 'reference', 'issuers.json');
    cached = JSON.parse(readFileSync(path, 'utf8')) as IssuerReference;
  }
  return cached;
}

/** Index into `CREDIT_SECTORS`, which is the vocabulary the curve model uses. */
export function sectorIndexOf(sector: string): number {
  const index = CREDIT_SECTORS.indexOf(sector as (typeof CREDIT_SECTORS)[number]);
  return index >= 0 ? index : CREDIT_SECTORS.length - 1;
}

/**
 * A ticker from a legal name.
 *
 * Real tickers are not in the LEI record, and guessing them from a name is
 * wrong more often than it is right ("Bank of America" is BAC, not BOA). This
 * produces a stable, readable abbreviation instead, and does not pretend to be
 * an exchange ticker.
 */
export function tickerFrom(legalName: string, used: Set<string>): string {
  const words = legalName
    .replace(/[.,&]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0 && !/^(INC|CORP|CORPORATION|COMPANY|CO|THE|GROUP|HOLDINGS|PLC|LTD|LP|LLC|NV|SA|SE)$/i.test(w));
  let stem = words.slice(0, 2).map((w) => w.slice(0, 4).toUpperCase()).join('').slice(0, 6);
  if (stem.length < 2) stem = legalName.replace(/[^A-Z]/gi, '').slice(0, 4).toUpperCase();
  let candidate = stem;
  let n = 1;
  while (used.has(candidate)) candidate = `${stem}${n++}`;
  used.add(candidate);
  return candidate;
}

/**
 * Rating within a band.
 *
 * Agency ratings are licensed, so the catalog's IG/HY split is the real signal
 * and the notch within it is drawn. The distribution matters more than any
 * single name: an index is mostly A and BBB, and a high-yield index mostly BB
 * and B, with a thin CCC tail.
 */
export function ratingFor(hy: boolean, rng: Rng): number {
  if (hy) {
    const draw = uniformInt(rng, 0, 99);
    return draw < 45 ? 4 : draw < 82 ? 5 : draw < 97 ? 6 : 7;
  }
  const draw = uniformInt(rng, 0, 99);
  return draw < 8 ? 0 : draw < 26 ? 1 : draw < 62 ? 2 : 3;
}

export interface ReferenceIssuerOptions {
  seed: number;
  /** Cap on real entities used. Defaults to all of them. */
  limit?: number;
}

/** The real entities, ready to hang a capital structure off. */
export function referenceIssuers(options: ReferenceIssuerOptions): {
  record: IssuerRecord; sectorIndex: number; ratingIndex: number; ticker: string;
}[] {
  const reference = issuerReference();
  const rng = createRng(deriveSeed(options.seed, 'refIssuers'));
  const usedTickers = new Set<string>();

  // Round-robin across sectors, not sector by sector. The register is stored
  // grouped, so taking a prefix of it gave a small book every bank and no
  // technology at all — an investment-grade book with no Apple in it is not
  // an investment-grade book.
  const bySector = new Map<string, IssuerRecord[]>();
  for (const record of reference.issuers) {
    bySector.set(record.sector, [...(bySector.get(record.sector) ?? []), record]);
  }
  const lanes = [...bySector.values()];
  const interleaved: IssuerRecord[] = [];
  for (let depth = 0; interleaved.length < reference.issuers.length; depth++) {
    for (const lane of lanes) {
      const record = lane[depth];
      if (record !== undefined) interleaved.push(record);
    }
    if (depth > 1000) break;
  }

  return interleaved
    .slice(0, options.limit ?? interleaved.length)
    .map((record) => ({
      record,
      sectorIndex: sectorIndexOf(record.sector),
      ratingIndex: ratingFor(record.hy, rng),
      ticker: tickerFrom(record.legalName, usedTickers),
    }));
}
