import { describe, expect, it } from 'vitest';
import { SifmaCalendar } from '../core/sifmaCalendar.js';
import { buildBook, DEMO_SCALE, scaleBook } from '../book/bookBuilder.js';
import { createRng } from '../core/rng.js';
import { mintCusip, TREASURY_PREFIX_FAMILY } from './treasuryAuction.js';

const calendar = new SifmaCalendar();

/**
 * A security master keys on its identifiers. Positions hid this — they key on
 * `positionId` — so two securities could share a CUSIP and nothing complained.
 */
describe('identifier uniqueness across the universe', () => {
  const book = buildBook({ asOf: 20260907, calendar, seed: 20260907, scale: scaleBook(DEMO_SCALE, 0.4) });

  it('gives every security a distinct CUSIP', () => {
    const seen = new Map<string, string[]>();
    for (const security of book.securities) {
      seen.set(security.cusip, [...(seen.get(security.cusip) ?? []), security.description]);
    }
    const collisions = [...seen.entries()].filter(([, v]) => v.length > 1);
    expect(collisions.map(([cusip, v]) => `${cusip}: ${v.join(' | ')}`)).toEqual([]);
  });

  it('gives every security a distinct securityId', () => {
    const ids = book.securities.map((s) => s.securityId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every bond a distinct ISIN', () => {
    const isins = book.securities.map((s) => s.isin).filter((i) => i !== '');
    expect(new Set(isins).size).toBe(isins.length);
  });

  it('distinguishes two tenors on the same CDS reference entity', () => {
    // A RED PAIR code identifies the entity and its reference obligation, not
    // the contract, so every tenor on a name shares it. Keying a security on
    // it alone made the 3-year and the 5-year the same security.
    const swaps = book.securities.filter((s) => s.securityType === 'CdsSingleName');
    expect(swaps.length).toBeGreaterThan(0);
    const byIssuer = new Map<number, typeof swaps>();
    for (const swap of swaps) byIssuer.set(swap.issuerId, [...(byIssuer.get(swap.issuerId) ?? []), swap]);
    const multi = [...byIssuer.values()].filter((list) => list.length > 1);
    expect(multi.length).toBeGreaterThan(0);
    for (const list of multi) {
      expect(new Set(list.map((s) => s.cusip)).size).toBe(list.length);
    }
  });

  it('distinguishes index families that share a name stem', () => {
    const indices = book.securities.filter((s) => s.securityType === 'CdsIndex');
    const families = new Set(indices.map((s) => s.issuerName));
    expect(families.has('iTraxx Europe') && families.has('iTraxx Crossover')).toBe(true);
    expect(new Set(indices.map((s) => s.cusip)).size).toBe(indices.length);
  });
});

describe('mintCusip', () => {
  it('fills a prefix completely rather than giving up while codes remain', () => {
    // Random probing alone fails long before the space is full: once most
    // codes are taken, collisions dominate any fixed attempt budget.
    const used = new Set<string>();
    const rng = createRng(1);
    let minted = 0;
    for (let i = 0; i < 1156; i++) {
      try { mintCusip('912797', used, rng); minted += 1; } catch { break; }
    }
    expect(minted).toBeGreaterThan(1000);
  });

  it('spills into the next prefix in a family once one is full', () => {
    const used = new Set<string>();
    const rng = createRng(2);
    const out: string[] = [];
    for (let i = 0; i < 1400; i++) out.push(mintCusip(TREASURY_PREFIX_FAMILY.bill, used, rng));
    expect(new Set(out).size).toBe(out.length);
    const prefixes = new Set(out.map((c) => c.slice(0, 6)));
    expect(prefixes.size).toBeGreaterThan(1);
    for (const prefix of prefixes) {
      expect(TREASURY_PREFIX_FAMILY.bill as readonly string[]).toContain(prefix);
    }
  });

  it('says which prefixes are full when a family really is exhausted', () => {
    const used = new Set<string>();
    const rng = createRng(3);
    expect(() => {
      for (let i = 0; i < 2000; i++) mintCusip('912797', used, rng);
    }).toThrow(/Exhausted the issue-code space for 912797.*1156 codes per prefix/s);
  });
});
