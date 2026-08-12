/**
 * @vitest-environment jsdom
 *
 * Colour-link wiring on the hosted SSRM wrapper. Mirrors HostedMarketsGrid:
 * gridApi captured via onReady, rowIdField from the container's resolved key
 * column, and SSRM defaults injected into the link config — the worker-backed
 * selection builder, and (rowId mode only) the set-filter receive resolver.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import React from 'react';

const captured = vi.hoisted(() => ({
  container: {} as Record<string, unknown>,
  link: null as Record<string, unknown> | null,
}));

const fakeProvider = vi.hoisted(() => ({
  getSetFilterValues: vi.fn(async () => ['P1']),
}));

vi.mock('../container/ssrm-markets-grid-container/index.js', () => ({
  SsrmMarketsGridContainer: (props: Record<string, unknown>) => {
    captured.container = props;
    React.useEffect(() => {
      (props.onRowIdFieldChange as ((f: string | null) => void) | undefined)?.('positionId');
      (props.onProviderReady as ((p: unknown) => void) | undefined)?.(fakeProvider);
      (props.onReady as ((h: unknown) => void) | undefined)?.({
        gridApi: { id: 'fake-api' },
      });
    }, []);
    return React.createElement('div', { 'data-testid': 'ssrm-container' });
  },
}));

vi.mock('./useHostedView.js', () => ({
  useHostedView: () => ({
    identity: {
      instanceId: 'inst-1',
      appId: 'app',
      userId: 'user',
      configManager: {},
      storage: undefined,
    },
    ready: true,
    agTheme: 'dark',
    tabsHidden: false,
    linking: { fdc3: { broadcast: vi.fn(), addContextListener: vi.fn(() => () => {}), current: null } },
  }),
}));

vi.mock('./useGridContextLink.js', () => ({
  useGridContextLink: (args: Record<string, unknown>) => {
    captured.link = args;
  },
}));

vi.mock('./useGridLinkNotifications.js', () => ({
  useGridLinkNotifications: () => ({ onPublish: vi.fn(), onReceive: vi.fn() }),
}));

vi.mock('./useInteropChannel.js', () => ({
  useInteropChannel: () => ({ broadcast: vi.fn(), addContextListener: vi.fn(() => () => {}), current: null }),
  isInteropAvailable: () => false,
}));

vi.mock('@wellsfargo-starui/react/data/runtime', () => ({
  DataServicesProvider: ({ children }: { children: React.ReactNode }) => children,
  DataHubProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { HostedSsrmMarketsGrid } from './HostedSsrmMarketsGrid.js';

beforeEach(() => {
  captured.container = {};
  captured.link = null;
});

const BASE = {
  providerId: 'p1',
  componentName: 'MarketsGrid',
  defaultInstanceId: 'inst-1',
};

describe('HostedSsrmMarketsGrid colour-link wiring', () => {
  it('feeds gridApi, keyColumn rowIdField and an SSRM builder into useGridContextLink', async () => {
    render(
      <HostedSsrmMarketsGrid
        {...BASE}
        contextLink={{ enabled: true, mode: 'fields' }}
      />,
    );

    await waitFor(() => {
      const cfg = captured.link?.config as Record<string, unknown> | undefined;
      expect(cfg?.rowIdField).toBe('positionId');
      expect(typeof cfg?.buildContext).toBe('function');
    });
    await waitFor(() => expect(captured.link?.gridApi).toEqual({ id: 'fake-api' }));
  });

  it('injects the rowId set-filter resolver only in rowId mode', async () => {
    render(
      <HostedSsrmMarketsGrid
        {...BASE}
        contextLink={{ enabled: true, mode: 'rowId' }}
      />,
    );
    await waitFor(() => {
      const cfg = captured.link?.config as Record<string, unknown> | undefined;
      expect(typeof cfg?.resolve).toBe('function');
    });
  });

  it('leaves resolve unset in fields mode unless the caller supplies one', async () => {
    render(
      <HostedSsrmMarketsGrid
        {...BASE}
        contextLink={{ enabled: true, mode: 'fields' }}
      />,
    );
    await waitFor(() => expect(captured.link?.config).toBeDefined());
    expect((captured.link?.config as Record<string, unknown>).resolve).toBeUndefined();
  });

  it('a caller-supplied buildContext wins over the SSRM default', async () => {
    const mine = vi.fn(() => null);
    render(
      <HostedSsrmMarketsGrid
        {...BASE}
        contextLink={{ enabled: true, mode: 'fields', buildContext: mine }}
      />,
    );
    await waitFor(() => {
      expect((captured.link?.config as Record<string, unknown>)?.buildContext).toBe(mine);
    });
  });

  it('passes no config when contextLink is omitted (hook inert)', async () => {
    render(<HostedSsrmMarketsGrid {...BASE} />);
    await waitFor(() => expect(captured.link).not.toBeNull());
    expect(captured.link?.config).toBeUndefined();
  });
});

describe('HostedSsrmMarketsGrid documentTitle', () => {
  it('sets document.title while mounted and restores it on unmount', async () => {
    const prev = document.title;
    document.title = 'before';
    const { unmount } = render(
      <HostedSsrmMarketsGrid {...BASE} documentTitle="MarketsGrid · SSRM Blotter" />,
    );
    await waitFor(() => expect(document.title).toBe('MarketsGrid · SSRM Blotter'));
    unmount();
    expect(document.title).toBe('before');
    document.title = prev;
  });
});
