import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getOneByTestId } from '../../../test-utils/queries';
import './test/setupMocks.js';
import { staruiTestState } from './test/setupMocks.js';
import {
  SSRM_CFG_VERSION_KEY,
  STOMP_SSRM_CFG_VERSION,
  STOMP_SSRM_PROVIDER_ID,
  stompSsrmProviderDraft,
} from './stompSsrmProvider.js';

vi.mock('./bootstrap.js', () => ({
  getPlatform: () => staruiTestState.platform,
}));

describe('App', () => {
  beforeEach(() => {
    localStorage.clear();
    staruiTestState.configStore.list.mockReset();
    staruiTestState.configStore.save.mockReset();
    staruiTestState.configStore.list.mockResolvedValue([]);
    staruiTestState.configStore.save.mockResolvedValue(undefined);
  });

  it('seeds the stomp-ssrm catalog row and mounts HostedSsrmMarketsGrid', async () => {
    const { App } = await import('./App.js');
    render(<App />);

    await waitFor(() => {
      expect(staruiTestState.configStore.save).toHaveBeenCalledWith(
        stompSsrmProviderDraft,
        'test-user',
      );
      expect(getOneByTestId('hosted-ssrm-markets-grid')).toBeInTheDocument();
    });

    const grid = getOneByTestId('hosted-ssrm-markets-grid');
    expect(grid).toHaveAttribute('data-provider-id', STOMP_SSRM_PROVIDER_ID);
    expect(grid).toHaveAttribute('data-has-inline-cfg', 'true');
    expect(grid).toHaveAttribute('data-with-storage', 'true');
    expect(grid).toHaveAttribute('data-has-config-manager', 'true');
    expect(screen.getByText('MarketsGrid SSRM Lab')).toBeInTheDocument();
  });

  it('skips save when provider exists at current cfg version', async () => {
    localStorage.setItem(SSRM_CFG_VERSION_KEY, String(STOMP_SSRM_CFG_VERSION));
    staruiTestState.configStore.list.mockResolvedValue([
      { providerId: STOMP_SSRM_PROVIDER_ID, name: stompSsrmProviderDraft.name },
    ]);

    const { App } = await import('./App.js');
    render(<App />);

    await waitFor(() => {
      expect(getOneByTestId('hosted-ssrm-markets-grid')).toBeInTheDocument();
    });
    expect(staruiTestState.configStore.save).not.toHaveBeenCalled();
  });

  it('refreshes catalog when cfg version is stale', async () => {
    localStorage.setItem(SSRM_CFG_VERSION_KEY, '0');
    staruiTestState.configStore.list.mockResolvedValue([
      { providerId: STOMP_SSRM_PROVIDER_ID, name: stompSsrmProviderDraft.name },
    ]);

    const { App } = await import('./App.js');
    render(<App />);

    await waitFor(() => {
      expect(staruiTestState.configStore.save).toHaveBeenCalledWith(
        stompSsrmProviderDraft,
        'test-user',
      );
      expect(localStorage.getItem(SSRM_CFG_VERSION_KEY)).toBe(String(STOMP_SSRM_CFG_VERSION));
    });
  });
});
