
import { describe, expect, it } from 'vitest';

import {
  collateralMultiplier, ficoMult, GENERIC_COLLATERAL, geoMult, llbMult, ltvMult, occupancyMult,
  satoMult, STATE_MULTIPLIER,
} from './poolMultipliers.js';

describe('loan size', () => {
  it('matches the calibrated table', () => {
    expect(llbMult(85_000)).toBeCloseTo(0.4166, 4);
    expect(llbMult(110_000)).toBeCloseTo(0.4669, 4);
    expect(llbMult(175_000)).toBeCloseTo(0.64, 4);
    expect(llbMult(300_000)).toBeCloseTo(0.9154, 4);
  });

  it('makes an 85k pool prepay at about 42% of generic - the pay-up story', () => {
    expect(llbMult(85_000) / llbMult(340_000)).toBeCloseTo(0.44, 1);
  });

  it('saturates for large loans', () => {
    expect(llbMult(550_000)).toBeGreaterThan(0.99);
    expect(llbMult(2_000_000)).toBeLessThanOrEqual(1);
  });

  it('is monotone increasing in balance', () => {
    let previous = 0;
    for (let balance = 40_000; balance < 800_000; balance += 10_000) {
      const value = llbMult(balance);
      expect(value).toBeGreaterThan(previous);
      previous = value;
    }
  });
});

describe('other collateral multipliers', () => {
  it('slows a credit-impaired borrower', () => {
    expect(satoMult(0)).toBe(1);
    expect(satoMult(0.5)).toBeCloseTo(0.7596, 4);
    expect(satoMult(1)).toBeLessThan(satoMult(0.5));
  });

  it('slows New York, where the recording tax is a real closing cost', () => {
    expect(STATE_MULTIPLIER.NY).toBeLessThan(0.8);
    expect(geoMult({ NY: 1 })).toBeCloseTo(0.72, 6);
    expect(geoMult({ CA: 1 })).toBeGreaterThan(1);
    expect(geoMult({ NY: 0.5, CA: 0.5 })).toBeCloseTo((0.72 + 1.15) / 2, 6);
  });

  it('treats an unknown state as neutral and an empty mix as one', () => {
    expect(geoMult({ ZZ: 1 })).toBe(1);
    expect(geoMult({})).toBe(1);
  });

  it('steps FICO through its bands', () => {
    expect(ficoMult(650)).toBe(0.68);
    expect(ficoMult(700)).toBe(0.85);
    expect(ficoMult(740)).toBe(1);
    expect(ficoMult(790)).toBe(1.12);
  });

  it('slows investors and second homes', () => {
    expect(occupancyMult({ ownerOccupied: 1, secondHome: 0, investor: 0 })).toBe(1);
    expect(occupancyMult({ ownerOccupied: 0, secondHome: 0, investor: 1 })).toBeCloseTo(0.78, 6);
    expect(occupancyMult({ ownerOccupied: 0, secondHome: 0, investor: 0 })).toBe(1);
  });

  it('slows a borrower who cannot refinance at all at very high LTV', () => {
    expect(ltvMult(97)).toBeLessThan(ltvMult(85));
    expect(ltvMult(85)).toBeLessThan(ltvMult(70));
    expect(ltvMult(70)).toBe(1);
  });
});

describe('the combined multiplier', () => {
  it('is near one for generic collateral, by construction', () => {
    const multiplier = collateralMultiplier(GENERIC_COLLATERAL);
    expect(multiplier).toBeGreaterThan(0.8);
    expect(multiplier).toBeLessThan(1.05);
  });

  it('compounds a story into a large slowdown', () => {
    const llb = collateralMultiplier({ ...GENERIC_COLLATERAL, averageLoanSize: 85_000 });
    expect(llb).toBeLessThan(collateralMultiplier(GENERIC_COLLATERAL) * 0.5);
  });

  it('compounds several stories multiplicatively', () => {
    const both = collateralMultiplier({
      ...GENERIC_COLLATERAL, averageLoanSize: 85_000, states: { NY: 1 },
    });
    const llbOnly = collateralMultiplier({ ...GENERIC_COLLATERAL, averageLoanSize: 85_000 });
    expect(both).toBeLessThan(llbOnly * 0.8);
  });
});
