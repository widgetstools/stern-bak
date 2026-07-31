import { describe, expect, it, vi } from 'vitest';
import { ExpressionEngine } from '../../../expression/index.js';
import type { CssHandle } from '../../../platform/types';
import {
  applyCellRulesToDefs,
  buildRowClassPredicate,
  createTimedRuleStore,
  extractTriggerColumns,
  FLASH_PALETTE,
  reinjectAllRules,
  type DiffCacheByApi,
  type TimedRuleStateByApi,
} from './transforms.js';
import type { ConditionalRule } from './state.js';

const engine = new ExpressionEngine();

function cssHandle(): CssHandle & { rules: Map<string, string> } {
  const rules = new Map<string, string>();
  return {
    rules,
    clear: () => rules.clear(),
    addRule: (id, css) => rules.set(id, css),
  };
}

function rule(overrides: Partial<ConditionalRule> = {}): ConditionalRule {
  return {
    id: 'r1',
    name: 'Rule',
    enabled: true,
    priority: 0,
    expression: '[price] > 100',
    scope: { type: 'cell', columns: ['price'] },
    style: {
      light: { color: 'red' },
      dark: { color: 'pink' },
    },
    ...overrides,
  };
}

describe('createTimedRuleStore', () => {
  it('tracks row and cell activations and returns earliest expiry', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2020-01-01T00:00:00Z'));
    const store = createTimedRuleStore();
    store.upsertRowActivation('row-1', 'rule-a', Date.now() + 500);
    store.upsertCellActivation('row-1', 'rule-b', 'price', Date.now() + 100);
    expect(store.getNextExpiry()).toBe(Date.now() + 100);
    vi.useRealTimers();
  });

  it('prunes rows not in the active set', () => {
    const store = createTimedRuleStore();
    store.upsertRowActivation('gone', 'rule-a', Date.now() + 1000);
    store.upsertRowActivation('stay', 'rule-a', Date.now() + 1000);
    store.prune(new Set(['stay']));
    expect(store.byRowId.has('gone')).toBe(false);
    expect(store.byRowId.has('stay')).toBe(true);
  });

  it('pruneByRuleSet drops stale rule ids after profile switch', () => {
    const store = createTimedRuleStore();
    store.upsertRowActivation('row-1', 'old-rule', Date.now() + 1000);
    store.pruneByRuleSet(new Set(['new-rule']));
    expect(store.byRowId.size).toBe(0);
  });

  it('collectAndPruneExpired separates row and cell scopes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2020-01-01T00:00:00Z'));
    const store = createTimedRuleStore();
    const past = Date.now() - 1;
    store.upsertRowActivation('row-a', 'rule-row', past + 1);
    store.upsertCellActivation('row-b', 'rule-cell', 'qty', past + 1);
    vi.setSystemTime(new Date('2020-01-01T00:00:01Z'));
    const expired = store.collectAndPruneExpired();
    expect(expired.rowScope).toEqual([{ rowId: 'row-a' }]);
    expect(expired.cellScope).toEqual([{ rowId: 'row-b', colIds: ['qty'] }]);
    vi.useRealTimers();
  });

  it('clear resets all state', () => {
    const store = createTimedRuleStore();
    store.upsertRowActivation('row-1', 'rule-a', Date.now() + 1000);
    store.clear();
    expect(store.getNextExpiry()).toBeNull();
  });
});

describe('extractTriggerColumns', () => {
  it('collects bracket refs and strips diff suffixes', () => {
    const ast = engine.parse('[price.old] > [side.new]');
    expect([...extractTriggerColumns(ast)]).toEqual(['price', 'side']);
  });

  it('collapses data.x.y member chains into dot-path triggers', () => {
    const ast = engine.parse('data.position.qty > 0');
    expect([...extractTriggerColumns(ast)]).toContain('position.qty');
  });
});

