/**
 * How the CLIENT-SIDE row model installs the rule. What the rule MEANS is
 * pinned in core, beside the evaluator both row models share
 * (`filters/rowExclusion.test.ts`).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { ExpressionEngine } from '@wellsfargo-starui/core';
import type { ExpressionEngineLike, TransformContext } from '@wellsfargo-starui/core';
import type { IRowNode } from 'ag-grid-community';
import { __resetRowExclusionCache } from '@wellsfargo-starui/core';
import { buildExternalFilterOptions } from './rowExclusionFilter';
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
