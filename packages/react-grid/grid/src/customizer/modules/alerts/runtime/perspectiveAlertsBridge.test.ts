/**
 * Alerts fed from the worker rather than from this window's row nodes.
 *
 * The client path evaluates against `platform.rows`, which under Perspective
 * describes only the loaded blocks — so alerts on the rest of the book never
 * fire, silently, and the panel looks like a quiet market. Each enabled rule
 * opens one worker subscription instead.
 */

import { describe, expect, it, vi } from 'vitest';
import type { AlertRule } from '@wellsfargo-starui/core';
import type { PerspectiveGridQueries } from '../../../../engine/types';
import {
  createPerspectiveAlertsBridge,
  planAlertRuleQuery,
} from './perspectiveAlertsBridge';

function rule(over: Partial<AlertRule> & { trigger: AlertRule['trigger'] }): AlertRule {
  return {
    id: 'r1',
    name: 'Rule',
    enabled: true,
    priority: 0,
    severity: 'info',
    ...over,
  } as AlertRule;
}

function fakeQueries() {
  const changeRules: Array<{ query: unknown; push: (hits: unknown[]) => void }> = [];
  const matchSets: Array<{ source: string; push: (t: unknown) => void }> = [];
  const released: string[] = [];
  const queries: PerspectiveGridQueries = {
    watchCount: () => () => {},
    watchExpressionCount: () => () => {},
    watchAggregate: () => () => {},
    distinctValues: async () => null,
    watchMatchSet(source, onTransition) {
      matchSets.push({ source, push: onTransition as never });
      return () => released.push(`match:${source}`);
    },
    watchChangeRule(query, onHits) {
      changeRules.push({ query, push: onHits as never });
      return () => released.push(`change:${query.ruleId}`);
    },
  };
  return { queries, changeRules, matchSets, released };
}

describe('planAlertRuleQuery', () => {
  it('maps relativeChange onto a change rule carrying its threshold', () => {
    const plan = planAlertRuleQuery(
      rule({
        id: 'rc',
        trigger: { kind: 'relativeChange', column: 'price', mode: 'PERCENT_CHANGE', threshold: 5 },
      }),
    );

    expect(plan).toMatchObject({
      kind: 'changeRule',
      query: {
        ruleId: 'rc',
        field: 'price',
        mode: 'relativeChange',
        changeMode: 'PERCENT_CHANGE',
        threshold: 5,
      },
    });
  });

  it('maps a column-scoped dataChange onto a change rule with its expression', () => {
    const plan = planAlertRuleQuery(
      rule({ id: 'dc', trigger: { kind: 'dataChange', expression: 'x > 100', column: 'pnl' } }),
    );

    expect(plan).toMatchObject({
      kind: 'changeRule',
      query: { ruleId: 'dc', field: 'pnl', mode: 'dataChange', expression: 'x > 100' },
    });
  });

  it('refuses an unscoped dataChange, naming the shadow-map scoping', () => {
    const plan = planAlertRuleQuery(
      rule({ trigger: { kind: 'dataChange', expression: 'x > 100' } }),
    );

    expect(plan.kind).toBe('unsupported');
    expect((plan as { reason: string }).reason).toContain('column scope');
  });

  it('leaves rowChange to the client path deliberately', () => {
    const plan = planAlertRuleQuery(
      rule({ trigger: { kind: 'rowChange', event: 'ROW_ADDED' } }),
    );

    expect(plan.kind).toBe('unsupported');
    // Not an oversight: block loads would make scrolling look like row adds.
    expect((plan as { reason: string }).reason).toContain('scrolling');
  });
});

describe('createPerspectiveAlertsBridge', () => {
  it('opens one subscription per enabled rule and dispatches its hits', () => {
    const { queries, changeRules } = fakeQueries();
    const dispatch = vi.fn();
    const r = rule({
      id: 'rc',
      trigger: { kind: 'relativeChange', column: 'price', mode: 'ANY_CHANGE' },
    });

    createPerspectiveAlertsBridge({ queries, rules: [r], dispatch });
    expect(changeRules).toHaveLength(1);

    const hit = { ruleId: 'rc', rowId: 'p1', column: 'price', value: 110, prevValue: 100 };
    changeRules[0].push([hit]);

    expect(dispatch).toHaveBeenCalledWith(r, hit);
  });

  it('skips disabled rules', () => {
    const { queries, changeRules } = fakeQueries();
    createPerspectiveAlertsBridge({
      queries,
      rules: [
        rule({
          enabled: false,
          trigger: { kind: 'relativeChange', column: 'price', mode: 'ANY_CHANGE' },
        }),
      ],
      dispatch: vi.fn(),
    });

    expect(changeRules).toHaveLength(0);
  });

  it('reports a rule it cannot serve instead of dropping it silently', () => {
    const { queries } = fakeQueries();
    const onUnsupported = vi.fn();

    createPerspectiveAlertsBridge({
      queries,
      rules: [rule({ id: 'row', trigger: { kind: 'rowChange', event: 'ROW_ADDED' } })],
      dispatch: vi.fn(),
      onUnsupported,
    });

    expect(onUnsupported).toHaveBeenCalledWith('row', expect.stringContaining('scrolling'));
  });

  it('ignores a hit whose ruleId is no longer in the rule list', () => {
    const { queries, changeRules } = fakeQueries();
    const dispatch = vi.fn();
    createPerspectiveAlertsBridge({
      queries,
      rules: [
        rule({ id: 'rc', trigger: { kind: 'relativeChange', column: 'price', mode: 'ANY_CHANGE' } }),
      ],
      dispatch,
    });

    // A push racing a rule deletion must not resurrect the rule.
    changeRules[0].push([{ ruleId: 'gone', rowId: 'p1', column: null, value: 1, prevValue: 0 }]);

    expect(dispatch).not.toHaveBeenCalled();
  });

  it('releases every subscription on dispose', () => {
    const { queries, released } = fakeQueries();
    const dispose = createPerspectiveAlertsBridge({
      queries,
      rules: [
        rule({ id: 'a', trigger: { kind: 'relativeChange', column: 'p', mode: 'ANY_CHANGE' } }),
        rule({ id: 'b', trigger: { kind: 'dataChange', expression: 'x', column: 'q' } }),
      ],
      dispatch: vi.fn(),
    });

    dispose();
    expect(released.sort()).toEqual(['change:a', 'change:b']);

    // Idempotent — activation teardown can run twice.
    expect(() => dispose()).not.toThrow();
    expect(released).toHaveLength(2);
  });
});
