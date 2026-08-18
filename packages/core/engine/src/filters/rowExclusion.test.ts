/**
 * What a row-exclusion expression MEANS.
 *
 * These cases moved here with the evaluator itself (Phase 12). They used to
 * live beside the client-side external filter, which made them read as
 * client-side-row-model behaviour; they are not. The server-side query plane
 * compiles the same expression through `compileRowExclusion` and applies it
 * before paging, so a rule that means one thing here and another there is the
 * exact defect this move prevents.
 */
import { describe, expect, it, afterEach } from 'vitest';
import { ExpressionEngine } from '../expression/index';
import type { ExpressionEngineLike } from '../platform/types';
import {
  __resetRowExclusionCache,
  compileRowExclusion,
  evaluateRowExclusion,
} from './rowExclusion';

const engine: ExpressionEngineLike = new ExpressionEngine();

afterEach(() => __resetRowExclusionCache());

describe('evaluateRowExclusion', () => {
  it('excludes a row when the predicate is true', () => {
    expect(evaluateRowExclusion(engine, '[ccy] == "INR"', { ccy: 'INR' })).toBe(true);
  });

  it('keeps a row when the predicate is false', () => {
    expect(evaluateRowExclusion(engine, '[ccy] == "INR"', { ccy: 'USD' })).toBe(false);
  });

  it('treats an empty expression as keep-everything', () => {
    expect(evaluateRowExclusion(engine, '   ', { ccy: 'INR' })).toBe(false);
  });

  it('resolves nested bracket paths', () => {
    expect(
      evaluateRowExclusion(engine, '[pnl.book] == "X"', { pnl: { book: 'X' } }),
    ).toBe(true);
  });

  it('supports compound predicates', () => {
    const expr = '[ccy] IN ["INR", "XXX"] OR [notional] < 0';
    expect(evaluateRowExclusion(engine, expr, { ccy: 'USD', notional: -5 })).toBe(true);
    expect(evaluateRowExclusion(engine, expr, { ccy: 'INR', notional: 10 })).toBe(true);
    expect(evaluateRowExclusion(engine, expr, { ccy: 'USD', notional: 10 })).toBe(false);
  });

  it('fails open on an invalid expression (excludes nothing)', () => {
    expect(evaluateRowExclusion(engine, '[ccy ==', { ccy: 'INR' })).toBe(false);
  });
});

