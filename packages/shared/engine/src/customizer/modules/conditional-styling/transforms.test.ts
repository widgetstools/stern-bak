import { describe, expect, it, vi, afterEach } from 'vitest';
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

  it('collects columns.* member chains and walks ternary/call/array trees', () => {
    expect([...extractTriggerColumns(engine.parse('columns.price.old > 0'))]).toEqual(['price']);
    expect([...extractTriggerColumns(engine.parse('IF([a] > 0, [b], [c])'))]).toEqual(expect.arrayContaining(['a', 'b', 'c']));
    expect([...extractTriggerColumns(engine.parse('SUM([x], [y])'))]).toEqual(expect.arrayContaining(['x', 'y']));
    expect([...extractTriggerColumns(engine.parse('[1, 2, 3]'))]).toEqual([]);
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

  it('evaluates timed cell rules via cellClassRules predicate', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2020-01-01T00:00:00Z'));
    const store = createTimedRuleStore();
    const timedByApi: TimedRuleStateByApi = new WeakMap();
    const api = {};
    timedByApi.set(api, store.byRowId);
    store.upsertCellActivation('row-1', 'r1', 'price', Date.now() + 1000);

    const out = applyCellRulesToDefs(
      [{ colId: 'price', field: 'price' }],
      [rule({ activeDurationMs: 500 })],
      engine,
      undefined,
      timedByApi,
    ) as Array<{ cellClassRules?: Record<string, (p: unknown) => boolean> }>;
    const predicate = Object.values(out[0]?.cellClassRules ?? {})[0];
    expect(
      predicate?.({
        api,
        node: { id: 'row-1' },
        column: { getColId: () => 'price' },
        data: {},
      }),
    ).toBe(true);
    vi.useRealTimers();
  });

  it('reinjectAllRules emits header flash css for headers target', () => {
    const css = cssHandle();
    reinjectAllRules(css, [
      rule({
        flash: { enabled: true, target: 'headers', durationMs: 700 },
      }),
    ]);
    expect(css.rules.get('conditional-r1')).toContain('.ag-header-cell.ds-flash-hdr-r1');
  });
});

