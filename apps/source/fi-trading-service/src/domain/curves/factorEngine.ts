/**
 * The factor engine: one step a day, and everything else follows.
 *
 * This is the module the plan's central claim rests on — nothing samples a
 * price. Roughly 700 stochastic numbers move here each day, and every one of
 * 70,000 securities reprices as a consequence. Two bonds of the same issuer
 * co-move because they read the same idiosyncratic factor; a CDS and its
 * reference bond co-move for the same reason, which is what makes the basis a
 * real, tradeable, mean-reverting quantity rather than noise.
 *
 * Per-day draw budget:
 *   4    correlated curve betas (plus a jump on release days)
 *   2    muni ratio intercept and slope
 *   2    mortgage current-coupon and primary/secondary spreads
 *   1    systematic credit
 *   14   sector credit
 *   N    issuer idiosyncratic credit, plus Poisson single-name jumps
 *   N    issuer asset values for rating migration
 */

import { businessDaysInRange } from '../core/businessDays.js';
import type { DateInt } from '../core/dateInt.js';
import { createNormalDraw, createRng, deriveSeed, type Rng } from '../core/rng.js';
import type { Calendar } from '../core/sifmaCalendar.js';
import {
  createCreditFactorState, evolveCreditFactors, issuerSpread5y, SYSTEMATIC_SPEC,
  type CreditFactorState,
} from './creditFactors.js';
import { nssDiscountCurve, type DiscountCurve } from './discount.js';
import { EventCalendar } from './eventCalendar.js';
import {
  evolveMortgageRates, seedMortgageRates, type MortgageRateState,
} from './mortgageRates.js';
import {
  evolveMuniRatio, MMD_KNOTS, publishMmdScale, seedMuniRatio, type MuniRatioState,
} from './muniScale.js';
import type { NssParams } from './nss.js';
import { stationarySd } from './ouProcess.js';
import {
  DEFAULT_INDEX, INVESTMENT_GRADE_MAX_INDEX, migrationThresholds, stepMigrations,
  transitionMatrix, type MigrationEvent,
} from './ratingMigration.js';
import { bridge } from './ouProcess.js';
import { DAILY_DT, evolveBetas, SEED_BETAS } from './rateFactors.js';

export interface FactorState {
  asOf: DateInt;
  betas: NssParams;
  muniRatio: MuniRatioState;
  /** Published MMD AAA scale, one entry per `MMD_KNOTS`. */
  mmdScale: Float64Array;
  mortgage: MortgageRateState;
  credit: CreditFactorState;
  /** Rating bucket index per issuer. */
  ratings: Uint8Array;
}

export interface FactorEngineOptions {
  seed: number;
  calendar: Calendar;
  /** Sector index per issuer. */
  sectorOfIssuer: Uint8Array;
  /** Starting rating bucket index per issuer. */
  initialRatings: Uint8Array;
}

export interface DayStep {
  state: FactorState;
  migrations: MigrationEvent[];
  /** True when a scheduled release produced a jump. */
  jumped: boolean;
  /** Single-name credit jumps that fired. */
  creditJumps: number;
}

export class FactorEngine {
  private readonly events: EventCalendar;
  private readonly dailyThresholds: readonly (readonly number[])[];
  private readonly systematicSd: number;

  constructor(private readonly options: FactorEngineOptions) {
    this.events = new EventCalendar(options.calendar);
    this.dailyThresholds = migrationThresholds(transitionMatrix(DAILY_DT));
    this.systematicSd = stationarySd(SYSTEMATIC_SPEC);
  }

  /** The starting state, at long-run levels. */
  seedState(asOf: DateInt): FactorState {
    const issuerCount = this.options.initialRatings.length;
    return {
      asOf,
      betas: { ...SEED_BETAS },
      muniRatio: seedMuniRatio(),
      mmdScale: new Float64Array(MMD_KNOTS.length),
      mortgage: seedMortgageRates(),
      credit: createCreditFactorState(issuerCount),
      ratings: Uint8Array.from(this.options.initialRatings),
    };
  }

  /** The Treasury discount curve implied by a state. */
  curve(state: FactorState): DiscountCurve {
    return nssDiscountCurve(state.betas);
  }

  /** Which issuers are currently below investment grade. */
  highYieldMask(state: FactorState): Uint8Array {
    const mask = new Uint8Array(state.ratings.length);
    for (let i = 0; i < state.ratings.length; i++) {
      mask[i] = (state.ratings[i] as number) > INVESTMENT_GRADE_MAX_INDEX ? 1 : 0;
    }
    return mask;
  }

