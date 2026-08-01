import { describe, expect, it } from 'vitest';
import {
  INITIAL_PLUS_MINUS,
  PLUS_MINUS_MODULE_ID,
} from '@wellsfargo-starui/core';
import { plusMinusModule } from './index';

describe('plusMinusModule', () => {
  it('registers with expected metadata', () => {
    expect(plusMinusModule.id).toBe(PLUS_MINUS_MODULE_ID);
    expect(plusMinusModule.code).toBe('08');
    expect(plusMinusModule.SettingsPanel).toBeTruthy();
  });

  it('getInitialState returns a clone', () => {
    const state = plusMinusModule.getInitialState();
    expect(state).toEqual(INITIAL_PLUS_MINUS);
    expect(state).not.toBe(INITIAL_PLUS_MINUS);
  });

  it('transformColumnDefs is no-op when disabled', () => {
    const defs = [{ field: 'qty', editable: true }];
    const out = plusMinusModule.transformColumnDefs!(defs, {
      ...INITIAL_PLUS_MINUS,
      settings: { ...INITIAL_PLUS_MINUS.settings, enabled: false },
    });
    expect(out).toBe(defs);
  });

  it('transformColumnDefs applies nudge transforms when enabled', () => {
    const defs = [{ field: 'qty', editable: true }];
    const out = plusMinusModule.transformColumnDefs!(defs, INITIAL_PLUS_MINUS);
    expect(out).not.toBe(defs);
  });

  it('serialize / deserialize round-trip', () => {
    const state = plusMinusModule.getInitialState();
    const raw = plusMinusModule.serialize!(state);
    const restored = plusMinusModule.deserialize!(raw);
    expect(restored.settings).toEqual(state.settings);
    expect(restored.nudges).toEqual(state.nudges);
  });
});
