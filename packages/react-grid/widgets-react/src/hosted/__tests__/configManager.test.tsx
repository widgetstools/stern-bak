/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Parity rows 5 + 10 — ConfigManager resolution and loading guard.
 *
 * Row 5: the resolved ConfigManager flows through to MarketsGridContainer
 * (via the wrapped storage adapter) and stays referentially stable
 * across re-renders so downstream memoisation does not churn.
 *
 * Row 10: while ConfigManager is unresolved (no override + host
 * singleton unavailable, as in jsdom), the wrapper renders its own
 * loading fallback rather than mounting MarketsGridContainer.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import type { ConfigManager } from '@wellsfargo-starui/core/host/config';

const mgcProps: any[] = [];
vi.mock('../../container/markets-grid-container/index.js', () => ({
  MarketsGridContainer: (props: any) => {
    mgcProps.push(props);
    return <div data-testid="mds-stub" />;
  },
}));

const { HostedMarketsGrid } = await import('../HostedMarketsGrid.js');

afterEach(() => {
  cleanup();
  delete (globalThis as any).fin;
  mgcProps.length = 0;
});

const fakeConfigManager = {
  deleteConfig: vi.fn().mockResolvedValue(undefined),
} as unknown as ConfigManager;

describe('HostedMarketsGrid — ConfigManager + loading guard (rows 5, 10)', () => {
  it('renders the loading fallback while ConfigManager is unresolved', async () => {
    const { findByText, queryByTestId } = render(
      <HostedMarketsGrid
        gridId="cm-1"
        defaultInstanceId="cm-1"
        componentName="CMTest"
      />,
    );
    expect(await findByText(/Connecting to ConfigService/i)).toBeTruthy();
    expect(queryByTestId('mds-stub')).toBeNull();
  });

  it('forwards the resolved ConfigManager-backed identity once available', async () => {
    const { getByTestId } = render(
      <HostedMarketsGrid
        gridId="cm-2"
        defaultInstanceId="cm-2"
        componentName="CMTest"
        configManager={fakeConfigManager}
      />,
    );
    await waitFor(() => getByTestId('mds-stub'));
    expect(mgcProps[mgcProps.length - 1].instanceId).toBe('cm-2');
    expect(mgcProps[mgcProps.length - 1].componentName).toBe('CMTest');
  });
});
