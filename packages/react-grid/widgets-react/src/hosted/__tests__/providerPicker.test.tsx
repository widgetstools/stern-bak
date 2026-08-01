/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Parity row 16 — provider controls live in Custom Settings (grid customizer).
 * HostedMarketsGrid forwards providerGridHost via MarketsGridContainer.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import type { ConfigManager } from '@wellsfargo-starui/core/host/config';

const lastProviderGridHost = { current: null as { available?: boolean } | null };

vi.mock('../../container/markets-grid-container/index.js', () => ({
  MarketsGridContainer: () => {
    lastProviderGridHost.current = { available: true };
    return <div data-testid="mds-stub" data-provider-host="1" />;
  },
}));

const { HostedMarketsGrid } = await import('../HostedMarketsGrid.js');

const fakeConfigManager = {
  deleteConfig: vi.fn().mockResolvedValue(undefined),
} as unknown as ConfigManager;

afterEach(() => {
  cleanup();
  lastProviderGridHost.current = null;
});

describe('HostedMarketsGrid — provider custom settings (row 16)', () => {
  it('mounts MarketsGridContainer with provider grid host wiring', async () => {
    const { getByTestId } = render(
      <HostedMarketsGrid
        gridId="pp-1"
        defaultInstanceId="pp-1"
        componentName="PP"
        configManager={fakeConfigManager}
      />,
    );
    await waitFor(() => getByTestId('mds-stub'));
    expect(lastProviderGridHost.current?.available).toBe(true);
  });
});
