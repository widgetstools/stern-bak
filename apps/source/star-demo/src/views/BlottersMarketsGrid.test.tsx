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

function makeAppState(identity?: Record<string, unknown>): StarGridAppState {
  return {
    runtime: {
      getTheme: () => 'dark',
      setTheme: vi.fn(),
      onThemeChanged: () => () => {},
      openSurface: mockOpenSurface,
      // Present only when a test supplies one — the view must cope without it.
      ...(identity ? { resolveIdentity: () => identity } : null),
      // Intentional partial mock: only the theme + surface slice is exercised.
    } as unknown as StarGridAppState['runtime'],
    theme: 'dark',
    setTheme: vi.fn(),
    onThemeChanged: () => () => {},
    hostForGrid: vi.fn(),
  };
}

function renderWithProviders(ui: React.ReactNode, identity?: Record<string, unknown>) {
  const appState = makeAppState(identity);
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

  // ── the wand hands the assistant configIds, never names ──────────────

  it('passes the launcher\'s template configId and this window\'s row id to the assistant', async () => {
    const user = userEvent.setup();
    const BlottersMarketsGrid = (await import('./BlottersMarketsGrid')).default;
    renderWithProviders(<BlottersMarketsGrid />, {
      // A multi-instance window: its own row is a minted id, its blotter is
      // the template configId the launcher put in customData.
      instanceId: 'dev1grid-rates-1700000000000',
      componentType: 'grid',
      componentSubType: 'rates',
      customData: { templateId: 'grid-rates', instanceId: 'dev1grid-rates-1700000000000' },
    });

    await user.click(getOneByTestId('open-assistant-btn'));

    await waitFor(() => {
      expect(mockOpenSurface).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringMatching(/scope=locked.*instance=dev1grid-rates-1700000000000.*grid=grid-rates/),
          windowName: 'ai-assistant-grid-rates',
        }),
      );
    });
  });

  it('prefers the launcher\'s templateId over an id derived from componentType/subType', async () => {
    const user = userEvent.setup();
    const BlottersMarketsGrid = (await import('./BlottersMarketsGrid')).default;
    // The derived form would be "grid-rates"; the launcher says otherwise
    // (a re-keyed entry) — the launcher wins.
    renderWithProviders(<BlottersMarketsGrid />, {
      instanceId: 'grid-rates-book',
      componentType: 'grid',
      componentSubType: 'rates',
      customData: { templateId: 'grid-rates-book' },
    });

    await user.click(getOneByTestId('open-assistant-btn'));

    await waitFor(() => {
      expect(mockOpenSurface).toHaveBeenCalledWith(
        expect.objectContaining({ url: expect.stringContaining('grid=grid-rates-book'), windowName: 'ai-assistant-grid-rates-book' }),
      );
    });
  });

  it('falls back to deriving the id only when the launcher supplied no templateId', async () => {
    const user = userEvent.setup();
    const BlottersMarketsGrid = (await import('./BlottersMarketsGrid')).default;
    renderWithProviders(<BlottersMarketsGrid />, {
      instanceId: 'browser-abc',
      componentType: 'grid',
      componentSubType: 'test',
      customData: {},
    });

    await user.click(getOneByTestId('open-assistant-btn'));

    await waitFor(() => {
      expect(mockOpenSurface).toHaveBeenCalledWith(
        expect.objectContaining({ url: expect.stringContaining('grid=grid-test'), windowName: 'ai-assistant-grid-test' }),
      );
    });
  });
});
