/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Parity row 14 — `onEditProvider` callback is wired through to
 * MarketsGridContainer so the toolbar Edit button can open the
 * consumer's editor popout.
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

const fakeConfigManager = {
  deleteConfig: vi.fn().mockResolvedValue(undefined),
} as unknown as ConfigManager;

afterEach(() => {
  cleanup();
  mgcProps.length = 0;
});

describe('HostedMarketsGrid — onEditProvider (row 14)', () => {
  it('forwards the onEditProvider callback by reference', async () => {
    const onEditProvider = vi.fn();
    const { getByTestId } = render(
      <HostedMarketsGrid
        gridId="oe-1"
        defaultInstanceId="oe-1"
        componentName="OE"
        configManager={fakeConfigManager}
        onEditProvider={onEditProvider}
      />,
    );
    await waitFor(() => getByTestId('mds-stub'));
    const last = mgcProps[mgcProps.length - 1];
    expect(last.onEditProvider).toBe(onEditProvider);
    last.onEditProvider('provider-xyz');
    expect(onEditProvider).toHaveBeenCalledWith('provider-xyz');
  });
});
