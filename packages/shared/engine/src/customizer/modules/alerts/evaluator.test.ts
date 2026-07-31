import { describe, expect, it } from 'vitest';
import { ExpressionEngine } from '../../../expression';
import {
  computeRelativeChange,
  detectRowChanges,
  evaluateDataChangeRule,
  renderMessage,
  type AlertHit,
} from './evaluator';
import type {
  DataChangeRule,
  RelativeChangeRule,
  RowChangeRule,
} from './state';

const engine = new ExpressionEngine();

function dataChangeRule(
  overrides: Partial<DataChangeRule['trigger']> = {},
): DataChangeRule {
  return {
    id: 'r1',
    name: 'Bid above 100',
    enabled: true,
    priority: 0,
    severity: 'warning',
    trigger: {
      kind: 'dataChange',
      expression: '[bid] > 100',
      ...overrides,
    },
    message: '{rowId} {column} = {value}',
    channels: ['toast', 'badge'],
  };
}

function relativeRule(
  trigger: Partial<RelativeChangeRule['trigger']> = {},
): RelativeChangeRule {
  return {
    id: 'r1',
    name: 'Last move',
    enabled: true,
    priority: 0,
    severity: 'warning',
    trigger: {
      kind: 'relativeChange',
      column: 'last',
      mode: 'PERCENT_CHANGE',
      threshold: 5,
      direction: 'both',
      ...trigger,
    },
    message: '{column} moved from {prev} to {value}',
    channels: ['toast'],
  };
}

function rowRule(event: 'ROW_ADDED' | 'ROW_REMOVED'): RowChangeRule {
  return {
    id: `r-${event}`,
    name: event,
    enabled: true,
    priority: 0,
    severity: 'info',
    trigger: { kind: 'rowChange', event },
    message: '{rowId} {rule}',
    channels: ['badge'],
  };
}

// ─── evaluateDataChangeRule ────────────────────────────────────────────────

describe('evaluateDataChangeRule', () => {
  const cases: Array<{
    name: string;
    rule: ReturnType<typeof dataChangeRule>;
    ctx: Parameters<typeof evaluateDataChangeRule>[1];
    expect: 'hit' | 'null';
    expectedColumn?: string | null;
  }> = [
    {
      name: 'predicate true → hit',
      rule: dataChangeRule(),
      ctx: { rowId: 'row-1', data: { bid: 150 }, value: 150, changedColumn: 'bid' },
      expect: 'hit',
      expectedColumn: 'bid',
    },
    {
      name: 'predicate false → null',
      rule: dataChangeRule(),
      ctx: { rowId: 'row-1', data: { bid: 50 }, value: 50, changedColumn: 'bid' },
      expect: 'null',
    },
    {
      name: 'column scope hit',
      rule: dataChangeRule({ column: 'bid' }),
      ctx: { rowId: 'row-1', data: { bid: 150 }, value: 150, changedColumn: 'bid' },
      expect: 'hit',
      expectedColumn: 'bid',
    },
    {
      name: 'column scope miss (wrong column changed)',
      rule: dataChangeRule({ column: 'bid' }),
      ctx: { rowId: 'row-1', data: { bid: 150 }, value: 150, changedColumn: 'ask' },
      expect: 'null',
    },
    {
      name: 'malformed expression → null (no throw)',
      rule: dataChangeRule({ expression: '[bid >>> 100' }),
      ctx: { rowId: 'row-1', data: { bid: 150 } },
      expect: 'null',
    },
    {
      name: 'no changedColumn + no scope → hit with column null',
      rule: dataChangeRule(),
      ctx: { rowId: 'row-1', data: { bid: 150 } },
      expect: 'hit',
      expectedColumn: null,
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const result = evaluateDataChangeRule(c.rule, c.ctx, engine);
      if (c.expect === 'null') {
        expect(result).toBeNull();
      } else {
        expect(result).not.toBeNull();
        expect(result!.ruleId).toBe(c.rule.id);
        expect(result!.rowId).toBe(c.ctx.rowId);
        if (c.expectedColumn !== undefined) {
          expect(result!.column).toBe(c.expectedColumn);
        }
      }
    });
  }
});

// ─── computeRelativeChange ─────────────────────────────────────────────────

