import { afterEach, describe, expect, it, vi } from 'vitest';
import { Suspense, type ReactNode } from 'react';
import { cleanup, render, renderHook, screen } from '@testing-library/react';
import type { ConfigManager } from '@wellsfargo-starui/core/host/config';
import type { DataServices } from '@wellsfargo-starui/data/runtime';
import { DEV_PLATFORM_BOOTSTRAP } from '@wellsfargo-starui/data';
import { LOGGED_IN_USER_ID } from '@wellsfargo-starui/types';
import {
  DataServicesProvider,
  useDataServicesContext,
  usePlatformIdentityOrNull,
  useUserIdFromContext,
} from './DataServicesProvider.js';

/**
 * The provider's job is to publish three things down the tree — the client
 * bundle, the session user id, and the deployment app id — and to suspend in
 * eager mode. Each is asserted through a consumer, not by reading the
 * provider's internals.
 */

function makeServices(
  configManager: Partial<ConfigManager> | undefined,
  ready: Promise<void> = Promise.resolve(),
): DataServices {
  return {
    client: { invalidateConfig: vi.fn() } as unknown as DataServices['client'],
    appData: {
      ready: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn(() => () => undefined),
      get: vi.fn(),
      list: vi.fn(() => []),
    } as unknown as DataServices['appData'],
    configManager: configManager as unknown as ConfigManager,
    ready,
    dispose: vi.fn(),
  };
}

function Identity() {
  const identity = usePlatformIdentityOrNull();
  return <p>{identity ? `${identity.appId}/${identity.userId}` : 'no identity'}</p>;
}

afterEach(cleanup);

describe('DataServicesProvider', () => {
  it('publishes the client and a config store built over the manager', () => {
    const services = makeServices({ getAppId: () => 'star-demo' });

    function Consumer() {
      const { client, appData, configStore } = useDataServicesContext();
      return <p>{[Boolean(client), Boolean(appData), Boolean(configStore)].join(',')}</p>;
    }

    render(<DataServicesProvider services={services}><Consumer /></DataServicesProvider>);
    expect(screen.getByText('true,true,true')).toBeDefined();
  });

  it('defaults the session user id to the pinned logged-in user', () => {
    render(
      <DataServicesProvider services={makeServices({ getAppId: () => 'star-demo' })}>
        <Identity />
      </DataServicesProvider>,
    );

    expect(screen.getByText(`star-demo/${LOGGED_IN_USER_ID}`)).toBeDefined();
  });

  it('an explicit userId wins over the default', () => {
    render(
      <DataServicesProvider services={makeServices({ getAppId: () => 'star-demo' })} userId="k123">
        <Identity />
      </DataServicesProvider>,
    );

    expect(screen.getByText('star-demo/k123')).toBeDefined();
  });

  it('an explicit appId wins over the config manager', () => {
    render(
      <DataServicesProvider
        services={makeServices({ getAppId: () => 'from-manager' })}
        appId="from-prop"
        userId="k123"
      >
        <Identity />
      </DataServicesProvider>,
    );

    expect(screen.getByText('from-prop/k123')).toBeDefined();
  });

  it('falls back to the dev bootstrap appId when the manager cannot report one', () => {
    // A manager without getAppId is the legacy bootstrap shape; landing on
    // appId='' there would silently scope every AppData row to nothing.
    render(
      <DataServicesProvider services={makeServices({})} userId="k123">
        <Identity />
      </DataServicesProvider>,
    );

    expect(screen.getByText(`${DEV_PLATFORM_BOOTSTRAP.appId}/k123`)).toBeDefined();
  });

  it('falls back when there is no config manager at all', () => {
    render(
      <DataServicesProvider services={makeServices(undefined)} userId="k123">
        <Identity />
      </DataServicesProvider>,
    );

    expect(screen.getByText(`${DEV_PLATFORM_BOOTSTRAP.appId}/k123`)).toBeDefined();
  });

  it('suspends in eager mode instead of rendering children unhydrated', () => {
    // Only the suspend is asserted: React 19 does not re-drive a `use()`
    // thenable to completion under jsdom + act, so the resumed render is an
    // e2e concern. What matters here is that eager mode never lets a child
    // paint against an empty AppData mirror.
    const pending = new Promise<void>(() => {});

    render(
      <Suspense fallback={<p>hydrating…</p>}>
        <DataServicesProvider services={makeServices({ getAppId: () => 'star-demo' }, pending)} mode="eager" userId="k123">
          <Identity />
        </DataServicesProvider>
      </Suspense>,
    );

    expect(screen.getByText('hydrating…')).toBeDefined();
    expect(screen.queryByText('star-demo/k123')).toBeNull();
  });

  it('renders eagerly once the mirror snapshot has already landed', () => {
    // A thenable React can read synchronously (the shape its own cache
    // produces) is the post-hydration state — children render, no fallback.
    const settled = Object.assign(Promise.resolve(), { status: 'fulfilled', value: undefined });

    render(
      <Suspense fallback={<p>hydrating…</p>}>
        <DataServicesProvider
          services={makeServices({ getAppId: () => 'star-demo' }, settled as unknown as Promise<void>)}
          mode="eager"
          userId="k123"
        >
          <Identity />
        </DataServicesProvider>
      </Suspense>,
    );

    expect(screen.getByText('star-demo/k123')).toBeDefined();
  });

  it('renders immediately in lazy mode even though ready is still pending', () => {
    // Lazy is the default precisely so first paint does not wait on the
    // SharedWorker; components observe `loaded === false` instead.
    const pending = new Promise<void>(() => {});
    render(
      <DataServicesProvider services={makeServices({ getAppId: () => 'star-demo' }, pending)} userId="k123">
        <Identity />
      </DataServicesProvider>,
    );

    expect(screen.getByText('star-demo/k123')).toBeDefined();
  });
});

describe('context hooks outside a provider', () => {
  const wrapper = ({ children }: { children: ReactNode }) => <>{children}</>;

  it('useDataServicesContext names the provider a caller forgot to mount', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useDataServicesContext(), { wrapper })).toThrow(
      'useDataServices requires <DataServicesProvider> or <DataHubProvider>',
    );
    vi.restoreAllMocks();
  });

  it('useUserIdFromContext throws rather than defaulting to a wrong user', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useUserIdFromContext(), { wrapper })).toThrow(
      'useDataProvidersList requires <DataServicesProvider> or <DataHubProvider>',
    );
    vi.restoreAllMocks();
  });

  it('usePlatformIdentityOrNull returns null instead of throwing', () => {
    // This one is the opt-in probe used by components that must render
    // outside the platform, so it must stay non-throwing.
    render(<Identity />);
    expect(screen.getByText('no identity')).toBeDefined();
  });
});
