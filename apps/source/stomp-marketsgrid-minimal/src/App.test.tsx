import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getOneByTestId } from '../../../test-utils/queries';
import './test/setupMocks.js';
import { staruiTestState } from './test/setupMocks.js';
import {
  STOMP_HISTORICAL_PROVIDER_ID,
  STOMP_LIVE_PROVIDER_ID,
  STOMP_PROVIDER_CFG_VERSION,
  STOMP_SSRM_PROVIDER_ID,
  stompHistoricalProviderDraft,
  stompProviderDraft,
  stompSsrmProviderDraft,
} from './stompProvider.js';

vi.mock('./bootstrap.js', () => ({
  getPlatform: () => staruiTestState.platform,
}));

describe('App', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
    localStorage.clear();
    staruiTestState.configStore.list.mockReset();
    staruiTestState.configStore.save.mockReset();
    staruiTestState.configStore.remove.mockReset();
    staruiTestState.configStore.list.mockResolvedValue([]);
    staruiTestState.configStore.save.mockResolvedValue(undefined);
    staruiTestState.configStore.remove.mockResolvedValue(undefined);
    localStorage.setItem(
      'stomp-marketsgrid-minimal.stomp-cfg-version',
      String(STOMP_PROVIDER_CFG_VERSION),
    );
  });

  it('returns null until provider ids are seeded', async () => {
    const { App } = await import('./App.js');
    const { container } = render(<App />);
    expect(container.firstChild).toBeNull();

    await waitFor(() => {
      expect(getOneByTestId('hosted-markets-grid')).toBeInTheDocument();
    });
  });

  it('seeds live and historical providers when catalog is empty', async () => {
    const { App } = await import('./App.js');
    render(<App />);

    await waitFor(() => {
      expect(staruiTestState.configStore.save).toHaveBeenCalledWith(stompProviderDraft, 'test-user');
      expect(staruiTestState.configStore.save).toHaveBeenCalledWith(
        stompHistoricalProviderDraft,
        'test-user',
      );
    });
  });

  it('skips save when providers already exist at current cfg version', async () => {
    staruiTestState.configStore.list.mockResolvedValue([
      { providerId: STOMP_LIVE_PROVIDER_ID, name: stompProviderDraft.name },
      { providerId: STOMP_HISTORICAL_PROVIDER_ID, name: stompHistoricalProviderDraft.name },
    ]);

    const { App } = await import('./App.js');
    render(<App />);

    await waitFor(() => {
      expect(getOneByTestId('hosted-markets-grid')).toBeInTheDocument();
    });
    expect(staruiTestState.configStore.save).not.toHaveBeenCalled();
  });

  it('refreshes providers when stored cfg version is stale', async () => {
    localStorage.setItem('stomp-marketsgrid-minimal.stomp-cfg-version', '1');
    staruiTestState.configStore.list.mockResolvedValue([
      { providerId: STOMP_LIVE_PROVIDER_ID, name: stompProviderDraft.name },
      { providerId: STOMP_HISTORICAL_PROVIDER_ID, name: stompHistoricalProviderDraft.name },
    ]);

    const { App } = await import('./App.js');
    render(<App />);

    await waitFor(() => {
      expect(staruiTestState.configStore.save).toHaveBeenCalledTimes(2);
      expect(localStorage.getItem('stomp-marketsgrid-minimal.stomp-cfg-version')).toBe(
        String(STOMP_PROVIDER_CFG_VERSION),
      );
    });
  });

  it('removes stale duplicate provider rows', async () => {
    staruiTestState.configStore.list.mockResolvedValue([
      { providerId: 'old-live-id', name: stompProviderDraft.name },
      { providerId: STOMP_LIVE_PROVIDER_ID, name: stompProviderDraft.name },
      { providerId: 'old-hist-id', name: stompHistoricalProviderDraft.name },
      { providerId: STOMP_HISTORICAL_PROVIDER_ID, name: stompHistoricalProviderDraft.name },
    ]);

    const { App } = await import('./App.js');
    render(<App />);

    await waitFor(() => {
      expect(staruiTestState.configStore.remove).toHaveBeenCalledWith('old-live-id');
      expect(staruiTestState.configStore.remove).toHaveBeenCalledWith('old-hist-id');
    });
  });

  it('renders HostedMarketsGrid with expected props after seeding', async () => {
    const { App } = await import('./App.js');
    render(<App />);

    await waitFor(() => {
      const grid = getOneByTestId('hosted-markets-grid');
      expect(grid).toHaveAttribute('data-grid-id', 'stomp-blotter');
      expect(grid).toHaveAttribute('data-live-provider', STOMP_LIVE_PROVIDER_ID);
      expect(grid).toHaveAttribute('data-historical-provider', STOMP_HISTORICAL_PROVIDER_ID);
    });
  });

  it('ignores stale rows without a provider id', async () => {
    staruiTestState.configStore.list.mockResolvedValue([
      { providerId: undefined, name: stompProviderDraft.name },
      { providerId: STOMP_LIVE_PROVIDER_ID, name: stompProviderDraft.name },
      { providerId: STOMP_HISTORICAL_PROVIDER_ID, name: stompHistoricalProviderDraft.name },
    ]);

    const { App } = await import('./App.js');
    render(<App />);

    await waitFor(() => {
      expect(getOneByTestId('hosted-markets-grid')).toBeInTheDocument();
    });
    expect(staruiTestState.configStore.remove).not.toHaveBeenCalled();
  });

  it('seeds stomp-ssrm and renders HostedSsrmMarketsGrid when ?ssrm=1', async () => {
    window.history.replaceState({}, '', '/?ssrm=1');
    staruiTestState.configStore.list.mockResolvedValue([]);

    const { App } = await import('./App.js');
    render(<App />);

    await waitFor(() => {
      expect(staruiTestState.configStore.save).toHaveBeenCalledWith(
        stompSsrmProviderDraft,
        'test-user',
      );
      const grid = getOneByTestId('hosted-ssrm-markets-grid');
      expect(grid).toHaveAttribute('data-provider-id', STOMP_SSRM_PROVIDER_ID);
    });
    expect(staruiTestState.configStore.list).toHaveBeenCalledWith('test-user', {
      subtype: 'stomp-ssrm',
    });
    const grid = getOneByTestId('hosted-ssrm-markets-grid');
    expect(grid).toHaveAttribute('data-has-inline-cfg', 'true');
    expect(grid).toHaveAttribute('data-default-instance-id', 'stomp-ssrm-blotter');
    expect(grid).toHaveAttribute('data-with-storage', 'true');
    expect(grid).toHaveAttribute('data-has-config-manager', 'true');
  });

  it('does not update state after unmount', async () => {
    let resolveList: (value: unknown[]) => void = () => {};
    staruiTestState.configStore.list.mockReturnValue(
      new Promise((resolve) => {
        resolveList = resolve;
      }),
    );

    const { App } = await import('./App.js');
    const { container, unmount } = render(<App />);
    unmount();
    resolveList([]);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container.querySelector('[data-testid="hosted-markets-grid"]')).toBeNull();
  });
});
