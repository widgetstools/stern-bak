/**
 * Yield to worst, and the workout date it implies.
 *
 * A premium callable bond is quoted to its call, not its maturity, and the
 * gap is not small: a 5% muni priced to a ten-year par call yields 3.60 to the
 * call and about 4.18 to maturity, because the premium amortises away over
 * the shorter horizon. Publishing only yield-to-maturity for such a bond is
 * one of the plainest tells that a dataset was not built by anyone who prices
 * munis.
 *
 * The rule respects the difference between a par call and a make-whole call.
 * A make-whole is priced at a spread over Treasuries and is essentially never
 * the worst outcome, so it is excluded from the search rather than being
 * allowed to produce a nonsense workout.
 */

import type { DateInt } from '../core/dateInt.js';
import { cleanPriceFromYield, yieldFromCleanPrice, type BondTerms, type YieldConvention } from './pricing.js';

export type WorkoutType = 'Maturity' | 'Call' | 'Put' | 'Sink';

export interface RedemptionOption {
  date: DateInt;
  /** Redemption price per 100 of face. */
  price: number;
  type: WorkoutType;
  /**
   * Make-whole calls are priced at a spread to Treasuries rather than a fixed
   * price, so they are excluded from the worst-case search.
   */
  makeWhole?: boolean;
}

export interface WorkoutResult {
  yieldToWorst: number;
  yieldToMaturity: number;
  workoutDate: DateInt;
  workoutPrice: number;
  workoutType: WorkoutType;
  /** Yield to each candidate, in the order supplied, maturity last. */
  candidates: { date: DateInt; price: number; type: WorkoutType; yield: number }[];
}

export interface WorkoutOptions {
  convention?: YieldConvention;
  guess?: number;
}

/**
 * Yield to every redemption candidate, and the worst of them.
 *
 * "Worst" means lowest yield: it is the outcome the investor least wants, and
 * for a discount bond it is normally maturity while for a premium bond it is
 * normally the first call.
 */
export function yieldToWorst(
  terms: BondTerms,
  settle: DateInt,
  cleanPrice: number,
  redemptions: readonly RedemptionOption[] = [],
  options: WorkoutOptions = {},
): WorkoutResult {
  const maturity = terms.schedule[terms.schedule.length - 1]?.accrualEnd ?? settle;
  const maturityYield = yieldFromCleanPrice(terms, settle, cleanPrice, options);

  const candidates: WorkoutResult['candidates'] = [];
  for (const option of redemptions) {
    if (option.makeWhole === true) continue;
    if (option.date <= settle || option.date >= maturity) continue;
    candidates.push({
      date: option.date,
      price: option.price,
      type: option.type,
      yield: yieldFromCleanPrice(terms, settle, cleanPrice, {
        ...options,
        redeemOn: option.date,
        redeemAt: option.price,
      }),
    });
  }
  candidates.push({
    date: maturity,
    price: (terms.redemption / (terms.face ?? 100)) * 100,
    type: 'Maturity',
    yield: maturityYield,
  });

  let worst = candidates[candidates.length - 1] as WorkoutResult['candidates'][number];
  for (const candidate of candidates) {
    if (candidate.yield < worst.yield) worst = candidate;
  }

  return {
    yieldToWorst: worst.yield,
    yieldToMaturity: maturityYield,
    workoutDate: worst.date,
    workoutPrice: worst.price,
    workoutType: worst.type,
    candidates,
  };
}

/** Price a bond to a given workout, which is how a new issue is offered. */
export function priceToWorkout(
  terms: BondTerms,
  settle: DateInt,
  yieldPct: number,
  workout: RedemptionOption,
  options: WorkoutOptions = {},
): number {
  return cleanPriceFromYield(terms, settle, yieldPct, {
    ...options,
    redeemOn: workout.date,
    redeemAt: workout.price,
  });
}

/**
 * The standard high-yield call schedule: non-call for a few years, then
 * stepping down to par. A 5-year non-call-2 at a 6% coupon typically starts
 * at par plus half the coupon.
 */
export function stepDownCallSchedule(
  firstCallDate: DateInt,
  couponRate: number,
  steps: number,
  addYears: (date: DateInt, years: number) => DateInt,
): RedemptionOption[] {
  const options: RedemptionOption[] = [];
  for (let i = 0; i < steps; i++) {
    const premium = (couponRate / 2) * (1 - i / steps);
    options.push({
      date: addYears(firstCallDate, i),
      price: Number((100 + premium).toFixed(3)),
      type: 'Call',
    });
  }
  return options;
}
