import { describe, expect, it } from 'vitest';
import { inferDensityForTest, resolveDensityForTest } from './GridDensityPill';

describe('grid density helpers', () => {
  it('infers preset from row and header heights', () => {
    expect(inferDensityForTest(22, 26)).toBe('ultra');
    expect(inferDensityForTest(30, 32)).toBe('compact');
    expect(inferDensityForTest(40, 42)).toBe('comfort');
  });

  it('prefers explicit gridDensity over height inference', () => {
    expect(resolveDensityForTest({ gridDensity: 'ultra', rowHeight: 30, headerHeight: 32 })).toBe('ultra');
  });
});
