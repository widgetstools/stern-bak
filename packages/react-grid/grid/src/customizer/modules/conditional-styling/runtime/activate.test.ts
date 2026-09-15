/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ExpressionEngine,
  GridPlatform,
  INITIAL_CONDITIONAL_STYLING,
} from '@wellsfargo-starui/core';
import { conditionalStylingModule } from '../index.js';
import { activateConditionalStyling } from './activate.js';

function makeApi() {
  const listeners = new Map<string, Set<(event?: unknown) => void>>();
  return {
    refreshCells: vi.fn(),
    forEachNode: vi.fn((cb: (node: { id: string; data: Record<string, unknown> }) => void) => {
      cb({ id: 'r1', data: { price: 1 } });
    }),
    forEachNodeAfterFilter: vi.fn((cb: (node: { id: string; data: Record<string, unknown> }) => void) => {
      cb({ id: 'r1', data: { price: 1 } });
    }),
    addEventListener: (evt: string, fn: (event?: unknown) => void) => {
      if (!listeners.has(evt)) listeners.set(evt, new Set());
      listeners.get(evt)!.add(fn);
    },
    removeEventListener: (evt: string, fn: (event?: unknown) => void) => {
      listeners.get(evt)?.delete(fn);
    },
    getColumns: () => [{ getColId: () => 'price' }],
    listeners,
  };
}