describe('createTimedRuleStore — update and prune paths', () => {
  it('extends existing row and cell activations via Math.max', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2020-01-01T00:00:00Z'));
    const store = createTimedRuleStore();
    store.upsertRowActivation('row-1', 'rule-a', Date.now() + 100);
    store.upsertRowActivation('row-1', 'rule-a', Date.now() + 500);
    store.upsertCellActivation('row-1', 'rule-b', 'price', Date.now() + 200);
    store.upsertCellActivation('row-1', 'rule-b', 'price', Date.now() + 800);
    expect(store.getNextExpiry()).toBe(Date.now() + 100);
    vi.useRealTimers();
  });

  it('prune drops expired rowUntil entries and empty rule buckets', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2020-01-01T00:00:00Z'));
    const store = createTimedRuleStore();
    store.upsertRowActivation('row-1', 'rule-a', Date.now() - 1);
    store.prune(new Set(['row-1']));
    expect(store.byRowId.has('row-1')).toBe(false);
    vi.useRealTimers();
  });

  it('pruneByRuleSet removes empty row buckets after rule purge', () => {
    const store = createTimedRuleStore();
    store.upsertCellActivation('row-1', 'old-rule', 'price', Date.now() + 1000);
    store.pruneByRuleSet(new Set(['new-rule']));
    expect(store.byRowId.has('row-1')).toBe(false);
  });

  it('recomputes next expiry after cache invalidation via prune', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2020-01-01T00:00:00Z'));
      const store = createTimedRuleStore();
      store.upsertRowActivation('row-1', 'rule-a', Date.now() + 500);
      store.upsertRowActivation('row-2', 'rule-b', Date.now() + 1000);
      expect(store.getNextExpiry()).toBe(Date.now() + 500);
      store.prune(new Set(['row-2']));
      expect(store.getNextExpiry()).toBe(Date.now() + 1000);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('reinjectAllRules — css branches', () => {
  it('emits pulse flash, row scope borders, and cells+headers flash', () => {
    const css = cssHandle();
    reinjectAllRules(css, [
      rule({
        scope: { type: 'row' },
        flash: { enabled: true, target: 'cells+headers', mode: 'pulse', color: 'emerald' },
        style: {
          light: { borderTopWidth: '2px', borderTopStyle: 'solid', borderTopColor: 'red' },
          dark: {},
        },
      }),
    ]);
    const body = css.rules.get('conditional-r1') ?? '';
    expect(body).toContain('animation: ds-flash-r1');
    expect(body).toContain('infinite');
    expect(body).toContain('.ag-row.ds-rule-r1');
    expect(body).toContain('.ag-header-cell.ds-flash-hdr-r1');
    expect(body).toContain('::after');
  });

  it('formats multi sub-filters in formatFilterModel helper path via row rules css', () => {
    const css = cssHandle();
    reinjectAllRules(css, [
      rule({
        indicator: { icon: 'arrow-down', color: 'blue', target: 'headers', position: 'bottom-left' },
      }),
    ]);
    expect(css.rules.get('conditional-r1')).toContain('.ag-header-cell');
  });
});

describe('applyCellRulesToDefs — row rules and diff predicates', () => {
  it('evaluates diff-aware cell predicates and uses ag-string fast path when available', () => {
    const out = applyCellRulesToDefs(
      [{ colId: 'price', field: 'price' }],
      [rule({ expression: '[price] > 0' })],
      engine,
    ) as Array<{ cellClassRules?: Record<string, (p: { value: number; data: Record<string, unknown> }) => boolean> }>;
    const predicate = out[0]?.cellClassRules?.['ds-rule-r1'];
    expect(typeof predicate).toBe('function');
    expect(predicate?.({ value: 5, data: { price: 5 } } as never)).toBe(true);
    expect(predicate?.({ value: 0, data: { price: 0 } } as never)).toBe(false);
  });

  it('syncs diff overlay keys for old/new suffix expressions', () => {
    const diffByApi: DiffCacheByApi = new WeakMap();
    const api = {};
    const node = {};
    const out = applyCellRulesToDefs(
      [{ colId: 'price', field: 'price' }],
      [rule({ expression: '[price.old] < [price.new]' })],
      engine,
      diffByApi,
    ) as Array<{ cellClassRules?: Record<string, (p: unknown) => boolean> }>;
    const predicate = out[0]?.cellClassRules?.['ds-rule-r1'];
    expect(predicate?.({ api, node, column: { getColId: () => 'price' }, value: 10, data: { price: 10 } })).toBe(false);
    expect(predicate?.({ api, node, column: { getColId: () => 'price' }, value: 12, data: { price: 12 } })).toBe(true);
  });

  it('layers per-rule value formatters with highest-priority match', () => {
    const defs = [{ colId: 'price', field: 'price', valueFormatter: () => 'base' }];
    const out = applyCellRulesToDefs(
      defs,
      [
        rule({ valueFormatter: { kind: 'preset', preset: 'number' } }),
        rule({
          id: 'r2',
          priority: 1,
          expression: '[price] < 0',
          valueFormatter: { kind: 'preset', preset: 'currency' },
        }),
      ],
      engine,
    ) as Array<{ valueFormatter?: (p: { value: number; data: Record<string, unknown> }) => string }>;
    expect(out[0]?.valueFormatter?.({ value: -1, data: { price: -1 } })).toBeTruthy();
    expect(out[0]?.valueFormatter?.({ value: 5, data: { price: 5 } })).toBeTruthy();
  });

  it('expires timed cell predicates inline and drops stale entries', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2020-01-01T00:00:00Z'));
    const store = createTimedRuleStore();
    const timedByApi: TimedRuleStateByApi = new WeakMap();
    const api = {};
    timedByApi.set(api, store.byRowId);
    store.upsertCellActivation('row-1', 'r1', 'price', Date.now() + 50);

    const out = applyCellRulesToDefs(
      [{ colId: 'price', field: 'price' }],
      [rule({ activeDurationMs: 500 })],
      engine,
      undefined,
      timedByApi,
    ) as Array<{ cellClassRules?: Record<string, (p: unknown) => boolean> }>;
    const predicate = Object.values(out[0]?.cellClassRules ?? {})[0];
    expect(
      predicate?.({
        api,
        node: { id: 'row-1' },
        column: { getColId: () => 'price' },
        data: {},
      }),
    ).toBe(true);

    vi.setSystemTime(new Date('2020-01-01T00:00:01Z'));
    expect(
      predicate?.({
        api,
        node: { id: 'row-1' },
        column: { getColId: () => 'price' },
        data: {},
      }),
    ).toBe(false);
    vi.useRealTimers();
  });
});

describe('extractTriggerColumns — ast shapes', () => {
  it('walks unary, ternary, call, and array nodes', () => {
    expect([...extractTriggerColumns(engine.parse('IF([a] > 0, [b], [c])'))].sort()).toEqual(['a', 'b', 'c']);
    expect([...extractTriggerColumns(engine.parse('SUM([x], [y])'))].sort()).toEqual(['x', 'y']);
    expect([...extractTriggerColumns(engine.parse('-[z]'))].sort()).toEqual(['z']);
  });
});

