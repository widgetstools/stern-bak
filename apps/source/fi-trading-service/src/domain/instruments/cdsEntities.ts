/**
 * Credit default swap reference entities.
 *
 * Every entity carries an `issuerId` into the CORPORATE ISSUER SET, and that
 * foreign key is the point of the module. Because a name's CDS and its bonds
 * read the same idiosyncratic credit factor, the bond-CDS basis is a real,
 * mean-reverting, tradeable quantity rather than the difference between two
 * unrelated random walks. Basis packages — long the bond, buy protection —
 * only exist as a query if the two universes share issuers.
 *
 * RED codes are the market's identifier: six characters for the entity, nine
 * for the entity-and-reference-obligation pair. Ours are synthesised but
 * well-formed and stable per issuer.
 */

import { createRng, deriveSeed, pickWeighted, type Rng } from '../core/rng.js';
import { RECOVERY_SENIOR_UNSECURED, RECOVERY_SUBORDINATED } from '../analytics/cds/hazard.js';
import type { Issuer } from './creditIssuers.js';

/** Capital-structure tier the contract references. */
export type CdsTier = 'SNRFOR' | 'SUBLT2' | 'SECDOM';

/**
 * Restructuring treatment. North American corporates trade No-Restructuring
 * (XR14), Europeans Modified-Modified (MM14), sovereigns Cum-Restructuring
 * (CR14). Getting this wrong makes two contracts on the same name look
 * fungible when they are not.
 */
export type DocClause = 'XR14' | 'MM14' | 'CR14' | 'MR14';

export interface CdsEntity {
  /** Six-character entity code. */
  redCode6: string;
  /** Nine-character entity-and-preferred-reference-obligation pair code. */
  redPair9: string;
  /** Foreign key into the corporate issuer universe. */
  issuerId: number;
  entityName: string;
  ticker: string;
  tier: CdsTier;
  docClause: DocClause;
  /** Assumed recovery: 40% senior unsecured, 20% subordinated. */
  conventionalRecovery: number;
  /** 100 bp for investment grade, 500 for high yield. */
  standardCouponBp: 100 | 500;
  /** CUSIP of one of the issuer's bonds. */
  referenceObligation: string;
  sectorIndex: number;
  isHighYield: boolean;
}

const RED_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** A stable six-character RED code from a ticker and issuer id. */
export function redCode(ticker: string, issuerId: number): string {
  let hash = 2166136261 ^ issuerId;
  for (let i = 0; i < ticker.length; i++) {
    hash = Math.imul(hash ^ ticker.charCodeAt(i), 16777619) >>> 0;
  }
  let code = '';
  let value = hash;
  for (let i = 0; i < 6; i++) {
    code += RED_ALPHABET[value % RED_ALPHABET.length] as string;
    value = Math.floor(value / RED_ALPHABET.length) + 7;
  }
  return code;
}

function tierFor(rng: Rng, sectorIndex: number): CdsTier {
  // Only banks and insurers have a liquid subordinated CDS market.
  if (sectorIndex === 0 || sectorIndex === 8) {
    return pickWeighted(rng, ['SNRFOR', 'SUBLT2'] as const, [78, 22]);
  }
  return 'SNRFOR';
}

export function recoveryFor(tier: CdsTier): number {
  return tier === 'SUBLT2' ? RECOVERY_SUBORDINATED : RECOVERY_SENIOR_UNSECURED;
}

export interface CdsEntityOptions {
  issuers: readonly Issuer[];
  seed: number;
  /** Reference obligation CUSIP per issuer, from the bond universe. */
  referenceObligations?: ReadonlyMap<number, string>;
  /** Cap on how many entities to create. Defaults to every issuer. */
  limit?: number;
}

/** Build the single-name universe from the corporate issuers. */
export function buildCdsEntities(options: CdsEntityOptions): CdsEntity[] {
  const limit = options.limit ?? options.issuers.length;
  const out: CdsEntity[] = [];

  for (const issuer of options.issuers.slice(0, limit)) {
    const rng = createRng(deriveSeed(options.seed, 'cds', issuer.issuerId));
    const tier = tierFor(rng, issuer.sectorIndex);
    const code = redCode(issuer.ticker, issuer.issuerId);
    out.push({
      redCode6: code,
      redPair9: `${code}${RED_ALPHABET[issuer.issuerId % 36] as string}${tier === 'SUBLT2' ? 'S' : 'N'}${issuer.isHighYield ? 'H' : 'I'}`,
      issuerId: issuer.issuerId,
      entityName: issuer.name,
      ticker: issuer.ticker,
      tier,
      docClause: 'XR14',
      conventionalRecovery: recoveryFor(tier),
      standardCouponBp: issuer.isHighYield ? 500 : 100,
      referenceObligation: options.referenceObligations?.get(issuer.issuerId) ?? '',
      sectorIndex: issuer.sectorIndex,
      isHighYield: issuer.isHighYield,
    });
  }
  return out;
}

/** Entities whose issuer appears in the supplied set — the basis universe. */
export function entitiesWithBonds(
  entities: readonly CdsEntity[],
  issuerIdsWithBonds: ReadonlySet<number>,
): CdsEntity[] {
  return entities.filter((entity) => issuerIdsWithBonds.has(entity.issuerId));
}
