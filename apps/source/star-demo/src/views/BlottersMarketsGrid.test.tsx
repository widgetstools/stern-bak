import React from 'react';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getOneByTestId } from '../../../../test-utils/queries';
import { readViteDevPort } from '../../../../test-utils/vitePort';
import {
  mockOpenSurface,
  resetStaruiMocks,
} from '../staruiVitestMocks';
import {
  PlatformBootstrapProvider,
  type PlatformBootstrapResult,
} from '../platformBootstrap';
import { StarGridAppProvider } from '../starGridApp/StarGridAppContext';
import type { StarGridAppState } from '../starGridApp/types';

const boot: PlatformBootstrapResult = {
  config: { appId: 'StarDemo', userId: 'dev1' },
  // Intentional partial mock: the view only reads configManager off the bundle.
  platform: { configManager: { init: vi.fn() } } as unknown as PlatformBootstrapResult['platform'],
};

function makeAppState(): StarGridAppState {
  return {
    runtime: {
      getTheme: () => 'dark',
      setTheme: vi.fn(),
      onThemeChanged: () => () => {},
      openSurface: mockOpenSurface,
      // Intentional partial mock: only the theme + surface slice is exercised.
    } as unknown as StarGridAppState['runtime'],
    theme: 'dark',
    setTheme: vi.fn(),
    onThemeChanged: () => () => {},
    hostForGrid: vi.fn(),
  };
}

function renderWithProviders(ui: React.ReactNode) {
  const appState = makeAppState();
  return render(
    <PlatformBootstrapProvider value={boot}>
      <StarGridAppProvider value={appState}>{ui}</StarGridAppProvider>
    </PlatformBootstrapProvider>,
  );
}

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('BlottersMarketsGrid', () => {
  let origin = `http://localhost:${readViteDevPort(appRoot)}`;

  beforeEach(() => {
    resetStaruiMocks();
    origin = `http://localhost:${readViteDevPort(appRoot)}`;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { origin },
    });
  });

  it('renders HostedMarketsGrid with blotter config', async () => {
    const BlottersMarketsGrid = (await import('./BlottersMarketsGrid')).default;
    renderWithProviders(<BlottersMarketsGrid />);

    expect(getOneByTestId('hosted-markets-grid')).toHaveAttribute(
      'data-grid-id',
      'star-demo-blotter',
    );
  });

  it('opens provider editor popout on edit', async () => {
    const user = userEvent.setup();
    const BlottersMarketsGrid = (await import('./BlottersMarketsGrid')).default;
    renderWithProviders(<BlottersMarketsGrid />);

    await user.click(getOneByTestId('edit-provider'));

    await waitFor(() => {
      expect(mockOpenSurface).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('id=p-1'),
          windowName: 'data-providers',
        }),
      );
    });
  });

  it('opens config browser popout', async () => {
    const user = userEvent.setup();
    const BlottersMarketsGrid = (await import('./BlottersMarketsGrid')).default;
    renderWithProviders(<BlottersMarketsGrid />);

    await user.click(getOneByTestId('open-config-browser'));

    await waitFor(() => {
      expect(mockOpenSurface).toHaveBeenCalledWith(
        expect.objectContaining({
          url: `${origin}/#/config-browser`,
          windowName: 'config-browser',
        }),
      );
    });
  });
});
