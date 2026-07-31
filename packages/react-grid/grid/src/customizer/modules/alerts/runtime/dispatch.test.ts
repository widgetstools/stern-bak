import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlatformHandle } from '@wellsfargo-starui/engine';
import {
  DEFAULT_ALERTS_SETTINGS,
  type AlertHit,
  type AlertRule,
  type AlertsSettings,
  type AlertsState,
} from '@wellsfargo-starui/engine';
import { createAlertDispatcher } from './dispatch';

function makePlatform(initial: AlertsState): {
  platform: PlatformHandle<AlertsState>;
  state: () => AlertsState;
} {
  let state: AlertsState = initial;
  const platform = {
    gridId: 'test-grid',
    api: {} as never,
    resources: {} as never,
    events: {} as never,
    getState: () => state,
    setState: (updater: (prev: AlertsState) => AlertsState) => {
      state = updater(state);
    },
    getModuleState: () => ({}) as never,
    subscribe: () => () => {},
  } as unknown as PlatformHandle<AlertsState>;
  return { platform, state: () => state };
}

function dataRule(overrides: Partial<AlertRule> = {}): AlertRule {
  return {
    id: 'r1',
    name: 'Rule 1',
    enabled: true,
    priority: 0,
    severity: 'warning',
    trigger: { kind: 'dataChange', expression: '[bid] > 0' },
    message: 'hit {rowId}',
    channels: ['toast', 'badge'],
    ...overrides,
  };
}

function makeHit(rowId = 'row-1'): AlertHit {
  return { ruleId: 'r1', rowId, column: 'bid', value: 100, prevValue: 50 };
}

function settingsFor(overrides: Partial<AlertsSettings> = {}): AlertsSettings {
  return { ...DEFAULT_ALERTS_SETTINGS, ...overrides };
}

