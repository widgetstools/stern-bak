/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_ALERTS_SETTINGS,
  ExpressionEngine,
  GridPlatform,
  INITIAL_ALERTS,
} from '@wellsfargo-starui/core';
import { alertsModule } from '../index.js';
import { activateAlerts } from './activate.js';

function makeApi(initialNodes = [{ id: 'r1', data: { price: 100, qty: 5 } }]) {
  const listeners = new Map<string, Set<(event?: unknown) => void>>();
  let nodes = [...initialNodes];
  return {
    forEachNode: (cb: (node: (typeof nodes)[0]) => void) => {
      for (const n of nodes) cb(n);
    },
    setNodes: (next: typeof nodes) => {
      nodes = next;
    },
    getColumns: () => [{ getColId: () => 'price' }, { getColId: () => 'qty' }],
    addEventListener: (evt: string, fn: (event?: unknown) => void) => {
      if (!listeners.has(evt)) listeners.set(evt, new Set());
      listeners.get(evt)!.add(fn);
    },
    removeEventListener: (evt: string, fn: (event?: unknown) => void) => {
      listeners.get(evt)?.delete(fn);
    },
    listeners,
    nodes,
  };
}

function flushRows(api: ReturnType<typeof makeApi>, event?: unknown) {
  for (const fn of api.listeners.get('asyncTransactionsFlushed') ?? []) fn(event);
  vi.runAllTimers();
}

function enabledSettings(overrides: Partial<typeof DEFAULT_ALERTS_SETTINGS> = {}) {
  return { ...DEFAULT_ALERTS_SETTINGS, enabled: true, evaluationMode: 'realtime' as const, ...overrides };
}

