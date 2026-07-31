import { afterEach, describe, expect, it } from 'vitest';
import { ExpressionEngine } from '@wellsfargo-starui/engine';
import type { ExpressionEngineLike, TransformContext } from '@wellsfargo-starui/engine';
import type { IRowNode } from 'ag-grid-community';
import {
  __resetRowExclusionCache,
  buildExternalFilterOptions,
  evaluateRowExclusion,
} from './rowExclusionFilter';
import { TOOLBAR_DATE_SETTINGS_MODULE_ID } from './state';

const engine: ExpressionEngineLike = new ExpressionEngine();

afterEach(() => __resetRowExclusionCache());

/** Minimal TransformContext exposing only what the filter touches, with a
 *  mutable expression so we can prove the callbacks read it LIVE. */
function makeCtx(initial: string, opts?: Partial<TransformContext>) {
  const box = { expr: initial };
  const ctx = {
    getModuleState: <T,>(id: string): T => {
      if (id !== TOOLBAR_DATE_SETTINGS_MODULE_ID) return undefined as T;
      return { rowExclusionExpression: box.expr } as T;
    },
    resources: { expression: () => engine },
    ...opts,
  } as unknown as TransformContext;
  return { ctx, box };
}

const node = (data: unknown): IRowNode => ({ data } as IRowNode);

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

describe('buildExternalFilterOptions', () => {
  it('reports the filter present only when a non-empty expression is set', () => {
    expect(
      buildExternalFilterOptions({}, makeCtx('[ccy] == "INR"').ctx).isExternalFilterPresent?.(),
    ).toBe(true);
    expect(buildExternalFilterOptions({}, makeCtx('').ctx).isExternalFilterPresent?.()).toBe(false);
  });

  it('hides matching rows and keeps the rest', () => {
    const { doesExternalFilterPass } = buildExternalFilterOptions({}, makeCtx('[ccy] == "INR"').ctx);
    expect(doesExternalFilterPass?.(node({ ccy: 'INR' }))).toBe(false); // excluded
    expect(doesExternalFilterPass?.(node({ ccy: 'USD' }))).toBe(true); // kept
  });

  it('keeps rows with absent/invalid data', () => {
    const { doesExternalFilterPass } = buildExternalFilterOptions({}, makeCtx('[ccy] == "INR"').ctx);
    expect(doesExternalFilterPass?.(node(undefined))).toBe(true);
    expect(doesExternalFilterPass?.(node('not-an-object'))).toBe(true);
  });

  it('reads the expression LIVE — no rebuild needed after an edit', () => {
    const { ctx, box } = makeCtx('');
    const { isExternalFilterPresent, doesExternalFilterPass } = buildExternalFilterOptions({}, ctx);
    // Initially empty → present false, all rows kept.
    expect(isExternalFilterPresent?.()).toBe(false);
    expect(doesExternalFilterPass?.(node({ ccy: 'INR' }))).toBe(true);
    // Edit the live expression; the SAME callbacks must now exclude INR.
    box.expr = '[ccy] == "INR"';
    expect(isExternalFilterPresent?.()).toBe(true);
    expect(doesExternalFilterPass?.(node({ ccy: 'INR' }))).toBe(false);
  });

  it('composes with a pre-existing external filter (AND semantics)', () => {
    const prevPass = (n: IRowNode) => (n.data as { region?: string }).region === 'APAC';
    const { isExternalFilterPresent, doesExternalFilterPass } = buildExternalFilterOptions(
      { isExternalFilterPresent: () => true, doesExternalFilterPass: prevPass },
      makeCtx('[ccy] == "INR"').ctx,
    );
    expect(isExternalFilterPresent?.()).toBe(true);
    // Hidden by the prior filter (not APAC) → excluded regardless of ccy.
    expect(doesExternalFilterPass?.(node({ ccy: 'USD', region: 'EMEA' }))).toBe(false);
    // Passes prior filter but our predicate excludes it.
    expect(doesExternalFilterPass?.(node({ ccy: 'INR', region: 'APAC' }))).toBe(false);
    // Passes both → kept.
    expect(doesExternalFilterPass?.(node({ ccy: 'USD', region: 'APAC' }))).toBe(true);
  });

  it('still reports present when a prior filter is present but our expression is empty', () => {
    const { isExternalFilterPresent } = buildExternalFilterOptions(
      { isExternalFilterPresent: () => true },
      makeCtx('').ctx,
    );
    expect(isExternalFilterPresent?.()).toBe(true);
  });
});
