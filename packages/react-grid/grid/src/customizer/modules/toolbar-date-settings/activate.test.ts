import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GridPlatform } from '@wellsfargo-starui/core';
import { toolbarDateSettingsModule } from './index.js';
import { INITIAL_TOOLBAR_DATE_SETTINGS } from './state.js';
import { activateRowExclusion } from './activate.js';

describe('activateRowExclusion', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls onFilterChanged when expression is set and cell edits occur', () => {
    const platform = new GridPlatform({
      gridId: 'tds-grid',
      modules: [toolbarDateSettingsModule],
    });
    platform.store.setModuleState('toolbar-date-settings', () => ({
      ...INITIAL_TOOLBAR_DATE_SETTINGS,
      rowExclusionExpression: '[ccy] == "INR"',
    }));

    const onFilterChanged = vi.fn();
    const listeners = new Map<string, Set<() => void>>();
    const api = {
      onFilterChanged,
      addEventListener: (evt: string, fn: () => void) => {
        if (!listeners.has(evt)) listeners.set(evt, new Set());
        listeners.get(evt)!.add(fn);
      },
      removeEventListener: (evt: string, fn: () => void) => {
        listeners.get(evt)?.delete(fn);
      },
    };
    platform.onGridReady(api as never);
    expect(onFilterChanged).toHaveBeenCalled();

    onFilterChanged.mockClear();
    for (const fn of listeners.get('cellValueChanged') ?? []) fn();
    expect(onFilterChanged).toHaveBeenCalled();
    platform.destroy();
  });

  it('skips refilter when expression is empty', () => {
    const onFilterChanged = vi.fn();
    const platform = {
      getState: () => ({ ...INITIAL_TOOLBAR_DATE_SETTINGS, rowExclusionExpression: '  ' }),
      subscribe: () => () => {},
      api: {
        on: () => () => {},
        onReady: (fn: (api: { onFilterChanged: typeof onFilterChanged }) => void) => {
          fn({ onFilterChanged });
          return () => {};
        },
        use: (fn: (api: { onFilterChanged: typeof onFilterChanged }) => void) => {
          fn({ onFilterChanged });
        },
      },
    };
    const dispose = activateRowExclusion(platform as never);
    expect(onFilterChanged).not.toHaveBeenCalled();
    dispose();
  });

  it('refilters when expression changes via subscribe', () => {
    let state = { ...INITIAL_TOOLBAR_DATE_SETTINGS, rowExclusionExpression: '' };
    let subscriber: ((s: typeof state, p: typeof state) => void) | null = null;
    const onFilterChanged = vi.fn();
    const platform = {
      getState: () => state,
      subscribe: (fn: typeof subscriber) => {
        subscriber = fn;
        return () => {};
      },
      api: {
        on: () => () => {},
        onReady: () => () => {},
        use: (fn: (api: { onFilterChanged: typeof onFilterChanged }) => void) => {
          fn({ onFilterChanged });
        },
      },
    };
    activateRowExclusion(platform as never);
    const prev = state;
    state = { ...state, rowExclusionExpression: '[ccy] == "USD"' };
    subscriber?.(state, prev);
    expect(onFilterChanged).toHaveBeenCalled();
  });

  it('dispose isolates failing disposers', () => {
    const onFilterChanged = vi.fn();
    const platform = {
      getState: () => INITIAL_TOOLBAR_DATE_SETTINGS,
      subscribe: () => () => { throw new Error('fail'); },
      api: {
        on: () => () => { throw new Error('fail'); },
        onReady: () => () => {},
        use: (fn: (api: { onFilterChanged: typeof onFilterChanged }) => void) => {
          fn({ onFilterChanged });
        },
      },
    };
    const dispose = activateRowExclusion(platform as never);
    expect(() => dispose()).not.toThrow();
  });
});
