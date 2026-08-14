import { render, screen, waitFor } from '@testing-library/react';
import { useStarGridHost } from './StarGridAppContext';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mockBrowserRuntime,
  mockBuildGridHostContext,
  mockCreateConfigServiceStorage,
  mockStorageFactoryForPersistence,
  resetStaruiMocks,
} from '../staruiVitestMocks';
import { StarGridApp } from './StarGridApp';

describe('StarGridApp', () => {
  const configManager = {
    init: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    resetStaruiMocks();
    mockCreateConfigServiceStorage.mockReturnValue(vi.fn());
    mockStorageFactoryForPersistence.mockReturnValue(vi.fn());
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('renders children after bootstrap completes', async () => {
    render(
      <StarGridApp appId="demo" loading={<div data-testid="loading">Loading</div>}>
        <div data-testid="child">Child</div>
      </StarGridApp>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('child')).toBeInTheDocument();
    });
  });

  it('creates BrowserRuntime when runtime prop is omitted', async () => {
    render(
      <StarGridApp appId="demo-app" userId="user-1">
        <div>Ready</div>
      </StarGridApp>,
    );

    await waitFor(() => {
      expect(mockBrowserRuntime).toHaveBeenCalledWith({
        identity: {
          appId: 'demo-app',
          userId: 'user-1',
          instanceId: 'demo-app',
          componentType: 'MarketsGrid',
        },
      });
    });
  });

  it('initializes config manager and uses config persistence', async () => {
    render(
      <StarGridApp
        appId="demo"
        persistence="config"
        // Intentional partial mock: StarGridApp only awaits init() before
        // rendering children; the rest of ConfigManager is never touched.
        configManager={configManager as unknown as import('@wellsfargo-starui/core/host/config').ConfigManager}
      >
        <div data-testid="ready">Ready</div>
      </StarGridApp>,
    );

    await waitFor(() => {
      expect(configManager.init).toHaveBeenCalled();
      expect(mockCreateConfigServiceStorage).toHaveBeenCalledWith({ configManager });
      expect(screen.getByTestId('ready')).toBeInTheDocument();
    });
  });

  it('registers plugins after bootstrap', async () => {
    const register = vi.fn();
    const plugin = { id: 'test-plugin', register };

    render(
      <StarGridApp appId="demo" plugins={[plugin]}>
        <div>Ready</div>
      </StarGridApp>,
    );

    await waitFor(() => {
      expect(register).toHaveBeenCalledWith({ appId: 'demo' });
    });
  });

  it('builds host context via hostForGrid', async () => {
    function HostProbe() {
      const host = useStarGridHost({ gridId: 'grid-1' });
      return <div data-testid="host">{JSON.stringify(host)}</div>;
    }

    render(
      <StarGridApp appId="demo">
        <HostProbe />
      </StarGridApp>,
    );

    await waitFor(() => {
      expect(mockBuildGridHostContext).toHaveBeenCalled();
      expect(screen.getByTestId('host')).toHaveTextContent('mock-host');
    });
  });

  it('logs bootstrap failures', async () => {
    mockBrowserRuntime.mockImplementationOnce(() => {
      throw new Error('runtime boom');
    });

    render(
      <StarGridApp appId="demo">
        <div>Child</div>
      </StarGridApp>,
    );

    await waitFor(() => {
      expect(console.error).toHaveBeenCalledWith(
        '[StarGridApp] bootstrap failed:',
        expect.any(Error),
      );
    });
  });
});
