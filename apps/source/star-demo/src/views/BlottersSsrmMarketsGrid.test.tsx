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
import BlottersSsrmMarketsGrid from './BlottersSsrmMarketsGrid';

const boot: PlatformBootstrapResult = {
  config: { appId: 'StarDemo', userId: 'dev1' },
  platform: { configManager: { init: vi.fn() } } as unknown as PlatformBootstrapResult['platform'],
};

function makeAppState(): StarGridAppState {
  return {
    runtime: {
      getTheme: () => 'dark',
      setTheme: vi.fn(),
      onThemeChanged: () => () => {},
      openSurface: mockOpenSurface,
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

describe('BlottersSsrmMarketsGrid', () => {
  let origin = `http://localhost:${readViteDevPort(appRoot)}`;

  beforeEach(() => {
    resetStaruiMocks();
    origin = `http://localhost:${readViteDevPort(appRoot)}`;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { origin, search: '?instanceId=grid-ssrm' },
    });
  });

  it('renders BlotterHost with launch instance id as gridId', () => {
    renderWithProviders(<BlottersSsrmMarketsGrid />);
    expect(getOneByTestId('blotter-host')).toHaveAttribute('data-component-name', 'SsrmMarketsGrid');
    expect(getOneByTestId('blotter-host')).toHaveAttribute(
      'data-grid-id',
      'grid-ssrm',
    );
  });

  it('prompts for instance id when not OpenFin and no launch stamp', () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { origin, search: '' },
    });
    const { getByText } = renderWithProviders(<BlottersSsrmMarketsGrid />);
    expect(getByText(/registered instance id/i)).toBeTruthy();
  });

  it('opens provider editor popout on edit', async () => {
    const user = userEvent.setup();
    renderWithProviders(<BlottersSsrmMarketsGrid />);
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

  it('opens the config browser popout at this app\'s own origin', async () => {
    const user = userEvent.setup();
    renderWithProviders(<BlottersSsrmMarketsGrid />);

    await user.click(getOneByTestId('open-config-browser'));

    await waitFor(() => {
      expect(mockOpenSurface).toHaveBeenCalledWith({
        kind: 'popout',
        url: `${origin}/#/config-browser`,
        windowName: 'config-browser',
        width: 1100,
        height: 720,
      });
    });
  });

  /**
   * Inside OpenFin the identity arrives from view customData rather than the
   * URL, so the missing-instance prompt must NOT fire there — it would hide a
   * grid that is about to receive its id.
   */
  it('renders the grid under OpenFin even with no launch stamp in the URL', () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { origin, search: '' },
    });
    vi.stubGlobal('fin', { me: { identity: { uuid: 'u', name: 'n' } } });

    renderWithProviders(<BlottersSsrmMarketsGrid />);

    // Empty gridId: BlotterHost resolves the real one from customData.
    expect(getOneByTestId('blotter-host')).toHaveAttribute('data-grid-id', '');
    vi.unstubAllGlobals();
  });
});
