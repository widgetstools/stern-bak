/**
 * @vitest-environment jsdom
 *
 * The grid must be visible before the data provider is ready: chrome and
 * columns frame mount immediately, rows arrive when the provider's snapshot
 * tick triggers the purge refresh in bindSsrmTicks. A "Starting provider…"
 * placeholder instead of the grid reads as a broken app.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

const fakeProvider = vi.hoisted(() => ({
  getConfig: () => {
    throw new Error('[SsrmProviderClientAdapter] Not started (providerId=p1)');
  },
  getColumnDefs: () => {
    throw new Error('[SsrmProviderClientAdapter] Not started (providerId=p1)');
  },
}));

vi.mock('@wellsfargo-starui/grid', async (importOriginal) => {
  const mod = await importOriginal<Record<string, unknown>>();
  return {
    ...mod,
    MarketsGrid: () => React.createElement('div', { 'data-testid': 'markets-grid' }),
  };
});

vi.mock('@wellsfargo-starui/react/data/runtime', () => ({
  useDataServices: () => ({
    client: {
      isProviderRunning: async () => true,
      waitForProviderRunning: async () => true,
    },
  }),
  useSsrmDataProvider: () => ({ provider: fakeProvider, error: null }),
  useDataProvidersList: () => ({ configs: [], loading: false, refresh: () => {} }),
  useAppDataStore: () => ({
    store: { get: vi.fn(), set: vi.fn(), list: () => [], subscribe: () => () => {} },
  }),
}));

// Provider exists but has NOT finished starting.
vi.mock('./useSsrmProviderDataWiring.js', () => ({
  useSsrmProviderDataWiring: () => ({ ready: false }),
}));

vi.mock('../markets-grid-container/ProviderEditorDialog.js', () => ({
  ProviderEditorDialog: () => null,
}));

vi.mock('../markets-grid-container/ConfigBrowserDialog.js', () => ({
  ConfigBrowserDialog: () => null,
}));

import { SsrmMarketsGridContainer } from './SsrmMarketsGridContainer.js';

describe('SsrmMarketsGridContainer before provider ready', () => {
  it('mounts MarketsGrid immediately instead of a placeholder', () => {
    render(<SsrmMarketsGridContainer providerId="p1" />);

    expect(screen.getByTestId('markets-grid')).toBeInTheDocument();
    expect(screen.queryByText(/Starting STOMP SSRM provider/i)).toBeNull();
    expect(screen.queryByText(/^Connecting…$/)).toBeNull();
  });
});