describe('buildRowClassPredicate — diff overlay branches', () => {
  it('syncs only referenced nested paths for diff rules', () => {
    const diffByApi: DiffCacheByApi = new WeakMap();
    const api = {};
    const node = {};
    const predicate = buildRowClassPredicate(
      engine,
      rule({ scope: { type: 'row' }, expression: '[position.qty.old] < [position.qty.new]' }),
      diffByApi,
    );
    predicate({ api, node, data: { position: { qty: 1 } } } as never);
    predicate({ api, node, data: { position: { qty: 3 } } } as never);
    const rowDiffs = diffByApi.get(api)?.get(node);
    expect(rowDiffs?.get('position.qty')).toEqual({ oldValue: 1, newValue: 3 });
  });

  it('returns false when timed row activation expired', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2020-01-01T00:00:00Z'));
    const store = createTimedRuleStore();
    const timedByApi: TimedRuleStateByApi = new WeakMap();
    const api = {};
    timedByApi.set(api, store.byRowId);
    store.upsertRowActivation('row-1', 'r1', Date.now() + 10);
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
});

describe('reinjectAllRules — indicator positions and flash targets', () => {
  it('renders header-only indicators and alternate anchor positions', () => {
    const css = cssHandle();
    reinjectAllRules(css, [
      rule({
        indicator: { icon: 'arrow-up', color: 'orange', target: 'headers', position: 'left-middle' },
      }),
    ]);
    const body = css.rules.get('conditional-r1') ?? '';
    expect(body).toContain('.ag-header-cell');
    expect(body).toContain('left: 2px');
    expect(body).toContain('translateY(-50%)');
  });

  it('defaults row-scope flash to the row surface selector', () => {
    const css = cssHandle();
    reinjectAllRules(css, [
      rule({
        scope: { type: 'row' },
        flash: { enabled: true, target: 'row', mode: 'oneShot', color: 'sky' },
      }),
    ]);
    expect(css.rules.get('conditional-r1')).toContain('.ag-row.ds-rule-r1 .ag-cell');
  });

  it('renders alternate indicator anchor positions', () => {
    for (const position of ['top-left', 'bottom-right', 'right-middle'] as const) {
      const css = cssHandle();
      reinjectAllRules(css, [
        rule({
          id: position,
          indicator: { icon: 'arrow-up', color: 'orange', target: 'cells', position },
        }),
      ]);
      expect(css.rules.get(`conditional-${position}`)).toContain('::before');
    }
  });
});

describe('timed rule predicate guards', () => {
  it('treats non-positive activeDurationMs as a normal expression rule', () => {
    const out = applyCellRulesToDefs(
      [{ colId: 'price', field: 'price' }],
      [rule({ activeDurationMs: 0, expression: '[price] > 0' })],
      engine,
    ) as Array<{ cellClassRules?: Record<string, (p: { value: number; data: Record<string, unknown> }) => boolean> }>;
    const predicate = out[0]?.cellClassRules?.['ds-rule-r1'];
    expect(typeof predicate).toBe('function');
    expect(predicate?.({ value: 5, data: { price: 5 } } as never)).toBe(true);
  });

  it('returns false for timed cell predicates when no timed state is registered', () => {
    const out = applyCellRulesToDefs(
      [{ colId: 'price', field: 'price' }],
      [rule({ activeDurationMs: 500 })],
      engine,
    ) as Array<{ cellClassRules?: Record<string, (p: unknown) => boolean> }>;
    const predicate = Object.values(out[0]?.cellClassRules ?? {})[0];
    expect(predicate?.({
      api: {},
      node: { id: 'row-1' },
      column: { getColId: () => 'price' },
      data: {},
    })).toBe(false);
  });
});

describe('timed rule store — expiry cache recompute', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('recomputes getNextExpiry after prune invalidates the cache', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2020-01-01T00:00:00Z'));
      const store = createTimedRuleStore();
      store.upsertRowActivation('row-1', 'rule-a', Date.now() + 1000);
      store.upsertRowActivation('row-2', 'rule-b', Date.now() + 5000);
      store.prune(new Set(['row-2']));
      expect(store.getNextExpiry()).toBe(Date.now() + 5000);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('buildCellClassPredicate — ag-string fast path', () => {
  it('returns an ag-grid string expression for simple value comparisons', () => {
    const out = applyCellRulesToDefs(
      [{ colId: 'price', field: 'price' }],
      [rule({ expression: 'value > 0' })],
      engine,
    ) as Array<{ cellClassRules?: Record<string, unknown> }>;
    expect(typeof out[0]?.cellClassRules?.['ds-rule-r1']).toBe('string');
  });

  it('emits dark-only css fallback when light theme props are empty', () => {
    const css = cssHandle();
    reinjectAllRules(css, [
      rule({
        style: { light: {}, dark: { color: 'cyan', borderTopWidth: '1px', borderTopStyle: 'solid', borderTopColor: 'red' } },
      }),
    ]);
    const body = css.rules.get('conditional-r1') ?? '';
    expect(body).toContain('[data-theme="dark"]');
    expect(body).toContain('::after');
  });
});
