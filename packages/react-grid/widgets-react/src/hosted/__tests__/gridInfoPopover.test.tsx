/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Parity row 21 / decision D2 verification — `componentName` is
 * forwarded to MarketsGridContainer (which surfaces it in the
 * MarketsGrid toolbar's ⓘ popover, where the legacy hover debug
 * header was relocated in commit 1fc5a01). The actual popover
 * rendering is covered by markets-grid's own tests; the wrapper's
 * contribution is the prop forwarding.
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

describe('HostedMarketsGrid — info popover identity (row 21 / D2)', () => {
  it('forwards componentName, instanceId, appId, and userId for the toolbar info popover', async () => {
    const { getByTestId } = render(
      <HostedMarketsGrid
        gridId="ip-1"
        defaultInstanceId="ip-instance"
        defaultAppId="ip-app"
        defaultUserId="ip-user"
        componentName="MarketsGrid"
        configManager={fakeConfigManager}
      />,
    );
    await waitFor(() => getByTestId('mds-stub'));
    const last = mgcProps[mgcProps.length - 1];
    expect(last.componentName).toBe('MarketsGrid');
    expect(last.instanceId).toBe('ip-instance');
    expect(last.appId).toBe('ip-app');
    expect(last.userId).toBe('ip-user');
    expect(last.gridId).toBe('ip-1');
  });
});
