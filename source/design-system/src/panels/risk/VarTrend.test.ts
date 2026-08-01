import { describe, expect, it } from 'vitest';
import { latestVarFromSeries } from './VarTrend';

describe('VarTrend helpers', () => {
  it('returns zero when the series is empty', () => {
    expect(latestVarFromSeries([])).toBe(0);
  });

  it('returns the last VaR point when present', () => {
    expect(latestVarFromSeries([{ day: 'D1', var: -150_000 }])).toBe(-150_000);
  });
});
