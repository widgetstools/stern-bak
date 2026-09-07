
import { describe, expect, it } from 'vitest';

import { createNormalDraw, createRng } from '../core/rng.js';
import {
  ANNUAL_TRANSITION, bucketForAsset, DEFAULT_INDEX, GENERATOR, isDefault, isFallenAngel,
  isInvestmentGrade, matMul, matrixExp, matrixLog, MERTON_ASSET_CORRELATION,
  migrationSpreadShock, migrationThresholds, RATING_BUCKETS, regularizeGenerator,
  stepMigrations, transitionMatrix,
} from './ratingMigration.js';

const N = RATING_BUCKETS.length;

describe('the transition matrix itself', () => {
  it('is a stochastic matrix with an absorbing default state', () => {
    for (const row of ANNUAL_TRANSITION) {
      expect(row.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
      expect(row.every((p) => p >= 0)).toBe(true);
    }
    expect(ANNUAL_TRANSITION[DEFAULT_INDEX]?.[DEFAULT_INDEX]).toBe(1);
  });

  it('is strongly diagonal, as ratings are sticky', () => {
    for (let i = 0; i < N - 1; i++) {
      expect(ANNUAL_TRANSITION[i]?.[i] as number).toBeGreaterThan(0.6);
    }
  });

  it('makes default overwhelmingly a low-rated event', () => {
    const aaaDefault = ANNUAL_TRANSITION[0]?.[DEFAULT_INDEX] as number;
    const cccDefault = ANNUAL_TRANSITION[6]?.[DEFAULT_INDEX] as number;
    expect(cccDefault).toBeGreaterThan(0.15);
    expect(aaaDefault).toBeLessThan(0.001);
  });

  it('classifies investment grade at the BBB boundary', () => {
    expect(isInvestmentGrade(3)).toBe(true);
    expect(isInvestmentGrade(4)).toBe(false);
  });
});

describe('the generator', () => {
  it('has rows summing to zero, as an intensity matrix must', () => {
    for (const row of GENERATOR) {
      expect(row.reduce((a, b) => a + b, 0)).toBeCloseTo(0, 9);
    }
  });

  it('has no negative off-diagonal intensities after regularisation', () => {
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        if (i === j) continue;
        expect((GENERATOR[i] as readonly number[])[j] as number).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('rebalances what it clamps, rather than discarding it', () => {
    const raw = [
      [-0.5, 0.6, -0.1],
      [0.2, -0.2, 0],
      [0, 0, 0],
    ];
    const fixed = regularizeGenerator(raw);
    expect((fixed[0] as number[])[2]).toBe(0);
    expect((fixed[0] as number[])[0]).toBeCloseTo(-0.6, 12);
    expect((fixed[0] as number[]).reduce((a, b) => a + b, 0)).toBeCloseTo(0, 12);
  });

  it('exponentiates back to the annual matrix it came from', () => {
    const recovered = transitionMatrix(1);
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        expect((recovered[i] as number[])[j] as number).toBeCloseTo(
          (ANNUAL_TRANSITION[i] as readonly number[])[j] as number,
          4,
        );
      }
    }
  });

  it('compounds a daily step back into the annual matrix', () => {
    // This is the point of using a generator instead of scaling the annual
    // probabilities: transitions compound, they do not add.
    const daily = transitionMatrix(1 / 252);
    let compounded = daily;
    for (let day = 1; day < 252; day++) compounded = matMul(compounded, daily);
    let worst = 0;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        worst = Math.max(
          worst,
          Math.abs(
            ((compounded[i] as number[])[j] as number) -
              ((ANNUAL_TRANSITION[i] as readonly number[])[j] as number),
          ),
        );
      }
    }
    expect(worst).toBeLessThan(1e-4);
  });

  it('produces a valid stochastic matrix at any horizon', () => {
    for (const years of [1 / 252, 1 / 12, 0.5, 1, 5]) {
      for (const row of transitionMatrix(years)) {
        expect(row.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 8);
        expect(row.every((p) => p >= -1e-12)).toBe(true);
      }
    }
  });

  it('log and exp invert each other', () => {
    const round = matrixExp(matrixLog(ANNUAL_TRANSITION));
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        expect((round[i] as number[])[j] as number).toBeCloseTo(
          (ANNUAL_TRANSITION[i] as readonly number[])[j] as number,
          6,
        );
      }
    }
  });
});

describe('thresholds', () => {
  const thresholds = migrationThresholds(transitionMatrix(1));

  it('orders states so default sits in the far left tail', () => {
    const bbb = thresholds[3] as number[];
    expect(bbb[DEFAULT_INDEX] as number).toBeLessThan(-2.5);
    for (let j = DEFAULT_INDEX; j > 0; j--) {
      expect(bbb[j - 1] as number).toBeGreaterThan(bbb[j] as number);
    }
    expect(bbb[0] as number).toBe(Infinity);
  });

  it('maps an asset value back to the state it implies', () => {
    const bbb = thresholds[3] as number[];
    expect(bucketForAsset(-5, bbb)).toBe(DEFAULT_INDEX);
    expect(bucketForAsset(0, bbb)).toBe(3);
    expect(bucketForAsset(5, bbb)).toBe(0);
  });

  it('recovers the row probabilities it was built from', () => {
    // Sampling standard normals through the thresholds must reproduce the
    // transition row, or the marginal migration rates would be wrong.
    const draw = createNormalDraw(createRng(201));
    const counts = new Array<number>(N).fill(0);
    const trials = 400_000;
    for (let i = 0; i < trials; i++) {
      const bucket = bucketForAsset(draw(), thresholds[4] as number[]);
      counts[bucket] = (counts[bucket] ?? 0) + 1;
    }
    const row = ANNUAL_TRANSITION[4] as readonly number[];
    for (let j = 0; j < N; j++) {
      expect((counts[j] as number) / trials).toBeCloseTo(row[j] as number, 2);
    }
  });
});

