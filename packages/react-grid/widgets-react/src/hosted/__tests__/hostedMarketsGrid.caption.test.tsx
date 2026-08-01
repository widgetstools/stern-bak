/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import type { ConfigManager } from '@wellsfargo-starui/core/host/config';

// Stubbed container records every prop it receives so we can assert
// what HostedMarketsGrid forwards.
vi.mock('../../container/markets-grid-container/index.js', () => ({
  MarketsGridContainer: (props: any) => (
    <div
      data-testid="mds-stub"
      data-caption={props.caption ?? ''}
      data-tabs-hidden={String(Boolean(props.tabsHidden))}
    />
  ),
}));

// Drive `tabsHidden` from the test by mocking useHostedView. We still
// exercise the wrapper's destructure + forward logic; the composing
// hook itself is covered by useHostedView.test.tsx.
const useHostedViewMock = vi.fn();
vi.mock('../useHostedView.js', () => ({
  useHostedView: (args: any) => useHostedViewMock(args),
}));

import { HostedMarketsGrid } from '../HostedMarketsGrid.js';

const fakeConfigManager = {
  deleteConfig: vi.fn().mockResolvedValue(undefined),
} as unknown as ConfigManager;

function setHostedView(tabsHidden: boolean) {
  useHostedViewMock.mockReturnValue({
    identity: {
      configManager: fakeConfigManager,
      instanceId: 'inst-1',
      appId: 'app-1',
      userId: 'user-1',
      storage: null,
    },
    ready: true,
    agTheme: {} as any,
    tabsHidden,
    iab: { subscribe: vi.fn(), publish: vi.fn() },
    linking: {
      color: { color: null, linked: false },
      fdc3: {} as any,
      channel: {} as any,
    },
  });
}

afterEach(() => {
  cleanup();
  useHostedViewMock.mockReset();
  delete (globalThis as any).fin;
});

describe('HostedMarketsGrid — caption + tabsHidden forwarding', () => {
  beforeEach(() => {
    useHostedViewMock.mockReset();
  });

  it('forwards the caption even when tabs are visible (caption is always shown)', async () => {
    setHostedView(false);
    const { getByTestId } = render(
      <HostedMarketsGrid
        gridId="g"
        defaultInstanceId="inst-1"
        componentName="Markets"
        caption="Markets Blotter"
        configManager={fakeConfigManager}
      />,
    );
    const stub = await waitFor(() => getByTestId('mds-stub'));
    expect(stub.getAttribute('data-tabs-hidden')).toBe('false');
    expect(stub.getAttribute('data-caption')).toBe('Markets Blotter');
  });

  it('forwards caption when tabs are hidden', async () => {
    setHostedView(true);
    const { getByTestId } = render(
      <HostedMarketsGrid
        gridId="g"
        defaultInstanceId="inst-1"
        componentName="Markets"
        caption="Markets Blotter"
        configManager={fakeConfigManager}
      />,
    );
    const stub = await waitFor(() => getByTestId('mds-stub'));
    expect(stub.getAttribute('data-tabs-hidden')).toBe('true');
    expect(stub.getAttribute('data-caption')).toBe('Markets Blotter');
  });

  it('falls back to componentName when caption is omitted and tabs are hidden', async () => {
    setHostedView(true);
    const { getByTestId } = render(
      <HostedMarketsGrid
        gridId="g"
        defaultInstanceId="inst-1"
        componentName="Markets"
        configManager={fakeConfigManager}
      />,
    );
    const stub = await waitFor(() => getByTestId('mds-stub'));
    expect(stub.getAttribute('data-caption')).toBe('Markets');
  });
});
