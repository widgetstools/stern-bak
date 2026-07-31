/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Parity row 13 — `showFiltersToolbar` and `showFormattingToolbar`
 * are forwarded to MarketsGridContainer (which forwards them to
 * MarketsGrid via the same prop names).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import type { ConfigManager } from '@wellsfargo-starui/host-config';

const mgcProps: any[] = [];
vi.mock('../../container/markets-grid-container/index.js', () => ({
  MarketsGridContainer: (props: any) => {
    mgcProps.push(props);
    return <div data-testid="mds-stub" />;
  },
}));

const { HostedMarketsGrid } = await import('../HostedMarketsGrid.js');

const fakeConfigManager = {
  deleteConfig: vi.fn().mockResolvedValue(undefined),
} as unknown as ConfigManager;

afterEach(() => {
  cleanup();
  mgcProps.length = 0;
});

describe('HostedMarketsGrid — toolbar flags (row 13)', () => {
  it('forwards showFiltersToolbar and showFormattingToolbar', async () => {
    const { getByTestId } = render(
      <HostedMarketsGrid
        gridId="tb-1"
        defaultInstanceId="tb-1"
        componentName="TB"
        configManager={fakeConfigManager}
        showFiltersToolbar
        showFormattingToolbar
      />,
    );
    await waitFor(() => getByTestId('mds-stub'));
    const last = mgcProps[mgcProps.length - 1];
    expect(last.showFiltersToolbar).toBe(true);
    expect(last.showFormattingToolbar).toBe(true);
  });

  it('defaults the flags to undefined when not specified', async () => {
    const { getByTestId } = render(
      <HostedMarketsGrid
        gridId="tb-2"
        defaultInstanceId="tb-2"
        componentName="TB"
        configManager={fakeConfigManager}
      />,
    );
    await waitFor(() => getByTestId('mds-stub'));
    const last = mgcProps[mgcProps.length - 1];
    expect(last.showFiltersToolbar).toBeUndefined();
    expect(last.showFormattingToolbar).toBeUndefined();
  });
});
