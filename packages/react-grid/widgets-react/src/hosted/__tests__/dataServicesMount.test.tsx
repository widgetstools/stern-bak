/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Parity row 9 — when `dataServices` (the bootstrap result) is
 * supplied, the wrapper mounts a `<DataServicesProvider>` around its
 * children, and the MarketsGridContainer subtree can resolve
 * `useDataServices()` without throwing. With no bundle, the provider
 * is omitted (consumers must supply data-services context themselves).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import type { ConfigManager } from '@wellsfargo-starui/core/host/config';
import type { DataServices } from '@wellsfargo-starui/data/runtime';
import type { ResolvedDataServicesHubBundle } from '@wellsfargo-starui/data';
import { useDataServices } from '@wellsfargo-starui/react/data/runtime';

let captureClient: unknown = null;
let throwsOnRead = false;

vi.mock('../../container/markets-grid-container/index.js', () => ({
  MarketsGridContainer: () => {
    try {
      const ctx = useDataServices();
      captureClient = ctx.client;
      return <div data-testid="mds-stub" data-has-dp="true" />;
    } catch {
      throwsOnRead = true;
      return <div data-testid="mds-stub" data-has-dp="false" />;
    }
  },
}));

const { HostedMarketsGrid } = await import('../HostedMarketsGrid.js');

const fakeConfigManager = {
  deleteConfig: vi.fn().mockResolvedValue(undefined),
} as unknown as ConfigManager;

// Minimal bootstrap-shaped stub. The Provider only reads
// services.client / services.appData / services.configManager — the
// actual port + mirror behaviour is exercised in
// data-services-react's hooks.test.tsx.
const fakeMirror = {
  attach: vi.fn().mockResolvedValue(undefined),
  ready: vi.fn().mockResolvedValue(undefined),
  subscribe: vi.fn(() => () => undefined),
} as unknown as DataServices['appData'];

const fakeClient = {
  __fake: true,
  attachAppData: vi.fn(() => fakeMirror),
  detachAppData: vi.fn(),
} as unknown as DataServices['client'];

const fakeServices: DataServices = {
  client: fakeClient,
  appData: fakeMirror,
  configManager: fakeConfigManager,
  ready: Promise.resolve(),
  dispose: vi.fn(),
};

const fakePlatform = {
  ...fakeServices,
  getProvider: vi.fn(),
  stopProvider: vi.fn().mockResolvedValue(undefined),
} as unknown as ResolvedDataServicesHubBundle;

afterEach(() => {
  cleanup();
  captureClient = null;
  throwsOnRead = false;
});

describe('HostedMarketsGrid — DataServices mount (row 9)', () => {
  it('mounts a DataServicesProvider when dataServices is supplied', async () => {
    const { getByTestId } = render(
      <HostedMarketsGrid
        gridId="dp-1"
        defaultInstanceId="dp-1"
        componentName="DP"
        configManager={fakeConfigManager}
        dataServices={fakeServices}
      />,
    );
    const stub = await waitFor(() => {
      const el = getByTestId('mds-stub');
      if (el.getAttribute('data-has-dp') !== 'true') throw new Error('not yet');
      return el;
    });
    expect(stub.getAttribute('data-has-dp')).toBe('true');
    expect(captureClient).toBe(fakeClient);
  });

  it('mounts DataHubProvider when platform is supplied', async () => {
    const { getByTestId } = render(
      <HostedMarketsGrid
        gridId="dp-1b"
        defaultInstanceId="dp-1b"
        componentName="DP"
        configManager={fakeConfigManager}
        platform={fakePlatform}
      />,
    );
    const stub = await waitFor(() => {
      const el = getByTestId('mds-stub');
      if (el.getAttribute('data-has-dp') !== 'true') throw new Error('not yet');
      return el;
    });
    expect(stub.getAttribute('data-has-dp')).toBe('true');
    expect(captureClient).toBe(fakeClient);
  });

  it('omits the provider when dataServices is absent', async () => {
    const { getByTestId } = render(
      <HostedMarketsGrid
        gridId="dp-2"
        defaultInstanceId="dp-2"
        componentName="DP"
        configManager={fakeConfigManager}
      />,
    );
    const stub = await waitFor(() => getByTestId('mds-stub'));
    expect(stub.getAttribute('data-has-dp')).toBe('false');
    expect(throwsOnRead).toBe(true);
  });
});