describe('reinjectAllRules', () => {
  it('ships palette once and emits css for enabled rules', () => {
    const css = cssHandle();
    reinjectAllRules(css, [rule(), rule({ id: 'r2', enabled: false })]);
    expect(css.rules.has('__flash-palette__')).toBe(true);
    expect(css.rules.has('conditional-r1')).toBe(true);
    expect(css.rules.has('conditional-r2')).toBe(false);
  });

  it('adds flash keyframes when a rule flashes', () => {
    const css = cssHandle();
    reinjectAllRules(css, [
      rule({
        flash: {
          enabled: true,
          target: 'cells',
          mode: 'oneShot',
          color: 'amber',
          durationMs: 500,
        },
      }),
    ]);
    expect(css.rules.has('conditional-flash-kf-r1')).toBe(true);
    expect(Object.keys(FLASH_PALETTE)).toContain('amber');
  });

  it('emits indicator overlay css and value-glyph animation rules', () => {
    const css = cssHandle();
    reinjectAllRules(css, [
      rule({
        scope: { type: 'row' },
        indicator: { icon: 'arrow-up', color: 'orange', target: 'cells' },
        animation: { enabled: true, kind: 'spin', durationMs: 800 },
      }),
    ]);
    const body = css.rules.get('conditional-r1') ?? '';
    expect(body).toContain('::before');
    expect(body).toContain('ds-anim-spin');
  });
});

describe('buildRowClassPredicate', () => {
  it('evaluates row expressions and swallows runtime errors', () => {
    const predicate = buildRowClassPredicate(engine, rule({
      scope: { type: 'row' },
      expression: '[qty] > 0',
    }));
    expect(predicate({ data: { qty: 5 } } as never)).toBe(true);
    expect(predicate({ data: { qty: 0 } } as never)).toBe(false);

    const broken = buildRowClassPredicate(engine, rule({
      scope: { type: 'row' },
      expression: 'NOPE([qty])',
    }));
    expect(broken({ data: { qty: 1 } } as never)).toBe(false);
  });

  it('uses timed activation store for activeDurationMs rules', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2020-01-01T00:00:00Z'));
    const store = createTimedRuleStore();
    const timedByApi: TimedRuleStateByApi = new WeakMap();
    const api = {};
    timedByApi.set(api, store.byRowId);
    store.upsertRowActivation('row-1', 'r1', Date.now() + 1000);

    const predicate = buildRowClassPredicate(
      engine,
      rule({ scope: { type: 'row' }, activeDurationMs: 500 }),
      undefined,
      timedByApi,
    );
    expect(predicate({ api, node: { id: 'row-1' }, data: {} } as never)).toBe(true);
    vi.setSystemTime(new Date('2020-01-01T00:00:02Z'));
    expect(predicate({ api, node: { id: 'row-1' }, data: {} } as never)).toBe(false);
    vi.useRealTimers();
  });

  it('syncs diff columns referenced by old/new suffixes', () => {
    const diffByApi: DiffCacheByApi = new WeakMap();
    const api = {};
    const node = {};
    const predicate = buildRowClassPredicate(engine, rule({
      scope: { type: 'row' },
      expression: '[price.old] < [price.new]',
    }), diffByApi);
    predicate({ api, node, data: { price: 10 } } as never);
    predicate({ api, node, data: { price: 12 } } as never);
    const rowDiffs = diffByApi.get(api)?.get(node);
    expect(rowDiffs?.get('price')).toEqual({ oldValue: 10, newValue: 12 });
  });
});

describe('applyCellRulesToDefs', () => {
  it('installs cellClassRules for matching columns only', () => {
    const defs = [
      { colId: 'price', field: 'price' },
      { colId: 'qty', field: 'qty' },
    ];
    const out = applyCellRulesToDefs(defs, [rule()], engine) as Array<{
      cellClassRules?: Record<string, unknown>;
    }>;
    expect(out[0]?.cellClassRules?.['ds-rule-r1']).toBeDefined();
    expect(out[1]).toBe(defs[1]);
  });

  it('recurses into column groups and applies highest-priority formatter', () => {
    const defs = [{
      headerName: 'Group',
      children: [{ colId: 'price', field: 'price', valueFormatter: () => 'base' }],
    }];
    const rules = [
      rule({
        valueFormatter: { kind: 'preset', preset: 'number' },
      }),
      rule({
        id: 'r2',
        priority: 1,
        expression: '[price] < 0',
        valueFormatter: { kind: 'preset', preset: 'currency' },
      }),
    ];
    const out = applyCellRulesToDefs(defs, rules, engine) as Array<{
      children: Array<{ valueFormatter?: (p: { value: number }) => string }>;
    }>;
    expect(typeof out[0]?.children[0]?.valueFormatter).toBe('function');
    expect(out[0]?.children[0]?.valueFormatter?.({ value: -1 })).toBeTruthy();
  });
});
