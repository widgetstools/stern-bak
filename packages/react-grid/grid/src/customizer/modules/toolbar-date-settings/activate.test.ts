/**
 * The runtime says "the rule may have changed" to `platform.data`, never to
 * the grid api. Asserting on the PORT rather than on `onFilterChanged` is the
 * point of the change: `onFilterChanged` is the client-side row model's answer
 * and under the server-side one it does nothing at all, so a test that pinned
 * it was pinning half the behaviour.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GridPlatform } from '@wellsfargo-starui/core';
import { toolbarDateSettingsModule } from './index.js';
import { INITIAL_TOOLBAR_DATE_SETTINGS } from './state.js';
import { activateRowExclusion } from './activate.js';

/** A platform stub whose only interesting member is the data port. */
function fakePlatform(opts: {
  state: typeof INITIAL_TOOLBAR_DATE_SETTINGS;
  setRowExclusion: ReturnType<typeof vi.fn>;
  onReady?: (fn: () => void) => () => void;
  on?: (evt: string, fn: () => void) => () => void;
  subscribe?: (fn: (s: unknown, p: unknown) => void) => () => void;
}) {
  return {
    getState: () => opts.state,
    subscribe: opts.subscribe ?? (() => () => {}),
    data: { setRowExclusion: opts.setRowExclusion },
    api: {
      on: opts.on ?? (() => () => {}),
      onReady: opts.onReady ?? (() => () => {}),
      use: () => {},
    },
  };
}

describe('activateRowExclusion', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('tells the port the rule on ready and again on every cell edit', () => {
    const platform = new GridPlatform({
      gridId: 'tds-grid',
      modules: [toolbarDateSettingsModule],
    });
    platform.store.setModuleState('toolbar-date-settings', () => ({
      ...INITIAL_TOOLBAR_DATE_SETTINGS,
      rowExclusionExpression: '[ccy] == "INR"',
    }));

    // The real port under a client-side grid: `setRowExclusion` re-runs the
    // external filter, which is what `onFilterChanged` is doing here.
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

  it('sends the expression the module holds, and null once it is cleared', () => {
    const setRowExclusion = vi.fn(async () => {});
    let subscriber: ((s: unknown, p: unknown) => void) | null = null;
    let state = { ...INITIAL_TOOLBAR_DATE_SETTINGS, rowExclusionExpression: '' };
    const platform = fakePlatform({
      get state() {
        return state;
      },
      setRowExclusion,
      subscribe: (fn) => {
        subscriber = fn;
        return () => {};
      },
    } as never);

    activateRowExclusion(platform as never);

    const prev = state;
    state = { ...state, rowExclusionExpression: '[ccy] == "USD"' };
    subscriber?.(state, prev);
    expect(setRowExclusion).toHaveBeenLastCalledWith('[ccy] == "USD"');

    // Clearing has to REACH the port. The plane holds this per session, so a
    // rule that is merely forgotten client-side would keep excluding rows.
    const cleared = { ...state, rowExclusionExpression: '' };
    const before = state;
    state = cleared;
    subscriber?.(state, before);
    expect(setRowExclusion).toHaveBeenLastCalledWith(null);
  });

  it('does not nudge on a cell edit while no rule is configured', () => {
    const setRowExclusion = vi.fn(async () => {});
    let cellEdit: (() => void) | null = null;
    const platform = fakePlatform({
      state: { ...INITIAL_TOOLBAR_DATE_SETTINGS, rowExclusionExpression: '  ' },
      setRowExclusion,
      on: (_evt, fn) => {
        cellEdit = fn;
        return () => {};
      },
    });
    activateRowExclusion(platform as never);
    setRowExclusion.mockClear();
    cellEdit?.();
    expect(setRowExclusion).not.toHaveBeenCalled();
  });

  it('states the rule on ready even when there is none, so a fresh session starts clean', () => {
    const setRowExclusion = vi.fn(async () => {});
    const platform = fakePlatform({
      state: { ...INITIAL_TOOLBAR_DATE_SETTINGS, rowExclusionExpression: '  ' },
      setRowExclusion,
      onReady: (fn) => {
        fn();
        return () => {};
      },
    });
    activateRowExclusion(platform as never);
    expect(setRowExclusion).toHaveBeenCalledWith(null);
  });

  it('survives a port that rejects — the rule is not worth an unhandled rejection', () => {
    const setRowExclusion = vi.fn(async () => {
      throw new Error('worker gone');
    });
    const platform = fakePlatform({
      state: { ...INITIAL_TOOLBAR_DATE_SETTINGS, rowExclusionExpression: '[ccy] == "INR"' },
      setRowExclusion,
      onReady: (fn) => {
        fn();
        return () => {};
      },
    });
    expect(() => activateRowExclusion(platform as never)).not.toThrow();
  });

  it('dispose isolates failing disposers', () => {
    const platform = fakePlatform({
      state: INITIAL_TOOLBAR_DATE_SETTINGS,
      setRowExclusion: vi.fn(async () => {}),
      subscribe: () => () => {
        throw new Error('fail');
      },
      on: () => () => {
        throw new Error('fail');
      },
    });
    const dispose = activateRowExclusion(platform as never);
    expect(() => dispose()).not.toThrow();
  });
});
