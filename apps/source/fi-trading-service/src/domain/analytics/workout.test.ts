
import { describe, expect, it } from 'vitest';

import { addYears } from '../core/dateInt.js';
import { SifmaCalendar } from '../core/sifmaCalendar.js';
import { cleanPriceFromYield, type BondTerms } from './pricing.js';
import { buildSchedule } from './schedule.js';
import { priceToWorkout, stepDownCallSchedule, yieldToWorst, type RedemptionOption } from './workout.js';

const calendar = new SifmaCalendar();
const SETTLE = 20260115;

/** A 5% twenty-year, the shape a new muni issue actually takes. */
function muni(): BondTerms {
  return {
    schedule: buildSchedule({ effective: 20260115, maturity: 20460115, frequency: 2, calendar }),
    couponRate: 5,
    frequency: 2,
    redemption: 100,
    dayCount: '30/360',
  };
}

const PAR_CALL: RedemptionOption = { date: 20360115, price: 100, type: 'Call' };

describe('the 5% premium muni convention', () => {
  it('prices well above par when offered to a ten-year par call', () => {
    // The muni market issues long maturities at a 5% coupon priced to the
    // ten-year call, so the book trades at 108-125 rather than near par.
    const price = priceToWorkout(muni(), SETTLE, 3.6, PAR_CALL);
    expect(price).toBeCloseTo(111.67, 1);
    expect(price).toBeGreaterThan(108);
  });

  it('yields much less to the call than to maturity', () => {
    const price = priceToWorkout(muni(), SETTLE, 3.6, PAR_CALL);
    const result = yieldToWorst(muni(), SETTLE, price, [PAR_CALL]);
    expect(result.yieldToWorst).toBeCloseTo(3.6, 6);
    expect(result.workoutType).toBe('Call');
    expect(result.workoutDate).toBe(20360115);
    expect(result.workoutPrice).toBe(100);
    // The premium amortises over a longer horizon, so YTM is materially higher.
    expect(result.yieldToMaturity).toBeGreaterThan(result.yieldToWorst + 0.4);
    expect(result.yieldToMaturity).toBeCloseTo(4.18, 1);
  });

  it('works out to maturity for a discount bond', () => {
    const result = yieldToWorst(muni(), SETTLE, 88, [PAR_CALL]);
    expect(result.workoutType).toBe('Maturity');
    expect(result.yieldToWorst).toBeCloseTo(result.yieldToMaturity, 10);
  });
});

describe('yieldToWorst', () => {
  it('takes the lowest yield across every candidate', () => {
    const calls: RedemptionOption[] = [
      { date: 20310115, price: 102, type: 'Call' },
      { date: 20360115, price: 100, type: 'Call' },
    ];
    const result = yieldToWorst(muni(), SETTLE, 115, calls);
    const yields = result.candidates.map((c) => c.yield);
    expect(result.yieldToWorst).toBe(Math.min(...yields));
    expect(result.candidates).toHaveLength(3);
  });

  it('excludes make-whole calls, which are never the worst outcome', () => {
    const withMakeWhole: RedemptionOption[] = [
      { date: 20310115, price: 100, type: 'Call', makeWhole: true },
      PAR_CALL,
    ];
    const result = yieldToWorst(muni(), SETTLE, 112, withMakeWhole);
    expect(result.candidates.some((c) => c.date === 20310115)).toBe(false);
    expect(result.candidates).toHaveLength(2);
  });

  it('ignores candidates outside the bond life', () => {
    const result = yieldToWorst(muni(), SETTLE, 112, [
      { date: 20250115, price: 100, type: 'Call' },
      { date: 20500115, price: 100, type: 'Call' },
    ]);
    expect(result.candidates).toHaveLength(1);
    expect(result.workoutType).toBe('Maturity');
  });

  it('falls back to maturity when there are no options at all', () => {
    const result = yieldToWorst(muni(), SETTLE, 100);
    expect(result.workoutType).toBe('Maturity');
    expect(result.yieldToWorst).toBeCloseTo(result.yieldToMaturity, 12);
  });

  it('handles a put, which works out in the holder favour', () => {
    const result = yieldToWorst(muni(), SETTLE, 112, [
      { date: 20360115, price: 100, type: 'Put' },
    ]);
    expect(result.workoutType).toBe('Put');
  });
});

describe('stepDownCallSchedule', () => {
  it('starts above par and steps down to it, the high-yield convention', () => {
    const schedule = stepDownCallSchedule(20310115, 6, 3, addYears);
    expect(schedule).toHaveLength(3);
    expect(schedule[0]?.price).toBeCloseTo(103, 6);
    expect(schedule[1]?.price).toBeCloseTo(102, 6);
    expect(schedule[2]?.price).toBeCloseTo(101, 6);
    expect(schedule.map((s) => s.date)).toEqual([20310115, 20320115, 20330115]);
  });

  it('makes a callable bond yield less than an identical bullet at a premium', () => {
    const calls = stepDownCallSchedule(20310115, 5, 3, addYears);
    const price = 110;
    const callable = yieldToWorst(muni(), SETTLE, price, calls);
    const bullet = yieldToWorst(muni(), SETTLE, price);
    expect(callable.yieldToWorst).toBeLessThan(bullet.yieldToWorst);
  });
});

describe('priceToWorkout', () => {
  it('is the inverse of yielding to that workout', () => {
    const price = priceToWorkout(muni(), SETTLE, 3.6, PAR_CALL);
    const back = yieldToWorst(muni(), SETTLE, price, [PAR_CALL]);
    expect(back.yieldToWorst).toBeCloseTo(3.6, 8);
  });

  it('agrees with maturity pricing when the workout IS maturity', () => {
    const toMaturity = cleanPriceFromYield(muni(), SETTLE, 4.5);
    const viaWorkout = priceToWorkout(muni(), SETTLE, 4.5, {
      date: 20460115, price: 100, type: 'Maturity',
    });
    expect(viaWorkout).toBeCloseTo(toMaturity, 8);
  });
});
