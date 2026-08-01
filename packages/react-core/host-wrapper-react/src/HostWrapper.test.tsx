import { useEffect } from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';

afterEach(() => cleanup());
import type {
  IdentitySnapshot,
  SurfaceHandle,
  SurfaceSpec,
  Theme,
  Unsubscribe,
} from '@wellsfargo-starui/types';
import type { RuntimePort } from '@wellsfargo-starui/core/host';
import type { ConfigManager } from '@wellsfargo-starui/core/host/config';
import { HostWrapper, useHost } from './index.js';

class FakeRuntime implements RuntimePort {
  readonly name = 'fake';
  private theme: Theme = 'light';
  private themeListeners = new Set<(t: Theme) => void>();
  private shownListeners = new Set<() => void>();
  private closingListeners = new Set<() => void>();
  private customDataListeners = new Set<(cd: Readonly<Record<string, unknown>>) => void>();
  private workspaceSaveListeners = new Set<() => void | Promise<void>>();

  constructor(private readonly identity: IdentitySnapshot) {}

  resolveIdentity(): IdentitySnapshot {
    return this.identity;
  }

  async openSurface(_spec: SurfaceSpec): Promise<SurfaceHandle> {
    return {
      kind: 'inpage',
      id: 's',
      close: () => {},
      onClosed: () => () => {},
    };
  }

  getTheme(): Theme {
    return this.theme;
  }

  setTheme(t: Theme): void {
    this.setThemeForTest(t);
  }

  setThemeForTest(t: Theme): void {
    this.theme = t;
    for (const fn of this.themeListeners) fn(t);
  }

  emitWindowShown(): void {
    for (const fn of this.shownListeners) fn();
  }

  onThemeChanged(fn: (t: Theme) => void): Unsubscribe {
    this.themeListeners.add(fn);
    return () => this.themeListeners.delete(fn);
  }

  onWindowShown(fn: () => void): Unsubscribe {
    this.shownListeners.add(fn);
    return () => this.shownListeners.delete(fn);
  }

  onWindowClosing(fn: () => void): Unsubscribe {
    this.closingListeners.add(fn);
    return () => this.closingListeners.delete(fn);
  }

  onCustomDataChanged(fn: (cd: Readonly<Record<string, unknown>>) => void): Unsubscribe {
    this.customDataListeners.add(fn);
    return () => this.customDataListeners.delete(fn);
  }

  onWorkspaceSave(fn: () => void | Promise<void>): Unsubscribe {
    this.workspaceSaveListeners.add(fn);
    return () => this.workspaceSaveListeners.delete(fn);
  }

  dispose(): void {
    this.themeListeners.clear();
    this.shownListeners.clear();
    this.closingListeners.clear();
    this.customDataListeners.clear();
    this.workspaceSaveListeners.clear();
  }
}

function makeIdentity(overrides: Partial<IdentitySnapshot> = {}): IdentitySnapshot {
  return {
    instanceId: 'iid-1',
    appId: 'app-1',
    userId: 'user-1',
    componentType: 'TestComponent',
    componentSubType: '',
    isTemplate: false,
    singleton: false,
    roles: [],
    permissions: [],
    customData: {},
    ...overrides,
  };
}

const fakeConfigManager: ConfigManager = {
  init: async () => {},
  dispose: () => {},
  // The remaining methods on ConfigManager aren't called in these tests — cast for brevity.
} as unknown as ConfigManager;

function Probe() {
  const host = useHost();
  return (
    <div>
      <span data-testid="instanceId">{host.instanceId}</span>
      <span data-testid="appId">{host.appId}</span>
      <span data-testid="theme">{host.theme}</span>
      <span data-testid="userId">{host.userId}</span>
    </div>
  );
}

describe('HostWrapper / useHost', () => {
  it('renders the loading slot while runtime/configManager promises pend', async () => {
    let resolveRuntime: (r: RuntimePort) => void = () => {};
    const runtimePromise = new Promise<RuntimePort>((res) => {
      resolveRuntime = res;
    });
    render(
      <HostWrapper
        runtime={runtimePromise}
        configManager={fakeConfigManager}
        loading={<span data-testid="loading">…</span>}
      >
        <Probe />
      </HostWrapper>,
    );
    expect(screen.getByTestId('loading')).toBeDefined();
    await act(async () => {
      resolveRuntime(new FakeRuntime(makeIdentity({ instanceId: 'late', appId: 'late-app' })));
    });
    await waitFor(() => expect(screen.getByTestId('instanceId').textContent).toBe('late'));
  });

  it('exposes identity + theme to consumers via useHost()', async () => {
    const runtime = new FakeRuntime(makeIdentity({ appId: 'a', userId: 'u' }));
    render(
      <HostWrapper runtime={runtime} configManager={fakeConfigManager}>
        <Probe />
      </HostWrapper>,
    );
    await waitFor(() => expect(screen.getByTestId('appId').textContent).toBe('a'));
    expect(screen.getByTestId('userId').textContent).toBe('u');
    expect(screen.getByTestId('theme').textContent).toBe('light');
  });

  it('re-renders consumers when the runtime broadcasts a theme change', async () => {
    const runtime = new FakeRuntime(makeIdentity());
    render(
      <HostWrapper runtime={runtime} configManager={fakeConfigManager}>
        <Probe />
      </HostWrapper>,
    );
    await waitFor(() => expect(screen.getByTestId('theme').textContent).toBe('light'));
    await act(async () => {
      runtime.setThemeForTest('dark');
    });
    expect(screen.getByTestId('theme').textContent).toBe('dark');
  });

  it('throws a clear error when useHost is called outside HostWrapper', () => {
    function BadConsumer() {
      useHost();
      return null;
    }
    // Suppress the React error overlay output for this single test.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<BadConsumer />)).toThrow(/useHost must be used within a <HostWrapper>/);
    errorSpy.mockRestore();
  });

  it('delegates onWindowShown to the underlying runtime', async () => {
    const runtime = new FakeRuntime(makeIdentity());
    const captured: number[] = [];
    function Listener() {
      const host = useHost();
      useEffect(() => {
        return host.onWindowShown(() => {
          captured.push(captured.length + 1);
        });
      }, [host]);
      return <span data-testid="listener-mounted">ok</span>;
    }
    render(
      <HostWrapper runtime={runtime} configManager={fakeConfigManager}>
        <Listener />
      </HostWrapper>,
    );
    await waitFor(() => expect(screen.getByTestId('listener-mounted')).toBeDefined());
    act(() => {
      runtime.emitWindowShown();
      runtime.emitWindowShown();
    });
    expect(captured).toEqual([1, 2]);
  });
});
