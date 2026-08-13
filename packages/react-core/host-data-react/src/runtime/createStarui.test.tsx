import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Component, type ReactNode } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { ConfigManager } from '@wellsfargo-starui/core/host/config';
import { LocalStorageBundleAdapter } from '@wellsfargo-starui/core';
import type { DataProviderConfig } from '@wellsfargo-starui/types';
import type { ResolvedDataServicesHubBundle } from '@wellsfargo-starui/data';

/**
 * createStarui boots through `ensurePlatformReady` and seeds provider rows
 * through `DataProviderConfigStore` — both mocked at the module edge. The
 * Provider component, identity context, and storage facade are real.
 */

const ensurePlatformReady = vi.fn();
const storeGet = vi.fn();
const storeSave = vi.fn();

vi.mock('@wellsfargo-starui/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@wellsfargo-starui/data')>();
  return {
    ...actual,
    ensurePlatformReady: (...args: unknown[]) => ensurePlatformReady(...args),
    DataProviderConfigStore: class {
      get = storeGet;
      save = storeSave;
    },
  };
});

const { createStarui, useStaruiIdentity } = await import('./createStarui.js');

function makeBundle(): ResolvedDataServicesHubBundle {
  return {
    client: { getHubIntrospect: vi.fn().mockResolvedValue(null), invalidateConfig: vi.fn() },
    appData: {
      ready: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn(() => () => undefined),
      list: vi.fn(() => []),
      get: vi.fn(),
    },
    configManager: { getAppId: () => 'TestApp' } as unknown as ConfigManager,
    appDataReady: Promise.resolve(),
    dispose: vi.fn(),
  } as unknown as ResolvedDataServicesHubBundle;
}

function Identity(): ReactNode {
  const identity = useStaruiIdentity();
  return <p>{identity ? `${identity.appId}/${identity.userId}` : 'no identity'}</p>;
}

class Boundary extends Component<{ children: ReactNode }, { message: string | null }> {
  state = { message: null as string | null };
  static getDerivedStateFromError(error: Error) {
    return { message: error.message };
  }
  render() {
    return this.state.message ? <p>boundary: {this.state.message}</p> : this.props.children;
  }
}

const draft = (over: Partial<DataProviderConfig> = {}): DataProviderConfig =>
  ({
    providerId: 'dp-fixed',
    name: 'Fixed',
    providerType: 'stomp-ssrm',
    userId: 'u1',
    config: { providerType: 'stomp-ssrm' },
    ...over,
  }) as unknown as DataProviderConfig;

beforeEach(() => {
  ensurePlatformReady.mockResolvedValue(makeBundle());
  storeGet.mockResolvedValue(null);
  storeSave.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('createStarui', () => {
  it('renders the fallback until boot resolves, then children with identity', async () => {
    const starui = createStarui({
      appId: 'HelloApp',
      userId: 'trader1',
      fallback: <p>booting…</p>,
    });
    render(
      <starui.Provider>
        <Identity />
      </starui.Provider>,
    );
    expect(screen.getByText('booting…')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('HelloApp/trader1')).toBeTruthy());
    expect(ensurePlatformReady).toHaveBeenCalledWith(
      expect.objectContaining({ appId: 'HelloApp', userId: 'trader1' }),
      {},
    );
  });

  it('seeds missing provider rows and leaves existing rows untouched', async () => {
    storeGet.mockImplementation(async (id: string) =>
      id === 'dp-existing' ? draft({ providerId: 'dp-existing' }) : null,
    );
    const starui = createStarui({
      appId: 'A',
      userId: 'u1',
      providers: [draft(), draft({ providerId: 'dp-existing' })],
    });
    render(
      <starui.Provider>
        <Identity />
      </starui.Provider>,
    );
    await waitFor(() => expect(screen.getByText('A/u1')).toBeTruthy());
    expect(storeSave).toHaveBeenCalledTimes(1);
    expect(storeSave).toHaveBeenCalledWith(expect.objectContaining({ providerId: 'dp-fixed' }), 'u1');
  });

  it('rejects provider drafts without a deterministic providerId', async () => {
    const starui = createStarui({
      appId: 'A',
      userId: 'u1',
      providers: [draft({ providerId: undefined as unknown as string })],
    });
    render(
      <Boundary>
        <starui.Provider>
          <Identity />
        </starui.Provider>
      </Boundary>,
    );
    await waitFor(() =>
      expect(screen.getByText(/deterministic providerId/)).toBeTruthy(),
    );
  });

  it('defaults to a memoized localStorage adapter per gridId', () => {
    const starui = createStarui({ appId: 'A', userId: 'u1' });
    const a = starui.storage({ instanceId: 'g1', gridId: 'g1', appId: 'A', userId: 'u1' });
    const b = starui.storage({ instanceId: 'g1', gridId: 'g1', appId: 'A', userId: 'u1' });
    const c = starui.storage({ instanceId: 'g2', gridId: 'g2', appId: 'A', userId: 'u1' });
    expect(a).toBeInstanceOf(LocalStorageBundleAdapter);
    expect(b).toBe(a);
    expect(c).not.toBe(a);
  });

  it('returns null identity outside the Provider', () => {
    render(<Identity />);
    expect(screen.getByText('no identity')).toBeTruthy();
  });
});
