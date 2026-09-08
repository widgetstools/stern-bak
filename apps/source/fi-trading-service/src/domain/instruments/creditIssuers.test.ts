
import { describe, expect, it } from 'vitest';

import { CREDIT_SECTORS } from '../curves/creditFactors.js';
import { isValidCusip } from '../core/identifiers.js';
import { RATING_BUCKETS } from '../curves/ratingMigration.js';
import {
  BASE_SPREAD_BY_RATING, buildIssuers, prefixProducesValidCusips,
  ratingVector, sectorVector,
} from './creditIssuers.js';
import { issuerReference } from './issuerReference.js';

const issuers = buildIssuers({ seed: 501 });

describe('the universe', () => {
  it('builds the requested number of issuers on each side', () => {
    expect(issuers).toHaveLength(650);
    expect(issuers.filter((i) => !i.isHighYield)).toHaveLength(400);
    expect(issuers.filter((i) => i.isHighYield)).toHaveLength(250);
  });

  it('scales to any size', () => {
    const small = buildIssuers({ seed: 501, investmentGrade: 12, highYield: 8 });
    expect(small).toHaveLength(20);
    expect(small.filter((i) => i.isHighYield)).toHaveLength(8);
  });

  it('names real legal entities, spelled as the register spells them', () => {
    const built = buildIssuers({ seed: 501, investmentGrade: 90, highYield: 45 });
    const register = new Set(issuerReference().issuers.map((i) => i.legalName));
    const parents = built.filter((i) => i.parentIssuerId === null);
    expect(parents.length).toBeGreaterThan(50);
    // Every parent is a real entity under its registered name — no
    // approximation, no title-casing, no invented suffix.
    for (const issuer of parents) expect(register.has(issuer.name)).toBe(true);
  });

  it('spreads a small book across every sector rather than filling one', () => {
    // The register is stored grouped by sector, so taking a prefix of it gave
    // a 90-issuer book every bank and no technology at all.
    const parents = buildIssuers({ seed: 501, investmentGrade: 90, highYield: 45 })
      .filter((i) => i.parentIssuerId === null);
    const sectors = new Set(parents.map((i) => i.sectorIndex));
    expect(sectors.size).toBeGreaterThanOrEqual(12);
  });

  it('carries the real LEI on every parent issuer', () => {
    const parents = buildIssuers({ seed: 7, investmentGrade: 40, highYield: 20 })
      .filter((i) => i.parentIssuerId === null);
    expect(parents.length).toBeGreaterThan(0);
    for (const issuer of parents) {
      // A real LEI is 20 alphanumerics. The synthetic ones were `LEI000123...`,
      // which looked fine until something tried to join on it.
      expect(issuer.lei).toMatch(/^[0-9A-Z]{20}$/);
    }
    expect(new Set(parents.map((i) => i.lei)).size).toBe(parents.length);
  });

  it('classifies every issuer into a real sector and rating bucket', () => {
    for (const issuer of issuers) {
      expect(issuer.sectorIndex).toBeGreaterThanOrEqual(0);
      expect(issuer.sectorIndex).toBeLessThan(CREDIT_SECTORS.length);
      expect(issuer.ratingIndex).toBeGreaterThanOrEqual(0);
      expect(issuer.ratingIndex).toBeLessThan(RATING_BUCKETS.length);
    }
  });

  it('agrees between the high-yield flag and the rating bucket', () => {
    for (const issuer of issuers) {
      expect(issuer.isHighYield).toBe(issuer.ratingIndex > 3);
    }
  });

  it('spans many sectors rather than clustering', () => {
    const sectors = new Set(issuers.map((i) => i.sectorIndex));
    expect(sectors.size).toBeGreaterThanOrEqual(12);
  });
});

describe('CUSIP prefixes', () => {
  it('gives every issuer a unique six-character prefix', () => {
    const prefixes = new Set(issuers.map((i) => i.cusipPrefix));
    expect(prefixes.size).toBe(issuers.length);
    for (const issuer of issuers) expect(issuer.cusipPrefix).toHaveLength(6);
  });

  it('produces prefixes that complete into valid CUSIPs', () => {
    for (const issuer of issuers.slice(0, 200)) {
      expect(prefixProducesValidCusips(issuer.cusipPrefix)).toBe(true);
      expect(isValidCusip(`${issuer.cusipPrefix}AA1`.slice(0, 8) + '0')).toBe(
        isValidCusip(`${issuer.cusipPrefix}AA1`.slice(0, 8) + '0'),
      );
    }
  });

  it('shapes prefixes like real ones - mostly digits', () => {
    let mostlyDigits = 0;
    for (const issuer of issuers) {
      if (/^\d{5}/.test(issuer.cusipPrefix)) mostlyDigits += 1;
    }
    expect(mostlyDigits).toBe(issuers.length);
  });
});

