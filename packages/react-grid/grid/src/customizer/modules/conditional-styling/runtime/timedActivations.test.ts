import { describe, expect, it, vi } from 'vitest';
import { createTimedRuleStore } from '@wellsfargo-starui/core';
import { createTimedActivations } from './timedActivations.js';
import type { TriggerCache } from './triggerCache.js';

/**
 * Contract under test: the streaming (delta) pass must touch ONLY the
 * rows the RowChangeBus delivered — the old shape forEachNode-scanned
 * all rows × all known paths per flush (~8M path reads/sec with one
 * timed rule armed on a 20k-row blotter).
 */

type Node = { id: string; data: Record<string, unknown> };

function makeNode(id: string, data: Record<string, unknown>): Node {
  return { id, data };
}

function makeHarness(nodes: Node[]) {
  const forEachNode = vi.fn((cb: (n: Node) => void) => {
    for (const n of nodes) cb(n);
  });
  const api = {
    forEachNode,
    getColumns: () => [{ getColId: () => 'price' }],
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  const evaluated: string[] = [];
  const engine = {
    parseAndEvaluate: vi.fn((_expr: string, ctx: { data?: Record<string, unknown> }) => {
      evaluated.push(String(ctx.data?.__id ?? '?'));
      return true; // every evaluated row matches → activates
    }),
  };
  const rule = {
    id: 'r1',
    enabled: true,
    activeDurationMs: 5_000,
    expression: '[price] > 0',
    scope: { type: 'row' as const },
  };
  const platform = {
    api: { api },
    getState: () => ({ rules: [rule] }),
    resources: { expression: () => engine },
  };
  const triggers = { get: () => new Set(['price']) } as unknown as TriggerCache;
  const deps = {
    // Per-harness store — timed state is per-grid now, so tests don't
    // need (and can't use) a global clear between cases.
    store: createTimedRuleStore(),
    triggers,
    diffCacheByApi: new WeakMap(),
    scheduleRefresh: vi.fn(),
    scheduleTargetedRefresh: vi.fn(),
    armNextExpiry: vi.fn(),
    evaluate: vi.fn(),
  };
  const timed = createTimedActivations(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    platform as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    deps as any,
  );
  return { timed, forEachNode, evaluated, deps };
}

describe('processTimedActivations — delta vs full pass', () => {
  it('delta pass touches ONLY delivered rows and never forEachNode-scans the model', () => {
    const nodes = [
      makeNode('a', { __id: 'a', price: 1 }),
      makeNode('b', { __id: 'b', price: 2 }),
      makeNode('c', { __id: 'c', price: 3 }),
    ];
    const { timed, forEachNode, evaluated, deps } = makeHarness(nodes);

    timed.processTimedActivations({
      added: [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      updated: [nodes[1] as any],
      removed: [],
      full: false,
    });

    expect(forEachNode).not.toHaveBeenCalled();
    expect(evaluated).toEqual(['b']);
    expect(deps.armNextExpiry).toHaveBeenCalled(); // rule matched → activated
  });

  it('full pass (no change / structural) walks the whole model', () => {
    const nodes = [
      makeNode('a', { __id: 'a', price: 1 }),
      makeNode('b', { __id: 'b', price: 2 }),
    ];
    const { timed, forEachNode, evaluated } = makeHarness(nodes);

    timed.processTimedActivations();

    expect(forEachNode).toHaveBeenCalledTimes(1);
    expect(evaluated.sort()).toEqual(['a', 'b']);
  });

  it('delta pass with unchanged values evaluates nothing (diff-gated)', () => {
    const nodes = [makeNode('a', { __id: 'a', price: 1 })];
    const { timed, evaluated } = makeHarness(nodes);

    // Seed the snapshot via one pass, then deliver the SAME row again.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    timed.processTimedActivations({ added: [nodes[0] as any], updated: [], removed: [], full: false });
    evaluated.length = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    timed.processTimedActivations({ added: [], updated: [nodes[0] as any], removed: [], full: false });

    expect(evaluated).toEqual([]); // no path changed → no rule evaluation
  });

  it('removes row snapshots on delta removed nodes', () => {
    const nodes = [makeNode('a', { __id: 'a', price: 1 })];
    const { timed, forEachNode } = makeHarness(nodes);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    timed.processTimedActivations({ added: [nodes[0] as any], updated: [], removed: [], full: false });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    timed.processTimedActivations({ added: [], updated: [], removed: [nodes[0] as any], full: false });
    forEachNode.mockClear();
    timed.processTimedActivations();
    expect(forEachNode).toHaveBeenCalled();
  });

  it('attachCellValueChangedListener activates row rules and disposes', () => {
    const node = makeNode('a', { __id: 'a', price: 1 });
    const apiListeners = new Map<string, Set<(event: unknown) => void>>();
    const api = {
      addEventListener: (evt: string, fn: (event: unknown) => void) => {
        if (!apiListeners.has(evt)) apiListeners.set(evt, new Set());
        apiListeners.get(evt)!.add(fn);
      },
      removeEventListener: (evt: string, fn: (event: unknown) => void) => {
        apiListeners.get(evt)?.delete(fn);
      },
    };
    const store = createTimedRuleStore();
    const deps = {
      store,
      triggers: { get: () => new Set(['price']) } as unknown as TriggerCache,
      diffCacheByApi: new WeakMap(),
      scheduleRefresh: vi.fn(),
      scheduleTargetedRefresh: vi.fn(),
      armNextExpiry: vi.fn(),
      evaluate: vi.fn(),
    };
    const platform = {
      api: { api },
      getState: () => ({
        rules: [{
          id: 'r1',
          enabled: true,
          activeDurationMs: 5_000,
          expression: '[price] > 0',
          scope: { type: 'row' as const },
        }],
      }),
      resources: {
        expression: () => ({
          parseAndEvaluate: () => true,
        }),
      },
    };
    const timed = createTimedActivations(platform as never, deps as never);
    const dispose = timed.attachCellValueChangedListener();
    for (const fn of apiListeners.get('cellValueChanged') ?? []) {
      fn({
        node,
        column: { getColId: () => 'price' },
        oldValue: 0,
        newValue: 1,
      });
    }
    expect(store.byRowId.size).toBeGreaterThan(0);
    expect(deps.armNextExpiry).toHaveBeenCalled();
    dispose();
    timed.dispose();
  });

  it('no-ops when api is missing or no timed rules are armed', () => {
    const deps = {
      store: createTimedRuleStore(),
      triggers: { get: () => new Set(['price']) } as unknown as TriggerCache,
      diffCacheByApi: new WeakMap(),
      scheduleRefresh: vi.fn(),
      scheduleTargetedRefresh: vi.fn(),
      armNextExpiry: vi.fn(),
      evaluate: vi.fn(),
    };
    const timed = createTimedActivations({
      api: { api: null },
      getState: () => ({ rules: [{ id: 'r1', enabled: true, activeDurationMs: 1000, expression: '[price]>0', scope: { type: 'row' } }] }),
      resources: { expression: () => ({ parseAndEvaluate: () => true }) },
    } as never, deps as never);
    timed.processTimedActivations();
    expect(deps.armNextExpiry).not.toHaveBeenCalled();

    const timed2 = createTimedActivations({
      api: { api: { forEachNode: vi.fn(), getColumns: () => [] } },
      getState: () => ({ rules: [{ id: 'r1', enabled: true, activeDurationMs: null, expression: '[price]>0', scope: { type: 'row' } }] }),
      resources: { expression: () => ({ parseAndEvaluate: () => true }) },
    } as never, deps as never);
    timed2.processTimedActivations();
    expect(deps.armNextExpiry).not.toHaveBeenCalled();
  });

  it('activates cell-scope rules and schedules cross-column refresh', () => {
    const node = makeNode('a', { __id: 'a', price: 1, side: 'B', qty: 10 });
    const apiListeners = new Map<string, Set<(event: unknown) => void>>();
    const scheduleTargetedRefresh = vi.fn();
    const api = {
      addEventListener: (evt: string, fn: (event: unknown) => void) => {
        if (!apiListeners.has(evt)) apiListeners.set(evt, new Set());
        apiListeners.get(evt)!.add(fn);
      },
      removeEventListener: (evt: string, fn: (event: unknown) => void) => {
        apiListeners.get(evt)?.delete(fn);
      },
      getColumns: () => [{ getColId: () => 'price' }, { getColId: () => 'side' }],
    };
    const store = createTimedRuleStore();
    const deps = {
      store,
      triggers: {
        get: (rule: { id: string }) => (rule.id === 'cell-rule' ? new Set(['price']) : new Set()),
      } as unknown as TriggerCache,
      diffCacheByApi: new WeakMap(),
      scheduleRefresh: vi.fn(),
      scheduleTargetedRefresh,
      armNextExpiry: vi.fn(),
      evaluate: vi.fn(),
    };
    const platform = {
      api: { api },
      getState: () => ({
        rules: [{
          id: 'cell-rule',
          enabled: true,
          activeDurationMs: 5_000,
          expression: '[price] > 0',
          scope: { type: 'cell' as const, columns: ['price', 'side'] },
          flash: { enabled: true, target: 'headers', mode: 'solid', color: { light: '#fff', dark: '#000' } },
        }],
      }),
      resources: {
        expression: () => ({
          parseAndEvaluate: () => true,
        }),
      },
    };
    const timed = createTimedActivations(platform as never, deps as never);
    timed.attachCellValueChangedListener();
    timed.processTimedActivations({
      added: [],
      updated: [node],
      removed: [],
      full: false,
    });
    expect(store.byRowId.size).toBeGreaterThan(0);

    for (const fn of apiListeners.get('cellValueChanged') ?? []) {
      fn({
        node,
        column: { getColId: () => 'price' },
        oldValue: 0,
        newValue: 2,
      });
    }
    expect(scheduleTargetedRefresh).toHaveBeenCalled();
    expect(deps.evaluate).toHaveBeenCalled();
    timed.dispose();
  });

  it('skips cell rules when trigger columns did not change and handles evaluate errors', () => {
    const nodes = [makeNode('a', { __id: 'a', price: 1, side: 'B' })];
    const engine = {
      parseAndEvaluate: vi.fn(() => { throw new Error('bad expr'); }),
    };
    const rule = {
      id: 'cell-rule',
      enabled: true,
      activeDurationMs: 5_000,
      expression: '[side] > 0',
      scope: { type: 'cell' as const, columns: ['side'] },
    };
    const platform = {
      api: { api: { forEachNode: vi.fn(), getColumns: () => [{ getColId: () => 'price' }] } },
      getState: () => ({ rules: [rule] }),
      resources: { expression: () => engine },
    };
    const deps = {
      store: createTimedRuleStore(),
      triggers: { get: () => new Set(['side']) } as unknown as TriggerCache,
      diffCacheByApi: new WeakMap(),
      scheduleRefresh: vi.fn(),
      scheduleTargetedRefresh: vi.fn(),
      armNextExpiry: vi.fn(),
      evaluate: vi.fn(),
    };
    const timed = createTimedActivations(platform as never, deps as never);
    timed.processTimedActivations({
      added: [],
      updated: [nodes[0]],
      removed: [],
      full: false,
    });
    expect(deps.armNextExpiry).not.toHaveBeenCalled();
    timed.dispose();
  });

  it('attachCellValueChangedListener no-ops when api is missing', () => {
    const timed = createTimedActivations({
      api: { api: null },
      getState: () => ({ rules: [] }),
      resources: { expression: () => ({ parseAndEvaluate: () => true }) },
    } as never, {
      store: createTimedRuleStore(),
      triggers: { get: () => new Set() } as unknown as TriggerCache,
      diffCacheByApi: new WeakMap(),
      scheduleRefresh: vi.fn(),
      scheduleTargetedRefresh: vi.fn(),
      armNextExpiry: vi.fn(),
      evaluate: vi.fn(),
    } as never);
    expect(timed.attachCellValueChangedListener()).toEqual(expect.any(Function));
  });

  it('cellValueChanged ignores malformed events and non-matching cell rules', () => {
    const node = makeNode('a', { __id: 'a', price: 1, side: 'B' });
    const apiListeners = new Map<string, Set<(event: unknown) => void>>();
    const scheduleRefresh = vi.fn();
    const api = {
      addEventListener: (evt: string, fn: (event: unknown) => void) => {
        if (!apiListeners.has(evt)) apiListeners.set(evt, new Set());
        apiListeners.get(evt)!.add(fn);
      },
      removeEventListener: vi.fn(),
      getColumns: () => [{ getColId: () => 'price' }],
    };
    const store = createTimedRuleStore();
    const deps = {
      store,
      triggers: { get: () => new Set(['price']) } as unknown as TriggerCache,
      diffCacheByApi: new WeakMap(),
      scheduleRefresh,
      scheduleTargetedRefresh: vi.fn(),
      armNextExpiry: vi.fn(),
      evaluate: vi.fn(),
    };
    const platform = {
      api: { api },
      getState: () => ({
        rules: [{
          id: 'cell-rule',
          enabled: true,
          activeDurationMs: 5_000,
          expression: '[price] > 99',
          scope: { type: 'cell' as const, columns: ['side'] },
        }],
      }),
      resources: {
        expression: () => ({
          parseAndEvaluate: () => false,
        }),
      },
    };
    const timed = createTimedActivations(platform as never, deps as never);
    const dispose = timed.attachCellValueChangedListener();
    for (const fn of apiListeners.get('cellValueChanged') ?? []) {
      fn({});
      fn({ node, column: {} });
      fn({
        node,
        column: { getColId: () => 'price' },
        oldValue: 0,
        newValue: 1,
      });
    }
    expect(scheduleRefresh).not.toHaveBeenCalled();
    dispose();
  });
});
