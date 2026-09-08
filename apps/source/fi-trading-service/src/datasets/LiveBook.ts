/**
 * The live position book, served from the factor model.
 *
 * This replaces the phase-1 `SyntheticBook` stand-in. Every field is computed
 * from the domain layer rather than sampled from a plausible-looking range, so
 * the blotter shows a book whose numbers agree with each other: the yield
 * reprices to the price, the key rate durations sum to the effective duration,
 * and the unrealised P&L is the market value against a real amortised basis.
 *
 * Two things make this behave like a market rather than a random walk.
 *
 * **The session clock.** The factor engine advances one business DAY at a
 * time, and its draws come from `(seed, date)` so any day recomputes on its
 * own. A live feed needs sub-daily motion, so a tick walks a Brownian bridge
 * from the previous close to the day's close (`bridgeBetas`). The path is
 * stochastic but both endpoints are pinned, which means the intraday feed
 * converges exactly on the close the daily model produced — the property that
 * lets a scenario fork off the live state and still agree with the corpus.
 *
 * **Quote arrival.** The factors move continuously, but a price is only
 * OBSERVED when someone quotes it, and an off-the-run muni is not quoted as
 * often as a 10-year note. So every position is repriced on every tick and
 * only a liquidity-weighted subset is published. The probability comes from
 * the position's own bid-ask, which is already derived from its liquidity
 * tier, so the tightest markets update on nearly every tick and the widest go
 * quiet for seconds at a time. Nothing is tabulated twice.
 */

import { addDays, type DateInt } from '../domain/core/dateInt.js';
import { createRng, createNormalDraw, type Rng } from '../domain/core/rng.js';
import type { Calendar } from '../domain/core/sifmaCalendar.js';
import { SifmaCalendar } from '../domain/core/sifmaCalendar.js';
import { bridgeBetas, type FactorEngine, type FactorState } from '../domain/curves/factorEngine.js';
import { betaDailySigma } from '../domain/curves/rateFactors.js';
import {
  buildBook, DEMO_SCALE, scaleBook, type BookScale, type BuiltBook, type RiskVector,
} from '../domain/book/bookBuilder.js';
import type { PositionRow } from '../domain/book/positions.js';
import type { Security } from '../domain/instruments/types.js';
import type { DatasetId } from '../wire/destinations.js';
import type { RowSource } from './RowSource.js';

export interface LiveBookOptions {
  asOf?: DateInt;
  seed?: number;
  scale?: BookScale;
  /** Multiplier applied to `scale`. 1 is roughly 1,700 positions. */
  scaleMultiplier?: number;
  calendar?: Calendar;
  dataset?: DatasetId;
  /** Ticks per session. The default walks a day in about a minute at 100 ms. */
  ticksPerSession?: number;
}

/** Beta sigmas, in the order `bridgeBetas` indexes them. */
const BETA_SIGMAS = [0, 1, 2, 3].map((i) => betaDailySigma(i));

/**
 * How often a position is quoted, from how wide it trades.
 *
 * A half-spread of half a 32nd (an on-the-run note) quotes on essentially
 * every tick; a third of a point (a distressed high-yield bond) quotes on
 * roughly one tick in six. The floor keeps even the illiquid tail alive.
 */
function quoteProbability(halfSpreadPoints: number): number {
  return Math.min(0.92, Math.max(0.04, 0.055 / Math.max(0.01, halfSpreadPoints)));
}

export class LiveBook implements RowSource {
  readonly dataset: DatasetId;
  readonly keyColumn = 'positionId';

  private readonly book: BuiltBook;
  private readonly calendar: Calendar;
  private readonly quoteOdds: Float64Array;
  private readonly dirty = new Set<number>();
  private readonly ticksPerSession: number;

  /** The close the session is walking toward, and the one it left. */
  private openState: FactorState;
  private closeState: FactorState;
  private tickInSession = 0;
  private tickSeq = 0;

