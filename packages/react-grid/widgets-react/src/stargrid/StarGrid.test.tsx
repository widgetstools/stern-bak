import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

/**
 * StarGrid's job is routing: identity from context, mode from the catalog
 * row's providerType. The containers and MarketsGrid are prop-echo mocks —
 * the assertions pin which surface mounts and what identity it receives.
 */

const { identityRef, cfgRef } = vi.hoisted(() => ({
  identityRef: {
    current: {
      appId: 'App1',
      userId: 'u1',
      storage: (() => ({})) as unknown,
    } as Record<string, unknown> | null,
  },
  cfgRef: {
    current: { cfg: null, loading: false } as { cfg: unknown; loading: boolean },
  },
}));

vi.mock('@wellsfargo-starui/react/data/runtime', () => ({
  useStaruiIdentity: () => identityRef.current,
  useDataProviderConfig: () => cfgRef.current,
}));

vi.mock('@wellsfargo-starui/grid', () => ({
  MarketsGrid: (props: Record<string, unknown>) =>
    React.createElement('div', {
      'data-testid': 'static-grid',
      'data-app': props.appId,
      'data-user': props.userId,
      'data-rows': Array.isArray(props.rowData) ? String(props.rowData.length) : '0',
    }),
}));

vi.mock('../container/markets-grid-container/MarketsGridContainer.js', () => ({
  MarketsGridContainer: (props: Record<string, unknown>) =>
    React.createElement('div', {
      'data-testid': 'csrm-container',
      'data-provider': props.defaultLiveProviderId,
      'data-app': props.appId,
      'data-caption': props.caption ?? '',
      'data-tabs-hidden': String(Boolean(props.tabsHidden)),
    }),
}));

vi.mock('../container/ssrm-markets-grid-container/SsrmMarketsGridContainer.js', () => ({
  SsrmMarketsGridContainer: (props: Record<string, unknown>) => {
    const onReady = props.onReady as ((handle: unknown) => void) | undefined;
    React.useEffect(() => {
      onReady?.(readyHandleRef.current);
      // One delivery per mount — mirrors the real container's gridReady.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return React.createElement('div', {
      'data-testid': 'ssrm-container',
      'data-provider': props.providerId,
      'data-app': props.appId,
      'data-user': props.userId,
      'data-theme-kind':
        props.theme == null ? 'none' : typeof props.theme === 'string' ? props.theme : 'theme-object',
    });
  },
}));

const { readyHandleRef } = vi.hoisted(() => ({
  readyHandleRef: { current: { saveAll: () => Promise.resolve() } as Record<string, unknown> },
}));

import { StarGrid } from './StarGrid.js';

afterEach(() => {
  cleanup();
  identityRef.current = { appId: 'App1', userId: 'u1', storage: () => ({}) };
  cfgRef.current = { cfg: null, loading: false };
});

