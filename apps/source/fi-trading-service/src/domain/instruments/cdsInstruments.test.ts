import { describe, expect, it } from 'vitest';

import { buildCreditBonds } from './creditBonds.js';
import { buildIssuers } from './creditIssuers.js';
import { buildCdsEntities, entitiesWithBonds, recoveryFor, redCode } from './cdsEntities.js';
import {
  buildCdsIndices, CDS_TENORS, daysSincePreviousImm, INDEX_DEFINITIONS, indexFactorAfterDefaults,
  intrinsicSpreadBp, isImmDate, nextImmDate, previousImmDate, protectionStart, seriesNumber,
  seriesRollDates, standardMaturity, tenorYears,
} from './cdsContracts.js';

const issuers = buildIssuers({ seed: 1301, investmentGrade: 200, highYield: 130 });
const bonds = buildCreditBonds({
  issuers, asOf: 20260115, seed: 1301, startSecurityId: 1, benchmarkYield: () => 4.4,
});
const referenceObligations = new Map<number, string>();
for (const bond of bonds) {
  if (!referenceObligations.has(bond.issuerId)) referenceObligations.set(bond.issuerId, bond.cusip);
}
const entities = buildCdsEntities({ issuers, seed: 1301, referenceObligations });

describe('THE ISSUER JOIN - what makes basis real', () => {
  it('keys every entity to a corporate issuer', () => {
    const byId = new Map(issuers.map((i) => [i.issuerId, i]));
    expect(entities).toHaveLength(issuers.length);
    for (const entity of entities) {
      const issuer = byId.get(entity.issuerId);
      expect(issuer).toBeDefined();
      expect(entity.entityName).toBe(issuer?.name);
      expect(entity.sectorIndex).toBe(issuer?.sectorIndex);
      expect(entity.isHighYield).toBe(issuer?.isHighYield);
    }
  });

  it('points at a real bond of the same issuer as its reference obligation', () => {
    const cusipsByIssuer = new Map<number, Set<string>>();
    for (const bond of bonds) {
      const set = cusipsByIssuer.get(bond.issuerId) ?? new Set<string>();
      set.add(bond.cusip);
      cusipsByIssuer.set(bond.issuerId, set);
    }
    let checked = 0;
    for (const entity of entities) {
      if (entity.referenceObligation === '') continue;
      expect(cusipsByIssuer.get(entity.issuerId)?.has(entity.referenceObligation)).toBe(true);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(200);
  });

  it('makes a basis universe: entities whose issuer also has bonds', () => {
    const withBonds = new Set(bonds.map((b) => b.issuerId));
    const tradeable = entitiesWithBonds(entities, withBonds);
    expect(tradeable.length).toBeGreaterThan(200);
    for (const entity of tradeable) expect(withBonds.has(entity.issuerId)).toBe(true);
  });

  it('puts every entity on the coupon its credit quality implies', () => {
    for (const entity of entities) {
      expect(entity.standardCouponBp).toBe(entity.isHighYield ? 500 : 100);
    }
  });
});

describe('RED codes and conventions', () => {
  it('mints stable, unique six-character entity codes', () => {
    const codes = new Set(entities.map((e) => e.redCode6));
    expect(codes.size).toBe(entities.length);
    for (const entity of entities) {
      expect(entity.redCode6).toHaveLength(6);
      expect(entity.redPair9).toHaveLength(9);
      expect(entity.redPair9.startsWith(entity.redCode6)).toBe(true);
    }
  });

  it('is deterministic per issuer', () => {
    expect(redCode('AAPL', 7)).toBe(redCode('AAPL', 7));
    expect(redCode('AAPL', 7)).not.toBe(redCode('AAPL', 8));
    expect(redCode('AAPL', 7)).not.toBe(redCode('MSFT', 7));
  });

  it('trades North American corporates on No-Restructuring', () => {
    for (const entity of entities) expect(entity.docClause).toBe('XR14');
  });

  it('offers a subordinated tier only at banks and insurers', () => {
    const subordinated = entities.filter((e) => e.tier === 'SUBLT2');
    expect(subordinated.length).toBeGreaterThan(0);
    for (const entity of subordinated) {
      expect([0, 8]).toContain(entity.sectorIndex);
    }
  });

  it('assumes 40% recovery senior and 20% subordinated', () => {
    expect(recoveryFor('SNRFOR')).toBe(0.4);
    expect(recoveryFor('SUBLT2')).toBe(0.2);
    for (const entity of entities) {
      expect(entity.conventionalRecovery).toBe(entity.tier === 'SUBLT2' ? 0.2 : 0.4);
    }
  });
});

describe('IMM dates', () => {
  it('recognises the four roll dates and rejects everything else', () => {
    for (const date of [20260320, 20260620, 20260920, 20261220]) {
      expect(isImmDate(date)).toBe(true);
    }
    for (const date of [20260321, 20260319, 20260420, 20260320 - 1]) {
      expect(isImmDate(date)).toBe(false);
    }
  });

  it('rolls forward and backward across a year boundary', () => {
    expect(nextImmDate(20260115)).toBe(20260320);
    expect(nextImmDate(20260320)).toBe(20260620);
    expect(nextImmDate(20261221)).toBe(20270320);
    expect(previousImmDate(20260115)).toBe(20251220);
    expect(previousImmDate(20260320)).toBe(20260320);
  });

  it('gives every trade in a quarter the SAME standard maturity', () => {
    // The fungibility that lets the market clear: a five-year traded in
    // January and one traded in March both mature on 20 March 2031.
    for (const tradeDate of [20260115, 20260201, 20260319]) {
      expect(standardMaturity(tradeDate, '5Y')).toBe(20310320);
    }
    expect(standardMaturity(20260321, '5Y')).toBe(20310620);
  });

  it('lands every standard maturity on an IMM date, unadjusted', () => {
    for (const tenor of CDS_TENORS) {
      const maturity = standardMaturity(20260115, tenor);
      expect(isImmDate(maturity)).toBe(true);
      expect(maturity).toBe(20260320 + tenorYears(tenor) * 10000);
    }
  });

  it('accrues protection from the previous roll', () => {
    expect(protectionStart(20260115)).toBe(20251220);
    expect(daysSincePreviousImm(20260320)).toBe(0);
    expect(daysSincePreviousImm(20260115)).toBeGreaterThan(0);
  });

  it('parses every tenor', () => {
    expect(CDS_TENORS.map(tenorYears)).toEqual([1, 3, 5, 7, 10]);
  });
});

describe('index construction', () => {
  const indices = buildCdsIndices({ asOf: 20260115, entities, historyPerFamily: 3 });

  it('builds each family with an on-the-run series and off-the-run tail', () => {
    for (const definition of INDEX_DEFINITIONS) {
      const family = indices.filter((i) => i.family === definition.family);
      expect(family).toHaveLength(3);
      expect(family.filter((i) => i.onTheRun)).toHaveLength(1);
    }
  });

  it('rolls the series twice a year, in March and September', () => {
    const [march, september] = seriesRollDates(2026);
    expect(march).toBe(20260320);
    expect(september).toBe(20260920);
    expect(seriesNumber(20260101)).toBe(seriesNumber(20260319));
    expect(seriesNumber(20260320)).toBe(seriesNumber(20260101) + 1);
    expect(seriesNumber(20260920)).toBe(seriesNumber(20260101) + 2);
    expect(seriesNumber(20270101)).toBe(seriesNumber(20260101) + 2);
  });

  it('numbers off-the-run series below the current one', () => {
    const ig = indices.filter((i) => i.family === 'CDX.NA.IG').sort((a, b) => b.series - a.series);
    expect(ig[0]?.onTheRun).toBe(true);
    for (let i = 1; i < ig.length; i++) {
      expect(ig[i]?.series as number).toBeLessThan(ig[i - 1]?.series as number);
      expect(ig[i]?.onTheRun).toBe(false);
    }
  });

  it('draws constituents as a STRICT SUBSET of the entity universe', () => {
    // The index level really is the weighted intrinsic of its members, so an
    // index selloff moves every constituent bond and CDS together.
    const entityIds = new Set(entities.map((e) => e.issuerId));
    for (const index of indices) {
      expect(index.constituentIssuerIds.length).toBeGreaterThan(0);
      for (const issuerId of index.constituentIssuerIds) {
        expect(entityIds.has(issuerId)).toBe(true);
      }
    }
  });

  it('puts investment-grade names in IG indices and high-yield names in HY', () => {
    const byId = new Map(entities.map((e) => [e.issuerId, e]));
    for (const index of indices) {
      const definition = INDEX_DEFINITIONS.find((d) => d.family === index.family);
      for (const issuerId of index.constituentIssuerIds) {
        expect(byId.get(issuerId)?.isHighYield).toBe(definition?.highYield);
      }
    }
  });

  it('replaces some constituents on each roll, as a real roll does', () => {
    const ig = indices.filter((i) => i.family === 'CDX.NA.IG').sort((a, b) => b.series - a.series);
    const current = new Set(ig[0]?.constituentIssuerIds ?? []);
    const previous = ig[1]?.constituentIssuerIds ?? [];
    const changed = previous.filter((id) => !current.has(id));
    expect(changed.length).toBeGreaterThan(0);
    expect(changed.length).toBeLessThan(previous.length / 2);
  });

  it('puts CDX.HY and Crossover on a 500 coupon quoted in price', () => {
    for (const index of indices) {
      const definition = INDEX_DEFINITIONS.find((d) => d.family === index.family);
      expect(index.couponBp).toBe(definition?.couponBp);
      expect(index.quotesInPrice).toBe(definition?.quotesInPrice);
    }
    expect(indices.find((i) => i.family === 'CDX.NA.HY')?.quotesInPrice).toBe(true);
    expect(indices.find((i) => i.family === 'CDX.NA.IG')?.quotesInPrice).toBe(false);
  });

  it('computes the intrinsic spread from its constituents', () => {
    const index = indices.find((i) => i.family === 'CDX.NA.IG' && i.onTheRun);
    if (index === undefined) throw new Error('no index');
    const spreads = new Map(index.constituentIssuerIds.map((id, i) => [id, 80 + i]));
    const expected = [...spreads.values()].reduce((a, b) => a + b, 0) / spreads.size;
    expect(intrinsicSpreadBp(index, spreads)).toBeCloseTo(expected, 8);
    expect(intrinsicSpreadBp(index, new Map())).toBe(0);
  });

  it('drops the index factor as constituents default', () => {
    expect(indexFactorAfterDefaults(125, 0)).toBe(1);
    expect(indexFactorAfterDefaults(125, 1)).toBeCloseTo(124 / 125, 10);
    expect(indexFactorAfterDefaults(0, 0)).toBe(0);
  });

  it('matures five years after its roll', () => {
    for (const index of indices) {
      expect(isImmDate(index.maturity)).toBe(true);
      expect(index.maturity).toBe(index.rollDate + 50000);
    }
  });
});
