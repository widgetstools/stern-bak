/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';

const useHostedIdentityMock = vi.fn();
const useAgGridThemeMock = vi.fn();
const useTabsHiddenMock = vi.fn();
const useColorLinkingMock = vi.fn();
const useFdc3ChannelMock = vi.fn();
const useOpenFinChannelMock = vi.fn();
const useIabMock = vi.fn();
const useWorkspaceSaveEventMock = vi.fn();

vi.mock('../useHostedIdentity.js', () => ({
  useHostedIdentity: (...args: any[]) => useHostedIdentityMock(...args),
}));
vi.mock('../useAgGridTheme.js', () => ({
  useAgGridTheme: (...args: any[]) => useAgGridThemeMock(...args),
}));
vi.mock('../useTabsHidden.js', () => ({
  useTabsHidden: (...args: any[]) => useTabsHiddenMock(...args),
}));
vi.mock('../useColorLinking.js', () => ({
  useColorLinking: (...args: any[]) => useColorLinkingMock(...args),
}));
vi.mock('../useFdc3Channel.js', () => ({
  useFdc3Channel: (...args: any[]) => useFdc3ChannelMock(...args),
}));
vi.mock('../useOpenFinChannel.js', () => ({
  useOpenFinChannel: (...args: any[]) => useOpenFinChannelMock(...args),
}));
vi.mock('../useIab.js', () => ({
  useIab: (...args: any[]) => useIabMock(...args),
}));
vi.mock('../useWorkspaceSaveEvent.js', () => ({
  useWorkspaceSaveEvent: (...args: any[]) => useWorkspaceSaveEventMock(...args),
}));

import { useHostedView } from '../useHostedView.js';

const fakeIdentity = { instanceId: 'i1', appId: 'a1', userId: 'u1', configManager: null, storage: null };
const fakeTheme = { __theme: true } as any;
const fakeIab = { subscribe: vi.fn(), publish: vi.fn() };
const fakeChannel = { createProvider: vi.fn(), connect: vi.fn() };
const fakeFdc3Join = vi.fn().mockResolvedValue(undefined);
const fakeFdc3 = {
  current: null,
  join: fakeFdc3Join,
  leave: vi.fn(),
  addContextListener: vi.fn(),
  broadcast: vi.fn(),
};
const fakeColor = { color: null, linked: false };

function setDefaults() {
  useHostedIdentityMock.mockReturnValue({ identity: fakeIdentity, ready: true });
  useAgGridThemeMock.mockReturnValue(fakeTheme);
  useTabsHiddenMock.mockReturnValue(false);
  useColorLinkingMock.mockReturnValue(fakeColor);
  useFdc3ChannelMock.mockReturnValue(fakeFdc3);
  useOpenFinChannelMock.mockReturnValue(fakeChannel);
  useIabMock.mockReturnValue(fakeIab);
  useWorkspaceSaveEventMock.mockReturnValue(undefined);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('useHostedView', () => {
  it('composes every sub-hook and surfaces their return values', () => {
    setDefaults();
    const { result } = renderHook(() =>
      useHostedView({
        defaultInstanceId: 'def',
        componentName: 'TestView',
        theme: 'dark',
      }),
    );

    expect(useHostedIdentityMock).toHaveBeenCalledTimes(1);
    expect(useHostedIdentityMock).toHaveBeenCalledWith({
      defaultInstanceId: 'def',
      componentName: 'TestView',
    });
    expect(useAgGridThemeMock).toHaveBeenCalledWith('dark');
    expect(useTabsHiddenMock).toHaveBeenCalledTimes(1);
    expect(useColorLinkingMock).toHaveBeenCalledTimes(1);
    expect(useFdc3ChannelMock).toHaveBeenCalledTimes(1);
    expect(useOpenFinChannelMock).toHaveBeenCalledTimes(1);
    expect(useIabMock).toHaveBeenCalledTimes(1);

    expect(result.current.identity).toBe(fakeIdentity);
    expect(result.current.ready).toBe(true);
    expect(result.current.agTheme).toBe(fakeTheme);
    expect(result.current.tabsHidden).toBe(false);
    expect(result.current.iab).toBe(fakeIab);
    expect(result.current.linking.color).toBe(fakeColor);
    expect(result.current.linking.fdc3).toBe(fakeFdc3);
    expect(result.current.linking.channel).toBe(fakeChannel);
  });

  it('forwards onWorkspaceSave to useWorkspaceSaveEvent when provided', () => {
    setDefaults();
    const cb = vi.fn();
    const opts = { onSaved: vi.fn() };
    renderHook(() =>
      useHostedView({
        defaultInstanceId: 'def',
        componentName: 'TestView',
        onWorkspaceSave: cb,
        workspaceSaveOptions: opts,
      }),
    );
    expect(useWorkspaceSaveEventMock).toHaveBeenCalledWith(cb, opts);
  });

  it('passes undefined to useWorkspaceSaveEvent when onWorkspaceSave is omitted', () => {
    setDefaults();
    renderHook(() =>
      useHostedView({ defaultInstanceId: 'def', componentName: 'TestView' }),
    );
    expect(useWorkspaceSaveEventMock).toHaveBeenCalledWith(undefined, undefined);
  });

  it('auto-joins the requested FDC3 user channel on mount', async () => {
    setDefaults();
    renderHook(() =>
      useHostedView({
        defaultInstanceId: 'def',
        componentName: 'TestView',
        fdc3: { autoJoin: 'red' },
      }),
    );
    await waitFor(() => {
      expect(fakeFdc3Join).toHaveBeenCalledWith('red');
    });
  });

  it('does not auto-join FDC3 when no autoJoin id is configured', () => {
    setDefaults();
    renderHook(() =>
      useHostedView({ defaultInstanceId: 'def', componentName: 'TestView' }),
    );
    expect(fakeFdc3Join).not.toHaveBeenCalled();
  });

  it('does not pass extra args to useHostedIdentity beyond identity props', () => {
    setDefaults();
    renderHook(() =>
      useHostedView({
        defaultInstanceId: 'def',
        componentName: 'TestView',
        theme: 'light',
        onWorkspaceSave: vi.fn(),
        fdc3: { autoJoin: 'blue' },
      }),
    );
    const call = useHostedIdentityMock.mock.calls[0][0];
    expect(call).not.toHaveProperty('theme');
    expect(call).not.toHaveProperty('onWorkspaceSave');
    expect(call).not.toHaveProperty('fdc3');
  });
});
