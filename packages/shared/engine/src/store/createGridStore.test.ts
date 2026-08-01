import { describe, expect, it, vi } from 'vitest';
import { createGridStore } from './createGridStore';
import type { AnyModule } from '../platform/types';

function testModule(id: string, initial = { v: 0 }): AnyModule {
  return {
    id,
    name: id,
    schemaVersion: 1,
    priority: 0,
    getInitialState: () => initial,
    serialize: (s) => s,
    deserialize: (raw) => raw ?? initial,
  };
}

describe('createGridStore', () => {
  it('preserves outer state reference when updater returns same slice', () => {
    const store = createGridStore({ gridId: 'g', modules: [testModule('m')] });
    const before = store.getAllModuleStates();
    store.setModuleState('m', (prev) => prev);
    expect(store.getAllModuleStates()).toBe(before);
  });

  it('replaceModuleState always produces a new moduleStates object', () => {
    const store = createGridStore({ gridId: 'g', modules: [testModule('m')] });
    const before = store.getAllModuleStates();
    store.replaceModuleState('m', { v: 9 });
    expect(store.getAllModuleStates()).not.toBe(before);
    expect(store.getModuleState<{ v: number }>('m').v).toBe(9);
  });

  it('subscribeToModule fires only when the target slice reference changes', () => {
    const store = createGridStore({ gridId: 'g', modules: [testModule('m')] });
    const listener = vi.fn();
    const off = store.subscribeToModule('m', listener);
    store.setModuleState('m', (prev) => prev);
    expect(listener).not.toHaveBeenCalled();
    store.setModuleState('m', (prev) => ({ ...prev, v: 1 }));
    expect(listener).toHaveBeenCalledTimes(1);
    off();
  });
});