describe('activateAlerts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('records cellValueChanged deltas when evaluation is active', () => {
    const platform = new GridPlatform({
      gridId: 'alerts-grid',
      modules: [alertsModule],
    });
    platform.store.setModuleState('alerts', () => ({
      ...INITIAL_ALERTS,
      settings: enabledSettings(),
      rules: [{
        id: 'dc1',
        name: 'Price spike',
        enabled: true,
        priority: 0,
        severity: 'info',
        trigger: { kind: 'dataChange', expression: '[price] > 50' },
        message: 'price moved',
        channels: ['badge'],
      }],
    }));
    const api = makeApi();
    platform.onGridReady(api as never);

    for (const fn of api.listeners.get('cellValueChanged') ?? []) {
      fn({
        source: 'edit',
        node: api.nodes[0],
        column: { getColId: () => 'price' },
        data: { price: 200, qty: 5 },
        oldValue: 100,
        newValue: 200,
      });
    }

    expect(platform.store.getModuleState('alerts').history.length).toBeGreaterThan(0);
    platform.destroy();
  });

  it('ignores row changes when evaluation is paused', () => {
    const platform = new GridPlatform({
      gridId: 'alerts-paused',
      modules: [alertsModule],
    });
    platform.store.setModuleState('alerts', () => ({
      ...INITIAL_ALERTS,
      settings: { ...DEFAULT_ALERTS_SETTINGS, enabled: true, evaluationMode: 'paused' },
      rules: [{
        id: 'rc1',
        name: 'Row added',
        enabled: true,
        priority: 0,
        severity: 'info',
        trigger: { kind: 'rowChange', event: 'ROW_ADDED' },
        message: 'row added',
        channels: ['badge'],
      }],
    }));
    const api = makeApi();
    platform.onGridReady(api as never);

    for (const fn of api.listeners.get('asyncTransactionsFlushed') ?? []) {
      fn({ results: [{ add: [{ id: 'r2', data: { price: 1 } }] }] });
    }
    vi.runAllTimers();
    expect(platform.store.getModuleState('alerts').history).toHaveLength(0);
    platform.destroy();
  });

  it('fires rowChange alerts on streaming row add', () => {
    const platform = new GridPlatform({ gridId: 'alerts-row-add', modules: [alertsModule] });
    platform.store.setModuleState('alerts', () => ({
      ...INITIAL_ALERTS,
      settings: enabledSettings(),
      rules: [{
        id: 'rc1',
        name: 'Row added',
        enabled: true,
        priority: 0,
        severity: 'info',
        trigger: { kind: 'rowChange', event: 'ROW_ADDED' },
        message: 'added {rowId}',
        channels: ['badge'],
      }],
    }));
    const api = makeApi();
    platform.onGridReady(api as never);

    flushRows(api, { results: [{ add: [{ id: 'r2', data: { price: 1 } }] }] });
    expect(platform.store.getModuleState('alerts').history).toHaveLength(1);
    platform.destroy();
  });

  it('evaluates relativeChange on streaming cell delta', () => {
    const platform = new GridPlatform({ gridId: 'alerts-rel', modules: [alertsModule] });
    platform.store.setModuleState('alerts', () => ({
      ...INITIAL_ALERTS,
      settings: enabledSettings({ defaultDebounceMs: 0, maxNotificationsPerSecond: 100 }),
      rules: [{
        id: 'rel1',
        name: 'Any change',
        enabled: true,
        priority: 0,
        severity: 'info',
        trigger: { kind: 'relativeChange', column: 'price', mode: 'ANY_CHANGE' },
        message: 'price changed',
        channels: ['badge'],
      }],
    }));
    const api = makeApi();
    platform.onGridReady(api as never);

    flushRows(api, {
      results: [{
        update: [{ id: 'r1', data: { price: 150, qty: 5 } }],
      }],
    });
    expect(platform.store.getModuleState('alerts').history.length).toBeGreaterThan(0);
    platform.destroy();
  });

  it('runs full pass on structural change and detects row removal', () => {
    const platform = new GridPlatform({ gridId: 'alerts-full', modules: [alertsModule] });
    platform.store.setModuleState('alerts', () => ({
      ...INITIAL_ALERTS,
      settings: enabledSettings(),
      rules: [{
        id: 'rc-remove',
        name: 'Row removed',
        enabled: true,
        priority: 0,
        severity: 'info',
        trigger: { kind: 'rowChange', event: 'ROW_REMOVED' },
        message: 'removed',
        channels: ['badge'],
      }],
    }));
    const api = makeApi([{ id: 'r1', data: { price: 1 } }]);
    platform.onGridReady(api as never);
    api.setNodes([]);
    for (const fn of api.listeners.get('sortChanged') ?? []) fn();
    vi.runAllTimers();
    expect(platform.store.getModuleState('alerts').history).toHaveLength(1);
    platform.destroy();
  });

  /**
   * Scrolling a server-side grid evicts blocks and loads others. The full
   * pass used to read that churn as rows arriving and leaving the DATASET,
   * so a ROW_ADDED / ROW_REMOVED rule fired on every scroll — on cache
   * membership, never on data.
   *
   * The port answers whether the ids a full pass can see span the dataset;
   * where they do not, the diff does not run. Nothing here asks which row
   * model is mounted.
   */
  describe('row-change alerts vs. a partially-loaded dataset', () => {
    /** Enough of the worker plane's shape for the port to bind. Never called:
     *  what is under test is the capability the binding implies. */
    const unloadableSource = () => ({
      source: {
        getRows: async () => ({ rowData: [], rowCount: 0 }),
        getSetFilterValues: async () => [],
        getStatusBar: async () => ({ totalRows: 0, filteredRows: 0, aggregations: [] }),
      },
    });

    const rowChangePlatform = (gridId: string, event: 'ROW_ADDED' | 'ROW_REMOVED') => {
      const platform = new GridPlatform({ gridId, modules: [alertsModule] });
      platform.store.setModuleState('alerts', () => ({
        ...INITIAL_ALERTS,
        settings: enabledSettings(),
        rules: [{
          id: `rc-${event}`,
          name: event,
          enabled: true,
          priority: 0,
          severity: 'info' as const,
          trigger: { kind: 'rowChange' as const, event },
          message: event,
          channels: ['badge' as const],
        }],
      }));
      return platform;
    };

    it('fires nothing when a block scrolls out of the cache', () => {
      const platform = rowChangePlatform('alerts-ssrm-out', 'ROW_REMOVED');
      platform.data.bindSsrm(unloadableSource() as never);
      const api = makeApi([{ id: 'r1', data: { price: 1 } }]);
      platform.onGridReady(api as never);

      api.setNodes([]); // the block the user scrolled away from
      for (const fn of api.listeners.get('sortChanged') ?? []) fn();
      vi.runAllTimers();

      expect(platform.store.getModuleState('alerts').history).toHaveLength(0);
      platform.destroy();
    });

    it('fires nothing when a block scrolls in', () => {
      const platform = rowChangePlatform('alerts-ssrm-in', 'ROW_ADDED');
      platform.data.bindSsrm(unloadableSource() as never);
      const api = makeApi([{ id: 'r1', data: { price: 1 } }]);
      platform.onGridReady(api as never);

      api.setNodes([
        { id: 'r1', data: { price: 1 } },
        { id: 'r2', data: { price: 2 } },
        { id: 'r3', data: { price: 3 } },
      ]);
      for (const fn of api.listeners.get('sortChanged') ?? []) fn();
      vi.runAllTimers();

      expect(platform.store.getModuleState('alerts').history).toHaveLength(0);
      platform.destroy();
    });

    it('still fires where the ids DO span the dataset — the reference behaviour', () => {
      const platform = rowChangePlatform('alerts-csrm-out', 'ROW_REMOVED');
      const api = makeApi([{ id: 'r1', data: { price: 1 } }]);
      platform.onGridReady(api as never);

      api.setNodes([]);
      for (const fn of api.listeners.get('sortChanged') ?? []) fn();
      vi.runAllTimers();

      expect(platform.store.getModuleState('alerts').history).toHaveLength(1);
      platform.destroy();
    });

    it('keeps a scrolled-out row\'s baseline, so a change across the gap still fires', () => {
      const platform = new GridPlatform({ gridId: 'alerts-ssrm-baseline', modules: [alertsModule] });
      platform.store.setModuleState('alerts', () => ({
        ...INITIAL_ALERTS,
        settings: enabledSettings(),
        rules: [{
          id: 'dc1',
          name: 'Price moved',
          enabled: true,
          priority: 0,
          severity: 'info' as const,
          trigger: { kind: 'dataChange' as const, expression: '[price] > 50' },
          message: 'price moved',
          channels: ['badge' as const],
        }],
      }));
      platform.data.bindSsrm(unloadableSource() as never);
      const api = makeApi([{ id: 'r1', data: { price: 1, qty: 1 } }]);
      platform.onGridReady(api as never);

      // Observe the row once, then scroll it out and back with a new value.
      for (const fn of api.listeners.get('sortChanged') ?? []) fn();
      vi.runAllTimers();
      api.setNodes([]);
      for (const fn of api.listeners.get('sortChanged') ?? []) fn();
      vi.runAllTimers();
      api.setNodes([{ id: 'r1', data: { price: 999, qty: 1 } }]);
      for (const fn of api.listeners.get('sortChanged') ?? []) fn();
      vi.runAllTimers();

      // The baseline survived the eviction, so the move is seen as a move —
      // dropping it re-seeded silently and the alert never fired.
      expect(platform.store.getModuleState('alerts').history).toHaveLength(1);
      platform.destroy();
    });

    /**
     * Server-side transaction deltas used to be empty ALWAYS — nothing fed
     * them — so `runDelta`'s row add/remove path was unreachable under this
     * row model and the id-set diff above was the only thing that could
     * fire. Now the tick binding and the port both report what they changed,
     * so this path runs for the first time. It is the same mechanism that
     * produced phantom alerts from cache churn, told apart by a different
     * question: the id-set diff infers arrival from "an id I cannot see",
     * a transaction STATES it.
     */
    it('a tick that updates rows fires no ROW_ADDED', () => {
      const platform = rowChangePlatform('alerts-ssrm-tick-update', 'ROW_ADDED');
      platform.data.bindSsrm(unloadableSource() as never);
      const api = makeApi([{ id: 'r1', data: { price: 1 } }]);
      platform.onGridReady(api as never);

      for (let i = 0; i < 5; i++) {
        platform.rows.transactionApplied({
          update: [{ id: 'r1', data: { price: 1 + i } }] as never,
        });
        vi.runAllTimers();
      }

      expect(platform.store.getModuleState('alerts').history).toHaveLength(0);
      platform.destroy();
    });

    it('a row genuinely entering the query fires exactly one', () => {
      const platform = rowChangePlatform('alerts-ssrm-tick-add', 'ROW_ADDED');
      platform.data.bindSsrm(unloadableSource() as never);
      const api = makeApi([{ id: 'r1', data: { price: 1 } }]);
      platform.onGridReady(api as never);

      platform.rows.transactionApplied({ add: [{ id: 'r2', data: { price: 2 } }] as never });
      vi.runAllTimers();
      // Later ticks on the same row are updates, not a second arrival.
      platform.rows.transactionApplied({ update: [{ id: 'r2', data: { price: 3 } }] as never });
      vi.runAllTimers();

      expect(platform.store.getModuleState('alerts').history).toHaveLength(1);
      platform.destroy();
    });
  });

  it('skips row subscription when no enabled rules', () => {
    const platform = new GridPlatform({ gridId: 'alerts-idle', modules: [alertsModule] });
    platform.store.setModuleState('alerts', () => ({
      ...INITIAL_ALERTS,
      settings: enabledSettings(),
      rules: [{
        id: 'off',
        name: 'Disabled',
        enabled: false,
        priority: 0,
        severity: 'info',
        trigger: { kind: 'rowChange', event: 'ROW_ADDED' },
        message: 'nope',
        channels: ['badge'],
      }],
    }));
    const api = makeApi();
    platform.onGridReady(api as never);
    flushRows(api, { results: [{ add: [{ id: 'r9', data: {} }] }] });
    expect(platform.store.getModuleState('alerts').history).toHaveLength(0);
    platform.destroy();
  });

  it('resets dispatcher debounce timers when rules mutate', () => {
    const platform = new GridPlatform({ gridId: 'alerts-reset', modules: [alertsModule] });
    platform.store.setModuleState('alerts', () => ({
      ...INITIAL_ALERTS,
      settings: enabledSettings({ defaultDebounceMs: 5000 }),
      rules: [{
        id: 'dc1',
        name: 'Price',
        enabled: true,
        priority: 0,
        severity: 'info',
        trigger: { kind: 'dataChange', expression: '[price] > 0' },
        message: 'hit',
        channels: ['badge'],
      }],
    }));
    const api = makeApi();
    platform.onGridReady(api as never);
    for (const fn of api.listeners.get('cellValueChanged') ?? []) {
      fn({
        node: api.nodes[0],
        column: { getColId: () => 'price' },
        data: { price: 200 },
        oldValue: 100,
        newValue: 200,
      });
    }
    platform.store.setModuleState('alerts', (state) => ({
      ...state,
      rules: [{ ...state.rules[0], debounceMs: 0 }],
    }));
    for (const fn of api.listeners.get('cellValueChanged') ?? []) {
      fn({
        node: api.nodes[0],
        column: { getColId: () => 'price' },
        data: { price: 300 },
        oldValue: 200,
        newValue: 300,
      });
    }
    expect(platform.store.getModuleState('alerts').history.length).toBeGreaterThan(0);
    platform.destroy();
  });

  it('ignores cellValueChanged when evaluation is disabled or missing ids', () => {
    const platform = new GridPlatform({
      gridId: 'alerts-off',
      modules: [alertsModule],
    });
    platform.store.setModuleState('alerts', () => ({
      ...INITIAL_ALERTS,
      settings: { ...DEFAULT_ALERTS_SETTINGS, enabled: false },
      rules: [{
        id: 'dc1',
        name: 'Price',
        enabled: true,
        priority: 0,
        severity: 'info',
        trigger: { kind: 'dataChange', expression: '[price] > 0' },
        message: 'hit',
        channels: ['badge'],
      }],
    }));
    const api = makeApi();
    platform.onGridReady(api as never);
    for (const fn of api.listeners.get('cellValueChanged') ?? []) {
      fn({
        node: { id: 'r1', data: { price: 200 } },
        column: { getColId: () => 'price' },
        newValue: 200,
      });
      fn({ node: { data: {} }, column: { getColId: () => 'price' }, newValue: 1 });
      fn({ node: { id: 'r1', data: {} }, column: {}, newValue: 1 });
    }
    expect(platform.store.getModuleState('alerts').history).toHaveLength(0);
    platform.destroy();
  });

  it('seeds baselines without firing on first delta observation', () => {
    const platform = new GridPlatform({ gridId: 'alerts-seed', modules: [alertsModule] });
    platform.store.setModuleState('alerts', () => ({
      ...INITIAL_ALERTS,
      settings: enabledSettings({ defaultDebounceMs: 0 }),
      rules: [{
        id: 'rel1',
        name: 'Any',
        enabled: true,
        priority: 0,
        severity: 'info',
        trigger: { kind: 'relativeChange', column: 'price', mode: 'ANY_CHANGE' },
        message: 'changed',
        channels: ['badge'],
      }],
    }));
    const api = makeApi();
    platform.onGridReady(api as never);
    flushRows(api, {
      results: [{ update: [{ id: 'r1', data: { price: 100, qty: 5 } }] }],
    });
    expect(platform.store.getModuleState('alerts').history).toHaveLength(0);
    platform.destroy();
  });

  it('runDelta skips cell evaluation when only rowChange rules are enabled', () => {
    const platform = new GridPlatform({ gridId: 'alerts-row-only', modules: [alertsModule] });
    platform.store.setModuleState('alerts', () => ({
      ...INITIAL_ALERTS,
      settings: enabledSettings(),
      rules: [{
        id: 'rc1',
        name: 'Added',
        enabled: true,
        priority: 0,
        severity: 'info',
        trigger: { kind: 'rowChange', event: 'ROW_ADDED' },
        message: 'added',
        channels: ['badge'],
      }],
    }));
    const api = makeApi();
    platform.onGridReady(api as never);
    flushRows(api, {
      results: [{ update: [{ id: 'r1', data: { price: 999, qty: 5 } }] }],
    });
    expect(platform.store.getModuleState('alerts').history).toHaveLength(0);
    platform.destroy();
  });

  it('handles nodes without ids and forEachNode failures during teardown', () => {
    const platform = new GridPlatform({ gridId: 'alerts-edge', modules: [alertsModule] });
    platform.store.setModuleState('alerts', () => ({
      ...INITIAL_ALERTS,
      settings: enabledSettings(),
      rules: [{
        id: 'rc1',
        name: 'Added',
        enabled: true,
        priority: 0,
        severity: 'info',
        trigger: { kind: 'rowChange', event: 'ROW_ADDED' },
        message: 'added',
        channels: ['badge'],
      }],
    }));
    const api = makeApi();
    platform.onGridReady(api as never);
    flushRows(api, {
      results: [{ add: [{ data: { price: 1 } }] }],
    });
    api.forEachNode = () => { throw new Error('teardown'); };
    for (const fn of api.listeners.get('sortChanged') ?? []) fn();
    vi.runAllTimers();
    expect(() => platform.destroy()).not.toThrow();
  });

  it('uses oldValue baseline on first cellValueChanged when prev store is empty', () => {
    const platform = new GridPlatform({ gridId: 'alerts-first-edit', modules: [alertsModule] });
    platform.store.setModuleState('alerts', () => ({
      ...INITIAL_ALERTS,
      settings: enabledSettings({ defaultDebounceMs: 0 }),
      rules: [{
        id: 'dc1',
        name: 'Spike',
        enabled: true,
        priority: 0,
        severity: 'info',
        trigger: { kind: 'dataChange', expression: '[price] > 150' },
        message: 'spike',
        channels: ['badge'],
      }],
    }));
    const api = makeApi([{ id: 'r1', data: { price: 100, qty: 1 } }]);
    platform.onGridReady(api as never);
    for (const fn of api.listeners.get('cellValueChanged') ?? []) {
      fn({
        node: api.nodes[0],
        column: { getColId: () => 'price' },
        data: { price: 200, qty: 1 },
        oldValue: 100,
        newValue: 200,
      });
    }
    expect(platform.store.getModuleState('alerts').history.length).toBeGreaterThan(0);
    platform.destroy();
  });

  it('cleans up removed rows from delta and ignores when alerts module disabled', () => {
    const platform = new GridPlatform({ gridId: 'alerts-disabled', modules: [alertsModule] });
    platform.store.setModuleState('alerts', () => ({
      ...INITIAL_ALERTS,
      settings: { ...DEFAULT_ALERTS_SETTINGS, enabled: false },
      rules: [{
        id: 'rel1',
        name: 'Rel',
        enabled: true,
        priority: 0,
        severity: 'info',
        trigger: { kind: 'relativeChange', column: 'price', mode: 'ANY_CHANGE' },
        message: 'x',
        channels: ['badge'],
      }],
    }));
    const api = makeApi();
    platform.onGridReady(api as never);
    flushRows(api, {
      results: [{ removed: [{ id: 'r1', data: { price: 1 } }] }],
    });
    expect(platform.store.getModuleState('alerts').history).toHaveLength(0);
    platform.destroy();
  });

  it('dispose clears previous values safely', () => {
    const engine = platformMock();
    const dispose = activateAlerts(engine as never);
    expect(() => dispose()).not.toThrow();
  });

  it('swallows per-disposer failures during teardown', () => {
    const api = makeApi();
    let readyCb: ((a: typeof api) => void) | null = null;
    const engine = {
      gridId: 'mock-dispose',
      getState: () => ({
        ...INITIAL_ALERTS,
        settings: enabledSettings(),
        rules: [],
      }),
      subscribe: () => () => { throw new Error('sub dispose fail'); },
      rows: { subscribe: () => () => {} },
      events: { on: () => () => {}, emit: () => {} },
      resources: { expression: () => new ExpressionEngine() },
      api: {
        onReady: (fn: (a: typeof api) => void) => {
          readyCb = fn;
          return () => { throw new Error('ready dispose fail'); };
        },
        api,
      },
    };
    const dispose = activateAlerts(engine as never);
    readyCb?.(api);
    expect(() => dispose()).not.toThrow();
  });

  it('skips delta cell scan when watched column set is empty', () => {
    const platform = new GridPlatform({ gridId: 'alerts-no-cols', modules: [alertsModule] });
    platform.store.setModuleState('alerts', () => ({
      ...INITIAL_ALERTS,
      settings: enabledSettings(),
      rules: [{
        id: 'dc1',
        name: 'Expr',
        enabled: true,
        priority: 0,
        severity: 'info',
        trigger: { kind: 'dataChange', expression: '[missingCol] > 0' },
        message: 'hit',
        channels: ['badge'],
      }],
    }));
    const api = makeApi();
    api.getColumns = () => [];
    platform.onGridReady(api as never);
    flushRows(api, {
      results: [{ update: [{ id: 'r1', data: { price: 2 } }] }],
    });
    expect(platform.store.getModuleState('alerts').history).toHaveLength(0);
    platform.destroy();
  });

  it('does not duplicate alerts when delta values are unchanged', () => {
    const platform = new GridPlatform({ gridId: 'alerts-same', modules: [alertsModule] });
    platform.store.setModuleState('alerts', () => ({
      ...INITIAL_ALERTS,
      settings: enabledSettings({ defaultDebounceMs: 0 }),
      rules: [{
        id: 'rel1',
        name: 'Any',
        enabled: true,
        priority: 0,
        severity: 'info',
        trigger: { kind: 'relativeChange', column: 'price', mode: 'ANY_CHANGE' },
        message: 'changed',
        channels: ['badge'],
      }],
    }));
    const api = makeApi();
    platform.onGridReady(api as never);
    flushRows(api, {
      results: [{ update: [{ id: 'r1', data: { price: 100, qty: 5 } }] }],
    });
    const afterSeed = platform.store.getModuleState('alerts').history.length;
    flushRows(api, {
      results: [{ update: [{ id: 'r1', data: { price: 100, qty: 5 } }] }],
    });
    expect(platform.store.getModuleState('alerts').history.length).toBe(afterSeed);
    platform.destroy();
  });

  it('drops baselines for removed rows on streaming delta', () => {
    const platform = new GridPlatform({ gridId: 'alerts-remove', modules: [alertsModule] });
    platform.store.setModuleState('alerts', () => ({
      ...INITIAL_ALERTS,
      settings: enabledSettings({ defaultDebounceMs: 0 }),
      rules: [{
        id: 'rel1',
        name: 'Any',
        enabled: true,
        priority: 0,
        severity: 'info',
        trigger: { kind: 'relativeChange', column: 'price', mode: 'ANY_CHANGE' },
        message: 'changed',
        channels: ['badge'],
      }],
    }));
    const api = makeApi();
    platform.onGridReady(api as never);
    flushRows(api, {
      results: [{ update: [{ id: 'r1', data: { price: 100, qty: 5 } }] }],
    });
    flushRows(api, {
      results: [{ removed: [{ id: 'r1', data: { price: 100, qty: 5 } }] }],
    });
    flushRows(api, {
      results: [{ add: [{ id: 'r1', data: { price: 200, qty: 5 } }] }],
    });
    expect(platform.store.getModuleState('alerts').history.length).toBeGreaterThan(0);
    platform.destroy();
  });

  it('memoizes watched columns for stable rule sets across ticks', () => {
    const platform = new GridPlatform({ gridId: 'alerts-memo', modules: [alertsModule] });
    const rules = [{
      id: 'dc1',
      name: 'Price',
      enabled: true,
      priority: 0,
      severity: 'info' as const,
      trigger: { kind: 'dataChange' as const, expression: '[price] > 0' },
      message: 'hit',
      channels: ['badge' as const],
    }];
    platform.store.setModuleState('alerts', () => ({
      ...INITIAL_ALERTS,
      settings: enabledSettings({ defaultDebounceMs: 0 }),
      rules,
    }));
    const api = makeApi();
    platform.onGridReady(api as never);
    flushRows(api, { results: [{ update: [{ id: 'r1', data: { price: 10, qty: 1 } }] }] });
    flushRows(api, { results: [{ update: [{ id: 'r1', data: { price: 20, qty: 1 } }] }] });
    platform.destroy();
  });

  it('ignores cell edits when alerts module is disabled at settings level', () => {
    const platform = new GridPlatform({ gridId: 'alerts-settings-off', modules: [alertsModule] });
    platform.store.setModuleState('alerts', () => ({
      ...INITIAL_ALERTS,
      settings: { ...DEFAULT_ALERTS_SETTINGS, enabled: false, evaluationMode: 'realtime' },
      rules: [{
        id: 'dc1',
        name: 'Price',
        enabled: true,
        priority: 0,
        severity: 'info',
        trigger: { kind: 'dataChange', expression: '[price] > 0' },
        message: 'hit',
        channels: ['badge'],
      }],
    }));
    const api = makeApi();
    platform.onGridReady(api as never);
    for (const fn of api.listeners.get('cellValueChanged') ?? []) {
      fn({
        node: api.nodes[0],
        column: { getColId: () => 'price' },
        data: { price: 999 },
        oldValue: 1,
        newValue: 999,
      });
    }
    expect(platform.store.getModuleState('alerts').history).toHaveLength(0);
    platform.destroy();
  });

  it('returns early from row subscription when grid api is unavailable', () => {
    const engine = {
      gridId: 'no-api',
      getState: () => ({
        ...INITIAL_ALERTS,
        settings: enabledSettings(),
        rules: [{
          id: 'dc1',
          name: 'Price',
          enabled: true,
          priority: 0,
          severity: 'info',
          trigger: { kind: 'dataChange', expression: '[price] > 0' },
          message: 'hit',
          channels: ['badge'],
        }],
      }),
      subscribe: () => () => {},
      rows: {
        subscribe: (fn: (change: unknown) => void) => {
          fn({ updated: [{ id: 'r1', data: { price: 2 } }], added: [], removed: [], full: false });
          return () => {};
        },
      },
      events: { on: () => () => {}, emit: () => {} },
      resources: { expression: () => new ExpressionEngine() },
      api: { onReady: () => () => {}, api: null },
    };
    expect(() => activateAlerts(engine as never)).not.toThrow();
  });

  it('seeds baselines safely when onReady forEachNode throws', () => {
    const platform = new GridPlatform({ gridId: 'alerts-seed-err', modules: [alertsModule] });
    platform.store.setModuleState('alerts', () => ({
      ...INITIAL_ALERTS,
      settings: enabledSettings(),
      rules: [{
        id: 'dc1',
        name: 'Price',
        enabled: true,
        priority: 0,
        severity: 'info',
        trigger: { kind: 'dataChange', expression: '[price] > 0' },
        message: 'hit',
        channels: ['badge'],
      }],
    }));
    const api = makeApi();
    api.forEachNode = () => { throw new Error('seed fail'); };
    expect(() => platform.onGridReady(api as never)).not.toThrow();
    platform.destroy();
  });

  it('ignores cellValueChanged without a resolvable row id', () => {
    const platform = new GridPlatform({ gridId: 'alerts-no-row', modules: [alertsModule] });
    platform.store.setModuleState('alerts', () => ({
      ...INITIAL_ALERTS,
      settings: enabledSettings(),
      rules: [{
        id: 'dc1',
        name: 'Price',
        enabled: true,
        priority: 0,
        severity: 'info',
        trigger: { kind: 'dataChange', expression: '[price] > 0' },
        message: 'hit',
        channels: ['badge'],
      }],
    }));
    const api = makeApi();
    platform.onGridReady(api as never);
    for (const fn of api.listeners.get('cellValueChanged') ?? []) {
      fn({
        node: { data: { price: 1 } },
        column: { getColId: () => 'price' },
        newValue: 1,
      });
    }
    expect(platform.store.getModuleState('alerts').history).toHaveLength(0);
    platform.destroy();
  });

  it('runFullPass no-ops when api disappears before structural event', () => {
    let rowHandler: ((change: unknown) => void) | null = null;
    const engine = {
      gridId: 'full-no-api',
      getState: () => ({
        ...INITIAL_ALERTS,
        settings: enabledSettings(),
        rules: [{
          id: 'rc1',
          name: 'Added',
          enabled: true,
          priority: 0,
          severity: 'info',
          trigger: { kind: 'rowChange', event: 'ROW_ADDED' },
          message: 'added',
          channels: ['badge'],
        }],
      }),
      subscribe: () => () => {},
      rows: {
        subscribe: (fn: (change: unknown) => void) => {
          rowHandler = fn;
          return () => {};
        },
      },
      events: { on: () => () => {}, emit: () => {} },
      resources: { expression: () => new ExpressionEngine() },
      api: {
        onReady: () => () => {},
        get api() { return null; },
      },
    };
    activateAlerts(engine as never);
    expect(() => rowHandler?.({ full: true, added: [], updated: [], removed: [] })).not.toThrow();
  });
});

