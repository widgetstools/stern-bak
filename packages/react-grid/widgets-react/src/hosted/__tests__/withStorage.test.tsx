/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Parity row 6 — `withStorage` toggles whether MarketsGridContainer
 * receives a StorageAdapterFactory. When false, no storage prop is
 * forwarded; when true, the wrapped factory from `useHostedIdentity`
 * comes through.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import type { ConfigManager } from '@wellsfargo-starui/host-config';

const mgcProps: any[] = [];
vi.mock('../../container/markets-grid-container/index.js', () => ({
  MarketsGridContainer: (props: any) => {
    mgcProps.push(props);
    return <div data-testid="mds-stub" data-has-storage={String(Boolean(props.storage))} />;
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
  // createConfigServiceStorage uses these in real life; the test only
  // needs the reference to flow through, not actual persistence.
  loadAll: vi.fn(),
  loadOne: vi.fn(),
  saveOne: vi.fn(),
} as unknown as ConfigManager;

describe('HostedMarketsGrid — withStorage (row 6)', () => {
  it('does not forward a storage factory when withStorage is false', async () => {
    const { getByTestId } = render(
      <HostedMarketsGrid
        gridId="ws-1"
        defaultInstanceId="ws-1"
        componentName="WS"
        configManager={fakeConfigManager}
      />,
    );
    const stub = await waitFor(() => getByTestId('mds-stub'));
    expect(stub.getAttribute('data-has-storage')).toBe('false');
    expect(mgcProps[mgcProps.length - 1].storage).toBeUndefined();
  });

  it('forwards a storage factory when withStorage is true', async () => {
    const { getByTestId } = render(
      <HostedMarketsGrid
        gridId="ws-2"
        defaultInstanceId="ws-2"
        componentName="WS"
        configManager={fakeConfigManager}
        withStorage
      />,
    );
    const stub = await waitFor(() => {
      const el = getByTestId('mds-stub');
      if (el.getAttribute('data-has-storage') !== 'true') throw new Error('not yet');
      return el;
    });
    expect(stub.getAttribute('data-has-storage')).toBe('true');
    expect(typeof mgcProps[mgcProps.length - 1].storage).toBe('function');
  });
});
