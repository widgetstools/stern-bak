import { describe, expect, it } from 'vitest';
import { createGridHostContext } from './GridHostContext.js';
import type { RuntimePort } from './RuntimePort.js';
import type { StoragePort } from './StoragePort.js';

const stubRuntime: RuntimePort = {
  name: 'browser',
  resolveIdentity: () => ({
    instanceId: 'test',
    appId: 'app',
    userId: 'dev1',
    componentType: '',
    componentSubType: '',
    isTemplate: false,
    singleton: false,
    roles: [],
    permissions: [],
    customData: {},
  }),
  openSurface: async () => ({ kind: 'popout', id: 'x', close: () => {}, onClosed: () => () => {} }),
  getTheme: () => 'light',
  setTheme: () => {},
  onThemeChanged: () => () => {},
  onWindowShown: () => () => {},
  onWindowClosing: () => () => {},
  onCustomDataChanged: () => () => {},
  onWorkspaceSave: () => () => {},
  dispose: () => {},
};

const stubStorage: StoragePort = {
  loadProfile: async () => null,
  saveProfile: async () => {},
  deleteProfile: async () => {},
  listProfiles: async () => [],
};

describe('createGridHostContext', () => {
  it('returns a frozen context with required ports', () => {
    const ctx = createGridHostContext({ runtime: stubRuntime, storage: stubStorage });
    expect(ctx.runtime).toBe(stubRuntime);
    expect(ctx.storage).toBe(stubStorage);
    expect(ctx.data).toBeUndefined();
    expect(ctx.config).toBeUndefined();
    expect(Object.isFrozen(ctx)).toBe(true);
  });

  it('includes optional data and config ports when provided', () => {
    const data = { ready: Promise.resolve(), getSnapshot: () => null, subscribe: () => () => {} };
    const config = { appId: 'a', userId: 'u' };
    const ctx = createGridHostContext({
      runtime: stubRuntime,
      storage: stubStorage,
      data,
      config,
    });
    expect(ctx.data).toBe(data);
    expect(ctx.config).toBe(config);
  });
});
