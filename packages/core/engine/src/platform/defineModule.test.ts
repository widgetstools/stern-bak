import { describe, expect, it } from 'vitest';
import { defineModule } from './defineModule';

interface ToggleState {
  enabled: boolean;
  label: string;
}

const INITIAL: ToggleState = { enabled: false, label: 'off' };

describe('defineModule', () => {
  it('defaults schemaVersion, priority, and getInitialState from initialState', () => {
    const mod = defineModule<ToggleState>({ id: 't', name: 'Toggle', initialState: INITIAL });
    expect(mod.schemaVersion).toBe(1);
    expect(mod.priority).toBe(100);
    const state = mod.getInitialState();
    expect(state).toEqual(INITIAL);
    expect(state).not.toBe(INITIAL); // cloned, not shared
  });

  it('defaults serialize to identity', () => {
    const mod = defineModule<ToggleState>({ id: 't', name: 'Toggle', initialState: INITIAL });
    const state = { enabled: true, label: 'on' };
    expect(mod.serialize(state)).toBe(state);
  });

  it('default deserialize spreads persisted fields over initial', () => {
    const mod = defineModule<ToggleState>({ id: 't', name: 'Toggle', initialState: INITIAL });
    expect(mod.deserialize({ enabled: true })).toEqual({ enabled: true, label: 'off' });
  });

  it('default deserialize resets non-object payloads to initial', () => {
    const mod = defineModule<ToggleState>({ id: 't', name: 'Toggle', initialState: INITIAL });
    expect(mod.deserialize(null)).toEqual(INITIAL);
    expect(mod.deserialize('junk')).toEqual(INITIAL);
    expect(mod.deserialize([1, 2])).toEqual(INITIAL);
  });

  it('default migrate is the same additive spread (version bumps never drop state)', () => {
    const mod = defineModule<ToggleState>({
      id: 't',
      name: 'Toggle',
      initialState: INITIAL,
      schemaVersion: 3,
    });
    expect(mod.migrate?.({ label: 'kept' }, 1)).toEqual({ enabled: false, label: 'kept' });
  });

  it('explicit members override every default', () => {
    const mod = defineModule<ToggleState>({
      id: 't',
      name: 'Toggle',
      category: 'options',
      initialState: INITIAL,
      schemaVersion: 7,
      priority: 42,
      serialize: () => 'custom',
      deserialize: () => ({ enabled: true, label: 'custom' }),
    });
    expect(mod.category).toBe('options');
    expect(mod.schemaVersion).toBe(7);
    expect(mod.priority).toBe(42);
    expect(mod.serialize(INITIAL)).toBe('custom');
    expect(mod.deserialize({})).toEqual({ enabled: true, label: 'custom' });
  });
});
