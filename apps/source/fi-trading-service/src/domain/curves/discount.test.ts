
import { describe, expect, it } from 'vitest';

import { flatDiscountCurve, nssDiscountCurve } from './discount.js';
import { nssZero } from './nss.js';

const SEED = { b0: 4.95, b1: -0.85, b2: -1.6, b3: 1.4 };

describe('nssDiscountCurve', () => {
  const curve = nssDiscountCurve(SEED);

  it('exposes the underlying zero curve', () => {
    expect(curve.zeroRate(10)).toBeCloseTo(nssZero(SEED, 10), 12);
  });

  it('discounts consistently with its own zero rates', () => {
    for (const tau of [0.5, 2, 10, 30]) {
      expect(curve.df(tau)).toBeCloseTo(Math.exp((-curve.zeroRate(tau) / 100) * tau), 14);
    }
  });

  it('is 1 at the front and strictly decreasing', () => {
    expect(curve.df(0)).toBe(1);
    expect(curve.df(-1)).toBe(1);
    let previous = 1;
    for (let tau = 0.25; tau <= 30; tau += 0.25) {
      const df = curve.df(tau);
      expect(df).toBeLessThan(previous);
      previous = df;
    }
  });

  it('adds a z-spread as a parallel shift', () => {
    const wide = nssDiscountCurve(SEED, 0.5);
    expect(wide.zeroRate(7) - curve.zeroRate(7)).toBeCloseTo(0.5, 12);
    expect(wide.df(7)).toBeLessThan(curve.df(7));
  });

  it('recovers the zero rate as the forward over a span starting at zero', () => {
    expect(curve.forwardRate(0, 5)).toBeCloseTo(curve.zeroRate(5), 12);
    expect(curve.forwardRate(5, 5)).toBeCloseTo(curve.zeroRate(5), 12);
  });

  it('prices forwards above spot on an upward-sloping curve', () => {
    expect(curve.forwardRate(5, 10)).toBeGreaterThan(curve.zeroRate(10));
  });

  it('prices a par bond back to par, which is what par yield means', () => {
    const frequency = 2;
    for (const tau of [2, 5, 10, 30]) {
      const coupon = curve.parYield(tau, frequency);
      const periods = tau * frequency;
      let value = 0;
      for (let i = 1; i <= periods; i++) value += (coupon / frequency) * curve.df(i / frequency);
      value += 100 * curve.df(tau);
      expect(value).toBeCloseTo(100, 8);
    }
  });

  it('handles degenerate par-yield inputs without dividing by zero', () => {
    expect(Number.isFinite(curve.parYield(0, 2))).toBe(true);
    expect(Number.isFinite(curve.parYield(5, 0))).toBe(true);
  });
});

describe('flatDiscountCurve', () => {
  it('gives the same rate at every tenor', () => {
    const curve = flatDiscountCurve(4.5);
    for (const tau of [0.25, 5, 30]) expect(curve.zeroRate(tau)).toBeCloseTo(4.5, 12);
    expect(curve.df(10)).toBeCloseTo(Math.exp(-0.045 * 10), 14);
  });

  it('has a par yield close to its flat rate', () => {
    expect(flatDiscountCurve(4.5).parYield(10, 2)).toBeCloseTo(4.55, 1);
  });
});