describe('StarGrid', () => {
  it('throws without a starui.Provider above it', () => {
    identityRef.current = null;
    expect(() => render(<StarGrid gridId="g1" />)).toThrow(/starui\.Provider/);
  });

  it('renders a static MarketsGrid when no providerId is given', () => {
    render(<StarGrid gridId="g1" rowData={[{ a: 1 }, { a: 2 }]} />);
    const grid = screen.getByTestId('static-grid');
    expect(grid).toHaveAttribute('data-app', 'App1');
    expect(grid).toHaveAttribute('data-user', 'u1');
    expect(grid).toHaveAttribute('data-rows', '2');
  });

  it('infers SSRM from a `-ssrm` providerType', () => {
    cfgRef.current = {
      cfg: { providerId: 'dp1', providerType: 'stomp-ssrm', name: 'P' },
      loading: false,
    };
    render(<StarGrid gridId="g1" providerId="dp1" />);
    const grid = screen.getByTestId('ssrm-container');
    expect(grid).toHaveAttribute('data-provider', 'dp1');
    expect(grid).toHaveAttribute('data-app', 'App1');
    expect(grid).toHaveAttribute('data-user', 'u1');
  });

  it('mounts the CSRM container alone when neither providerId nor rowData is given', () => {
    render(<StarGrid gridId="g1" />);
    const grid = screen.getByTestId('csrm-container');
    expect(grid).not.toHaveAttribute('data-provider');
    expect(screen.queryByTestId('static-grid')).not.toBeInTheDocument();
  });

  it('routes any other providerType to the CSRM container', () => {
    cfgRef.current = {
      cfg: { providerId: 'dp2', providerType: 'stomp', name: 'P' },
      loading: false,
    };
    render(<StarGrid gridId="g1" providerId="dp2" />);
    expect(screen.getByTestId('csrm-container')).toHaveAttribute('data-provider', 'dp2');
  });

  it('renders the fallback while the catalog row loads', () => {
    cfgRef.current = { cfg: null, loading: true };
    render(<StarGrid gridId="g1" providerId="dp3" fallback={<p>loading…</p>} />);
    expect(screen.getByText('loading…')).toBeInTheDocument();
  });

  it('reports a missing catalog row instead of mounting a grid', () => {
    cfgRef.current = { cfg: null, loading: false };
    render(<StarGrid gridId="g1" providerId="dp-nope" />);
    expect(screen.getByText(/"dp-nope" was not found/)).toBeInTheDocument();
  });

  it('sets and restores the document title', () => {
    document.title = 'before';
    const { unmount } = render(
      <StarGrid gridId="g1" rowData={[]} documentTitle="My Blotter" />,
    );
    expect(document.title).toBe('My Blotter');
    unmount();
    expect(document.title).toBe('before');
  });

  it('flushes grid state via saveAll on unmount', async () => {
    const saveAll = vi.fn().mockResolvedValue(undefined);
    readyHandleRef.current = { saveAll };
    cfgRef.current = {
      cfg: { providerId: 'dp1', providerType: 'stomp-ssrm', name: 'P' },
      loading: false,
    };
    const { unmount } = render(<StarGrid gridId="g1" providerId="dp1" />);
    expect(screen.getByTestId('ssrm-container')).toBeInTheDocument();
    saveAll.mockClear();
    unmount();
    expect(saveAll).toHaveBeenCalledTimes(1);
  });

  it('defaults the container theme and lets advanced.theme win', () => {
    cfgRef.current = {
      cfg: { providerId: 'dp1', providerType: 'stomp-ssrm', name: 'P' },
      loading: false,
    };
    const { unmount } = render(<StarGrid gridId="g1" providerId="dp1" />);
    expect(screen.getByTestId('ssrm-container')).toHaveAttribute(
      'data-theme-kind',
      'theme-object',
    );
    unmount();
    render(
      <StarGrid gridId="g1" providerId="dp1" advanced={{ theme: 'pinned' } as never} />,
    );
    expect(screen.getByTestId('ssrm-container')).toHaveAttribute('data-theme-kind', 'pinned');
  });

  it('forwards the CSRM caption from title and falls back to gridId', () => {
    cfgRef.current = {
      cfg: { providerId: 'dp2', providerType: 'stomp', name: 'P' },
      loading: false,
    };
    const { unmount } = render(<StarGrid gridId="g1" providerId="dp2" title="Markets Blotter" />);
    expect(screen.getByTestId('csrm-container')).toHaveAttribute('data-caption', 'Markets Blotter');
    expect(screen.getByTestId('csrm-container')).toHaveAttribute('data-tabs-hidden', 'false');
    unmount();
    render(<StarGrid gridId="g1" providerId="dp2" />);
    expect(screen.getByTestId('csrm-container')).toHaveAttribute('data-caption', 'g1');
  });

  it('renders the full-bleed page reset only when fullBleed is set', () => {
    const { container, unmount } = render(<StarGrid gridId="g1" rowData={[]} fullBleed />);
    expect(container.querySelector('style')?.textContent).toContain('overflow: hidden');
    unmount();
    const { container: plain } = render(<StarGrid gridId="g1" rowData={[]} />);
    expect(plain.querySelector('style')).toBeNull();
  });
});