describe('stepMigrations', () => {
  function population(): Uint8Array {
    // 400 investment grade across AAA-BBB, 250 high yield across BB-CCC.
    const ratings = new Uint8Array(650);
    for (let i = 0; i < 400; i++) ratings[i] = [0, 1, 2, 3, 3, 2][i % 6] as number;
    for (let i = 400; i < 650; i++) ratings[i] = [4, 5, 4, 5, 6][i % 5] as number;
    return ratings;
  }

  const daily = migrationThresholds(transitionMatrix(1 / 252));

  it('produces roughly the expected number of actions over a year', () => {
    // The market factor must be STANDARDISED for the marginal rates to come
    // out right: A = sqrt(rho)*M + sqrt(1-rho)*Z is only a standard normal
    // when M is one. That is why the engine divides the systematic credit
    // factor by its stationary standard deviation before passing it here.
    const rng = createRng(202);
    const draw = createNormalDraw(rng);
    const ratings = population();
    let actions = 0;
    for (let day = 0; day < 252; day++) {
      actions += stepMigrations({
        ratings, thresholds: daily, marketFactor: draw(), normalDraw: draw, rng,
      }).length;
    }
    // 400 investment grade at ~10%/yr plus 250 high yield at ~16%/yr.
    expect(actions).toBeGreaterThan(55);
    expect(actions).toBeLessThan(140);
  });

  it('understates migrations if the market factor is not standardised', () => {
    // Holding M at zero shrinks the asset variance to 1 - rho, pulling every
    // issuer away from its thresholds. Worth pinning: it is a silent
    // calibration error, not a crash.
    const run = (marketFactor: () => number): number => {
      const rng = createRng(206);
      const draw = createNormalDraw(rng);
      const ratings = population();
      let actions = 0;
      for (let day = 0; day < 252; day++) {
        actions += stepMigrations({
          ratings, thresholds: daily, marketFactor: marketFactor(), normalDraw: draw, rng,
        }).length;
      }
      return actions;
    };
    const standardised = createNormalDraw(createRng(207));
    expect(run(() => 0)).toBeLessThan(run(() => standardised()));
  });

  it('clusters downgrades into the weeks credit deteriorates', () => {
    // The whole reason for the Merton threshold model: independent chains
    // would scatter these uniformly through the year.
    const rng = createRng(203);
    const draw = createNormalDraw(rng);
    const count = (marketFactor: number): number => {
      const ratings = population();
      let downgrades = 0;
      for (let day = 0; day < 252; day++) {
        for (const event of stepMigrations({ ratings, thresholds: daily, marketFactor, normalDraw: draw, rng })) {
          if (event.to > event.from) downgrades += 1;
        }
      }
      return downgrades;
    };
    const stressed = count(-1.5);
    const benign = count(1.5);
    expect(stressed).toBeGreaterThan(benign * 2);
  });

  it('leaves defaulted issuers alone, because default is absorbing', () => {
    const rng = createRng(204);
    const draw = createNormalDraw(rng);
    const ratings = Uint8Array.from([DEFAULT_INDEX, DEFAULT_INDEX, 3]);
    for (let day = 0; day < 500; day++) {
      stepMigrations({ ratings, thresholds: daily, marketFactor: -3, normalDraw: draw, rng });
    }
    expect(ratings[0]).toBe(DEFAULT_INDEX);
    expect(ratings[1]).toBe(DEFAULT_INDEX);
  });

  it('reports only the issuers that actually moved', () => {
    const rng = createRng(205);
    const draw = createNormalDraw(rng);
    const ratings = population();
    const events = stepMigrations({ ratings, thresholds: daily, marketFactor: -4, normalDraw: draw, rng });
    for (const event of events) {
      expect(event.from).not.toBe(event.to);
      expect(ratings[event.issuerIndex]).toBe(event.to);
    }
  });

  it('uses an asset correlation that actually couples the issuers', () => {
    expect(MERTON_ASSET_CORRELATION).toBeGreaterThan(0);
    expect(MERTON_ASSET_CORRELATION).toBeLessThan(0.5);
  });
});

describe('event classification', () => {
  it('spots a fallen angel crossing out of investment grade', () => {
    expect(isFallenAngel({ issuerIndex: 0, from: 3, to: 4 })).toBe(true);
    expect(isFallenAngel({ issuerIndex: 0, from: 4, to: 5 })).toBe(false);
    expect(isFallenAngel({ issuerIndex: 0, from: 2, to: 3 })).toBe(false);
  });

  it('spots a default', () => {
    expect(isDefault({ issuerIndex: 0, from: 6, to: DEFAULT_INDEX })).toBe(true);
    expect(isDefault({ issuerIndex: 0, from: 6, to: 5 })).toBe(false);
  });

  it('overshoots hardest on a fallen angel, and tightens on an upgrade', () => {
    const upgrade = migrationSpreadShock({ issuerIndex: 0, from: 3, to: 2 });
    const downgrade = migrationSpreadShock({ issuerIndex: 0, from: 5, to: 6 });
    const fallenAngel = migrationSpreadShock({ issuerIndex: 0, from: 3, to: 4 });
    expect(upgrade).toBeLessThan(0);
    expect(downgrade).toBeGreaterThan(0);
    expect(fallenAngel).toBeGreaterThan(downgrade);
  });
});
