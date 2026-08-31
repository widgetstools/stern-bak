import { describe, expect, it } from 'vitest';
import type { PerspectiveSchema } from '../schema.js';
import { NULL_TAG } from './derived.js';
import { buildFilterPlan, coerceGroupKey, createFilterBuilder } from './filters.js';

const schema: PerspectiveSchema = {
  name: 'string',
  qty: 'float',
  when: 'datetime',
  flag: 'boolean',
};

describe('buildFilterPlan — simple models', () => {
  it('lowers text comparisons onto a case-folded derived column', () => {
    const plan = buildFilterPlan({ name: { filterType: 'text', type: 'contains', filter: 'AbC' } }, schema);
    const [column, op, operand] = plan.filter[0];
    expect(op).toBe('contains');
    expect(operand).toBe('abc');
    expect(plan.expressions[column as string]).toBe('lower("name")');
  });

  it('keeps number comparisons native', () => {
    const plan = buildFilterPlan({ qty: { filterType: 'number', type: 'greaterThan', filter: 5 } }, schema);
    expect(plan.filter).toEqual([['qty', '>', 5]]);
    expect(plan.matchNothing).toBe(false);
  });

  it('reads a date-only equals as the whole local day', () => {
    const plan = buildFilterPlan(
      { when: { filterType: 'date', type: 'equals', dateFrom: '2026-08-31' } },
      schema,
    );
    expect(plan.filter).toHaveLength(2);
    const [[, geOp, start], [, ltOp, end]] = plan.filter as [unknown, string, number][];
    void geOp;
    void ltOp;
    expect(plan.filter[0][1]).toBe('>=');
    expect(plan.filter[1][1]).toBe('<');
    expect((end as number) - (start as number)).toBe(24 * 60 * 60 * 1000);
  });

  it('maps blank on a string to the null-or-empty derived comparison', () => {
    const plan = buildFilterPlan({ name: { filterType: 'text', type: 'blank' } }, schema);
    const [column, op, operand] = plan.filter[0];
    expect([op, operand]).toEqual(['==', 0]);
    expect(plan.expressions[column as string]).toContain('is_null');
  });

  it('reports an unknown column as unsupported rather than guessing', () => {
    const plan = buildFilterPlan({ ghost: { filterType: 'text', type: 'equals', filter: 'x' } }, schema);
    expect(plan.filter).toEqual([]);
    expect(plan.unsupported[0]).toContain('ghost');
  });
});

describe('buildFilterPlan — set filters', () => {
  it('goes native `in` when no blanks are ticked', () => {
    const plan = buildFilterPlan({ name: { filterType: 'set', values: ['a', 'b'] } }, schema);
    expect(plan.filter).toEqual([['name', 'in', ['a', 'b']]]);
  });

  it('matches blanks through the null-tag sentinel on string columns', () => {
    const plan = buildFilterPlan({ name: { filterType: 'set', values: ['a', null] } }, schema);
    const [column, op, operand] = plan.filter[0];
    expect(op).toBe('in');
    expect(operand).toEqual(['a', NULL_TAG]);
    expect(plan.expressions[String(column).replace('', '')]).toBeDefined;
    expect(Object.values(plan.expressions).some((e) => e.includes(NULL_TAG))).toBe(true);
  });

  it('declares an empty tick list unmatchable', () => {
    const plan = buildFilterPlan({ qty: { filterType: 'set', values: [] } }, schema);
    expect(plan.matchNothing).toBe(true);
  });

  it('folds a numeric set with blanks into a null-or expression', () => {
    const plan = buildFilterPlan({ qty: { filterType: 'set', values: ['1', null] } }, schema);
    const condition = plan.filter[0];
    expect(condition[1]).toBe('==');
    expect(condition[2]).toBe(true);
    const expr = plan.expressions[condition[0] as string];
    expect(expr).toContain('is_null("qty")');
    expect(expr).toContain('== 1');
  });
});

describe('buildFilterPlan — combined conditions', () => {
  it('keeps AND conditions on the native fast path independently', () => {
    const plan = buildFilterPlan(
      {
        qty: {
          filterType: 'number',
          operator: 'AND',
          conditions: [
            { filterType: 'number', type: 'greaterThan', filter: 1 },
            { filterType: 'number', type: 'lessThan', filter: 9 },
          ],
        },
      },
      schema,
    );
    expect(plan.filter).toEqual([
      ['qty', '>', 1],
      ['qty', '<', 9],
    ]);
  });

  it('turns OR-of-equals into native set membership', () => {
    const plan = buildFilterPlan(
      {
        qty: {
          filterType: 'number',
          operator: 'OR',
          conditions: [
            { filterType: 'number', type: 'equals', filter: 1 },
            { filterType: 'number', type: 'equals', filter: 2 },
          ],
        },
      },
      schema,
    );
    expect(plan.filter).toEqual([['qty', 'in', [1, 2]]]);
  });

  it('routes a mixed OR through one boolean expression column', () => {
    const plan = buildFilterPlan(
      {
        qty: {
          filterType: 'number',
          operator: 'OR',
          conditions: [
            { filterType: 'number', type: 'lessThan', filter: 1 },
            { filterType: 'number', type: 'greaterThan', filter: 9 },
          ],
        },
      },
      schema,
    );
    expect(plan.filter).toHaveLength(1);
    expect(plan.filter[0][2]).toBe(true);
    const expr = plan.expressions[plan.filter[0][0] as string];
    expect(expr).toContain(' or ');
  });

  it('recurses into multi-filter models', () => {
    const plan = buildFilterPlan(
      {
        name: {
          filterType: 'multi',
          filterModels: [{ filterType: 'text', type: 'equals', filter: 'x' }, null],
        },
      },
      schema,
    );
    expect(plan.filter).toHaveLength(1);
    expect(plan.filter[0][2]).toBe('x');
  });
});

describe('group path filtering', () => {
  it('uses typed keys verbatim and coerces stringified ones', () => {
    const builder = createFilterBuilder(schema);
    builder.addGroupPath(['when', 'name'], [1700000000000, '']);
    const plan = builder.plan();
    expect(plan.filter).toContainEqual(['when', '==', 1700000000000]);
    // Empty string on a string column is a REAL group, not the null group.
    expect(plan.filter).toContainEqual(['name', '==', '']);
  });

  it('treats null keys as is-null and unparseable keys as unmatchable', () => {
    const builder = createFilterBuilder(schema);
    builder.addGroupPath(['name', 'qty'], [null, 'not-a-number']);
    const plan = builder.plan();
    expect(plan.filter).toContainEqual(['name', 'is null', null]);
    expect(plan.matchNothing).toBe(true);
  });
});

describe('advanced filter models', () => {
  it('joins conditions into one boolean expression', () => {
    const plan = buildFilterPlan(
      {
        filterType: 'join',
        type: 'OR',
        conditions: [
          { filterType: 'number', colId: 'qty', type: 'greaterThan', filter: 5 },
          { filterType: 'text', colId: 'name', type: 'contains', filter: 'x' },
        ],
      },
      schema,
    );
    expect(plan.filter).toHaveLength(1);
    const expr = plan.expressions[plan.filter[0][0] as string];
    expect(expr).toContain(' or ');
  });
});

describe('coerceGroupKey', () => {
  it('restores millisecond datetime keys AG Grid stringified', () => {
    expect(coerceGroupKey(schema, 'when', '1700000000000')).toBe(1700000000000);
  });
  it('reads empty / "null" strings as the null group', () => {
    expect(coerceGroupKey(schema, 'qty', '')).toBeNull();
    expect(coerceGroupKey(schema, 'qty', 'null')).toBeNull();
  });
});