  /**
   * Advance one business day.
   *
   * The random stream is derived from `(seed, date)` rather than carried
   * across calls, so a day can be recomputed on its own and eight workers
   * produce byte-identical output to one.
   */
  step(previous: FactorState, date: DateInt): DayStep {
    const rng: Rng = createRng(deriveSeed(this.options.seed, 'factors', date));
    const normalDraw = createNormalDraw(rng);
    const event = this.events.eventOn(date);
    const eventMultiplier = event === null ? 1 : event.volMultiplier;

    const rateStep = evolveBetas(previous.betas, DAILY_DT, rng, normalDraw, eventMultiplier);
    const curve = nssDiscountCurve(rateStep.betas);

    const muniRatio = evolveMuniRatio(previous.muniRatio, DAILY_DT, normalDraw(), normalDraw());
    const parYields = MMD_KNOTS.map((tau) => curve.parYield(tau, 2));
    const hadScale = previous.mmdScale.some((value) => value !== 0);
    const mmdScale = publishMmdScale(hadScale ? previous.mmdScale : null, parYields, muniRatio);

    const mortgage = evolveMortgageRates(
      previous.mortgage,
      DAILY_DT,
      normalDraw(),
      normalDraw(),
    );

    const credit = {
      systematic: previous.credit.systematic,
      sector: Float64Array.from(previous.credit.sector),
      idiosyncratic: Float64Array.from(previous.credit.idiosyncratic),
    };
    const { jumpCount } = evolveCreditFactors(credit, {
      dt: DAILY_DT,
      rng,
      normalDraw,
      isHighYield: this.highYieldMask(previous),
      eventMultiplier,
    });

    // Assets fall as spreads widen: they are the same deterioration seen from
    // two sides, which is what makes downgrades cluster in widening weeks.
    const ratings = Uint8Array.from(previous.ratings);
    const marketFactor = -credit.systematic / this.systematicSd;
    const migrations = stepMigrations({
      ratings,
      thresholds: this.dailyThresholds,
      marketFactor,
      normalDraw,
      rng,
    });

    return {
      state: { asOf: date, betas: rateStep.betas, muniRatio, mmdScale, mortgage, credit, ratings },
      migrations,
      jumped: rateStep.jumped,
      creditJumps: jumpCount,
    };
  }

  /** Run the engine across a date range, returning every daily state. */
  run(from: DateInt, to: DateInt): FactorState[] {
    const sessions = businessDaysInRange(this.options.calendar, from, to);
    const states: FactorState[] = [];
    let state = this.seedState(sessions[0] ?? from);
    for (const date of sessions) {
      state = this.step(state, date).state;
      states.push(state);
    }
    return states;
  }

  /** An issuer's 5-year spread under a state, in basis points. */
  issuerSpread(state: FactorState, issuerIndex: number, baseSpreadBp: number): number {
    const rating = state.ratings[issuerIndex] as number;
    return issuerSpread5y(
      baseSpreadBp,
      this.options.sectorOfIssuer[issuerIndex] as number,
      issuerIndex,
      rating > INVESTMENT_GRADE_MAX_INDEX,
      state.credit,
    );
  }

  /** Issuers that have defaulted. */
  defaultedIssuers(state: FactorState): number[] {
    const out: number[] = [];
    for (let i = 0; i < state.ratings.length; i++) {
      if ((state.ratings[i] as number) === DEFAULT_INDEX) out.push(i);
    }
    return out;
  }
}

/**
 * Interpolate the curve betas within a day.
 *
 * The intraday path is stochastic but pinned to both endpoints, so replaying
 * a day converges exactly on the close that was persisted. Querying the corpus
 * for an as-of date therefore agrees with what the live feed showed.
 */
export function bridgeBetas(
  open: NssParams,
  close: NssParams,
  fraction: number,
  sigmas: readonly number[],
  normalDraw: () => number,
): NssParams {
  const step = (a: number, b: number, index: number): number =>
    bridge(a, b, fraction, sigmas[index] as number, DAILY_DT, normalDraw());
  return {
    b0: step(open.b0, close.b0, 0),
    b1: step(open.b1, close.b1, 1),
    b2: step(open.b2, close.b2, 2),
    b3: step(open.b3, close.b3, 3),
  };
}
