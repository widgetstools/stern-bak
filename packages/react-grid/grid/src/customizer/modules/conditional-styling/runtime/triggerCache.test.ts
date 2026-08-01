import { describe, expect, it } from 'vitest';
import { ExpressionEngine } from '@wellsfargo-starui/engine';
import { createTriggerCache } from './triggerCache.js';

describe('createTriggerCache', () => {
  const engine = new ExpressionEngine();
  const platform = {
    resources: { expression: () => engine },
  };

  it('memoises trigger columns per rule id + expression', () => {
    const cache = createTriggerCache(platform as never);
    const rules = [
      {
        id: 'r1',
        enabled: true,
        expression: '[price] > [qty]',
        scope: { type: 'cell' as const, columns: ['side'] },
      },
    ];
    cache.rebuild(rules);
    expect([...(cache.get(rules[0]) ?? [])].sort()).toEqual(['price', 'qty']);
    expect(cache.cacheKey(rules[0])).toBe('r1::[price] > [qty]');
  });

  it('evicts entries when rules disappear or expressions change', () => {
    const cache = createTriggerCache(platform as never);
    const ruleA = {
      id: 'r1',
      enabled: true,
      expression: '[price] > 0',
      scope: { type: 'cell' as const, columns: ['price'] },
    };
    cache.rebuild([ruleA]);
    expect(cache.get(ruleA)).toBeTruthy();

    cache.rebuild([]);
    expect(cache.get(ruleA)).toBeUndefined();

    cache.rebuild([{ ...ruleA, expression: '[qty] > 0' }]);
    expect(cache.get(ruleA)).toBeUndefined();
  });

  it('stores empty trigger set for unparseable expressions', () => {
    const cache = createTriggerCache(platform as never);
    const rule = {
      id: 'bad',
      enabled: true,
      expression: '((((',
      scope: { type: 'cell' as const, columns: ['x'] },
    };
    cache.rebuild([rule]);
    expect(cache.get(rule)).toEqual(new Set());
  });
});