describe('financing entities', () => {
  it('links a subsidiary to its parent', () => {
    const subsidiaries = issuers.filter((i) => i.parentIssuerId !== null);
    expect(subsidiaries.length).toBeGreaterThan(400);
    const byId = new Map(issuers.map((i) => [i.issuerId, i]));
    for (const subsidiary of subsidiaries) {
      const parent = byId.get(subsidiary.parentIssuerId as number);
      expect(parent).toBeDefined();
      expect(parent?.parentIssuerId).toBeNull();
      expect(subsidiary.sectorIndex).toBe(parent?.sectorIndex);
      expect(subsidiary.ticker).toBe(parent?.ticker);
    }
  });

  it('never rates a subsidiary above its parent', () => {
    const byId = new Map(issuers.map((i) => [i.issuerId, i]));
    for (const issuer of issuers) {
      if (issuer.parentIssuerId === null) continue;
      const parent = byId.get(issuer.parentIssuerId);
      expect(issuer.ratingIndex).toBeGreaterThanOrEqual(parent?.ratingIndex as number);
    }
  });

  it('names subsidiaries after their parent', () => {
    const subsidiary = issuers.find((i) => i.name.includes('Capital Corp') && i.parentIssuerId !== null);
    expect(subsidiary).toBeDefined();
    expect(subsidiary?.name).not.toMatch(/Inc Capital Corp/);
  });
});

describe('spreads', () => {
  it('widens monotonically down the rating scale', () => {
    for (let i = 1; i < BASE_SPREAD_BY_RATING.length; i++) {
      expect(BASE_SPREAD_BY_RATING[i] as number).toBeGreaterThan(BASE_SPREAD_BY_RATING[i - 1] as number);
    }
  });

  it('places each issuer near its rating bucket, but not exactly on it', () => {
    const distinct = new Set<number>();
    for (const issuer of issuers) {
      const bucket = BASE_SPREAD_BY_RATING[issuer.ratingIndex] as number;
      expect(issuer.baseSpread5yBp).toBeGreaterThan(bucket * 0.7);
      expect(issuer.baseSpread5yBp).toBeLessThan(bucket * 1.35);
      distinct.add(issuer.baseSpread5yBp);
    }
    // Not every issuer in a bucket has the same spread.
    expect(distinct.size).toBeGreaterThan(100);
  });

  it('puts high yield well wide of investment grade', () => {
    const ig = issuers.filter((i) => !i.isHighYield);
    const hy = issuers.filter((i) => i.isHighYield);
    const mean = (list: typeof ig): number =>
      list.reduce((a, b) => a + b.baseSpread5yBp, 0) / list.length;
    expect(mean(hy)).toBeGreaterThan(mean(ig) * 2.5);
  });
});

describe('vectors for the factor model', () => {
  it('exports ratings and sectors in issuer order', () => {
    const ratings = ratingVector(issuers);
    const sectors = sectorVector(issuers);
    expect(ratings).toHaveLength(issuers.length);
    expect(sectors).toHaveLength(issuers.length);
    expect(ratings[0]).toBe(issuers[0]?.ratingIndex);
    expect(sectors[10]).toBe(issuers[10]?.sectorIndex);
  });
});

describe('determinism', () => {
  it('is identical for a seed and different across seeds', () => {
    expect(buildIssuers({ seed: 501 }).map((i) => i.cusipPrefix)).toEqual(
      issuers.map((i) => i.cusipPrefix),
    );
    expect(buildIssuers({ seed: 777 }).map((i) => i.cusipPrefix)).not.toEqual(
      issuers.map((i) => i.cusipPrefix),
    );
  });

  it('draws on a register big enough to fill both books', () => {
    const reference = issuerReference();
    expect(reference.issuers.length).toBeGreaterThan(180);
    expect(reference.issuers.filter((i) => !i.hy).length).toBeGreaterThan(150);
    expect(reference.issuers.filter((i) => i.hy).length).toBeGreaterThan(25);
    expect(reference.licence).toContain('CC0');
  });
});
