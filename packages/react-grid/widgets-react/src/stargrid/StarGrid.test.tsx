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
    }),
}));

vi.mock('../container/ssrm-markets-grid-container/SsrmMarketsGridContainer.js', () => ({
  SsrmMarketsGridContainer: (props: Record<string, unknown>) =>
    React.createElement('div', {
      'data-testid': 'ssrm-container',
      'data-provider': props.providerId,
      'data-app': props.appId,
      'data-user': props.userId,
    }),
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
});