describe('computeRelativeChange', () => {
  const cases: Array<{
    name: string;
    rule: ReturnType<typeof relativeRule>;
    prev: unknown;
    next: unknown;
    expect: 'hit' | 'null';
  }> = [
    {
      name: 'PERCENT 6% > 5% threshold up → hit',
      rule: relativeRule({ mode: 'PERCENT_CHANGE', threshold: 5, direction: 'both' }),
      prev: 100,
      next: 106,
      expect: 'hit',
    },
    {
      name: 'PERCENT 4% < 5% threshold → null',
      rule: relativeRule({ mode: 'PERCENT_CHANGE', threshold: 5 }),
      prev: 100,
      next: 104,
      expect: 'null',
    },
    {
      name: 'PERCENT direction=down rejects up move',
      rule: relativeRule({ mode: 'PERCENT_CHANGE', threshold: 5, direction: 'down' }),
      prev: 100,
      next: 110,
      expect: 'null',
    },
    {
      name: 'PERCENT direction=down accepts down move',
      rule: relativeRule({ mode: 'PERCENT_CHANGE', threshold: 5, direction: 'down' }),
      prev: 100,
      next: 90,
      expect: 'hit',
    },
    {
      name: 'ABSOLUTE threshold met → hit',
      rule: relativeRule({ mode: 'ABSOLUTE_CHANGE', threshold: 10 }),
      prev: 100,
      next: 111,
      expect: 'hit',
    },
    {
      name: 'ABSOLUTE threshold not met → null',
      rule: relativeRule({ mode: 'ABSOLUTE_CHANGE', threshold: 10 }),
      prev: 100,
      next: 105,
      expect: 'null',
    },
    {
      name: 'ANY_CHANGE on any delta → hit',
      rule: relativeRule({ mode: 'ANY_CHANGE' }),
      prev: 100,
      next: 100.0001,
      expect: 'hit',
    },
    {
      name: 'ANY_CHANGE no-op when equal → null',
      rule: relativeRule({ mode: 'ANY_CHANGE' }),
      prev: 100,
      next: 100,
      expect: 'null',
    },
    {
      name: 'first observation (prev undefined) → null',
      rule: relativeRule({ mode: 'ANY_CHANGE' }),
      prev: undefined,
      next: 100,
      expect: 'null',
    },
    {
      name: 'non-numeric prev → null',
      rule: relativeRule({ mode: 'ANY_CHANGE' }),
      prev: 'banana',
      next: 100,
      expect: 'null',
    },
    {
      name: 'NaN next → null',
      rule: relativeRule({ mode: 'ANY_CHANGE' }),
      prev: 100,
      next: NaN,
      expect: 'null',
    },
    {
      name: 'PERCENT divide-by-zero (prev=0) → null',
      rule: relativeRule({ mode: 'PERCENT_CHANGE', threshold: 5 }),
      prev: 0,
      next: 10,
      expect: 'null',
    },
    {
      name: 'numeric string coerced',
      rule: relativeRule({ mode: 'PERCENT_CHANGE', threshold: 5 }),
      prev: '100',
      next: '110',
      expect: 'hit',
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const result = computeRelativeChange(c.rule, 'row-1', c.prev, c.next);
      if (c.expect === 'null') {
        expect(result).toBeNull();
      } else {
        expect(result).not.toBeNull();
        expect(result!.ruleId).toBe(c.rule.id);
        expect(result!.rowId).toBe('row-1');
        expect(result!.column).toBe(c.rule.trigger.column);
      }
    });
  }
});

// ─── detectRowChanges ──────────────────────────────────────────────────────

describe('detectRowChanges', () => {
  it('emits one hit per added row per ROW_ADDED rule', () => {
    const hits = detectRowChanges(
      [{ id: 'a' }, { id: 'b' }],
      [],
      [rowRule('ROW_ADDED'), rowRule('ROW_REMOVED')],
    );
    expect(hits).toHaveLength(2);
    expect(hits.every((h) => h.ruleId === 'r-ROW_ADDED')).toBe(true);
    expect(hits.map((h) => h.rowId).sort()).toEqual(['a', 'b']);
  });

  it('emits one hit per removed row per ROW_REMOVED rule', () => {
    const hits = detectRowChanges([], [{ id: 'x' }], [rowRule('ROW_REMOVED')]);
    expect(hits).toEqual([
      { ruleId: 'r-ROW_REMOVED', rowId: 'x', column: null, value: null, prevValue: null },
    ]);
  });

  it('skips disabled rules', () => {
    const disabled = rowRule('ROW_ADDED');
    disabled.enabled = false;
    const hits = detectRowChanges([{ id: 'a' }], [], [disabled]);
    expect(hits).toEqual([]);
  });

  it('returns empty when no row-change rules are present', () => {
    const hits = detectRowChanges([{ id: 'a' }], [{ id: 'b' }], []);
    expect(hits).toEqual([]);
  });
});

// ─── renderMessage ─────────────────────────────────────────────────────────

describe('renderMessage', () => {
  const baseHit: AlertHit = {
    ruleId: 'r1',
    rowId: 'AAPL',
    column: 'last',
    value: 150.5,
    prevValue: 145,
  };

  it('substitutes all placeholders', () => {
    expect(renderMessage('{rule}: {column} on {rowId} → {value} (was {prev})', baseHit, 'Big move'))
      .toBe('Big move: last on AAPL → 150.5 (was 145)');
  });

  it('leaves unknown placeholders as empty string', () => {
    expect(renderMessage('{value} {unknown}', baseHit, 'X')).toBe('150.5 {unknown}');
  });

  it('handles null/undefined gracefully', () => {
    expect(renderMessage('{column}/{value}', { ...baseHit, column: null, value: null }, 'r')).toBe(
      '/',
    );
  });

  it('trims trailing zeros on numbers', () => {
    expect(renderMessage('{value}', { ...baseHit, value: 1.5 }, 'r')).toBe('1.5');
    expect(renderMessage('{value}', { ...baseHit, value: 1 }, 'r')).toBe('1');
  });
});
