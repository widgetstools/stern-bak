/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ConfigManager } from '@wellsfargo-starui/core/host/config';
import { useHostedIdentity } from '../useHostedIdentity.js';

const fakeConfigManager = {} as unknown as ConfigManager;

afterEach(() => {
  cleanup();
  delete (globalThis as any).fin;
  window.history.replaceState({}, '', '/');
});

describe('useHostedIdentity — browser path', () => {
  beforeEach(() => {
    delete (globalThis as any).fin;
  });

  it('falls back to URL ?instanceId= when no OpenFin runtime is present', async () => {
    window.history.replaceState({}, '', '/?instanceId=B-FROM-URL');
    const { result } = renderHook(() =>
      useHostedIdentity({
        defaultInstanceId: 'unused-default',
        defaultAppId: 'browser-app',
        defaultUserId: 'browser-user',
        componentName: 'TestGrid',
        configManager: fakeConfigManager,
      }),
    );
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.identity.instanceId).toBe('B-FROM-URL');
    expect(result.current.identity.appId).toBe('browser-app');
    expect(result.current.identity.userId).toBe('browser-user');
  });

  it('falls back to defaultInstanceId when no fin runtime and no URL param', async () => {
    window.history.replaceState({}, '', '/');
    const { result } = renderHook(() =>
      useHostedIdentity({
        defaultInstanceId: 'plain-default',
        componentName: 'TestGrid',
      }),
    );
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.identity.instanceId).toBe('plain-default');
  });

  it('accepts id query param as an instance id alias', async () => {
    window.history.replaceState({}, '', '/?id=alias-id');
    const { result } = renderHook(() =>
      useHostedIdentity({
        defaultInstanceId: 'unused-default',
        componentName: 'TestGrid',
      }),
    );
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.identity.instanceId).toBe('alias-id');
  });

  it('builds a storage factory when withStorage is enabled', async () => {
    const { result } = renderHook(() =>
      useHostedIdentity({
        defaultInstanceId: 'stored-grid',
        defaultAppId: 'app',
        defaultUserId: 'user',
        componentName: 'TestGrid',
        withStorage: true,
        configManager: fakeConfigManager,
      }),
    );
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.identity.storage).toEqual(expect.any(Function));
  });
});
