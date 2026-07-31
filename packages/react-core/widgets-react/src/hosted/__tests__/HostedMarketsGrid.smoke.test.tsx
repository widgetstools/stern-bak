/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import type { ConfigManager } from '@wellsfargo-starui/host-config';

// Replace MarketsGridContainer with a marker so we exercise the wrapper
// without bringing AG-Grid, the data-services runtime, or the live picker
// into the test bundle. The wrapper's job is composition; this asserts
// it gets to the point of rendering its child.
vi.mock('../../container/markets-grid-container/index.js', () => ({
  MarketsGridContainer: (props: any) => (
    <div
      data-testid="mds-stub"
      data-grid-id={props.gridId}
      data-instance-id={props.instanceId}
      data-component-name={props.componentName}
    />
  ),
}));

import { HostedMarketsGrid } from '../HostedMarketsGrid.js';

afterEach(() => {
  cleanup();
  delete (globalThis as any).fin;
  window.history.replaceState({}, '', '/');
  document.title = '';
});

const fakeConfigManager = {
  deleteConfig: vi.fn().mockResolvedValue(undefined),
} as unknown as ConfigManager;

describe('HostedMarketsGrid — smoke', () => {
  it('renders MarketsGridContainer once identity resolves', async () => {
    const { getByTestId } = render(
      <HostedMarketsGrid
        gridId="t1"
        defaultInstanceId="t1"
        componentName="Test"
        configManager={fakeConfigManager}
      />,
    );
    const stub = await waitFor(() => getByTestId('mds-stub'));
    expect(stub.getAttribute('data-grid-id')).toBe('t1');
    expect(stub.getAttribute('data-instance-id')).toBe('t1');
    expect(stub.getAttribute('data-component-name')).toBe('Test');
  });

  it('sets and restores document.title', async () => {
    document.title = 'Original';
    const { unmount, getByTestId } = render(
      <HostedMarketsGrid
        gridId="t2"
        defaultInstanceId="t2"
        componentName="Test"
        documentTitle="Hosted · Test"
        configManager={fakeConfigManager}
      />,
    );
    await waitFor(() => getByTestId('mds-stub'));
    expect(document.title).toBe('Hosted · Test');
    unmount();
    expect(document.title).toBe('Original');
  });
});
