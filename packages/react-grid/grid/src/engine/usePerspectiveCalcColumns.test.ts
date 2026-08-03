/**
 * The three tiers, and which expression lands in which.
 *
 * The tier that matters is the one a column must NOT be in: a calculated
 * column left to a client `valueGetter` renders a value the book does not
 * have, so sorting, filtering, grouping and aggregating over it are all
 * quietly wrong. Anything compilable has to reach tier 1.
 */

import { describe, expect, it } from 'vitest';
import { ExpressionEngine, type VirtualColumnDef } from '@wellsfargo-starui/core';
import { planCalcColumn, planCalcColumns } from './usePerspectiveCalcColumns';

const engine = new ExpressionEngine();

const col = (expression: string, colId = 'c1'): VirtualColumnDef => ({
  colId,
  headerName: colId,
  expression,
});

describe('planCalcColumn', () => {
  it('compiles arithmetic to a Perspective expression column', () => {
    const plan = planCalcColumn(col('[price] * [quantity]'), engine);
    expect(plan.tier).toBe('compiled');
    expect(plan.expression).toContain('"price"');
    expect(plan.expression).toContain('"quantity"');
  });

  it('compiles a conditional', () => {
    const plan = planCalcColumn(col('IF([pnl] > 0, 1, 0)'), engine);
    expect(plan.tier).toBe('compiled');
    expect(plan.expression).toBeTruthy();
  });

  it('refuses a cross-row aggregate as UNSUPPORTED, naming the structural gap', () => {
    const plan = planCalcColumn(col('SUM([pnl])'), engine);
    expect(plan.tier).toBe('unsupported');
    // Not "unknown function SUM" — that reads like a mapping someone forgot.
    expect(plan.reason).toContain('row-local');
  });

  it('treats an unparseable expression as unsupported', () => {
    const plan = planCalcColumn(col('[price] *'), engine);
    expect(plan.tier).toBe('unsupported');
    expect(plan.reason).toBeTruthy();
  });

  it('treats an empty expression as unsupported', () => {
    expect(planCalcColumn(col('   '), engine).tier).toBe('unsupported');
  });
});

describe('planCalcColumns', () => {
  it('is empty for no columns', () => {
    expect(planCalcColumns(undefined, engine).columns).toEqual([]);
    expect(planCalcColumns([], engine).expressions).toEqual({});
  });

  it('publishes only the compiled columns as engine expressions', () => {
    const plan = planCalcColumns(
      [col('[price] * [quantity]', 'notional'), col('SUM([pnl])', 'total')],
      engine,
    );

    expect(Object.keys(plan.expressions)).toEqual(['notional']);
    expect(plan.unsupported.map((c) => c.colId)).toEqual(['total']);
  });

  it('keeps every column in the plan, so nothing disappears without a reason', () => {
    const plan = planCalcColumns(
      [col('[a] + [b]', 'ok'), col('SUM([pnl])', 'agg'), col('[x] *', 'broken')],
      engine,
    );

    expect(plan.columns.map((c) => c.colId)).toEqual(['ok', 'agg', 'broken']);
    for (const column of plan.columns) {
      if (column.tier !== 'compiled') expect(column.reason).toBeTruthy();
    }
  });
});
