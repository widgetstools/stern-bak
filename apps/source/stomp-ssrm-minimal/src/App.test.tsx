import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import './test/setupMocks.js';
import { staruiTestState } from './test/setupMocks.js';
import { STOMP_SSRM_PROVIDER_CFG_VERSION, STOMP_SSRM_PROVIDER_ID, stompSsrmProviderDraft } from './stompProvider.js';

vi.mock('./bootstrap.js', () => ({
  getPlatform: () => staruiTestState.platform,
}));

describe('App', () => {
  beforeEach(() => {
    localStorage.clear();
    staruiTestState.configStore.list.mockReset();
    staruiTestState.configStore.save.mockReset();
    staruiTestState.configStore.remove.mockReset();
    staruiTestState.configStore.list.mockResolvedValue([]);
    staruiTestState.configStore.save.mockResolvedValue(undefined);
    staruiTestState.configStore.remove.mockResolvedValue(undefined);
    localStorage.setItem('stomp-ssrm-minimal.cfg-version', String(STOMP_SSRM_PROVIDER_CFG_VERSION));
  });

  it('seeds one stomp-ssrm catalog row and mounts the grid', async () => {
    const { App } = await import('./App.js');
    render(<App />);
    await waitFor(() => {
      expect(staruiTestState.configStore.save).toHaveBeenCalledWith(stompSsrmProviderDraft, 'test-user');
      expect(screen.getAllByTestId('hosted-markets-grid')).toHaveLength(1);
    });
    expect(screen.getAllByTestId('hosted-markets-grid')[0]).toHaveAttribute(
      'data-live-provider',
      STOMP_SSRM_PROVIDER_ID,
    );
  });

  it('enables the filters, formatting and editing toolbars', async () => {
    const { App } = await import('./App.js');
    render(<App />);
    const grids = await waitFor(() => {
      const found = screen.getAllByTestId('hosted-markets-grid');
      expect(found).toHaveLength(1);
      return found;
    });
    for (const grid of grids) {
      expect(grid).toHaveAttribute('data-filters-toolbar', 'true');
      expect(grid).toHaveAttribute('data-formatting-toolbar', 'true');
      expect(grid).toHaveAttribute('data-editing-toolbar', 'true');
    }
  });

  it('skips save when the provider already exists at the current version', async () => {
    staruiTestState.configStore.list.mockResolvedValue([
      { providerId: STOMP_SSRM_PROVIDER_ID, name: stompSsrmProviderDraft.name },
    ]);
    const { App } = await import('./App.js');
    render(<App />);
    await waitFor(() => {
      expect(screen.getAllByTestId('hosted-markets-grid')).toHaveLength(1);
    });
    expect(staruiTestState.configStore.save).not.toHaveBeenCalled();
  });

  it('re-saves when the stored row was opened with a different live rate', async () => {
    staruiTestState.configStore.list.mockResolvedValue([
      {
        providerId: STOMP_SSRM_PROVIDER_ID,
        name: stompSsrmProviderDraft.name,
        config: { requestMessage: '/snapshot/positions/TRADER001/999/50' },
      },
    ]);
    const { App } = await import('./App.js');
    render(<App />);
    await waitFor(() => {
      expect(staruiTestState.configStore.save).toHaveBeenCalledWith(stompSsrmProviderDraft, 'test-user');
    });
  });
});
