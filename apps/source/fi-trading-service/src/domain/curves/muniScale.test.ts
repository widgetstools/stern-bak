
import { describe, expect, it } from 'vitest';

import { createNormalDraw, createRng } from '../core/rng.js';
import {
  deMinimisThreshold, deMinimisYieldPenalty, evolveMuniRatio, MMD_KNOTS, MMD_MOVE_THRESHOLD,
  MMD_PASSTHROUGH, mmdYield, muniRatio, publishMmdScale, seedMuniRatio,
  taxableEquivalentYield,
} from './muniScale.js';

describe('muniRatio', () => {
  const seed = seedMuniRatio();

  it('reproduces the ratio curve the model targets', () => {
    expect(muniRatio(seed, 2)).toBeCloseTo(0.5921, 4);
    expect(muniRatio(seed, 5)).toBeCloseTo(0.647, 4);
    expect(muniRatio(seed, 10)).toBeCloseTo(0.7205, 4);
    expect(muniRatio(seed, 30)).toBeCloseTo(0.8744, 4);
  });

  it('rises monotonically out the curve, as muni ratios do', () => {
    let previous = 0;
    for (const tau of MMD_KNOTS) {
      const ratio = muniRatio(seed, tau);
      expect(ratio).toBeGreaterThan(previous);
      previous = ratio;
    }
  });

  it('evolves both parameters and reverts them', () => {
    const draw = createNormalDraw(createRng(101));
    let state = { a: 0.9, b: 0.9 };
    for (let day = 0; day < 252 * 10; day++) {
      state = evolveMuniRatio(state, 1 / 252, draw(), draw());
    }
    expect(state.a).toBeGreaterThan(0.2);
    expect(state.a).toBeLessThan(0.9);
  });
});

describe('publishMmdScale', () => {
  const ratio = seedMuniRatio();
  const treasuries = MMD_KNOTS.map((tau) => 4 + tau * 0.02);

  it('takes the model value on the first publication', () => {
    const scale = publishMmdScale(null, treasuries, ratio);
    for (let i = 0; i < MMD_KNOTS.length; i++) {
      const expected = (treasuries[i] as number) * muniRatio(ratio, MMD_KNOTS[i] as number);
      expect(scale[i]).toBeCloseTo(Math.round(expected * 100) / 100, 10);
    }
  });

  it('lags a move rather than tracking it, and rounds to the basis point', () => {
    const first = publishMmdScale(null, treasuries, ratio);
    const shocked = treasuries.map((y) => y + 1);
    const second = publishMmdScale(first, shocked, ratio);
    const modelMove = muniRatio(ratio, MMD_KNOTS[5] as number) * 1;
    const published = (second[5] as number) - (first[5] as number);
    expect(published).toBeLessThan(modelMove);
    // Within a basis point: the published scale is deliberately rounded, so
    // it cannot track the lagged value more finely than that.
    expect(Math.abs(published - MMD_PASSTHROUGH * modelMove)).toBeLessThan(0.01);
    expect(Math.round((second[5] as number) * 100)).toBeCloseTo((second[5] as number) * 100, 6);
  });

  it('stands still when the indicated move is under the threshold', () => {
    // A tiny Treasury move should not move a poll published in whole bp.
    const first = publishMmdScale(null, treasuries, ratio);
    const nudged = treasuries.map((y) => y + 0.005);
    const second = publishMmdScale(first, nudged, ratio);
    expect([...second]).toEqual([...first]);
  });

  it('leaves a given tenor unchanged on about half of days', () => {
    // This is the point of the lag-and-round filter: MMD is a poll published
    // in whole basis points, not a mirror of the Treasury curve. Under a
    // typical 6 bp/day Treasury move the 10-year scale holds still on
    // roughly half of sessions, which is what makes the muni book tick far
    // less often than the rates book.
    const draw = createNormalDraw(createRng(102));
    let scale = publishMmdScale(null, treasuries, ratio);
    let tenYearUnchanged = 0;
    const days = 5000;
    for (let day = 0; day < days; day++) {
      const moved = treasuries.map((y) => y + 0.06 * draw());
      const next = publishMmdScale(scale, moved, ratio);
      if (next[5] === scale[5]) tenYearUnchanged += 1;
      scale = next;
    }
    expect(tenYearUnchanged / days).toBeGreaterThan(0.4);
    expect(tenYearUnchanged / days).toBeLessThan(0.7);
  });

  it('is stickier at the front of the curve, where the ratio is lower', () => {
    const draw = createNormalDraw(createRng(103));
    let scale = publishMmdScale(null, treasuries, ratio);
    let front = 0;
    let back = 0;
    const days = 3000;
    for (let day = 0; day < days; day++) {
      const moved = treasuries.map((y) => y + 0.06 * draw());
      const next = publishMmdScale(scale, moved, ratio);
      if (next[0] === scale[0]) front += 1;
      if (next[MMD_KNOTS.length - 1] === scale[MMD_KNOTS.length - 1]) back += 1;
      scale = next;
    }
    expect(front).toBeGreaterThan(back);
  });

  it('respects the configured move threshold', () => {
    expect(MMD_MOVE_THRESHOLD).toBeCloseTo(0.02, 10);
  });
});

describe('mmdYield', () => {
  const scale = Float64Array.from(MMD_KNOTS.map((tau) => 2 + tau * 0.05));

  it('returns the knot value at a knot', () => {
    expect(mmdYield(scale, 10)).toBeCloseTo(2.5, 10);
  });

  it('interpolates between knots', () => {
    expect(mmdYield(scale, 12.5)).toBeCloseTo((2.5 + 2.75) / 2, 10);
  });

  it('holds flat outside the published range', () => {
    expect(mmdYield(scale, 0.1)).toBe(scale[0]);
    expect(mmdYield(scale, 50)).toBe(scale[scale.length - 1]);
  });
});

describe('de minimis', () => {
  it('sets the threshold a quarter point per year below par', () => {
    expect(deMinimisThreshold(10)).toBeCloseTo(97.5, 10);
    expect(deMinimisThreshold(4)).toBeCloseTo(99, 10);
  });

  it('charges nothing at or above the threshold', () => {
    expect(deMinimisYieldPenalty(97.5, 10, 7.8)).toBe(0);
    expect(deMinimisYieldPenalty(99.2, 10, 7.8)).toBe(0);
  });

  it('jumps discontinuously once the line is crossed', () => {
    const above = deMinimisYieldPenalty(97.6, 10, 7.8);
    const below = deMinimisYieldPenalty(97.0, 10, 7.8);
    expect(above).toBe(0);
    expect(below).toBeGreaterThan(0.05);
    expect(below).toBeCloseTo(0.067, 2);
  });

  it('steepens as the discount deepens', () => {
    expect(deMinimisYieldPenalty(92, 10, 7.8)).toBeGreaterThan(
      deMinimisYieldPenalty(97, 10, 7.8) * 2,
    );
    expect(deMinimisYieldPenalty(92, 10, 7.8)).toBeCloseTo(0.188, 2);
  });

  it('guards degenerate inputs', () => {
    expect(deMinimisYieldPenalty(90, 10, 0)).toBe(0);
    expect(deMinimisYieldPenalty(0, 10, 7.8)).toBe(0);
  });

  it('grosses a tax-exempt yield up to its taxable equivalent', () => {
    expect(taxableEquivalentYield(3)).toBeCloseTo(3 / (1 - 0.408), 10);
    expect(taxableEquivalentYield(3, 0.35)).toBeCloseTo(3 / 0.65, 10);
  });
});
