import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { ISsrmDataProvider } from '@wellsfargo-starui/data';

const { mockProvider } = vi.hoisted(() => ({
  mockProvider: {
    id: 'stomp-ssrm-1',
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    getConfig: () => ({ keyColumn: 'id', blockSize: 50 }),
    getColumnDefs: () => [{ field: 'id' }],
    onStatus: vi.fn(() => () => undefined),
    onError: vi.fn(() => () => undefined),
    onRowsReceived: vi.fn(() => () => undefined),
  } as unknown as ISsrmDataProvider,
}));

vi.mock('@wellsfargo-starui/grid', () => ({
  MarketsGrid: (props: Record<string, unknown>) =>
    React.createElement('div', {
      'data-testid': 'markets-grid',
      'data-has-ssrm': props.ssrm ? '1' : '0',
      'data-show-toolbar': String(props.showToolbar !== false),
      'data-show-settings': String(props.showSettingsButton !== false),
      'data-show-formatting': String(props.showFormattingToolbar === true),
      'data-show-editing': String(props.showEditingToolbar === true),
    }),
  SsrmMarketsGrid: () => React.createElement('div', { 'data-testid': 'legacy-ssrm' }),
  toSsrmExpressionRules: vi.fn(() => []),
}));

vi.mock('@wellsfargo-starui/react/data/runtime', () => ({
  useDataProvidersList: () => ({ configs: [], loading: false, refresh: () => {} }),
  useSsrmDataProvider: () => ({
    provider: mockProvider,
    error: undefined,
  }),
}));

vi.mock('./useSsrmProviderDataWiring.js', () => ({
  useSsrmProviderDataWiring: (params: {
    onStatus?: (text: string) => void;
    setLoadRowCount?: (count: number | undefined) => void;
  }) => {
    React.useEffect(() => {
      params.onStatus?.('Ready');
      params.setLoadRowCount?.(20000);
    }, [params.onStatus, params.setLoadRowCount]);
    return { ready: true };
  },
}));

vi.mock('../markets-grid-container/ProviderEditorDialog.js', () => ({
  ProviderEditorDialog: () => null,
}));

import { SsrmMarketsGridContainer } from './SsrmMarketsGridContainer.js';

describe('SsrmMarketsGridContainer', () => {
  it('renders MarketsGrid with ssrm chrome when provider is ready', () => {
    render(
      <SsrmMarketsGridContainer
        providerId="stomp-ssrm-1"
        showProviderEditor={false}
      />,
    );

    expect(screen.getByTestId('markets-grid')).toBeInTheDocument();
    expect(screen.getByTestId('markets-grid')).toHaveAttribute('data-has-ssrm', '1');
    expect(screen.getByTestId('markets-grid')).toHaveAttribute('data-show-toolbar', 'true');
    expect(screen.getByTestId('markets-grid')).toHaveAttribute('data-show-settings', 'true');
    expect(screen.getByTestId('markets-grid')).toHaveAttribute('data-show-formatting', 'true');
    expect(screen.getByTestId('markets-grid')).toHaveAttribute('data-show-editing', 'true');
    expect(screen.queryByTestId('legacy-ssrm')).not.toBeInTheDocument();
  });

  it('shows provider status strip with row count when opted in', async () => {
    render(
      <SsrmMarketsGridContainer
        providerId="stomp-ssrm-1"
        showProviderEditor={false}
        showStatusStrip
      />,
    );

    const strip = screen.getByTestId('ssrm-provider-status');
    await waitFor(() => {
      expect(strip.textContent).toContain('Ready');
      expect(strip.textContent).toContain('20,000');
    });
  });

  it('renders neither strip by default — layout parity with MarketsGridContainer', () => {
    render(<SsrmMarketsGridContainer providerId="stomp-ssrm-1" />);

    expect(screen.queryByTestId('ssrm-provider-status')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit provider/i })).not.toBeInTheDocument();
  });
});
