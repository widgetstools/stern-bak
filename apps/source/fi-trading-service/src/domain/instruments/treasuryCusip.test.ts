import { describe, expect, it } from 'vitest';
import { createRng } from '../core/rng.js';
import { completeCusip } from '../core/identifiers.js';
import { mintCusip, TREASURY_PREFIX, TREASURY_PREFIX_FAMILY } from './treasuryCusip.js';

describe('TREASURY_PREFIX', () => {
  it('names the prefixes Treasury actually issues on', () => {
    expect(TREASURY_PREFIX.bill).toBe('912797');
    expect(TREASURY_PREFIX.note).toBe('91282C');
    expect(TREASURY_PREFIX.bond).toBe('912810');
    for (const family of Object.values(TREASURY_PREFIX_FAMILY)) {
      expect(family.length).toBeGreaterThan(0);
      for (const prefix of family) expect(prefix).toHaveLength(6);
    }
  });

  it('takes its primary from the front of each family', () => {
    expect(TREASURY_PREFIX.bill).toBe(TREASURY_PREFIX_FAMILY.bill[0]);
    expect(TREASURY_PREFIX.strip).toBe(TREASURY_PREFIX_FAMILY.strip[0]);
  });

  it('lists no prefix twice, within or across families', () => {
    const all = Object.values(TREASURY_PREFIX_FAMILY).flat();
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('mintCusip', () => {
  it('mints a valid nine-character CUSIP on the prefix asked for', () => {
    const cusip = mintCusip('912797', new Set(), createRng(1));
    expect(cusip).toHaveLength(9);
    expect(cusip.startsWith('912797')).toBe(true);
    // The check digit must be the one the standard algorithm produces.
    expect(completeCusip(cusip.slice(0, 8))).toBe(cusip);
  });

  it('never repeats a code within one build', () => {
    const used = new Set<string>();
    const rng = createRng(7);
    const out = Array.from({ length: 400 }, () => mintCusip('91282C', used, rng));
    expect(new Set(out).size).toBe(out.length);
  });

  it('fills a prefix rather than giving up while codes remain', () => {
    // Random probing alone fails long before the space is full: once most
    // codes are taken, collisions dominate any fixed attempt budget.
    const used = new Set<string>();
    const rng = createRng(2);
    let minted = 0;
    for (let i = 0; i < 1156; i++) {
      try { mintCusip('912810', used, rng); minted += 1; } catch { break; }
    }
    expect(minted).toBeGreaterThan(1000);
  });

  it('spills into the next prefix in a family once one is full', () => {
    const used = new Set<string>();
    const rng = createRng(3);
    const out = Array.from({ length: 1400 }, () => mintCusip(TREASURY_PREFIX_FAMILY.bill, used, rng));
    expect(new Set(out).size).toBe(out.length);
    const prefixes = new Set(out.map((c) => c.slice(0, 6)));
    expect(prefixes.size).toBeGreaterThan(1);
    for (const prefix of prefixes) {
      expect(TREASURY_PREFIX_FAMILY.bill as readonly string[]).toContain(prefix);
    }
  });

  it('says which prefixes are full when a family is genuinely exhausted', () => {
    const used = new Set<string>();
    const rng = createRng(4);
    expect(() => {
      for (let i = 0; i < 2000; i++) mintCusip('912797', used, rng);
    }).toThrow(/Exhausted the issue-code space for 912797/);
  });

  it('is deterministic for a seed', () => {
    const one = Array.from({ length: 20 }, () => mintCusip('912797', new Set(), createRng(9)));
    const two = Array.from({ length: 20 }, () => mintCusip('912797', new Set(), createRng(9)));
    expect(one).toEqual(two);
  });
});
