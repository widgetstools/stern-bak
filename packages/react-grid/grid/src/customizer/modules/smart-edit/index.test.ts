import { describe, expect, it } from 'vitest';
import {
  INITIAL_SMART_EDIT,
  SMART_EDIT_MODULE_ID,
} from '@wellsfargo-starui/core';
import { smartEditModule } from './index';

describe('smartEditModule', () => {
  it('registers with expected metadata', () => {
    expect(smartEditModule.id).toBe(SMART_EDIT_MODULE_ID);
    expect(smartEditModule.code).toBe('06');
    expect(smartEditModule.priority).toBe(22);
    expect(smartEditModule.SettingsPanel).toBeTruthy();
  });

  it('getInitialState returns a clone of INITIAL_SMART_EDIT', () => {
    const state = smartEditModule.getInitialState();
    expect(state).toEqual(INITIAL_SMART_EDIT);
    expect(state).not.toBe(INITIAL_SMART_EDIT);
  });

  it('transformColumnDefs is no-op when disabled', () => {
    const defs = [{ field: 'qty', editable: true }];
    const out = smartEditModule.transformColumnDefs!(defs, {
      settings: { ...INITIAL_SMART_EDIT.settings, enabled: false },
    });
    expect(out).toBe(defs);
  });

  it('transformColumnDefs applies magnitude parser when enabled', () => {
    const defs = [{ field: 'qty', editable: true, cellDataType: 'number' as const }];
    const out = smartEditModule.transformColumnDefs!(defs, INITIAL_SMART_EDIT);
    expect(out[0]).not.toBe(defs[0]);
    expect(typeof (out[0] as { valueParser?: unknown }).valueParser).toBe('function');
  });

  it('serialize / deserialize round-trip', () => {
    const state = smartEditModule.getInitialState();
    const raw = smartEditModule.serialize!(state);
    const restored = smartEditModule.deserialize!(raw);
    expect(restored).toEqual(state);
  });
});
