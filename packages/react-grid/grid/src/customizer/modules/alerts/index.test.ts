import { describe, expect, it } from 'vitest';
import { INITIAL_ALERTS } from '@wellsfargo-starui/engine';
import { alertsModule, ALERTS_MODULE_ID } from './index';

describe('alertsModule', () => {
  it('registers with expected metadata', () => {
    expect(alertsModule.id).toBe(ALERTS_MODULE_ID);
    expect(alertsModule.code).toBe('05');
    expect(alertsModule.ListPane).toBeTruthy();
    expect(alertsModule.EditorPane).toBeTruthy();
  });

  it('getInitialState starts with empty rules and default settings', () => {
    const state = alertsModule.getInitialState();
    expect(state.rules).toEqual([]);
    expect(state.settings).toEqual(INITIAL_ALERTS.settings);
  });

  it('serialize drops session history', () => {
    const state = alertsModule.getInitialState();
    state.history = [{ id: 'n1', ruleName: 'x', message: 'm', severity: 'info', firedAt: 1, read: false }];
    const raw = alertsModule.serialize!(state);
    expect(raw.history).toEqual([]);
  });

  it('deserialize restores rules and settings', () => {
    const raw = {
      rules: [{ id: 'r1', name: 'Test', enabled: true, priority: 0, severity: 'info', trigger: { kind: 'dataChange', expression: 'true' }, message: 'hi', channels: ['toast'] }],
      settings: INITIAL_ALERTS.settings,
    };
    const state = alertsModule.deserialize!(raw);
    expect(state.rules).toHaveLength(1);
    expect(state.settings.enabled).toBe(INITIAL_ALERTS.settings.enabled);
  });
});
