import { describe, expect, it } from 'vitest';
import {
  capHistory,
  DEFAULT_ALERTS_SETTINGS,
  deserializeAlertsState,
  INITIAL_ALERTS,
  type AlertNotification,
} from './state.js';

function notification(id: string, firedAt: number): AlertNotification {
  return {
    id,
    ruleId: 'r1',
    ruleName: 'Rule',
    severity: 'info',
    message: 'msg',
    rowId: null,
    column: null,
    value: 1,
    prevValue: 0,
    firedAt,
    read: false,
  };
}

describe('deserializeAlertsState', () => {
  it('returns defaults for non-object input', () => {
    expect(deserializeAlertsState(null)).toEqual({
      rules: [],
      history: [],
      settings: { ...DEFAULT_ALERTS_SETTINGS },
    });
    expect(deserializeAlertsState('bad')).toEqual(INITIAL_ALERTS);
  });

  it('always clears history on load — notifications are never persisted', () => {
    const state = deserializeAlertsState({
      rules: [],
      history: [notification('n1', 1)],
      settings: { enabled: false },
    });
    expect(state.history).toEqual([]);
    expect(state.settings.enabled).toBe(false);
  });

  it('drops malformed rules silently', () => {
    const state = deserializeAlertsState({
      rules: [
        null,
        { id: '', name: 'No id' },
        {
          id: 'ok',
          name: 'Valid',
          trigger: { kind: 'dataChange', expression: '[x] > 1' },
        },
        {
          id: 'bad-trigger',
          name: 'Bad trigger',
          trigger: { kind: 'unknown' },
        },
        {
          id: 'row',
          name: 'Row added',
          trigger: { kind: 'rowChange', event: 'ROW_ADDED' },
        },
      ],
    });
    expect(state.rules.map((r) => r.id)).toEqual(['ok', 'row']);
  });

  it('coerces relativeChange triggers and clamps settings', () => {
    const state = deserializeAlertsState({
      rules: [{
        id: 'rel',
        name: 'Move',
        trigger: {
          kind: 'relativeChange',
          column: 'last',
          mode: 'PERCENT_CHANGE',
          threshold: 5,
          direction: 'up',
        },
      }],
      settings: {
        defaultDebounceMs: -10,
        maxNotificationsPerSecond: 0,
        historyLimit: 0,
        evaluationMode: 'bogus',
        enabledChannels: { toast: 'yes' },
      },
    });
    expect(state.rules[0]?.trigger).toMatchObject({
      kind: 'relativeChange',
      column: 'last',
      mode: 'PERCENT_CHANGE',
      threshold: 5,
      direction: 'up',
    });
    expect(state.settings.defaultDebounceMs).toBe(0);
    expect(state.settings.maxNotificationsPerSecond).toBe(1);
    expect(state.settings.historyLimit).toBe(1);
    expect(state.settings.evaluationMode).toBe('realtime');
    expect(state.settings.enabledChannels.toast).toBe(true);
  });

  it('defaults channels when absent or empty', () => {
    const state = deserializeAlertsState({
      rules: [{
        id: 'c',
        name: 'Channels',
        trigger: { kind: 'dataChange', expression: 'true' },
        channels: ['toast', 'bogus'],
      }],
    });
    expect(state.rules[0]?.channels).toEqual(['toast']);
  });
});

describe('capHistory', () => {
  it('returns the same array when under the limit', () => {
    const history = [notification('a', 1)];
    expect(capHistory(history, 5)).toBe(history);
  });

  it('keeps the most recent entries when over the limit', () => {
    const history = [
      notification('a', 1),
      notification('b', 2),
      notification('c', 3),
    ];
    expect(capHistory(history, 2).map((n) => n.id)).toEqual(['a', 'b']);
  });
});
