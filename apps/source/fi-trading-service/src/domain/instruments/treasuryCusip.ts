/**
 * Treasury CUSIP minting and ladder helpers.
 *
 * The synthetic auction calendar that used to live here is gone: the universe
 * now comes from `treasuryReference.ts`, which loads the actual auction record,
 * so there is no reason to model reopening cadences or round coupons down to
 * the nearest eighth — Treasury already did both, and the real numbers are in
 * the snapshot.
 *
 * What remains is the part the real data does not provide: minting CUSIPs for
 * the instruments that have no public register (agencies, corporates, munis,
 * structured deals), and reading a ladder out of a set of securities.
 */

import { addMonths, addDays, monthOf, type DateInt } from '../core/dateInt.js';
import { completeCusip, isinFromCusip, issueCode } from '../core/identifiers.js';
import { createRng, deriveSeed, uniformInt, type Rng } from '../core/rng.js';
import { formatIso } from '../core/dateInt.js';
import type { Security, LiquidityTier } from './types.js';

/**
 * Issuer prefixes matching real Treasury CUSIP families.
 *
 * Each family lists its prefixes in the order Treasury actually filled them,
 * and minting spills to the next only when the previous is full. A prefix
 * carries just two issue characters — 34 x 34 = 1,156 codes — so one family
 * cannot cover a book with thousands of Treasuries, and a demo-sized book
 * still gets the exact real prefix because the overflow is never reached.
 */
export const TREASURY_PREFIX_FAMILY = {
  bill: ['912797', '912796', '912795', '912794'],
  note: ['91282C', '91282D', '91282E'],
  bond: ['912810', '912803'],
  strip: ['912820', '912833', '912834'],
} as const;

/** The primary prefix per family, for anything naming one directly. */
export const TREASURY_PREFIX = {
  bill: TREASURY_PREFIX_FAMILY.bill[0],
  note: TREASURY_PREFIX_FAMILY.note[0],
  bond: TREASURY_PREFIX_FAMILY.bond[0],
  strip: TREASURY_PREFIX_FAMILY.strip[0],
} as const;


/**
 * The auction cycle, close to the real schedule: 2s, 3s, 5s and 7s monthly,
 * 10s, 20s and 30s quarterly with reopenings between, TIPS on their own
 * cycle, and bills weekly.
 */


/** A yield curve as of a historical date — the seam for a backfilled path. */


/** Issue codes available on one prefix: two characters from a 34-symbol set. */
const ISSUE_CODE_SPACE = 34 * 34;

export function mintCusip(
  prefix6: string | readonly string[], used: Set<string>, rng: Rng,
): string {
  const prefixes = typeof prefix6 === 'string' ? [prefix6] : prefix6;
  for (const prefix of prefixes) {
    for (let attempt = 0; attempt < 16; attempt++) {
      const stem = `${prefix}${issueCode(uniformInt(rng, 0, ISSUE_CODE_SPACE - 1))}`;
      if (used.has(stem)) continue;
      const cusip = completeCusip(stem);
      if (cusip === null) continue;
      used.add(stem);
      return cusip;
    }
    const start = uniformInt(rng, 0, ISSUE_CODE_SPACE - 1);
    for (let i = 0; i < ISSUE_CODE_SPACE; i++) {
      const stem = `${prefix}${issueCode((start + i) % ISSUE_CODE_SPACE)}`;
      if (used.has(stem)) continue;
      const cusip = completeCusip(stem);
      if (cusip === null) continue;
      used.add(stem);
      return cusip;
    }
  }
  throw new Error(
    `Exhausted the issue-code space for ${prefixes.join(', ')} — ` +
      `${ISSUE_CODE_SPACE} codes per prefix. Add another prefix to the family.`,
  );
}