  constructor(options: LiveBookOptions = {}) {
    this.dataset = options.dataset ?? 'positions';
    this.calendar = options.calendar ?? new SifmaCalendar();
    this.ticksPerSession = Math.max(2, options.ticksPerSession ?? 600);

    const asOf = options.asOf ?? 20260907;
    this.book = buildBook({
      asOf,
      calendar: this.calendar,
      seed: options.seed ?? 20260907,
      scale: scaleBook(options.scale ?? DEMO_SCALE, options.scaleMultiplier ?? 1),
    });

    this.openState = this.book.state;
    this.closeState = this.book.step(this.nextSession(asOf));
    this.quoteOdds = Float64Array.from(
      this.book.riskVectors.map((vector) => quoteProbability(vector.halfSpreadPoints)),
    );
  }

  private nextSession(from: DateInt): DateInt {
    let cursor = addDays(from, 1);
    while (!this.calendar.isBusinessDay(cursor)) cursor = addDays(cursor, 1);
    return cursor;
  }

  size(): number {
    return this.book.positions.length;
  }

  pendingLive(): number {
    return this.dirty.size;
  }

  /** The factor state the book is currently priced at. Scenarios fork from here. */
  factorState(): FactorState {
    return this.closeState;
  }

  positions(): readonly PositionRow[] {
    return this.book.positions;
  }

  /** The per-position sensitivities a scenario scan runs against. */
  riskVectors(): readonly RiskVector[] {
    return this.book.riskVectors;
  }

  /** The factor model itself, for forking counterfactual worlds off it. */
  engine(): FactorEngine {
    return this.book.engine;
  }

  /** The security master — the hedge universe is drawn from it, not from holdings. */
  securities(): readonly Security[] {
    return this.book.securities;
  }

  /** Current spread for any security in the master, in basis points. */
  spreadFor = (security: Security): number => this.book.spreadFor(security);

  /** The date the book was built and priced at. */
  asOf(): DateInt {
    return this.book.asOf;
  }

  async *snapshot(batchSize: number): AsyncIterable<readonly PositionRow[]> {
    const rows = this.book.positions;
    for (let i = 0; i < rows.length; i += batchSize) {
      yield rows.slice(i, i + batchSize);
    }
  }

  drainLive(max: number): readonly PositionRow[] {
    if (max <= 0 || this.dirty.size === 0) return [];
    const out: PositionRow[] = [];
    for (const index of this.dirty) {
      out.push(this.book.positions[index] as PositionRow);
      this.dirty.delete(index);
      if (out.length >= max) break;
    }
    return out;
  }

  /**
   * Advance the session by one tick and publish what got quoted.
   *
   * Returns the number of rows marked dirty, capped at `max`. The whole book
   * is revalued either way — repricing is the cheap part, and skipping it
   * would let unquoted positions drift away from the factor state.
   */
  tick(max: number): number {
    if (max <= 0 || this.book.positions.length === 0) return 0;

    this.tickInSession += 1;
    if (this.tickInSession >= this.ticksPerSession) {
      // Land exactly on the close, then open the next session from it.
      this.book.repriceFast(this.closeState);
      this.openState = this.closeState;
      this.closeState = this.book.step(this.nextSession(this.closeState.asOf));
      this.tickInSession = 0;
    } else {
      const fraction = this.tickInSession / this.ticksPerSession;
      const rng: Rng = createRng(0x9e3779b1 ^ (this.tickSeq += 1));
      const betas = bridgeBetas(
        this.openState.betas,
        this.closeState.betas,
        fraction,
        BETA_SIGMAS,
        createNormalDraw(rng),
      );
      // Credit follows the same bridge, without its own noise: single-name
      // spread jumps are day-scale events and inventing intraday ones would
      // put moves in the feed that no scenario replay could reproduce.
      const systematic =
        this.openState.credit.systematic +
        (this.closeState.credit.systematic - this.openState.credit.systematic) * fraction;
      this.book.repriceFast({
        ...this.closeState,
        betas,
        credit: { ...this.closeState.credit, systematic },
      });
    }

    const rng = createRng(0x85ebca6b ^ this.tickSeq);
    let quoted = 0;
    for (let i = 0; i < this.quoteOdds.length && quoted < max; i++) {
      if (rng() < (this.quoteOdds[i] as number)) {
        this.dirty.add(i);
        quoted += 1;
      }
    }
    return quoted;
  }

  /** Every row, for the sentinel-collision test. */
  allRows(): readonly PositionRow[] {
    return this.book.positions;
  }
}