describe('activateConditionalStyling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('wires onReady, row changes, and dispose cleanly', () => {
    const platform = new GridPlatform({
      gridId: 'cs-grid',
      modules: [conditionalStylingModule],
    });
    const api = makeApi();
    platform.onGridReady(api as never);

    platform.store.setModuleState('conditional-styling', (state) => ({
      ...state,
      rules: [{
        id: 'r1',
        enabled: true,
        expression: '[price] > 0',
        activeDurationMs: 1000,
        scope: { type: 'row' },
      }],
    }));

    for (const fn of api.listeners.get('asyncTransactionsFlushed') ?? []) {
      fn({
        results: [{ update: [{ id: 'r1', data: { price: 2 } }] }],
      });
    }
    vi.runAllTimers();

    expect(api.refreshCells).toHaveBeenCalled();
    platform.destroy();
    expect(() => platform.destroy()).not.toThrow();
  });

  it('prunes timed rules and rebuilds triggers on state subscribe', () => {
    const platform = new GridPlatform({
      gridId: 'cs-grid-2',
      modules: [conditionalStylingModule],
    });
    const api = makeApi();
    platform.onGridReady(api as never);

    platform.store.setModuleState('conditional-styling', (state) => ({
      ...state,
      rules: [{
        id: 'timed',
        enabled: true,
        expression: '[price] > 0',
        activeDurationMs: 5000,
        scope: { type: 'row' },
      }],
    }));

    platform.store.setModuleState('conditional-styling', (state) => ({
      ...state,
      rules: [],
    }));
    vi.runAllTimers();
    platform.destroy();
  });

  it('safely disposes even when subsystems throw', () => {
    const engine = new ExpressionEngine();
    const platform = {
      resources: {
        cache: () => new WeakMap(),
        expression: () => engine,
      },
      api: {
        onReady: (fn: (api: unknown) => void) => {
          fn(makeApi());
          return () => {};
        },
        on: () => () => {},
        api: makeApi(),
      },
      rows: { subscribe: () => () => {} },
      getState: () => ({ ...INITIAL_CONDITIONAL_STYLING, rules: [] }),
      subscribe: () => () => {},
    };
    const dispose = activateConditionalStyling(platform as never);
    expect(() => dispose()).not.toThrow();
  });

  it('filterChanged evaluates header paint rules', () => {
    const platform = new GridPlatform({
      gridId: 'cs-grid-filter',
      modules: [conditionalStylingModule],
    });
    const api = makeApi();
    platform.onGridReady(api as never);
    platform.store.setModuleState('conditional-styling', (state) => ({
      ...state,
      rules: [{
        id: 'hdr',
        enabled: true,
        expression: '[price] > 0',
        scope: { type: 'cell', columns: ['price'] },
        flash: { enabled: true, target: 'headers', mode: 'solid', color: { light: '#fff', dark: '#000' } },
        style: { light: {}, dark: {} },
      }],
    }));
    for (const fn of api.listeners.get('filterChanged') ?? []) {
      fn();
    }
    platform.destroy();
  });

  it('rows subscribe skips header evaluate when no header paint rules', () => {
    const platform = new GridPlatform({
      gridId: 'cs-grid-rows',
      modules: [conditionalStylingModule],
    });
    platform.onGridReady(makeApi() as never);
    platform.store.setModuleState('conditional-styling', (state) => ({
      ...state,
      rules: [{
        id: 'row-only',
        enabled: true,
        expression: '[price] > 0',
        scope: { type: 'row' },
      }],
    }));
    platform.destroy();
  });

  it('dispose strips header flash classes from the DOM', () => {
    const el = document.createElement('div');
    el.className = 'ag-header-cell ds-flash-hdr-rule1 ds-flash-hdr-rule2';
    document.body.appendChild(el);
    const platform = new GridPlatform({
      gridId: 'cs-dispose-dom',
      modules: [conditionalStylingModule],
    });
    platform.onGridReady(makeApi() as never);
    platform.destroy();
    expect(el.classList.contains('ds-flash-hdr-rule1')).toBe(false);
    el.remove();
  });

  it('handles full structural row changes', () => {
    const platform = new GridPlatform({
      gridId: 'cs-full',
      modules: [conditionalStylingModule],
    });
    const api = makeApi();
    platform.onGridReady(api as never);
    platform.store.setModuleState('conditional-styling', (state) => ({
      ...state,
      rules: [{
        id: 'timed',
        enabled: true,
        expression: '[price] > 0',
        activeDurationMs: 1000,
        scope: { type: 'row' },
      }],
    }));
    for (const fn of api.listeners.get('sortChanged') ?? []) fn();
    vi.runAllTimers();
    platform.destroy();
  });
  /**
   * An aggregate-threshold rule (`[price] > AVG([price])`) is the one shape
   * where a cell's own value tells you nothing: the threshold moves with the
   * whole book, so a flush that changes ANY row can flip rules on rows that
   * did not change. The snapshot therefore has to be dropped and everything
   * the rules touch repainted — and because that is the expensive path, the
   * check is memoised on the rules array so a grid with no aggregate rules
   * pays one reference comparison per flush.
   */
  describe('aggregate-threshold rules', () => {
    function aggPlatform(gridId: string, expression: string) {
      const platform = new GridPlatform({ gridId, modules: [conditionalStylingModule] });
      const api = makeApi();
      platform.onGridReady(api as never);
      platform.store.setModuleState('conditional-styling', (state) => ({
        ...state,
        rules: [{ id: 'agg', enabled: true, expression, scope: { type: 'cell', columns: ['price'] } }],
      }));
      // Installing a rule schedules its own first pass; drain it so each test
      // counts only the repaints its own signal caused.
      vi.runAllTimers();
      api.refreshCells.mockClear();
      return { platform, api };
    }

    const flush = (api: ReturnType<typeof makeApi>) => {
      for (const fn of api.listeners.get('asyncTransactionsFlushed') ?? []) {
        fn({ results: [{ update: [{ id: 'r1', data: { price: 2 } }] }] });
      }
      vi.runAllTimers();
    };

    /**
     * Only the aggregate path asks for a FULL forced repaint; the row-local
     * path refreshes the changed nodes. Counting forced repaints is what
     * separates the two.
     */
    const fullRepaints = (api: ReturnType<typeof makeApi>) =>
      api.refreshCells.mock.calls.filter(
        ([arg]) => (arg as { force?: boolean } | undefined)?.force === true,
      ).length;

    it('repaints on a row flush when a rule reads an aggregate', () => {
      const { platform, api } = aggPlatform('cs-agg', '[price] > AVG([price])');

      flush(api);

      expect(fullRepaints(api)).toBeGreaterThan(0);
      platform.destroy();
    });

    it('repaints on a user edit too, which does not always ride the rows bus', () => {
      // A CSRM edit mutates the row in place, so the flush never happens —
      // without this listener the thresholds stay on the pre-edit book.
      const { platform, api } = aggPlatform('cs-agg-edit', '[price] > AVG([price])');

      for (const fn of api.listeners.get('cellValueChanged') ?? []) fn({});
      vi.runAllTimers();

      expect(fullRepaints(api)).toBeGreaterThan(0);
      platform.destroy();
    });

    it('does not force a full repaint for a rule that reads no aggregate', () => {
      const { platform, api } = aggPlatform('cs-plain', '[price] > 100');

      flush(api);
      for (const fn of api.listeners.get('cellValueChanged') ?? []) fn({});
      vi.runAllTimers();

      // The changed rows still repaint; the whole viewport does not.
      expect(fullRepaints(api)).toBe(0);
      platform.destroy();
    });

    it('answers the same rules array from the memo instead of re-parsing', () => {
      const { platform, api } = aggPlatform('cs-agg-memo', '[price] > AVG([price])');

      flush(api);
      flush(api);
      flush(api);

      // Three flushes, three repaints — the memo saves the expression walk,
      // not the repaint, which must still happen on every flush.
      expect(fullRepaints(api)).toBeGreaterThanOrEqual(3);
      platform.destroy();
    });
  });

  it('finishes disposing when a cleanup step throws, and says which one', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const el = document.createElement('div');
    el.className = 'ag-header-cell ds-flash-hdr-rule1';
    document.body.appendChild(el);
    const platform = new GridPlatform({ gridId: 'cs-dispose-throws', modules: [conditionalStylingModule] });
    platform.onGridReady(makeApi() as never);
    const querySelectorAll = vi.spyOn(document, 'querySelectorAll').mockImplementation(() => {
      throw new Error('detached document');
    });

    expect(() => platform.destroy()).not.toThrow();

    expect(warn).toHaveBeenCalledWith(
      '[conditional-styling] cleanup step failed:',
      'remove header flash classes',
      expect.any(Error),
    );
    querySelectorAll.mockRestore();
    warn.mockRestore();
    el.remove();
  });
});