describe('boolean & existence predicates ("field active exists and == true")', () => {
  // `[active] == true` IS the "exists AND is true" check: an absent column
  // resolves to null, and `null === true` is false, so it only matches a row
  // that actually carries `active: true`.
  it('[active] == true matches only a real boolean true (absent → no match)', () => {
    expect(evaluateRowExclusion(engine, '[active] == true', { active: true })).toBe(true);
    expect(evaluateRowExclusion(engine, '[active] == true', { active: false })).toBe(false);
    expect(evaluateRowExclusion(engine, '[active] == true', {})).toBe(false); // column absent → null
  });

  // `==` is strict (`===`), so a string/number representation does NOT match a
  // boolean literal — match the feed's actual type instead.
  it('is strict: "true"/1 do not equal the boolean true', () => {
    expect(evaluateRowExclusion(engine, '[active] == true', { active: 'true' })).toBe(false);
    expect(evaluateRowExclusion(engine, '[active] == true', { active: 1 })).toBe(false);
    // …match the representation the feed actually sends:
    expect(evaluateRowExclusion(engine, '[active] == "true"', { active: 'true' })).toBe(true);
    expect(evaluateRowExclusion(engine, '[active] == 1', { active: 1 })).toBe(true);
  });

  // Bare `[active]` is a truthiness test (note: a non-empty string like
  // "false" is truthy — prefer an explicit compare for string-boolean feeds).
  it('bare [active] is a truthiness test', () => {
    expect(evaluateRowExclusion(engine, '[active]', { active: true })).toBe(true);
    expect(evaluateRowExclusion(engine, '[active]', { active: false })).toBe(false);
    expect(evaluateRowExclusion(engine, '[active]', {})).toBe(false);
  });

  // Pure existence (present & non-null), independent of the value.
  it('ISNOTNULL([active]) tests presence regardless of value', () => {
    expect(evaluateRowExclusion(engine, 'ISNOTNULL([active])', { active: false })).toBe(true);
    expect(evaluateRowExclusion(engine, 'ISNOTNULL([active])', { active: true })).toBe(true);
    expect(evaluateRowExclusion(engine, 'ISNOTNULL([active])', {})).toBe(false);
  });

  // Explicit "exists AND true" — equivalent to `[active] == true` for boolean
  // feeds, but self-documenting.
  it('ISNOTNULL([active]) AND [active] == true combines existence + value', () => {
    const expr = 'ISNOTNULL([active]) AND [active] == true';
    expect(evaluateRowExclusion(engine, expr, { active: true })).toBe(true);
    expect(evaluateRowExclusion(engine, expr, { active: false })).toBe(false);
    expect(evaluateRowExclusion(engine, expr, {})).toBe(false);
  });

  // "Exclude rows that contain `active` and its value is false." `[active]`
  // resolves to null when the field is absent/null, and `null === false` is
  // false, so only a row that actually carries `active: false` matches —
  // existence is implied by the strict compare.
  it('[active] == false excludes only rows present with a false value', () => {
    expect(evaluateRowExclusion(engine, '[active] == false', { active: false })).toBe(true); // excluded
    expect(evaluateRowExclusion(engine, '[active] == false', { active: true })).toBe(false);
    expect(evaluateRowExclusion(engine, '[active] == false', {})).toBe(false); // absent → kept
    expect(evaluateRowExclusion(engine, '[active] == false', { active: null })).toBe(false); // null → kept
    // strict: a string "false" is NOT the boolean false.
    expect(evaluateRowExclusion(engine, '[active] == false', { active: 'false' })).toBe(false);
    expect(evaluateRowExclusion(engine, '[active] == "false"', { active: 'false' })).toBe(true);
  });
});

/**
 * The compiled form the query plane installs. It has to agree with
 * `evaluateRowExclusion` row for row, and it has to answer `null` — not a
 * predicate — for a rule that cannot exclude anything, because `null` is what
 * lets a session drop its overlay and go back to sharing the plane's cache.
 */
describe('compileRowExclusion', () => {
  it('agrees with evaluateRowExclusion, row for row', () => {
    const expr = '[ccy] IN ["INR", "XXX"] OR [notional] < 0';
    const predicate = compileRowExclusion(engine, expr)!;
    for (const row of [
      { ccy: 'USD', notional: -5 },
      { ccy: 'INR', notional: 10 },
      { ccy: 'USD', notional: 10 },
      {},
    ]) {
      expect(predicate(row)).toBe(evaluateRowExclusion(engine, expr, row));
    }
  });

  it('is null for a rule that cannot exclude anything', () => {
    expect(compileRowExclusion(engine, null)).toBeNull();
    expect(compileRowExclusion(engine, '')).toBeNull();
    expect(compileRowExclusion(engine, '   ')).toBeNull();
    expect(compileRowExclusion(engine, '[ccy ==')).toBeNull();
  });

  it('fails open per row rather than throwing out of the query', () => {
    // A rule that parses but blows up on a row: the row is kept, and the
    // caller — a worker mid-query — never sees an exception.
    const hostile = {
      parse: (source: string) => source,
      evaluate: () => {
        throw new Error('boom');
      },
      parseAndEvaluate: () => null,
      compile: () => () => null,
    } as unknown as ExpressionEngineLike;
    const predicate = compileRowExclusion(hostile, '[ccy] == "INR"')!;
    expect(predicate({ ccy: 'INR' })).toBe(false);
  });
});