describe('createAlertDispatcher', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('appends a notification to history on the happy path', () => {
    const { platform, state } = makePlatform({
      rules: [],
      history: [],
      settings: settingsFor({ defaultDebounceMs: 0, maxNotificationsPerSecond: 100 }),
    });
    const d = createAlertDispatcher(platform);
    d.dispatch(dataRule(), makeHit());
    expect(state().history).toHaveLength(1);
    expect(state().history[0].ruleId).toBe('r1');
    expect(state().history[0].message).toBe('hit row-1');
    expect(d.counters().fired).toBe(1);
  });

  it('respects per-rule debounce per row', () => {
    const { platform, state } = makePlatform({
      rules: [],
      history: [],
      settings: settingsFor({ defaultDebounceMs: 0, maxNotificationsPerSecond: 100 }),
    });
    const d = createAlertDispatcher(platform);
    const rule = dataRule({ debounceMs: 1000 });
    d.dispatch(rule, makeHit('row-1')); // fires
    vi.setSystemTime(500);
    d.dispatch(rule, makeHit('row-1')); // dropped (within 1000ms)
    vi.setSystemTime(1001);
    d.dispatch(rule, makeHit('row-1')); // fires
    expect(state().history).toHaveLength(2);
    expect(d.counters().droppedByDebounce).toBe(1);
  });

  it('debounce is per-row, not global', () => {
    const { platform, state } = makePlatform({
      rules: [],
      history: [],
      settings: settingsFor({ defaultDebounceMs: 0, maxNotificationsPerSecond: 100 }),
    });
    const d = createAlertDispatcher(platform);
    const rule = dataRule({ debounceMs: 1000 });
    d.dispatch(rule, makeHit('row-1'));
    d.dispatch(rule, makeHit('row-2'));
    d.dispatch(rule, makeHit('row-3'));
    expect(state().history).toHaveLength(3);
  });

  it('falls back to settings.defaultDebounceMs when rule.debounceMs is unset', () => {
    const { platform, state } = makePlatform({
      rules: [],
      history: [],
      settings: settingsFor({ defaultDebounceMs: 500, maxNotificationsPerSecond: 100 }),
    });
    const d = createAlertDispatcher(platform);
    d.dispatch(dataRule(), makeHit());
    vi.setSystemTime(300);
    d.dispatch(dataRule(), makeHit());
    expect(state().history).toHaveLength(1);
  });

  it('drops over-budget hits when maxNotificationsPerSecond is hit', () => {
    const { platform, state } = makePlatform({
      rules: [],
      history: [],
      settings: settingsFor({ defaultDebounceMs: 0, maxNotificationsPerSecond: 2 }),
    });
    const d = createAlertDispatcher(platform);
    d.dispatch(dataRule(), makeHit('row-1')); // fires
    d.dispatch(dataRule(), makeHit('row-2')); // fires
    d.dispatch(dataRule(), makeHit('row-3')); // dropped
    expect(state().history).toHaveLength(2);
    expect(d.counters().droppedByRateLimit).toBe(1);
  });

  it('token bucket recovers after the 1s window slides', () => {
    const { platform, state } = makePlatform({
      rules: [],
      history: [],
      settings: settingsFor({ defaultDebounceMs: 0, maxNotificationsPerSecond: 1 }),
    });
    const d = createAlertDispatcher(platform);
    d.dispatch(dataRule(), makeHit('row-1'));
    d.dispatch(dataRule(), makeHit('row-2')); // dropped
    vi.setSystemTime(1001);
    d.dispatch(dataRule(), makeHit('row-3')); // fires (window slid)
    expect(state().history).toHaveLength(2);
  });

  it('short-circuits when settings.enabled is false', () => {
    const { platform, state } = makePlatform({
      rules: [],
      history: [],
      settings: settingsFor({ enabled: false }),
    });
    const d = createAlertDispatcher(platform);
    d.dispatch(dataRule(), makeHit());
    expect(state().history).toHaveLength(0);
    expect(d.counters().fired).toBe(0);
  });

  it('short-circuits when evaluationMode is paused', () => {
    const { platform, state } = makePlatform({
      rules: [],
      history: [],
      settings: settingsFor({ evaluationMode: 'paused' }),
    });
    const d = createAlertDispatcher(platform);
    d.dispatch(dataRule(), makeHit());
    expect(state().history).toHaveLength(0);
  });

  it('skips when rule is disabled', () => {
    const { platform, state } = makePlatform({
      rules: [],
      history: [],
      settings: settingsFor({ defaultDebounceMs: 0, maxNotificationsPerSecond: 100 }),
    });
    const d = createAlertDispatcher(platform);
    d.dispatch(dataRule({ enabled: false }), makeHit());
    expect(state().history).toHaveLength(0);
  });

  it('intersects rule.channels with settings.enabledChannels', () => {
    const { platform, state } = makePlatform({
      rules: [],
      history: [],
      settings: settingsFor({
        defaultDebounceMs: 0,
        maxNotificationsPerSecond: 100,
        enabledChannels: { toast: true, badge: false },
      }),
    });
    const d = createAlertDispatcher(platform);
    // Rule only wants badge → both filtered out → notification skipped.
    d.dispatch(dataRule({ channels: ['badge'] }), makeHit('row-1'));
    expect(state().history).toHaveLength(0);
    // Rule wants toast → survives intersection.
    d.dispatch(dataRule({ channels: ['toast'] }), makeHit('row-2'));
    expect(state().history).toHaveLength(1);
  });

  it('caps history at settings.historyLimit', () => {
    const { platform, state } = makePlatform({
      rules: [],
      history: [],
      settings: settingsFor({
        defaultDebounceMs: 0,
        maxNotificationsPerSecond: 100,
        historyLimit: 2,
      }),
    });
    const d = createAlertDispatcher(platform);
    d.dispatch(dataRule(), makeHit('row-1'));
    d.dispatch(dataRule(), makeHit('row-2'));
    d.dispatch(dataRule(), makeHit('row-3'));
    expect(state().history).toHaveLength(2);
    expect(state().history[0].rowId).toBe('row-3');
    expect(state().history[1].rowId).toBe('row-2');
  });

  it('reset() clears the per-rule debounce timers', () => {
    const { platform, state } = makePlatform({
      rules: [],
      history: [],
      settings: settingsFor({ defaultDebounceMs: 1000, maxNotificationsPerSecond: 100 }),
    });
    const d = createAlertDispatcher(platform);
    d.dispatch(dataRule(), makeHit('row-1'));
    d.dispatch(dataRule(), makeHit('row-1')); // dropped
    d.reset();
    d.dispatch(dataRule(), makeHit('row-1')); // fires again — timer reset
    expect(state().history).toHaveLength(2);
  });
});
