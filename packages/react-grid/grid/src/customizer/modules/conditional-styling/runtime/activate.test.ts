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
});