function platformMock() {
  const api = makeApi();
  const state = {
    ...INITIAL_ALERTS,
    settings: { ...DEFAULT_ALERTS_SETTINGS, enabled: true },
    rules: [],
  };
  return {
    gridId: 'mock',
    getState: () => state,
    getModuleState: () => state,
    setState: (updater: (prev: typeof state) => typeof state) => {
      Object.assign(state, updater(state));
    },
    subscribe: () => () => {},
    rows: { subscribe: () => () => {} },
    events: { on: () => () => {}, emit: () => {} },
    resources: { expression: () => new ExpressionEngine() },
    api: {
      onReady: (fn: (a: typeof api) => void) => {
        fn(api);
        return () => {};
      },
      api,
    },
  };
}

/**
 * The bell counts a hit the client could never have found: a `dataChange` rule
 * matched by a row this grid has not loaded, reported by the data source on
 * `data:alertHits`.
 *
 * The module subscribes to an event that, in a grid holding every row, never
 * arrives — so this is not a branch on the row model, and a client-side grid
 * needs no change for its behaviour to stay exactly as it was.
 */
describe('alerts on rows this grid never loaded', () => {
  const dataChangeRule = {
    id: 'dc-remote',
    name: 'Price spike',
    enabled: true,
    priority: 0,
    severity: 'info' as const,
    trigger: { kind: 'dataChange' as const, expression: '[price] > 50' },
    message: 'spike on {rowId}',
    channels: ['badge' as const],
  };

  const platformWith = (gridId: string, rules: unknown[] = [dataChangeRule]) => {
    const platform = new GridPlatform({ gridId, modules: [alertsModule] });
    platform.store.setModuleState('alerts', () => ({
      ...INITIAL_ALERTS,
      settings: enabledSettings({ defaultDebounceMs: 0, maxNotificationsPerSecond: 100 }),
      rules,
    }));
    platform.onGridReady(makeApi() as never);
    return platform;
  };

  const history = (p: GridPlatform) => p.store.getModuleState('alerts').history;

  it('counts a hit reported for an unloaded row', () => {
    const platform = platformWith('alerts-remote');
    platform.events.emit('data:alertHits', {
      gridId: 'alerts-remote',
      hits: [{ rowId: 'never-loaded', ruleId: 'dc-remote' }],
    });
    expect(history(platform)).toHaveLength(1);
    expect(history(platform)[0]).toMatchObject({
      ruleId: 'dc-remote',
      rowId: 'never-loaded',
      // A row predicate on a row nobody holds has no cell context, and the
      // module does not invent one.
      column: null,
    });
    platform.destroy();
  });

  it('counts once per (rule, row) in a batch, and once per rule for one row', () => {
    const second = { ...dataChangeRule, id: 'dc-2', name: 'Second' };
    const platform = platformWith('alerts-remote-batch', [dataChangeRule, second]);
    platform.events.emit('data:alertHits', {
      gridId: 'alerts-remote-batch',
      hits: [
        { rowId: 'r-far', ruleId: 'dc-remote' },
        { rowId: 'r-far', ruleId: 'dc-2' },
        { rowId: 'r-other', ruleId: 'dc-remote' },
      ],
    });
    expect(history(platform)).toHaveLength(3);
    platform.destroy();
  });

  it('ignores an event addressed to a different grid', () => {
    const platform = platformWith('alerts-remote-mine');
    platform.events.emit('data:alertHits', {
      gridId: 'someone-elses-grid',
      hits: [{ rowId: 'x', ruleId: 'dc-remote' }],
    });
    expect(history(platform)).toHaveLength(0);
    platform.destroy();
  });

  it('ignores a hit for a rule this grid does not have, or has disabled', () => {
    const platform = platformWith('alerts-remote-unknown', [
      { ...dataChangeRule, enabled: false },
    ]);
    platform.events.emit('data:alertHits', {
      gridId: 'alerts-remote-unknown',
      hits: [
        { rowId: 'x', ruleId: 'dc-remote' },
        { rowId: 'y', ruleId: 'no-such-rule' },
      ],
    });
    expect(history(platform)).toHaveLength(0);
    platform.destroy();
  });

  it('respects the paused switch', () => {
    const platform = new GridPlatform({ gridId: 'alerts-remote-paused', modules: [alertsModule] });
    platform.store.setModuleState('alerts', () => ({
      ...INITIAL_ALERTS,
      settings: { ...DEFAULT_ALERTS_SETTINGS, enabled: true, evaluationMode: 'paused' as const },
      rules: [dataChangeRule],
    }));
    platform.onGridReady(makeApi() as never);
    platform.events.emit('data:alertHits', {
      gridId: 'alerts-remote-paused',
      hits: [{ rowId: 'x', ruleId: 'dc-remote' }],
    });
    expect(history(platform)).toHaveLength(0);
    platform.destroy();
  });

  it('does NOT fire a relativeChange rule — there is no baseline for a row nobody saw', () => {
    const platform = platformWith('alerts-remote-rel', [{
      id: 'rel-remote',
      name: 'Moved',
      enabled: true,
      priority: 0,
      severity: 'info' as const,
      trigger: { kind: 'relativeChange' as const, column: 'price', mode: 'ANY_CHANGE' as const },
      message: 'moved',
      channels: ['badge' as const],
    }]);
    platform.events.emit('data:alertHits', {
      gridId: 'alerts-remote-rel',
      hits: [{ rowId: 'x', ruleId: 'rel-remote' }],
    });
    expect(history(platform)).toHaveLength(0);
    platform.destroy();
  });

  it('stops counting after teardown', () => {
    const platform = platformWith('alerts-remote-teardown');
    platform.destroy();
    platform.events.emit('data:alertHits', {
      gridId: 'alerts-remote-teardown',
      hits: [{ rowId: 'x', ruleId: 'dc-remote' }],
    });
    expect(history(platform)).toHaveLength(0);
  });
});
